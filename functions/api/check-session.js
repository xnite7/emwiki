export const onRequestGet = async ({ request, env }) => {
  const cookie = request.headers.get("Cookie") || "";
  const session = cookie.split("; ").find(c => c.startsWith("session="))?.split("=")[1];
  if (!session) return new Response(JSON.stringify({ ok: false }), { status: 401 });

  const payload = await verifySession(session, env.SECRET_KEY);
  if (!payload) return new Response(JSON.stringify({ ok: false }), { status: 401 });

  return new Response(JSON.stringify({ ok: true, name: payload.name }));
};
