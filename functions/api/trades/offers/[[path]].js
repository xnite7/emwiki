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
async function handleGet(request, env, path, user) {
    if (!user || !isAuthorized(user)) {
        return errorResponse('Unauthorized', 401);
    }

    const url = new URL(request.url);

    // GET /api/trades/offers - List user's offers (sent and received)
    if (!path || path === '') {
        const type = url.searchParams.get('type') || 'all'; // all, sent, received
        const status = url.searchParams.get('status'); // pending, accepted, rejected, cancelled, completed

        let query = 'SELECT o.*, l.title as listing_title FROM trade_offers o JOIN trade_listings l ON o.listing_id = l.id WHERE 1=1';
        const bindings = [];

        if (type === 'sent') {
            query += ' AND o.from_user_id = ?';
            bindings.push(user.user_id);
        } else if (type === 'received') {
            query += ' AND o.to_user_id = ?';
            bindings.push(user.user_id);
        } else {
            query += ' AND (o.from_user_id = ? OR o.to_user_id = ?)';
            bindings.push(user.user_id, user.user_id);
        }

        if (status) {
            query += ' AND o.status = ?';
            bindings.push(status);
        }

        query += ' ORDER BY o.created_at DESC';

        const { results } = await env.DBA.prepare(query).bind(...bindings).all();

        // Get user info for each offer
        const offers = await Promise.all(results.map(async (offer) => {
            const fromUser = await getUserWithStats(env, offer.from_user_id);
            const toUser = await getUserWithStats(env, offer.to_user_id);

            return {
                ...offer,
                offered_items: JSON.parse(offer.offered_items),
                from_user: {
                    user_id: fromUser.user_id,
                    username: fromUser.username,
                    display_name: fromUser.display_name,
                    avatar_url: fromUser.avatar_url,
                    average_rating: fromUser.average_rating || 0
                },
                to_user: {
                    user_id: toUser.user_id,
                    username: toUser.username,
                    display_name: toUser.display_name,
                    avatar_url: toUser.avatar_url,
                    average_rating: toUser.average_rating || 0
                }
            };
        }));

        return successResponse({ offers });
    }

    // GET /api/trades/offers/:id - Get specific offer
    const offerId = path.split('/')[0];
    if (offerId) {
        const offer = await env.DBA.prepare(
            'SELECT o.*, l.title as listing_title, l.offering_items as listing_items FROM trade_offers o JOIN trade_listings l ON o.listing_id = l.id WHERE o.id = ?'
        ).bind(offerId).first();

        if (!offer) {
            return errorResponse('Offer not found', 404);
        }

        // Check authorization - must be sender or receiver
        if (offer.from_user_id !== user.user_id && offer.to_user_id !== user.user_id) {
            return errorResponse('Unauthorized to view this offer', 403);
        }

        const fromUser = await getUserWithStats(env, offer.from_user_id);
        const toUser = await getUserWithStats(env, offer.to_user_id);

        return successResponse({
            ...offer,
            offered_items: JSON.parse(offer.offered_items),
            listing_items: JSON.parse(offer.listing_items),
            from_user: {
                user_id: fromUser.user_id,
                username: fromUser.username,
                display_name: fromUser.display_name,
                avatar_url: fromUser.avatar_url,
                average_rating: fromUser.average_rating || 0,
                total_trades: fromUser.total_trades || 0
            },
            to_user: {
                user_id: toUser.user_id,
                username: toUser.username,
                display_name: toUser.display_name,
                avatar_url: toUser.avatar_url,
                average_rating: toUser.average_rating || 0,
                total_trades: toUser.total_trades || 0
            }
        });
    }

    return errorResponse('Invalid request', 400);
}

