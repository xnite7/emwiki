export async function onRequestGet(context) {
  const DBH = context.env.DBH;

  try {
    // Select the latest version record
    const row = await DBH.prepare(`
      SELECT timestamp, diff as version
      FROM history
      WHERE username = '__version__'
      ORDER BY timestamp DESC
      LIMIT 1
    `).first();

    if (!row) {
      return new Response(`0:`, { status: 200, headers: { "Content-Type": "text/plain", "Cache-Control": "no-cache" } });
    }

    return new Response(`${row.timestamp}:${row.version}`, {
      headers: { "Content-Type": "text/plain", "Cache-Control": "no-cache" }
    });

  } catch (err) {
    return new Response(`Error: ${err.message}`, { status: 500 });
  }
}
