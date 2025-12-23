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

    // Get user's wishlist
    let wishlist = [];
    try {
        const wishlistPref = await env.DBA.prepare(`
            SELECT preference_value
            FROM user_preferences
            WHERE user_id = ? AND preference_key = 'wishlist'
        `).bind(actualUserId).first();

        if (wishlistPref && wishlistPref.preference_value) {
            wishlist = JSON.parse(wishlistPref.preference_value);
            // Ensure it's an array
            if (!Array.isArray(wishlist)) {
                wishlist = [];
            }
        }
    } catch (e) {
        console.error('Failed to fetch wishlist:', e);
        wishlist = [];
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
        galleryPosts: galleryPosts,
        wishlist: wishlist
    }), {
        headers: { 'Content-Type': 'application/json' }
    });
}

// Handle POST review for a user profile
async function handlePostReview(request, env) {
    const url = new URL(request.url);
    const pathParts = url.pathname.split('/api/profile/').filter(Boolean);
    const pathSegments = pathParts[0].split('/');
    const userId = pathSegments[0];

    if (!userId) {
        return new Response(JSON.stringify({ error: 'User ID required' }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' }
        });
    }

    // Authenticate the reviewer
    const authHeader = request.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), {
            status: 401,
            headers: { 'Content-Type': 'application/json' }
        });
    }

    const token = authHeader.substring(7);

    // Verify session by querying sessions table (same as other endpoints)
    const session = await env.DBA.prepare(`
        SELECT s.*, u.* FROM sessions s
        JOIN users u ON s.user_id = u.user_id
        WHERE s.token = ? AND s.expires_at > ?
    `).bind(token, Date.now()).first();

    if (!session) {
        return new Response(JSON.stringify({ error: 'Invalid or expired session' }), {
            status: 401,
            headers: { 'Content-Type': 'application/json' }
        });
    }

    // Get reviewer user from session (already joined above)
    const reviewer = {
        user_id: session.user_id,
        username: session.username,
        display_name: session.display_name,
        avatar_url: session.avatar_url,
        role: session.role
    };

    if (!reviewer) {
        return new Response(JSON.stringify({ error: 'User not found' }), {
            status: 404,
            headers: { 'Content-Type': 'application/json' }
        });
    }

    // Check if user is banned/scammer
    let roles;
    try {
        roles = reviewer.role ? JSON.parse(reviewer.role) : ['user'];
    } catch (e) {
        roles = ['user'];
    }

    if (roles.includes('scammer')) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), {
            status: 403,
            headers: { 'Content-Type': 'application/json' }
        });
    }

    // Parse request body
    const data = await request.json();
    const { rating, comment } = data;

    // Validate rating
    if (!rating || rating < 1 || rating > 5) {
        return new Response(JSON.stringify({ error: 'Rating must be between 1 and 5' }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' }
        });
    }

    // Prevent self-review
    if (reviewer.user_id === userId) {
        return new Response(JSON.stringify({ error: 'You cannot review yourself' }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' }
        });
    }

    // Check if user being reviewed exists
    const reviewedUser = await env.DBA.prepare(
        'SELECT user_id FROM users WHERE user_id = ?'
    ).bind(userId).first();

    if (!reviewedUser) {
        return new Response(JSON.stringify({ error: 'User not found' }), {
            status: 404,
            headers: { 'Content-Type': 'application/json' }
        });
    }

    // Check if reviewer has already reviewed this user (limit one review per user pair)
    const existingReview = await env.DBA.prepare(
        'SELECT id FROM trade_reviews WHERE reviewer_id = ? AND reviewed_user_id = ? AND trade_id IS NULL'
    ).bind(reviewer.user_id, userId).first();

    if (existingReview) {
        return new Response(JSON.stringify({ error: 'You have already reviewed this user' }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' }
        });
    }

    const now = Date.now();

    // Insert review (trade_id will be NULL for profile reviews)
    const result = await env.DBA.prepare(
        `INSERT INTO trade_reviews
        (trade_id, reviewer_id, reviewed_user_id, rating, comment, created_at)
        VALUES (?, ?, ?, ?, ?, ?)`
    ).bind(
        null, // No trade_id for profile reviews
        reviewer.user_id,
        userId,
        rating,
        comment || null,
        now
    ).run();

    // Update user stats
    const { updateUserStats } = await import('../trades/_utils/helpers.js');
    await updateUserStats(env, userId);

    // Create notification
    const ratingText = rating === 5 ? 'excellent' :
                      rating === 4 ? 'good' :
                      rating === 3 ? 'okay' :
                      rating === 2 ? 'poor' : 'bad';

    await env.DBA.prepare(
        'INSERT INTO trade_notifications (user_id, type, title, message, link, created_at) VALUES (?, ?, ?, ?, ?, ?)'
    ).bind(
        userId,
        'review_received',
        'New Review',
        `${reviewer.username} gave you a ${ratingText} review (${rating}/5 stars)`,
        `/profile/${userId}`,
        now
    ).run();

    return new Response(JSON.stringify({
        id: result.meta.last_row_id,
        message: 'Review submitted successfully'
    }), {
        status: 201,
        headers: { 'Content-Type': 'application/json' }
    });
}

export async function onRequest(context) {
    const { request, env } = context;

    // CORS headers
    const corsHeaders = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    };

    if (request.method === 'OPTIONS') {
        return new Response(null, { headers: corsHeaders });
    }

    try {
        let response;
        const url = new URL(request.url);
        const pathParts = url.pathname.split('/api/profile/').filter(Boolean);
        const pathSegments = pathParts[0] ? pathParts[0].split('/') : [];

        if (request.method === 'GET') {
            response = await handleGetProfile(request, env);
        } else if (request.method === 'POST' && pathSegments[1] === 'review') {
            response = await handlePostReview(request, env);
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
