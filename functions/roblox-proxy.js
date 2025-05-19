export async function onRequest(context) {
  const url = new URL(context.request.url);
  const userId = url.searchParams.get("userId");

  if (!userId || !/^\d+$/.test(userId)) {
    return new Response("Missing or invalid userId", { status: 400 });
  }

  const avatarUrl = `https://thumbnails.roblox.com/v1/users/avatar-headshot?userIds=${userId}&size=100x100&format=Png&isCircular=false`;
  const userUrl = `https://users.roblox.com/v1/users/${userId}`;

  try {
    const [avatarRes, userRes] = await Promise.all([
      fetch(avatarUrl),
      fetch(userUrl)
    ]);

    if (!avatarRes.ok || !userRes.ok) {
      return new Response("Failed to fetch Roblox API", { status: 500 });
    }

    const avatarData = await avatarRes.json();
    const userData = await userRes.json();

    return new Response(JSON.stringify({
      avatar: avatarData.data?.[0]?.imageUrl || null,
      displayName: userData.displayName || null,
      name: userData.name || null
    }), {
      headers: { "Content-Type": "application/json" }
    });

  } catch (err) {
    return new Response("Server error", { status: 500 });
  }
}
