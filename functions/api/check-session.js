// functions/api/check-session.js
import { verifySession } from "./_utils/auth.js";

export const onRequestGet = async ({ request, env }) => {
  try {
    const cookieHeader = request.headers.get("Cookie") || "";
    const session = cookieHeader
      .split("; ")
      .find(c => c.startsWith("session="))
      ?.split("=")[1];

    if (!session) {
      return new Response(JSON.stringify({ ok: false }), { status: 401 });
    }

    const payload = await verifySession(session, env.SECRET_KEY);
    if (!payload) {
      return new Response(JSON.stringify({ ok: false }), { status: 401 });
    }

    return new Response(JSON.stringify({ ok: true, name: payload.name }), {
      headers: { "Content-Type": "application/json" }
    });
  } catch (err) {
    console.error("check-session error:", err);
    return new Response(JSON.stringify({ ok: false, error: err.message }), { status: 500 });
  }
};
