/**
 * ============================================================================
 * DONATIONS WEBHOOK - Handles webhook requests from Roblox game
 * ============================================================================
 * 
 * Endpoint: POST /api/donations/webhook
 * 
 * This endpoint receives transaction data from the Roblox game via webhook.
 * Also accessible via POST /api/donations?webhook=true
 * ============================================================================
 */

/**
 * Replace aggregated totals for a user
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
 * Process webhook transactions (handles both game format and full Roblox API format)
 * Game format: {userId, productId, price}
 * API format: {transactionType: 'Sale', agent: {id}, currency: {amount}, ...}
 */
async function processGameWebhookTransactions(kv, transactions) {
  const processed = [];
  const seenTokens = new Set();

  for (const tx of transactions) {
    let userId, price;

    // Check if it's the game format (simple: {userId, productId, price})
    if (tx.userId !== undefined && tx.price !== undefined) {
      userId = tx.userId;
      price = tx.price;
      
      // Validate
      if (!userId || price <= 0) continue;
    }
    // Check if it's the full Roblox API format
    else if (tx.transactionType === 'Sale' && tx.currency?.type === 'Robux') {
      // Skip if already processed (check by purchaseToken)
      if (tx.purchaseToken && seenTokens.has(tx.purchaseToken)) {
        continue;
      }
      if (tx.purchaseToken) {
        seenTokens.add(tx.purchaseToken);
      }

      // Extract user ID from agent (the buyer)
      userId = tx.agent?.id;
      if (!userId) continue;

      // Extract price (in Robux, before Roblox takes their cut)
      price = tx.currency?.amount || 0;
      if (price <= 0) continue;
    } else {
      // Unknown format, skip
      continue;
    }

    // Increment totals for this user
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

  return processed;
}

export async function onRequest(context) {
  const { request, env } = context;
  const kv = env.DONATIONS_KV;

  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  try {
    const data = await request.json();

    // Support multiple formats:
    // 1. Game format: {userId, productId, price}
    // 2. Full Roblox API format: {transactionType: 'Sale', agent: {id}, currency: {amount}, ...}
    // 3. Array of either format
    let transactions = [];
    
    if (Array.isArray(data)) {
      transactions = data;
    } else if (data.transactions && Array.isArray(data.transactions)) {
      transactions = data.transactions;
    } else if (data.userId && data.price !== undefined) {
      // Game format: simple {userId, productId, price}
      transactions = [data];
    } else if (data.transactionType === 'Sale') {
      // Full Roblox API format
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

    // Process transactions (handles both formats)
    const processed = await processGameWebhookTransactions(kv, transactions);

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
