function corsHeaders(request) {
  const origin = request.headers.get("Origin") || "";
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}


// --------------------- check-session.js ---------------------
import { verifySession } from "./_utils/auth.js";

export const onRequestGet = async ({ request, env }) => {
    // Handle preflight OPTIONS
    if (request.method === "OPTIONS") {
        return new Response(null, { headers: corsHeaders(request) });
    }

    try {
        const cookieHeader = request.headers.get("Cookie") || "";
        const session = cookieHeader
            .split("; ")
            .find(c => c.startsWith("session="))
            ?.split("=")[1];

        if (!session) return new Response(JSON.stringify({ ok: false }), { 
            status: 401, 
            headers: corsHeaders(request) 
        });

        const payload = await verifySession(session, env.SECRET_KEY);
        if (!payload) return new Response(JSON.stringify({ ok: false }), { 
            status: 401, 
            headers: corsHeaders(request) 
        });

        return new Response(JSON.stringify({ ok: true, name: payload.name }), {
            headers: {
                ...corsHeaders(request),
                "Content-Type": "application/json"
            }
        });
    } catch (err) {
        console.error("check-session error:", err);
        return new Response(JSON.stringify({ ok: false, error: err.message }), { 
            status: 500, 
            headers: corsHeaders(request) 
        });
    }
};