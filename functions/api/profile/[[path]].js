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
    let stats = null;
    try {
        stats = await env.DBA.prepare(`
            SELECT
                total_trades,
                successful_trades,
                average_rating,
                total_reviews,
                last_trade_at
            FROM user_trade_stats
            WHERE user_id = ?
        `).bind(userId).first();
    } catch (e) {
        console.error('Failed to fetch user_trade_stats (table might not exist):', e);
        stats = null;
    }

    // Get user reviews
    let reviews = [];
    try {
        const reviewsResult = await env.DBA.prepare(`
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
        reviews = reviewsResult.results || [];
    } catch (e) {
        console.error('Failed to fetch trade_reviews (table might not exist):', e);
        reviews = [];
    }

    // Get recent completed trades (limited info for privacy)
    let recentTrades = [];
    try {
        const tradesResult = await env.DBA.prepare(`
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
        recentTrades = tradesResult.results || [];
    } catch (e) {
        console.error('Failed to fetch completed_trades (table might not exist):', e);
        recentTrades = [];
    }

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
        // Check if DONATIONS_KV binding exists
        if (env.DONATIONS_KV) {
            const donationKey = `purchase:${userId}`;
            const donationKV = await env.DONATIONS_KV.get(donationKey);
            if (donationKV) {
                const data = JSON.parse(donationKV);
                donationData = {
                    totalSpent: data.totalSpent || 0,
                    purchases: data.purchases || 0
                };
            }
        }
    } catch (e) {
        console.error('Failed to fetch donation data:', e);
    }

    // Get user's approved gallery posts
    let galleryPosts = [];
    try {
        const postsResult = await env.DBA.prepare(`
            SELECT
                g.id,
                g.title,
                g.description,
                g.media_url,
                g.media_type,
                g.thumbnail_url,
                g.created_at,
                g.views,
                COUNT(gl.id) as likes_count
            FROM gallery_items g
            LEFT JOIN gallery_likes gl ON g.id = gl.gallery_item_id
            WHERE g.user_id = ? AND g.status = 'approved'
            GROUP BY g.id
            ORDER BY g.created_at DESC
            LIMIT 12
        `).bind(userId).all();
        galleryPosts = postsResult.results || [];
    } catch (e) {
        console.error('Failed to fetch gallery posts:', e);
        // Try fallback without likes if gallery_likes table doesn't exist
        try {
            const postsResult = await env.DBA.prepare(`
                SELECT
                    g.id,
                    g.title,
                    g.description,
                    g.media_url,
                    g.media_type,
                    g.thumbnail_url,
                    g.created_at,
                    g.views,
                    0 as likes_count
                FROM gallery_items g
                WHERE g.user_id = ? AND g.status = 'approved'
                ORDER BY g.created_at DESC
                LIMIT 12
            `).bind(userId).all();
            galleryPosts = postsResult.results || [];
        } catch (e2) {
            console.error('Failed to fetch gallery posts (fallback):', e2);
            galleryPosts = [];
        }
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
        reviews: reviews,
        recentTrades: recentTrades,
        donationData: donationData,
        galleryPosts: galleryPosts
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
        console.error('Error stack:', error.stack);
        console.error('Request URL:', request.url);
        return new Response(JSON.stringify({
            error: 'Internal server error',
            details: error.message
        }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
    }
}
