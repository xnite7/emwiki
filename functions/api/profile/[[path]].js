// Profile API endpoints

async function handleGetProfile(request, env) {
    const url = new URL(request.url);
    const pathParts = url.pathname.split('/api/profile/').filter(Boolean);
    const userId = pathParts[0];

    if (!userId) {
        return new Response(JSON.stringify({ error: 'User ID required' }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' }
        });
    }

    // Get user basic info
    const user = await env.DBA.prepare(`
        SELECT
            user_id,
            username,
            display_name,
            avatar_url,
            role,
            created_at,
            last_online
        FROM users
        WHERE user_id = ?
    `).bind(userId).first();

    if (!user) {
        return new Response(JSON.stringify({ error: 'User not found' }), {
            status: 404,
            headers: { 'Content-Type': 'application/json' }
        });
    }

    // Get user trade stats
    const stats = await env.DBA.prepare(`
        SELECT
            total_trades,
            successful_trades,
            average_rating,
            total_reviews,
            last_trade_at
        FROM user_trade_stats
        WHERE user_id = ?
    `).bind(userId).first();

    // Get user reviews
    const { results: reviews } = await env.DBA.prepare(`
        SELECT
            r.*,
            u.username as reviewer_username,
            u.display_name as reviewer_display_name,
            u.avatar_url as reviewer_avatar
        FROM trade_reviews r
        JOIN users u ON r.reviewer_id = u.user_id
        WHERE r.reviewed_user_id = ?
        ORDER BY r.created_at DESC
        LIMIT 10
    `).bind(userId).all();

    // Get recent completed trades (limited info for privacy)
    const { results: recentTrades } = await env.DBA.prepare(`
        SELECT
            ct.id,
            ct.item_name,
            ct.completed_at,
            CASE
                WHEN ct.seller_id = ? THEN 'seller'
                ELSE 'buyer'
            END as role
        FROM completed_trades ct
        WHERE ct.seller_id = ? OR ct.buyer_id = ?
        ORDER BY ct.completed_at DESC
        LIMIT 5
    `).bind(userId, userId, userId).all();

    // Parse roles
    let roles;
    try {
        roles = user.role ? JSON.parse(user.role) : ['user'];
    } catch (e) {
        roles = ['user'];
    }

    // Get donation status if available (check KV)
    let donationData = null;
    try {
        const donationKey = `purchase:${userId}`;
        const donationKV = await env.DONATIONS_KV.get(donationKey);
        if (donationKV) {
            const data = JSON.parse(donationKV);
            donationData = {
                totalSpent: data.totalSpent || 0,
                purchases: data.purchases || 0
            };
        }
    } catch (e) {
        console.error('Failed to fetch donation data:', e);
    }

    return new Response(JSON.stringify({
        user: {
            userId: user.user_id,
            username: user.username,
            displayName: user.display_name,
            avatarUrl: user.avatar_url,
            roles: roles,
            createdAt: user.created_at,
            lastOnline: user.last_online
        },
        stats: stats || {
            total_trades: 0,
            successful_trades: 0,
            average_rating: 0,
            total_reviews: 0,
            last_trade_at: null
        },
        reviews: reviews || [],
        recentTrades: recentTrades || [],
        donationData: donationData
    }), {
        headers: { 'Content-Type': 'application/json' }
    });
}

export async function onRequest(context) {
    const { request, env } = context;

    // CORS headers
    const corsHeaders = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    };

    if (request.method === 'OPTIONS') {
        return new Response(null, { headers: corsHeaders });
    }

    try {
        let response;

        if (request.method === 'GET') {
            response = await handleGetProfile(request, env);
        } else {
            response = new Response(JSON.stringify({ error: 'Method not allowed' }), {
                status: 405,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        // Add CORS headers to response
        Object.entries(corsHeaders).forEach(([key, value]) => {
            response.headers.set(key, value);
        });

        return response;
    } catch (error) {
        console.error('Profile API error:', error);
        return new Response(JSON.stringify({ error: 'Internal server error' }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
    }
}
