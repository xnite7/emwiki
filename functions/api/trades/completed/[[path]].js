import {
    authenticateUser,
    isAuthorized,
    errorResponse,
    successResponse,
    getUserWithStats,
    parsePagination,
    safeJsonParse,
    userIdForms,
    isSameUser
} from '../_utils/helpers.js';

// Handle GET requests
async function handleGet(request, env, path, user) {
    if (!user || !isAuthorized(user)) {
        return errorResponse('Unauthorized', 401);
    }

    const url = new URL(request.url);

    // GET /api/trades/completed - List the authenticated user's completed trades
    if (!path || path === '') {
        const { limit, offset } = parsePagination(url);

        // Match both the canonical and legacy ".0" id forms (see helpers).
        const me = userIdForms(user.user_id);
        const { results } = await env.DBA.prepare(`
            SELECT
                ct.*,
                (SELECT COUNT(*) FROM trade_reviews r
                 WHERE r.trade_id = ct.id AND r.reviewer_id IN (?, ?)) AS reviewed_by_me
            FROM completed_trades ct
            WHERE ct.seller_id IN (?, ?) OR ct.buyer_id IN (?, ?)
            ORDER BY ct.completed_at DESC
            LIMIT ? OFFSET ?
        `).bind(...me, ...me, ...me, limit, offset).all();

        const trades = await Promise.all((results || []).map(async (trade) => {
            const isSeller = isSameUser(trade.seller_id, user.user_id);
            const otherUserId = isSeller ? trade.buyer_id : trade.seller_id;
            const otherUser = await getUserWithStats(env, otherUserId);

            return {
                id: trade.id,
                listing_id: trade.listing_id,
                offer_id: trade.offer_id,
                completed_at: trade.completed_at,
                role: isSeller ? 'seller' : 'buyer',
                my_items: safeJsonParse(isSeller ? trade.seller_items : trade.buyer_items),
                their_items: safeJsonParse(isSeller ? trade.buyer_items : trade.seller_items),
                reviewed_by_me: trade.reviewed_by_me > 0,
                other_user: otherUser ? {
                    user_id: otherUser.user_id,
                    username: otherUser.username,
                    display_name: otherUser.display_name,
                    avatar_url: otherUser.avatar_url,
                    average_rating: otherUser.average_rating || 0,
                    total_trades: otherUser.total_trades || 0
                } : null
            };
        }));

        return successResponse({ trades, limit, offset });
    }

    // GET /api/trades/completed/:id - Get a specific completed trade
    const tradeId = path.split('/')[0];
    if (tradeId) {
        const trade = await env.DBA.prepare(
            'SELECT * FROM completed_trades WHERE id = ?'
        ).bind(tradeId).first();

        if (!trade) {
            return errorResponse('Trade not found', 404);
        }

        // Only participants can view
        if (!isSameUser(trade.seller_id, user.user_id) && !isSameUser(trade.buyer_id, user.user_id)) {
            return errorResponse('Unauthorized to view this trade', 403);
        }

        const isSeller = isSameUser(trade.seller_id, user.user_id);
        const otherUserId = isSeller ? trade.buyer_id : trade.seller_id;
        const otherUser = await getUserWithStats(env, otherUserId);

        const existingReview = await env.DBA.prepare(
            'SELECT id FROM trade_reviews WHERE trade_id = ? AND reviewer_id IN (?, ?)'
        ).bind(tradeId, ...userIdForms(user.user_id)).first();

        return successResponse({
            trade: {
                id: trade.id,
                listing_id: trade.listing_id,
                offer_id: trade.offer_id,
                completed_at: trade.completed_at,
                role: isSeller ? 'seller' : 'buyer',
                my_items: safeJsonParse(isSeller ? trade.seller_items : trade.buyer_items),
                their_items: safeJsonParse(isSeller ? trade.buyer_items : trade.seller_items),
                reviewed_by_me: !!existingReview,
                other_user: otherUser ? {
                    user_id: otherUser.user_id,
                    username: otherUser.username,
                    display_name: otherUser.display_name,
                    avatar_url: otherUser.avatar_url,
                    average_rating: otherUser.average_rating || 0,
                    total_trades: otherUser.total_trades || 0
                } : null
            }
        });
    }

    return errorResponse('Invalid request', 400);
}

// Main handler
export async function onRequest(context) {
    const { request, env } = context;
    const url = new URL(request.url);
    const prefix = '/api/trades/completed';
    const path = url.pathname.startsWith(prefix)
        ? url.pathname.slice(prefix.length).replace(/^\//, '')
        : '';

    // CORS headers
    const corsHeaders = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    };

    // Handle OPTIONS request
    if (request.method === 'OPTIONS') {
        return new Response(null, { headers: corsHeaders });
    }

    try {
        const user = await authenticateUser(request, env);

        let response;
        switch (request.method) {
            case 'GET':
                response = await handleGet(request, env, path, user);
                break;
            default:
                response = errorResponse('Method not allowed', 405);
        }

        // Add CORS headers to response
        const headers = new Headers(response.headers);
        Object.entries(corsHeaders).forEach(([key, value]) => {
            headers.set(key, value);
        });

        return new Response(response.body, {
            status: response.status,
            headers
        });
    } catch (error) {
        console.error('Trade completed error:', error);
        return new Response(JSON.stringify({ error: 'Internal server error' }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
    }
}
