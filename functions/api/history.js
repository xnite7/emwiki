export async function onRequestGet(context) {
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
      headers: { "Content-Type": "application/json" }
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message, stack: err.stack }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
}
