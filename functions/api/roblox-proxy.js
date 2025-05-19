export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const userId = url.searchParams.get("userId");
  const discordId = url.searchParams.get("discordId"); // Optional

  if (!userId) {
    return new Response(JSON.stringify({ error: "Missing userId" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    // Roblox API calls
    const [userRes, thumbRes] = await Promise.all([
      fetch(`https://users.roblox.com/v1/users/${userId}`),
      fetch(`https://thumbnails.roblox.com/v1/users/avatar-headshot?userIds=${userId}&size=100x100&format=Png&isCircular=false`)
    ]);

    if (!userRes.ok || !thumbRes.ok) {
      return new Response(JSON.stringify({ error: "User not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }

    const userData = await userRes.json();
    const thumbData = await thumbRes.json();
    const imageUrl = thumbData.data?.[0]?.imageUrl;

    let discordDisplayName = null;

    // Optional Discord lookup
    if (discordId) {
      const discordRes = await fetch(`https://discord.com/api/v10/users/${discordId}`, {
        headers: {
          "Authorization": `Bot ${env.DISCORD_BOT_TOKEN}`
        }
      });

      if (discordRes.ok) {
        const discordData = await discordRes.json();
        discordDisplayName = discordData.global_name || `${discordData.username}#${discordData.discriminator}`;
      }
    }

    return new Response(JSON.stringify({
      name: userData.name,
      displayName: userData.displayName,
      avatar: imageUrl,
      discordDisplayName: discordDisplayName
    }), {
      headers: { "Content-Type": "application/json" },
    });

  } catch (e) {
    return new Response(JSON.stringify({ error: "Server error", details: e.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
