const CACHE_KEY = "discord-scammers-cache.json";
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const mode = url.searchParams.get("mode");
  const userId = url.searchParams.get("userId");
  const discordId = url.searchParams.get("discordId");

  if (mode === "discord-scammers") {
    try {
      // Try to get from R2
      const obj = await env.SCAMMER_CACHE.get(CACHE_KEY);
      if (obj) {
        const meta = obj.httpMetadata || {};
        const lastModified = new Date(meta.lastModified || obj.uploaded || 0).getTime();
        const age = Date.now() - lastModified;

        if (age < CACHE_TTL_MS) {
          const body = await obj.text();
          return new Response(body, {
            headers: {
              "Content-Type": "application/json",
              "X-Cache": "R2-HIT"
            }
          });
        }
      }

      // Fetch fresh messages from Discord
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
          const userIdMatch = robloxProfile ? robloxProfile.match(/users\/(\d+)\/profile/) : null;
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

      const filtered = scammers.filter(Boolean);
      const payload = JSON.stringify(filtered);

      // Save to R2
      await env.SCAMMER_CACHE.put(CACHE_KEY, payload, {
        httpMetadata: {
          contentType: "application/json",
        },
      });

      return new Response(payload, {
        headers: {
          "Content-Type": "application/json",
          "X-Cache": "R2-MISS",
        },
      });
    } catch (err) {
      return new Response(JSON.stringify({ error: "Internal error" }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }
  }

  // === fallback lookup for single users (unchanged) ===
  // (leave your existing userId/discordId handling here)
  if (userId) {
    const response = await fetch(`https://emwiki.site/api/roblox-proxy?userId=${userId}`);
    const data = await response.json();
    return new Response(JSON.stringify(data), {
      headers: { "Content-Type": "application/json" },
    });
  }

  if (discordId) {
    const response = await fetch(`https://emwiki.site/api/roblox-proxy?discordId=${discordId}`);
    const data = await response.json();
    return new Response(JSON.stringify(data), {
      headers: { "Content-Type": "application/json" },
    });
  }

  return new Response(JSON.stringify({ error: "User not found" }), {
    status: 404,
    headers: { "Content-Type": "application/json" },
  });
}
