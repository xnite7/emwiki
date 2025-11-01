import {
    authenticateUser,
    isAuthorized,
    errorResponse,
    successResponse,
    validateFields,
    createNotification,
    updateUserStats,
    getUserWithStats
} from '../_utils/helpers.js';

// Handle GET requests
async function handleGet(request, env, path) {
    const url = new URL(request.url);

    // GET /api/trades/reviews - Get reviews for a user
    if (!path || path === '') {
        const userId = url.searchParams.get('user_id');

        if (!userId) {
            return errorResponse('user_id parameter required');
        }

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
        `).bind(userId).all();

        // Get user stats
        const stats = await env.DBA.prepare(
            'SELECT * FROM user_trade_stats WHERE user_id = ?'
        ).bind(userId).first();

        return successResponse({
            reviews,
            stats: stats || {
                total_trades: 0,
                successful_trades: 0,
                average_rating: 0,
                total_reviews: 0
            }
        });
    }

    // GET /api/trades/reviews/:id - Get specific review
    const reviewId = path.split('/')[0];
    if (reviewId) {
        const review = await env.DBA.prepare(`
            SELECT
                r.*,
                u1.username as reviewer_username,
                u1.display_name as reviewer_display_name,
                u1.avatar_url as reviewer_avatar,
                u2.username as reviewed_username,
                u2.display_name as reviewed_display_name,
                u2.avatar_url as reviewed_avatar
            FROM trade_reviews r
            JOIN users u1 ON r.reviewer_id = u1.user_id
            JOIN users u2 ON r.reviewed_user_id = u2.user_id
            WHERE r.id = ?
        `).bind(reviewId).first();

        if (!review) {
            return errorResponse('Review not found', 404);
        }

        return successResponse({ review });
    }

    return errorResponse('Invalid request', 400);
}

// Handle POST requests
async function handlePost(request, env, path, user) {
    if (!user || !isAuthorized(user)) {
        return errorResponse('Unauthorized', 401);
    }

    // POST /api/trades/reviews - Create a review
    if (!path || path === '') {
        const data = await request.json();

        const error = validateFields(data, ['trade_id', 'rating']);
        if (error) {
            return errorResponse(error);
        }

        const { trade_id, rating, comment } = data;

        // Validate rating
        if (rating < 1 || rating > 5) {
            return errorResponse('Rating must be between 1 and 5');
        }

        // Get the completed trade
        const trade = await env.DBA.prepare(
            'SELECT * FROM completed_trades WHERE id = ?'
        ).bind(trade_id).first();

        if (!trade) {
            return errorResponse('Trade not found', 404);
        }

        // Verify user was part of the trade
        if (trade.seller_id !== user.user_id && trade.buyer_id !== user.user_id) {
            return errorResponse('You were not part of this trade', 403);
        }

        // Determine who is being reviewed
        const reviewedUserId = trade.seller_id === user.user_id ? trade.buyer_id : trade.seller_id;

        // Check if user already reviewed this trade
        const existingReview = await env.DBA.prepare(
            'SELECT id FROM trade_reviews WHERE trade_id = ? AND reviewer_id = ?'
        ).bind(trade_id, user.user_id).first();

        if (existingReview) {
            return errorResponse('You have already reviewed this trade', 400);
        }

        const now = Date.now();

        const result = await env.DBA.prepare(
            `INSERT INTO trade_reviews
            (trade_id, reviewer_id, reviewed_user_id, rating, comment, created_at)
            VALUES (?, ?, ?, ?, ?, ?)`
        ).bind(
            trade_id,
            user.user_id,
            reviewedUserId,
            rating,
            comment || null,
            now
        ).run();

        // Update user stats
        await updateUserStats(env, reviewedUserId);

        // Create notification
        const ratingText = rating === 5 ? 'excellent' :
                          rating === 4 ? 'good' :
                          rating === 3 ? 'okay' :
                          rating === 2 ? 'poor' : 'bad';

        await createNotification(
            env,
            reviewedUserId,
            'review_received',
            'New Review',
            `${user.username} gave you a ${ratingText} review (${rating}/5 stars)`,
            `/profile/${reviewedUserId}`
        );

        return successResponse({
            id: result.meta.last_row_id,
            message: 'Review submitted successfully'
        }, 201);
    }

    return errorResponse('Invalid request', 400);
}

// Handle PUT/PATCH requests
async function handlePut(request, env, path, user) {
    if (!user || !isAuthorized(user)) {
        return errorResponse('Unauthorized', 401);
    }

    const reviewId = path.split('/')[0];
    if (!reviewId) {
        return errorResponse('Review ID required', 400);
    }

    const review = await env.DBA.prepare(
        'SELECT * FROM trade_reviews WHERE id = ?'
    ).bind(reviewId).first();

    if (!review) {
        return errorResponse('Review not found', 404);
    }

    // Can only edit own reviews
    if (review.reviewer_id !== user.user_id) {
        return errorResponse('You can only edit your own reviews', 403);
    }

    const data = await request.json();
    const { rating, comment } = data;

    // Build update query
    const updates = [];
    const bindings = [];

    if (rating !== undefined) {
        if (rating < 1 || rating > 5) {
            return errorResponse('Rating must be between 1 and 5');
        }
        updates.push('rating = ?');
        bindings.push(rating);
    }

    if (comment !== undefined) {
        updates.push('comment = ?');
        bindings.push(comment);
    }

    if (updates.length === 0) {
        return errorResponse('No fields to update');
    }

    bindings.push(reviewId);

    await env.DBA.prepare(
        `UPDATE trade_reviews SET ${updates.join(', ')} WHERE id = ?`
    ).bind(...bindings).run();

    // Update user stats
    await updateUserStats(env, review.reviewed_user_id);

    return successResponse({ message: 'Review updated successfully' });
}

// Handle DELETE requests
async function handleDelete(request, env, path, user) {
    if (!user || !isAuthorized(user)) {
        return errorResponse('Unauthorized', 401);
    }

    const reviewId = path.split('/')[0];
    if (!reviewId) {
        return errorResponse('Review ID required', 400);
    }

    const review = await env.DBA.prepare(
        'SELECT * FROM trade_reviews WHERE id = ?'
    ).bind(reviewId).first();

    if (!review) {
        return errorResponse('Review not found', 404);
    }

    // Can only delete own reviews (or admin/moderator)
    const roles = typeof user.roles === 'string' ? JSON.parse(user.roles) : user.roles;
    const isAdminOrMod = roles.includes('admin') || roles.includes('moderator');

    if (review.reviewer_id !== user.user_id && !isAdminOrMod) {
        return errorResponse('You can only delete your own reviews', 403);
    }

    const reviewedUserId = review.reviewed_user_id;

    await env.DBA.prepare(
        'DELETE FROM trade_reviews WHERE id = ?'
    ).bind(reviewId).run();

    // Update user stats
    await updateUserStats(env, reviewedUserId);

    return successResponse({ message: 'Review deleted successfully' });
}

// Main handler
export async function onRequest(context) {
    const { request, env } = context;
    const url = new URL(request.url);
    const pathParts = url.pathname.split('/api/trades/reviews/').filter(Boolean);
    const path = pathParts[0] || '';

    // CORS headers
    const corsHeaders = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    };

    // Handle OPTIONS request
    if (request.method === 'OPTIONS') {
        return new Response(null, { headers: corsHeaders });
    }

    try {
        let user = null;
        if (request.method !== 'GET') {
            user = await authenticateUser(request, env);
        }

        let response;
        switch (request.method) {
            case 'GET':
                response = await handleGet(request, env, path);
                break;
            case 'POST':
                response = await handlePost(request, env, path, user);
                break;
            case 'PUT':
            case 'PATCH':
                response = await handlePut(request, env, path, user);
                break;
            case 'DELETE':
                response = await handleDelete(request, env, path, user);
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
        return new Response(JSON.stringify({ error: 'Internal server error' }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
    }
}
