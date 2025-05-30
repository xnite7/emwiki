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

      const scammers = await Promise.all(
        allMessages.map(async (msg) => {
          try {
            const discordMatch = msg.content?.match(/discord user:\s*\*{0,2}\s*([^\n\r]+)/i);
            const robloxProfileMatch = msg.content?.match(/https:\/\/www\.roblox\.com\/users\/(\d+)\/profile/i);
            const robloxUserMatch = msg.content?.match(/roblox user:\s*\*{0,2}(.*)/i);

            const discordid = discordMatch ? discordMatch[1].trim().split(',')[0] : null;
            const robloxProfile = robloxProfileMatch ? `https://www.roblox.com/users/${robloxProfileMatch[1]}/profile` : null;
            const userId = robloxProfileMatch ? robloxProfileMatch[1] : null;
            const victims = msg.content?.match(/victims:\s*\*{0,2}(.*)/i)?.[1]?.trim();
            const itemsScammed = msg.content?.match(/items scammed:\s*\*{0,2}(.*)/i)?.[1]?.trim();

            if (!userId) return null;

            let data = {};
            const maxRetries = 5;
            for (let attempt = 0; attempt < maxRetries; attempt++) {
              try {
                const response = await fetch(`https://emwiki.site/api/roblox-proxy?userId=${userId}&discordId=${discordid}`);
                if (response.ok) {
                  data = await response.json();
                  break;
                }
              } catch {}
              await new Promise(r => setTimeout(r, 500 * (attempt + 1)));
            }

            if (!data.displayName && !data.name && !data.avatar && !data.discordDisplayName) {
              return null;
            }

            return {
              robloxUser: data.displayName || data.name || robloxUserMatch?.[1]?.trim() || "Unknown",
              robloxProfile,
              avatar: data.avatar || null,
              discordDisplay: data.discordDisplayName || discordid || "Unknown",
              victims: victims || "Unknown",
              itemsScammed: itemsScammed || "Unknown",
            };
          } catch {
            return null;
          }
        })
      );

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