// Handle POST requests
async function handlePost(request, env, path, user) {
    if (!user || !isAuthorized(user)) {
        return errorResponse('Unauthorized', 401);
    }

    // POST /api/trades/offers - Create new offer
    if (!path || path === '') {
        const data = await request.json();

        const error = validateFields(data, ['listing_id', 'offered_items']);
        if (error) {
            return errorResponse(error);
        }

        const { listing_id, offered_items, message } = data;

        // Get listing
        const listing = await env.DBA.prepare(
            'SELECT * FROM trade_listings WHERE id = ? AND status = ?'
        ).bind(listing_id, 'active').first();

        if (!listing) {
            return errorResponse('Listing not found or not active', 404);
        }

        // Can't make offer on own listing
        if (listing.user_id === user.user_id) {
            return errorResponse('Cannot make offer on your own listing', 400);
        }

        // Validate offered_items is an array
        if (!Array.isArray(offered_items) || offered_items.length === 0) {
            return errorResponse('offered_items must be a non-empty array');
        }

        const now = Date.now();

        const result = await env.DBA.prepare(
            `INSERT INTO trade_offers
            (listing_id, from_user_id, to_user_id, offered_items, message, status, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, 'pending', ?, ?)`
        ).bind(
            listing_id,
            user.user_id,
            listing.user_id,
            JSON.stringify(offered_items),
            message || null,
            now,
            now
        ).run();

        // Create notification for listing owner
        await createNotification(
            env,
            listing.user_id,
            'new_offer',
            'New Trade Offer',
            `${user.username} made an offer on your listing: ${listing.title}`,
            `/trading/${listing_id}`
        );

        return successResponse({
            id: result.meta.last_row_id,
            message: 'Offer created successfully'
        }, 201);
    }

    // POST /api/trades/offers/:id/accept - Accept an offer
    const parts = path.split('/');
    const offerId = parts[0];
    const action = parts[1];

    if (offerId && action === 'accept') {
        const offer = await env.DBA.prepare(
            'SELECT o.*, l.offering_items as listing_items FROM trade_offers o JOIN trade_listings l ON o.listing_id = l.id WHERE o.id = ?'
        ).bind(offerId).first();

        if (!offer) {
            return errorResponse('Offer not found', 404);
        }

        // Must be the listing owner
        if (offer.to_user_id !== user.user_id) {
            return errorResponse('Only the listing owner can accept offers', 403);
        }

        // Offer must be pending
        if (offer.status !== 'pending') {
            return errorResponse('Offer is not pending', 400);
        }

        const now = Date.now();

        // Update offer status
        await env.DBA.prepare(
            'UPDATE trade_offers SET status = ?, updated_at = ? WHERE id = ?'
        ).bind('accepted', now, offerId).run();

        // Update listing status
        await env.DBA.prepare(
            'UPDATE trade_listings SET status = ?, updated_at = ? WHERE id = ?'
        ).bind('completed', now, offer.listing_id).run();

        // Create completed trade record
        const tradeResult = await env.DBA.prepare(
            `INSERT INTO completed_trades
            (listing_id, offer_id, seller_id, buyer_id, seller_items, buyer_items, completed_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)`
        ).bind(
            offer.listing_id,
            offerId,
            offer.to_user_id,
            offer.from_user_id,
            offer.listing_items,
            offer.offered_items,
            now
        ).run();

        // Update stats for both users
        await updateUserStats(env, offer.to_user_id);
        await updateUserStats(env, offer.from_user_id);

        // Create notification for offer sender
        await createNotification(
            env,
            offer.from_user_id,
            'offer_accepted',
            'Offer Accepted!',
            'Your trade offer was accepted!',
            `/trades/completed/${tradeResult.meta.last_row_id}`
        );

        // Reject all other pending offers on this listing
        await env.DBA.prepare(
            'UPDATE trade_offers SET status = ?, updated_at = ? WHERE listing_id = ? AND id != ? AND status = ?'
        ).bind('rejected', now, offer.listing_id, offerId, 'pending').run();

        return successResponse({
            trade_id: tradeResult.meta.last_row_id,
            message: 'Offer accepted successfully'
        });
    }

    // POST /api/trades/offers/:id/reject - Reject an offer
    if (offerId && action === 'reject') {
        const offer = await env.DBA.prepare(
            'SELECT * FROM trade_offers WHERE id = ?'
        ).bind(offerId).first();

        if (!offer) {
            return errorResponse('Offer not found', 404);
        }

        // Must be the listing owner
        if (offer.to_user_id !== user.user_id) {
            return errorResponse('Only the listing owner can reject offers', 403);
        }

        // Update offer status
        await env.DBA.prepare(
            'UPDATE trade_offers SET status = ?, updated_at = ? WHERE id = ?'
        ).bind('rejected', Date.now(), offerId).run();

        // Create notification
        await createNotification(
            env,
            offer.from_user_id,
            'offer_rejected',
            'Offer Rejected',
            'Your trade offer was rejected',
            `/trading/${offer.listing_id}`
        );

        return successResponse({ message: 'Offer rejected successfully' });
    }

    // POST /api/trades/offers/:id/cancel - Cancel own offer
    if (offerId && action === 'cancel') {
        const offer = await env.DBA.prepare(
            'SELECT * FROM trade_offers WHERE id = ?'
        ).bind(offerId).first();

        if (!offer) {
            return errorResponse('Offer not found', 404);
        }

        // Must be the offer sender
        if (offer.from_user_id !== user.user_id) {
            return errorResponse('You can only cancel your own offers', 403);
        }

        // Can only cancel pending offers
        if (offer.status !== 'pending') {
            return errorResponse('Can only cancel pending offers', 400);
        }

        // Update offer status
        await env.DBA.prepare(
            'UPDATE trade_offers SET status = ?, updated_at = ? WHERE id = ?'
        ).bind('cancelled', Date.now(), offerId).run();

        return successResponse({ message: 'Offer cancelled successfully' });
    }

    return errorResponse('Invalid request', 400);
}

// Main handler
export async function onRequest(context) {
    const { request, env } = context;
    const url = new URL(request.url);
    const pathParts = url.pathname.split('/api/trades/offers/').filter(Boolean);
    const path = pathParts[0] || '';

    // CORS headers
    const corsHeaders = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
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
            case 'POST':
                response = await handlePost(request, env, path, user);
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
