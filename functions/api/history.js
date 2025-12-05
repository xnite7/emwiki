export async function onRequest(context) {
  const { request } = context;
  const corsHeaders = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type"
  };

  // Handle CORS preflight
  if (request.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  if (request.method === 'GET') {
    return await onRequestGet(context, corsHeaders);
  }

  if (request.method === 'POST') {
    return await onRequestPost(context, corsHeaders);
  }

  return new Response(JSON.stringify({ error: 'Method not allowed' }), {
    status: 405,
    headers: corsHeaders
  });
}

async function onRequestGet(context, corsHeaders) {
  const DBH = context.env.DBH;

  try {
    const result = await DBH.prepare(`
      SELECT id, timestamp, username, diff, version
      FROM history
      ORDER BY timestamp DESC
      LIMIT 50
    `).all();

    const data = result?.results ?? [];

    return new Response(JSON.stringify(data), {
      status: 200,
      headers: corsHeaders
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message, stack: err.stack }), {
      status: 500,
      headers: corsHeaders
    });
  }
}

async function onRequestPost(context, corsHeaders) {
  const DBH = context.env.DBH;

  try {
    const body = await context.request.json();
    const { username, diff, version } = body;

    if (!diff) {
      return new Response(JSON.stringify({ error: "diff is required" }), {
        status: 400,
        headers: corsHeaders
      });
    }

    const timestamp = new Date().toISOString();
    const finalUsername = username || "unknown";
    const finalVersion = version || null;

    await DBH.prepare(`
      INSERT INTO history (timestamp, username, diff, version)
      VALUES (?, ?, ?, ?)
    `).bind(timestamp, finalUsername, diff, finalVersion).run();

    return new Response(JSON.stringify({ 
      success: true, 
      message: "History entry saved" 
    }), {
      status: 200,
      headers: corsHeaders
    });
  } catch (err) {
    return new Response(JSON.stringify({ 
      error: err.message, 
      stack: err.stack 
    }), {
      status: 500,
      headers: corsHeaders
    });
  }
}