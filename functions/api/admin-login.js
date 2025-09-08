export const onRequestPost = async ({ request, env }) => {
  try {
    const { key } = await request.json();

    // Hash input
    const hashBuffer = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(key));
    const hashHex = [...new Uint8Array(hashBuffer)]
      .map(b => b.toString(16).padStart(2, "0"))
      .join("");

    // Check DBH
    const row = await env.DBH.prepare("SELECT name FROM admins WHERE key_hash = ?")
      .bind(hashHex)
      .first();

    if (!row) {
      return new Response(JSON.stringify({ error: "Invalid key" }), { status: 401 });
    }

    // Create signed token
    const token = await createSession(row.name, env.SECRET_KEY);

    return new Response(JSON.stringify({ ok: true, name: row.name }), {
      headers: {
        "Content-Type": "application/json",
        "Set-Cookie": `session=${token}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=86400`
      }
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
};
