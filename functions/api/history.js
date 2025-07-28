export async function onRequestGet(context) {
  const DBH = context.env.DBH;

  try {
    const result = await DBH.prepare(`
      SELECT id, timestamp, username, diff
      FROM history
      ORDER BY timestamp DESC
      LIMIT 50
    `).all();

    return Response.json(result.results);
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message, stack: err.stack }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
}
