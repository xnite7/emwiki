/**
 * ============================================================================
 * DONATIONS API - Handles donation tracking with webhook and scheduled updates
 * ============================================================================
 * 
 * Endpoints:
 * - POST /api/donations - Legacy endpoint (backward compatibility)
 * - POST /api/donations/webhook - Webhook endpoint from Roblox game
 * - GET /api/donations?mode=fetch - Scheduled fetch from Roblox API (for cron)
 * - GET /api/donations - Returns donation leaderboard
 * 
 * Storage Structure:
 * - purchase:{userId} - Aggregated totals per user (userId, totalSpent, purchases)
 * - token:{purchaseToken} - Lookup to prevent duplicate processing
 * ============================================================================
 */

/**
 * Replace aggregated totals for a user (used when recalculating from scratch)
 */
async function replaceUserTotals(kv, userId, totalSpent, purchases) {
  const userIdStr = String(userId);
  const purchaseKey = `purchase:${userIdStr}`;
  
  await kv.put(purchaseKey, JSON.stringify({
    userId: parseInt(userIdStr),
    totalSpent,
    purchases
  }));

  return { totalSpent, purchases };
}

/**
 * Process Roblox transaction API response and replace totals (recalculate from scratch)
 * Filters by specific developer product IDs
 */
async function processRobloxTransactionsReplace(kv, transactions, allowedProductIds) {
  // Group transactions by buyer (agent.id)
  const userTotals = new Map(); // userId -> { totalSpent, purchases }

  for (const tx of transactions) {
    // Only process "Sale" transactions with currency type "Robux"
    if (tx.transactionType !== 'Sale' || tx.currency?.type !== 'Robux') {
      continue;
    }

    // Filter by developer product ID if specified
    const productId = tx.details?.id;
    if (allowedProductIds && allowedProductIds.length > 0) {
      if (!productId || !allowedProductIds.includes(productId)) {
        continue; // Skip transactions not for our products
      }
    }

    // Extract user ID from agent (the buyer)
    const userId = tx.agent?.id;
    if (!userId) continue;

    // Extract price (in Robux, before Roblox takes their cut)
    const price = tx.currency?.amount || 0;
    if (price <= 0) continue;

    // Accumulate totals per user
    const userIdStr = String(userId);
    if (!userTotals.has(userIdStr)) {
      userTotals.set(userIdStr, { totalSpent: 0, purchases: 0 });
    }
    
    const totals = userTotals.get(userIdStr);
    totals.totalSpent += price;
    totals.purchases += 1;
  }

  // Replace all user totals in KV
  const processed = [];
  for (const [userIdStr, totals] of userTotals.entries()) {
    await replaceUserTotals(kv, userIdStr, totals.totalSpent, totals.purchases);
    processed.push({
      userId: userIdStr,
      totalSpent: totals.totalSpent,
      purchases: totals.purchases
    });
  }

  return processed;
}

/**
 * Fetch transactions from Roblox API for a specific user (requires authentication cookie)
 */
async function fetchUserTransactions(userId, robloxCookie, cursor = '') {
  try {
    const url = new URL(`https://apis.roblox.com/transaction-records/v1/users/${userId}/transactions`);
    url.searchParams.set('transactionType', 'Sale');
    url.searchParams.set('itemPricingType', 'PaidAndLimited');
    url.searchParams.set('limit', '100');
    if (cursor) {
      url.searchParams.set('cursor', cursor);
    }

    // Format cookie header correctly: .ROBLOSECURITY=<value>
    // Handle both cases: if user provides just the value or the full cookie string
    const cookieValue = robloxCookie.startsWith('.ROBLOSECURITY=') 
      ? robloxCookie 
      : `.ROBLOSECURITY=${robloxCookie}`;

    const headers = {
      'Cookie': cookieValue,
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
    };

    const response = await fetch(url.toString(), { headers });
    if (!response.ok) {
      console.error(`Failed to fetch transactions for user ${userId}: ${response.status} ${response.statusText}`);
      return null;
    }

    return await response.json();
  } catch (e) {
    console.error(`Error fetching transactions for user ${userId}:`, e);
    return null;
  }
}

