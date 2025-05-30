const CACHE_KEY = "discord-scammers";
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const mode = url.searchParams.get("mode");
  const userId = url.searchParams.get("userId");
  const discordId = url.searchParams.get("discordId");

  if (mode === "discord-scammers") {
    try {
      const { results } = await env.DB.prepare(
        "SELECT value, updated_at FROM scammer_cache WHERE key = ?"
      ).bind(CACHE_KEY).all();

      if (results.length > 0) {
        const { value, updated_at } = results[0];

        const latestMessageRes = await fetch(`https://discord.com/api/v10/channels/${env.DISCORD_CHANNEL_ID}/messages?limit=1`, {
          headers: { Authorization: `Bot ${env.DISCORD_BOT_TOKEN}` }
        });

        if (!latestMessageRes.ok) {
          return new Response(JSON.stringify({ error: "Failed to check latest message" }), {
            status: 500,
            headers: { "Content-Type": "application/json" }
          });
        }

        const [latestMessage] = await latestMessageRes.json();
        const latestTimestamp = new Date(latestMessage.timestamp).getTime();

        if (latestTimestamp <= updated_at) {
          return new Response(value, {
            headers: { "Content-Type": "application/json", "X-Cache": "D1-HIT" },
          });
        }
      }

      const channelId = env.DISCORD_CHANNEL_ID;
      let allMessages = [];
      let before = null;

      while (true) {
        const fetchUrl = new URL(`https://discord.com/api/v10/channels/${channelId}/messages`);
        fetchUrl.searchParams.set("limit", "100");
        if (before) fetchUrl.searchParams.set("before", before);

        let response;

        for (let attempt = 0; attempt < 3; attempt++) {
          response = await fetch(fetchUrl.toString(), {
            headers: { Authorization: `Bot ${env.DISCORD_BOT_TOKEN}` },
          });

          if (response.status === 429) {
            const retryAfter = await response.json();
            await new Promise(r => setTimeout(r, retryAfter.retry_after * 1000));
          } else {
            break;
          }
        }

        if (!response.ok) {
          return new Response(JSON.stringify({ error: "Failed to fetch messages" }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          });
        }

        const messages = await response.json();
        if (messages.length === 0) break;
        allMessages.push(...messages);
        before = messages[messages.length - 1].id;
        if (allMessages.length >= 5000) break;
      }

      const scammers = [];
      const MAX_LOOKUPS = 500;

      for (let i = 0; i < allMessages.length; i++) {
        const msg = allMessages[i];

        try {
          const discordMatch = msg.content?.match(/discord user:\s*\*{0,2}\s*([^\n\r]+)/i);
          const robloxProfileMatch = msg.content?.match(/https:\/\/www\.roblox\.com\/users\/(\d+)\/profile/i);
          const robloxUserMatch = msg.content?.match(/roblox user:\s*\*{0,2}(.*)/i);

          const discordid = discordMatch ? discordMatch[1].trim().split(',')[0] : null;
          const robloxProfile = robloxProfileMatch ? `https://www.roblox.com/users/${robloxProfileMatch[1]}/profile` : null;
          const userId = robloxProfileMatch ? robloxProfileMatch[1] : null;
          const victims = msg.content?.match(/victims:\s*\*{0,2}(.*)/i)?.[1]?.trim();
          const itemsScammed = msg.content?.match(/items scammed:\s*\*{0,2}(.*)/i)?.[1]?.trim();

          if (!userId) continue;

          let data = {};
          const now = Date.now();

          // Try to load from persistent cache
          let cacheHit = false;
          const cached = await env.DB.prepare(`
      SELECT * FROM scammer_profile_cache WHERE user_id = ?
    `).bind(userId).first();

          if (cached && now - cached.updated_at < 7 * 24 * 60 * 60 * 1000) { // 7 days
            data = {
              name: cached.roblox_name,
              displayName: cached.roblox_display_name,
              avatar: cached.avatar,
              discordDisplayName: cached.discord_display_name
            };
            cacheHit = true;
          }

          // If not cached, fetch and store
          if (!cacheHit) {
            for (let attempt = 0; attempt < 5; attempt++) {
              try {
                const res = await fetch(`https://emwiki.site/api/roblox-proxy?userId=${userId}&discordId=${discordid}`);
                if (res.ok) {
                  data = await res.json();

                  await env.DB.prepare(`
              INSERT INTO scammer_profile_cache (user_id, roblox_name, roblox_display_name, avatar, discord_id, discord_display_name, updated_at)
              VALUES (?, ?, ?, ?, ?, ?, ?)
              ON CONFLICT(user_id) DO UPDATE SET
                roblox_name = excluded.roblox_name,
                roblox_display_name = excluded.roblox_display_name,
                avatar = excluded.avatar,
                discord_id = excluded.discord_id,
                discord_display_name = excluded.discord_display_name,
                updated_at = excluded.updated_at
            `).bind(
                    userId,
                    data.name || null,
                    data.displayName || null,
                    data.avatar || null,
                    discordid || null,
                    data.discordDisplayName || null,
                    now
                  ).run();

                  break;
                }
              } catch { }
              await new Promise(r => setTimeout(r, 500 * (attempt + 1)));
            }
          }

          scammers.push({
            robloxUser: data.displayName || data.name || robloxUserMatch?.[1]?.trim() || "Unknown",
            robloxProfile,
            avatar: data.avatar || null,
            discordDisplay: data.discordDisplayName || discordid || "Unknown",
            victims: victims || "Unknown",
            itemsScammed: itemsScammed || "Unknown",
          });

        } catch {
          // Skip on error
        }
      }



      const validScammers = scammers.filter(entry => entry);
      const payload = JSON.stringify(validScammers);

      await env.DB.prepare(`
        INSERT INTO scammer_cache (key, value, updated_at)
        VALUES (?, ?, ?)
        ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
      `).bind(CACHE_KEY, payload, Date.now()).run();

      return new Response(payload, {
        headers: { "Content-Type": "application/json", "X-Cache": "D1-MISS" },
      });

    } catch (err) {
      return new Response(JSON.stringify({ error: err.message }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }
  }

  // Fallback lookup for specific user
  if (!userId && !discordId) {
    return new Response(JSON.stringify({ error: "Missing userId or discordId" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  let robloxData = {};
  let discordDisplayName = null;



  if (userId) {
  const now = Date.now();
  const cached = await env.DB.prepare(`
    SELECT * FROM scammer_profile_cache WHERE user_id = ?
  `).bind(userId).first();

  if (cached && now - cached.updated_at < 7 * 24 * 60 * 60 * 1000) {
    return new Response(JSON.stringify({
      name: cached.roblox_name || "Unknown",
      displayName: cached.roblox_display_name || "Unknown",
      avatar: cached.avatar || null,
      discordDisplayName: cached.discord_display_name || "Unknown"
    }), {
      headers: { "Content-Type": "application/json" },
    });
  }

  // Not cached or expired — fetch it now
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const userRes = await fetch(`https://users.roblox.com/v1/users/${userId}`);
      if (userRes.ok) {
        const userData = await userRes.json();
        robloxData.name = userData.name;
        robloxData.displayName = userData.displayName;
        break;
      }
    } catch {}
    await new Promise(r => setTimeout(r, 500 * (attempt + 1)));
  }

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const thumbRes = await fetch(`https://thumbnails.roblox.com/v1/users/avatar-headshot?userIds=${userId}&size=100x100&format=Png&isCircular=false`);
      if (thumbRes.ok) {
        const thumbData = await thumbRes.json();
        robloxData.avatar = thumbData.data?.[0]?.imageUrl;
        break;
      }
    } catch {}
    await new Promise(r => setTimeout(r, 500 * (attempt + 1)));
  }

  // Only write to cache if something valid was fetched
  if (robloxData.name || robloxData.displayName || robloxData.avatar) {
    await env.DB.prepare(`
      INSERT INTO scammer_profile_cache (user_id, roblox_name, roblox_display_name, avatar, updated_at)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(user_id) DO UPDATE SET
        roblox_name = excluded.roblox_name,
        roblox_display_name = excluded.roblox_display_name,
        avatar = excluded.avatar,
        updated_at = excluded.updated_at
    `).bind(
      userId,
      robloxData.name || null,
      robloxData.displayName || null,
      robloxData.avatar || null,
      now
    ).run();
  }
}



  if (discordId) {
    const maxRetries = 3;
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        const discordRes = await fetch(`https://discord.com/api/v10/users/${discordId}`, {
          headers: { Authorization: `Bot ${env.DISCORD_BOT_TOKEN}` }
        });

        if (discordRes.ok) {
          const discordData = await discordRes.json();
          discordDisplayName = discordData.global_name || `${discordData.username}#${discordData.discriminator}`;
          if (userId && discordDisplayName) {
            await env.DB.prepare(`
              UPDATE scammer_profile_cache
              SET discord_display_name = ?, discord_id = ?
              WHERE user_id = ?
            `).bind(
              discordDisplayName,
              discordId,
              userId
            ).run();
          } 

          break;
        }
      } catch {
        await new Promise(r => setTimeout(r, 500 * (attempt + 1)));
      }
    }
  }

  if (!robloxData.name && !robloxData.displayName && !robloxData.avatar && !discordDisplayName) {
    return new Response(JSON.stringify({ error: "No user data found" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }

  return new Response(JSON.stringify({
    name: robloxData.name || "Unknown",
    displayName: robloxData.displayName || "Unknown",
    avatar: robloxData.avatar || null,
    discordDisplayName: discordDisplayName || "Unknown"
  }), {
    headers: { "Content-Type": "application/json" },
  });
}