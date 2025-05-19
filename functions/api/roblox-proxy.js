export async function onRequestGet({ request }) {
  const url = new URL(request.url);
  const userId = url.searchParams.get("userId");

  if (!userId) {
    return new Response(JSON.stringify({ error: "Missing userId" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
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

    return new Response(JSON.stringify({
      name: userData.name,
      displayName: userData.displayName,
      avatar: imageUrl
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
