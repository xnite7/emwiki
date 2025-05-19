export async function onRequest(context) {
  const { searchParams } = new URL(context.request.url);
  const userId = searchParams.get('userId');

  if (!userId) {
    return new Response("Missing userId", { status: 400 });
  }

  const res = await fetch(`https://users.roblox.com/v1/users/${userId}`);
  const data = await res.json();

  return new Response(JSON.stringify(data), {
    headers: { 'Content-Type': 'application/json' },
  });
}
