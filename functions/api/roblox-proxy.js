export async function onRequest(context) {
  const { searchParams } = new URL(context.request.url);
  const userId = searchParams.get("userId");

  if (!userId) {
    return new Response("Missing userId", { status: 400 });
  }

  try {
    const avatarResponse = await fetch(`https://thumbnails.roblox.com/v1/users/avatar-headshot?userIds=${userId}&size=100x100&format=Png&isCircular=false`);
    const userResponse = await fetch(`https://users.roblox.com/v1/users/${userId}`);

    const avatarData = await avatarResponse.json();
    const userData = await userResponse.json();

    return new Response(JSON.stringify({
      avatar: avatarData,
      displayName: userData.displayName,
      name: userData.name
    }), {
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (e) {
    return new Response("Error fetching data", { status: 500 });
  }
}