/**
 * Scheduled fetch mode - processes transactions from Roblox API
 * Only fetches for owner's user ID using their cookie
 * Filters by specific developer product IDs and replaces totals
 */
async function handleScheduledFetch(request, env, kv) {
  try {
    // Get owner's user ID and Roblox cookie from environment variables
    const ownerUserId = env.DONATIONS_OWNER_USER_ID;
    const robloxCookie = env.ROBLOX_COOKIE;
    const productIdsStr = env.DONATIONS_PRODUCT_IDS; // Comma-separated list of product IDs

    if (!ownerUserId) {
      return new Response(JSON.stringify({ error: 'DONATIONS_OWNER_USER_ID not configured' }), {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        }
      });
    }

    if (!robloxCookie) {
      return new Response(JSON.stringify({ error: 'ROBLOX_COOKIE not configured' }), {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        }
      });
    }

    // Parse product IDs (comma-separated string to array of numbers)
    let allowedProductIds = null;
    if (productIdsStr) {
      allowedProductIds = productIdsStr.split(',').map(id => parseInt(id.trim())).filter(id => !isNaN(id));
      if (allowedProductIds.length === 0) {
        allowedProductIds = null; // If invalid, don't filter
      }
    }

    // Fetch all transactions for owner's account
    let allTransactions = [];
    let cursor = '';
    let hasMore = true;

    while (hasMore) {
      const data = await fetchUserTransactions(ownerUserId, robloxCookie, cursor);
      if (!data || !data.data || data.data.length === 0) {
        hasMore = false;
        break;
      }

      allTransactions.push(...data.data);

      cursor = data.nextPageCursor || null;
      hasMore = !!cursor;

      // Rate limiting: wait between API calls
      if (hasMore) {
        await new Promise(r => setTimeout(r, 500));
      }
    }

    // Process all transactions and replace totals
    const processed = await processRobloxTransactionsReplace(kv, allTransactions, allowedProductIds);

    return new Response(JSON.stringify({
      status: 'ok',
      ownerUserId,
      totalTransactions: allTransactions.length,
      processedUsers: processed.length,
      allowedProductIds: allowedProductIds || 'all',
      results: processed
    }), {
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    });
  } catch (e) {
    console.error('Scheduled fetch error:', e);
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    });
  }
}

/**
 * Webhook endpoint - receives transaction data from Roblox game
 */
async function handleWebhook(request, env, kv) {
  try {
    const data = await request.json();

    // Support both direct transaction format and wrapped format
    let transactions = [];
    if (Array.isArray(data)) {
      transactions = data;
    } else if (data.transactions && Array.isArray(data.transactions)) {
      transactions = data.transactions;
    } else if (data.transactionType === 'Sale') {
      // Single transaction
      transactions = [data];
    } else {
      return new Response(JSON.stringify({ error: 'Invalid webhook format' }), {
        status: 400,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        }
      });
    }

    // Webhook still uses increment logic (for real-time updates)
    // This processes transactions and increments totals
    const processed = [];
    const seenTokens = new Set();

    for (const tx of transactions) {
      if (tx.purchaseToken && seenTokens.has(tx.purchaseToken)) {
        continue;
      }
      if (tx.purchaseToken) {
        seenTokens.add(tx.purchaseToken);
      }

      if (tx.transactionType !== 'Sale' || tx.currency?.type !== 'Robux') {
        continue;
      }

      const userId = tx.agent?.id;
      if (!userId) continue;

      const price = tx.currency?.amount || 0;
      if (price <= 0) continue;

      const userIdStr = String(userId);
      const purchaseKey = `purchase:${userIdStr}`;
      const existing = await kv.get(purchaseKey);
      
      let totalSpent = price;
      let purchases = 1;
      
      if (existing) {
        try {
          const data = JSON.parse(existing);
          totalSpent = (data.totalSpent || 0) + price;
          purchases = (data.purchases || 0) + 1;
        } catch (e) {
          console.error('Failed to parse existing purchase data:', e);
        }
      }

      await replaceUserTotals(kv, userId, totalSpent, purchases);
      processed.push({
        userId: userIdStr,
        price,
        totalSpent,
        purchases
      });
    }

    return new Response(JSON.stringify({
      status: 'ok',
      processed: processed.length,
      transactions: processed
    }), {
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    });
  } catch (e) {
    console.error('Webhook processing error:', e);
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    });
  }
}

