// functions/api/admin-login.js
import { createSession } from "./_utils/auth.js";

export const onRequestPost = async ({ request, env }) => {
  try {
    // Parse JSON body
    let key;
    try {
      const data = await request.json();
      key = data.key?.trim();
      if (!key) throw new Error("No key provided");
    } catch {
      return new Response(JSON.stringify({ error: "Invalid request body" }), { status: 400 });
    }

    // Lookup admin in D1 by raw key
    const row = await env.DBH.prepare("SELECT name FROM admins WHERE key_hash = ?")
      .bind(key)
      .first()
      .catch(() => null);

    if (!row) {
      return new Response(JSON.stringify({ error: "Invalid key" }), { status: 401 });
    }

    // Create a session token
    if (!env.SECRET_KEY) throw new Error("Missing SECRET_KEY in environment");
    const token = await createSession(row.name, env.SECRET_KEY);

    // Respond with JSON + Set-Cookie
    return new Response(JSON.stringify({ ok: true, name: row.name }), {
      headers: {
        "Content-Type": "application/json",
        "Set-Cookie": `session=${token}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=86400`
      }
    });
  } catch (err) {
    console.error("admin-login error:", err);
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
};
