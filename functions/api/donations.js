export async function onRequest(context) {
  const { request, env } = context;
  const kv = env.DONATIONS_KV;

  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (request.method === 'POST') {
    try {
      const { userId, productId, price } = await request.json();
      if (!userId || !productId || typeof price !== 'number') {
        return new Response('Missing or invalid fields', { status: 400, headers: corsHeaders });
      }

      const key = `purchase:${userId}`;
      const existingRaw = await kv.get(key);
      let existing = existingRaw ? JSON.parse(existingRaw) : { userId, totalSpent: 0, purchases: 0 };

      existing.totalSpent += price;
      existing.purchases += 1;

      await kv.put(key, JSON.stringify(existing));

      return new Response(JSON.stringify({ status: 'ok' }), { headers: corsHeaders });
    } catch (e) {
      return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: corsHeaders });
    }
  }

  if (request.method === 'GET') {
    try {
      const list = await kv.list({ prefix: 'purchase:', limit: 1000 });

      const users = await Promise.all(
        list.keys.map(async (entry) => {
          const raw = await kv.get(entry.name);
          if (!raw) return null;
          try {
            const data = JSON.parse(raw);
            const res = await fetch(`https://emwiki.site/api/roblox-proxy?userId=${data.userId}&mode=lite`);
            const profile = res.ok ? await res.json() : {};
            return {
              userId: data.userId,
              totalSpent: data.totalSpent,
              name: profile.name || null,
              displayName: profile.displayName || null,
              avatar: profile.avatar || null,
            };
          } catch {
            return null;
          }
        })
      );

      const filtered = users.filter(Boolean);
      filtered.sort((a, b) => b.totalSpent - a.totalSpent);

      return new Response(JSON.stringify(filtered.slice(0, 50)), {
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    } catch (e) {
      return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: corsHeaders });
    }
  }

  return new Response('Not found', { status: 404, headers: corsHeaders });
}