export async function onRequest(context) {
  const { request, env } = context;
  const kv = env.DONATIONS_KV;
  const url = new URL(request.url);

  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  // Scheduled fetch mode (for cron trigger)
  const mode = url.searchParams.get('mode');
  if (mode === 'fetch' && request.method === 'GET') {
    return handleScheduledFetch(request, env, kv);
  }

  // Webhook endpoint via query parameter (from Roblox game)
  // Can also be called as /api/donations/webhook via donations/webhook.js
  const isWebhook = url.searchParams.get('webhook') === 'true' || url.pathname.endsWith('/webhook');
  if (isWebhook && request.method === 'POST') {
    return handleWebhook(request, env, kv);
  }

  // Legacy POST endpoint (backward compatibility)
  if (request.method === 'POST') {
    try {
      const { userId, productId, price } = await request.json();
      if (!userId || !productId || typeof price !== 'number') {
        return new Response(JSON.stringify({ error: 'Missing or invalid fields' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      // Legacy endpoint still increments (for backward compatibility)
      const userIdStr = String(userId);
      const purchaseKey = `purchase:${userIdStr}`;
      const existing = await kv.get(purchaseKey);
      
      let totalSpent = price;
      let purchases = 1;
      
      if (existing) {
        try {
          const data = JSON.parse(existing);
          totalSpent = (data.totalSpent || 0) + price;
          purchases = (data.purchases || 0) + 1;
        } catch (e) {
          console.error('Failed to parse existing purchase data:', e);
        }
      }

      const result = await replaceUserTotals(kv, userId, totalSpent, purchases);

      return new Response(JSON.stringify({ status: 'ok', ...result }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    } catch (e) {
      return new Response(JSON.stringify({ error: e.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
  }

  // GET endpoint - returns leaderboard
  if (request.method === 'GET') {
    try {
      const list = await kv.list({ prefix: 'purchase:', limit: 1000 });

      const users = await Promise.all(
        list.keys.map(async (entry) => {
          const raw = await kv.get(entry.name);
          if (!raw) return null;

          try {
            const data = JSON.parse(raw);
            const userId = data.userId;

            // Fetch user profile from roblox-proxy
            const res = await fetch(`https://emwiki.com/api/roblox-proxy?userId=${userId}&mode=lite`);
            const profile = res.ok ? await res.json() : {};

            return {
              userId,
              totalSpent: data.totalSpent || 0,
              purchases: data.purchases || 0,
              name: profile.name || null,
              displayName: profile.displayName || null,
              avatar: profile.avatar || null,
            };
          } catch (err) {
            console.error('Failed to parse user data:', err);
            return null;
          }
        })
      );

      const filtered = users.filter(Boolean);
      filtered.sort((a, b) => (b.totalSpent || 0) - (a.totalSpent || 0));

      const limit = parseInt(url.searchParams.get('limit') || '50');
      return new Response(JSON.stringify(filtered.slice(0, limit)), {
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    } catch (e) {
      return new Response(JSON.stringify({ error: e.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
  }

  return new Response(JSON.stringify({ error: 'Not found' }), {
    status: 404,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  });
}