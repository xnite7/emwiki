// Helper for CORS
function corsHeaders(request) {
    const origin = request.headers.get("Origin") || "";
    return {
        "Access-Control-Allow-Origin": origin,
        "Access-Control-Allow-Credentials": "true",
        "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
    };
}


// --------------------- admin-login.js ---------------------
import { createSession } from "./_utils/auth.js";

export const onRequestPost = async ({ request, env }) => {
    // Handle preflight OPTIONS
    if (request.method === "OPTIONS") {
        return new Response(null, { headers: corsHeaders(request) });
    }


    try {
        const data = await request.json();
        const key = data.key?.trim();
        if (!key) throw new Error("No key provided");

        const row = await env.DBH.prepare("SELECT name FROM admins WHERE key_hash = ?")
            .bind(key)
            .first()
            .catch(() => null);

        if (!row) {
            return new Response(JSON.stringify({ error: "Invalid key" }), {
                status: 401,
                headers: corsHeaders(request)
            });
        }

        const token = await createSession(row.name, env.SECRET_KEY);

        return new Response(JSON.stringify({ ok: true, name: row.name }), {
            headers: {
                ...corsHeaders(request),
                "Content-Type": "application/json",
                "Set-Cookie": `session=${token}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=86400`
            }
        });
    } catch (err) {
        console.error("admin-login error:", err);
        return new Response(JSON.stringify({ error: err.message }), {
            status: 500,
            headers: corsHeaders(request)
        });
    }
};