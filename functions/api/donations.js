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
      // Get all purchases
      const list = await kv.list({ prefix: 'purchase:', limit: 1000 });

      // Aggregate by userId
      const userTotals = {};
      
      await Promise.all(
        list.keys.map(async (entry) => {
          const raw = await kv.get(entry.name);
          if (!raw) return;
          
          try {
            const purchase = JSON.parse(raw);
            const userId = purchase.userId;
            
            if (!userTotals[userId]) {
              userTotals[userId] = {
                userId,
                totalSpent: 0,
                purchases: 0
              };
            }
            
            userTotals[userId].totalSpent += purchase.price;
            userTotals[userId].purchases += 1;
          } catch (err) {
            console.error('Failed to parse purchase:', err);
          }
        })
      );

      // Fetch profiles for users
      const users = await Promise.all(
        Object.values(userTotals).map(async (userData) => {
          try {
            const res = await fetch(`https://emwiki.site/api/roblox-proxy?userId=${userData.userId}&mode=lite`);
            const profile = res.ok ? await res.json() : {};
            
            return {
              userId: userData.userId,
              totalSpent: userData.totalSpent,
              purchases: userData.purchases,
              name: profile.name || null,
              displayName: profile.displayName || null,
              avatar: profile.avatar || null,
            };
          } catch {
            return {
              userId: userData.userId,
              totalSpent: userData.totalSpent,
              purchases: userData.purchases,
              name: null,
              displayName: null,
              avatar: null,
            };
          }
        })
      );

      // Sort by total spent
      users.sort((a, b) => b.totalSpent - a.totalSpent);

      return new Response(JSON.stringify(users.slice(0, 50)), {
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    } catch (e) {
      return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: corsHeaders });
    }
  }

  return new Response('Not found', { status: 404, headers: corsHeaders });
}