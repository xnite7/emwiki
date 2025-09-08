export const onRequestPost = async ({ request, env }) => {
    try {
        const { key } = await request.json();

        const row = await env.DBH.prepare("SELECT name FROM admins WHERE key_hash = ?")
            .bind(key)
            .first();

        if (!row) return new Response(JSON.stringify({ error: "Invalid key" }), { status: 401 });


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
