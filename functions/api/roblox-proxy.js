export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const mode = url.searchParams.get("mode");
  const userId = url.searchParams.get("userId");
  const discordId = url.searchParams.get("discordId");

  if (mode === "discord-scammers") {
    const channelId = env.DISCORD_CHANNEL_ID;

    try {
      const messagesRes = await fetch(`https://discord.com/api/v10/channels/${channelId}/messages?limit=100`, {
        headers: {
          Authorization: `Bot ${env.ACCESS_TOKEN}`
        }
      });

      if (!messagesRes.ok) {
        return new Response("Failed to fetch messages", { status: 500 });
      }

      const messages = await messagesRes.json();

      const scammers = await Promise.all(
        messages
          .filter(msg => msg.content.includes("discord user:") && msg.content.includes("roblox user:") && msg.content.includes("roblox profile:"))
          .map(async (msg) => {
            const discordMatch = msg.content.match(/discord user:\s*\*\*\s*(.*)/);
            const robloxUserMatch = msg.content.match(/roblox user:\s*\*\*\s*(.*)/);
            const robloxProfileMatch = msg.content.match(/roblox profile:\s*\*\*\s*(https:\/\/www\\.roblox\\.com\/users\/\d+\/profile)/);

            const discordid = discordMatch ? discordMatch[1].trim().split(',')[0] : null;
            const robloxProfile = robloxProfileMatch ? robloxProfileMatch[1].trim() : null;
            const userIdMatch = robloxProfile ? robloxProfile.match(/users\/(\d+)\/profile/) : null;

            if (!userIdMatch) return null;

            const userId = userIdMatch[1];

            try {
              const response = await fetch(`https://emwiki.site/api/roblox-proxy?userId=${userId}&discordId=${discordid}`);
              const data = await response.json();

              return {
                Content: msg.content,
                Timestamp: msg.timestamp,
                AuthorId: msg.author.id,
                robloxUser: data.displayName || robloxUserMatch?.[1] || "N/A",
                robloxProfile: robloxProfile,
                avatar: data.avatar || null,
                discordDisplay: data.discordDisplayName || discordid || "N/A"
              };
            } catch (err) {
              return null;
            }
          })
      );

      return new Response(JSON.stringify(scammers.filter(Boolean)), {
        headers: { "Content-Type": "application/json" }
      });
    } catch (error) {
      return new Response("Error fetching Discord scammers", { status: 500 });
    }
  }

  if (!userId && !discordId) {
    return new Response(JSON.stringify({ error: "Missing userId or discordId" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  let robloxData = null;
  let discordDisplayName = null;

  if (userId) {
    try {
      const [userRes, thumbRes] = await Promise.all([
        fetch(`https://users.roblox.com/v1/users/${userId}`),
        fetch(`https://thumbnails.roblox.com/v1/users/avatar-headshot?userIds=${userId}&size=100x100&format=Png&isCircular=false`)
      ]);

      if (userRes.ok && thumbRes.ok) {
        const userData = await userRes.json();
        const thumbData = await thumbRes.json();
        const imageUrl = thumbData.data?.[0]?.imageUrl;

        robloxData = {
          name: userData.name,
          displayName: userData.displayName,
          avatar: imageUrl
        };
      }
    } catch {
      // Any error: leave robloxData as null
    }
  }

  if (discordId) {
    const maxRetries = 3;
    let attempt = 0;

    while (attempt < maxRetries) {
      try {
        const discordRes = await fetch(`https://discord.com/api/v10/users/${discordId}`, {
          headers: {
            "Authorization": `Bot ${env.DISCORD_BOT_TOKEN}`
          }
        });

        if (discordRes.ok) {
          const discordData = await discordRes.json();
          discordDisplayName = discordData.global_name || `${discordData.username}#${discordData.discriminator}`;
          break;
        }

        attempt++;
        if (attempt < maxRetries) await new Promise(r => setTimeout(r, 500 * attempt));
        else discordDisplayName = null;

      } catch {
        attempt++;
        if (attempt < maxRetries) await new Promise(r => setTimeout(r, 500 * attempt));
        else discordDisplayName = null;
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
