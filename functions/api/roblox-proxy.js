const CACHE_KEY = "discord-scammers";
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const mode = url.searchParams.get("mode");
  const userId = url.searchParams.get("userId");
  const discordId = url.searchParams.get("discordId");

  if (mode === "discord-scammers") {
    try {
      // Check cache in D1
      const { results } = await env.DB.prepare(
        "SELECT value, updated_at FROM scammer_cache WHERE key = ?"
      ).bind(CACHE_KEY).all();

      if (results.length > 0) {
        const { value, updated_at } = results[0];
        if (Date.now() - updated_at < CACHE_TTL_MS) {
          return new Response(value, {
            headers: { "Content-Type": "application/json", "X-Cache": "D1-HIT" },
          });
        }
      }

      // Fetch Discord messages
      const channelId = env.DISCORD_CHANNEL_ID;
      let allMessages = [];
      let before = null;

      for (let i = 0; i < 5; i++) {
        const fetchUrl = new URL(`https://discord.com/api/v10/channels/${channelId}/messages`);
        fetchUrl.searchParams.set("limit", "100");
        if (before) fetchUrl.searchParams.set("before", before);

        const response = await fetch(fetchUrl.toString(), {
          headers: { Authorization: `Bot ${env.DISCORD_BOT_TOKEN}` },
        });

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
      }

      const scammers = await Promise.all(
        allMessages.map(async (msg) => {
          const discordMatch = msg.content?.match(/discord user:\s*\*\*\s*(.*)/);
          const robloxUserMatch = msg.content?.match(/roblox user:\s*\*\*\s*(.*)/);
          const robloxProfileMatch = msg.content?.match(/https:\/\/www\.roblox\.com\/users\/\d+\/profile/);
          const discordid = discordMatch ? discordMatch[1].trim().split(',')[0] : null;
          const robloxProfile = robloxProfileMatch ? robloxProfileMatch[0] : null;
          const userIdMatch = robloxProfile?.match(/users\/(\d+)\/profile/);
          const victims = msg.content?.match(/victims: \*\*(.+)/)?.[1]?.trim();
          const itemsScammed = msg.content?.match(/items scammed: \*\*(.+)/)?.[1]?.trim();

          if (!userIdMatch) return null;
          const userId = userIdMatch[1];

          try {
            const response = await fetch(`https://emwiki.site/api/roblox-proxy?userId=${userId}&discordId=${discordid}`);
            const data = await response.json();

            return {
              robloxUser: data.displayName || robloxUserMatch?.[1] || "N/A",
              robloxProfile,
              avatar: data.avatar || null,
              discordDisplay: data.discordDisplayName || discordid || "N/A",
              victims: victims || "Unknown",
              itemsScammed: itemsScammed || "Unknown",
            };
          } catch {
            return null;
          }
        })
      );

      const validScammers = scammers.filter(entry => entry && entry.avatar); // Only keep those with non-null avatars

      // Check if at least 50% of entries had avatars
      const avatarSuccessRate = validScammers.length / scammers.filter(Boolean).length;

      if (validScammers.length > 0 && avatarSuccessRate >= 0.5) {
        const payload = JSON.stringify(validScammers);

        await env.DB.prepare(`
          INSERT INTO scammer_cache (key, value, updated_at)
          VALUES (?, ?, ?)
          ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
        `).bind(CACHE_KEY, payload, Date.now()).run();

        return new Response(payload, {
          headers: { "Content-Type": "application/json", "X-Cache": "D1-MISS" },
        });
      } else {
        return new Response(JSON.stringify(validScammers), {
          headers: { "Content-Type": "application/json", "X-Cache": "BYPASSED-CACHE" },
        });
      }



    } catch (err) {
      return new Response(JSON.stringify({ error: err.message }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }
  }

  // Fallback userId/discordId lookup
  if (!userId && !discordId) {
    return new Response(JSON.stringify({ error: "Missing userId or discordId" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  let robloxData = null;
  let discordDisplayName = null;

  if (userId) {
  const maxRetries = 3;
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const [userRes, thumbRes] = await Promise.all([
        fetch(`https://users.roblox.com/v1/users/${userId}`),
        fetch(`https://thumbnails.roblox.com/v1/users/avatar-headshot?userIds=${userId}&size=100x100&format=Png&isCircular=false`)
      ]);

      if (userRes.ok && thumbRes.ok) {
        const userData = await userRes.json();
        const thumbData = await thumbRes.json();
        robloxData = {
          name: userData.name,
          displayName: userData.displayName,
          avatar: thumbData.data?.[0]?.imageUrl
        };
        break; // ✅ Success, exit retry loop
      }
    } catch {
      // Silent error, retry after a short delay
    }

    await new Promise(r => setTimeout(r, 500 * (attempt + 1)));
  }
}


  if (discordId) {
    const maxRetries = 3;
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        const discordRes = await fetch(`https://discord.com/api/v10/users/${discordId}`, {
          headers: { "Authorization": `Bot ${env.DISCORD_BOT_TOKEN}` }
        });

        if (discordRes.ok) {
          const discordData = await discordRes.json();
          discordDisplayName = discordData.global_name || `${discordData.username}#${discordData.discriminator}`;
          break;
        }
      } catch {
        await new Promise(r => setTimeout(r, 500 * (attempt + 1)));
      }
    }
  }

  if (!robloxData && !discordDisplayName) {
    return new Response(JSON.stringify({ error: "No user data found" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }

  return new Response(JSON.stringify({
    ...robloxData,
    discordDisplayName
  }), {
    headers: { "Content-Type": "application/json" },
  });
}

