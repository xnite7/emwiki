export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const userId = url.searchParams.get("userId");
  const discordId = url.searchParams.get("discordId"); // Optional

  if (!userId && !discordId) {
    return new Response(JSON.stringify({ error: "Missing userId or discordId" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  let robloxData = null;
  let discordDisplayName = null;

  // Roblox user info
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
    } catch (e) {
      // Log or ignore Roblox error
    }
  }

  // Discord user info
  if (discordId) {
    try {
      const discordRes = await fetch(`https://discord.com/api/v10/users/${discordId}`, {
        headers: {
          "Authorization": `Bot ${env.DISCORD_BOT_TOKEN}`
        }
      });

      if (discordRes.ok) {
        const discordData = await discordRes.json();
        discordDisplayName = discordData.global_name || `${discordData.username}#${discordData.discriminator}`;
      }
    } catch (e) {
      // Log or ignore Discord error
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
