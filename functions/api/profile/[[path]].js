// Profile API endpoints

async function handleGetProfile(request, env) {
    const url = new URL(request.url);
    const pathParts = url.pathname.split('/api/profile/').filter(Boolean);
    let userId = pathParts[0];

    if (!userId) {
        return new Response(JSON.stringify({ error: 'User ID required' }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' }
        });
    }

    // Try with both userId and userId.0 to handle database inconsistencies
    const userIdWithSuffix = userId.includes('.') ? userId : `${userId}.0`;

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
        WHERE user_id = ? OR user_id = ?
    `).bind(userId, userIdWithSuffix).first();

    if (!user) {
        return new Response(JSON.stringify({ error: 'User not found' }), {
            status: 404,
            headers: { 'Content-Type': 'application/json' }
        });
    }

    // Use the actual user_id from the database for subsequent queries
    const actualUserId = user.user_id;

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
        `).bind(actualUserId).first();
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
        `).bind(actualUserId).all();
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
        `).bind(actualUserId, actualUserId, actualUserId).all();
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
                g.thumbnail_url,
                g.created_at,
                g.views,
                g.likes
            FROM gallery_items g
            WHERE g.user_id = ? AND g.status = 1
            ORDER BY g.created_at DESC
            LIMIT 12
        `).bind(actualUserId).all();

        // Helper to determine media type from URL
        const getMediaType = (url) => {
            if (!url) return 'image';
            const ext = url.split('.').pop().toLowerCase();
            const videoExts = ['mp4', 'webm', 'mov'];
            return videoExts.includes(ext) ? 'video' : 'image';
        };

        // Parse JSON fields and add computed fields
        galleryPosts = (postsResult.results || []).map(item => {
            const likes = JSON.parse(item.likes || '[]');
            let viewCount = item.views || 0;
            return {
                ...item,
                media_type: getMediaType(item.media_url),
                views: viewCount,
                likes_count: likes.length
            };
        });
    } catch (e) {
        console.error('Failed to fetch gallery posts:', e);
        galleryPosts = [];
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
