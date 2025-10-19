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

      // ✅ Store each purchase separately with unique timestamp
      const timestamp = Date.now();
      const purchaseKey = `purchase:${userId}:${timestamp}:${productId}`;
      
      await kv.put(purchaseKey, JSON.stringify({
        userId,
        productId,
        price,
        timestamp
      }));

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
          
          // ✅ Data is already aggregated in KV
          const res = await fetch(`https://emwiki.site/api/roblox-proxy?userId=${data.userId}&mode=lite`);
          const profile = res.ok ? await res.json() : {};
          
          return {
            userId: data.userId,
            totalSpent: data.totalSpent || 0, // ✅ Read directly from KV
            purchases: data.purchases || 0,
            name: profile.name || null,
            displayName: profile.displayName || null,
            avatar: profile.avatar || null,
          };
        } catch (err) {
          console.error('Failed to parse:', err);
          return null;
        }
      })
    );

    const filtered = users.filter(Boolean);
    filtered.sort((a, b) => (b.totalSpent || 0) - (a.totalSpent || 0));

    return new Response(JSON.stringify(filtered.slice(0, 50)), {
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: corsHeaders });
  }
}

  return new Response('Not found', { status: 404, headers: corsHeaders });
}