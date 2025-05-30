export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const mode = url.searchParams.get("mode");
  const userId = url.searchParams.get("userId");
  const discordId = url.searchParams.get("discordId");

  let scammerCache = null;
let scammerCacheTime = 0;

if (mode === "discord-scammers") {
  const channelId = env.DISCORD_CHANNEL_ID;

  // Use cache if valid
  if (scammerCache && (Date.now() - scammerCacheTime < 2 * 60 * 1000)) {
    return new Response(JSON.stringify(scammerCache), {
      headers: { "Content-Type": "application/json" }
    });
  }

  const allMessages = [];
  let lastMessageId = null;

  try {
    // Paginate up to 500 messages in batches of 25
    while (allMessages.length < 500) {
      const url = new URL(`https://discord.com/api/v10/channels/${channelId}/messages`);
      url.searchParams.set("limit", "25");
      if (lastMessageId) url.searchParams.set("before", lastMessageId);

      const messagesRes = await fetch(url.toString(), {
        headers: {
          Authorization: `Bot ${env.DISCORD_BOT_TOKEN}`
        }
      });

      if (!messagesRes.ok) break;

      const batch = await messagesRes.json();
      if (batch.length === 0) break;

      allMessages.push(...batch);
      lastMessageId = batch[batch.length - 1].id;
    }

    const scammers = await Promise.all(
      allMessages.map(async (msg) => {
        const content = msg.content;
        const discordMatch = content.match(/discord user:\s*\*\*\s*(.*)/);
        const robloxUserMatch = content.match(/roblox user:\s*\*\*\s*(.*)/);
        const robloxProfileMatch = content.match(/https:\/\/www\.roblox\.com\/users\/\d+\/profile/);

        const discordid = discordMatch ? discordMatch[1].trim().split(',')[0] : null;
        const robloxProfile = robloxProfileMatch ? robloxProfileMatch[0] : null;
        const userIdMatch = robloxProfile ? robloxProfile.match(/users\/(\d+)\/profile/) : null;

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
            robloxAlts: robloxAlts || null,
          };
        } catch (err) {
          return null;
        }
      })
    );

    const filteredScammers = scammers.filter(Boolean);
    scammerCache = filteredScammers;
    scammerCacheTime = Date.now();

    return new Response(JSON.stringify(filteredScammers), {
      headers: { "Content-Type": "application/json" }
    });

  } catch (error) {
    return new Response("Error fetching Discord scammers", { status: 500 });
  }
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
