import {
    authenticateUser,
    isAuthorized,
    errorResponse,
    successResponse,
    validateFields,
    createNotification,
    getUserWithStats
} from '../_utils/helpers.js';

// Handle GET requests
async function handleGet(request, env, path, user) {
    if (!user || !isAuthorized(user)) {
        return errorResponse('Unauthorized', 401);
    }

    const url = new URL(request.url);

    // GET /api/trades/messages - List user's conversations
    if (!path || path === '') {
        const listingId = url.searchParams.get('listing_id');
        const offerId = url.searchParams.get('offer_id');
        const withUserId = url.searchParams.get('with_user_id');

        let query = 'SELECT * FROM trade_messages WHERE (from_user_id = ? OR to_user_id = ?)';
        const bindings = [user.user_id, user.user_id];

        if (listingId) {
            query += ' AND listing_id = ?';
            bindings.push(listingId);
        }

        if (offerId) {
            query += ' AND offer_id = ?';
            bindings.push(offerId);
        }

        if (withUserId) {
            query += ' AND (from_user_id = ? OR to_user_id = ?)';
            bindings.push(withUserId, withUserId);
        }

        query += ' ORDER BY created_at ASC';

        const { results } = await env.DBA.prepare(query).bind(...bindings).all();

        // Get user info for each message
        const messages = await Promise.all(results.map(async (msg) => {
            const fromUser = await getUserWithStats(env, msg.from_user_id);
            const toUser = await getUserWithStats(env, msg.to_user_id);

            return {
                ...msg,
                from_user: {
                    user_id: fromUser.user_id,
                    username: fromUser.username,
                    display_name: fromUser.display_name,
                    avatar_url: fromUser.avatar_url
                },
                to_user: {
                    user_id: toUser.user_id,
                    username: toUser.username,
                    display_name: toUser.display_name,
                    avatar_url: toUser.avatar_url
                }
            };
        }));

        // Mark messages as read that were sent to this user
        if (messages.length > 0) {
            const messageIds = messages
                .filter(m => m.to_user_id === user.user_id && !m.read)
                .map(m => m.id);

            if (messageIds.length > 0) {
                await env.DBA.prepare(
                    `UPDATE trade_messages SET read = 1 WHERE id IN (${messageIds.join(',')})`
                ).run();
            }
        }

        return successResponse({ messages });
    }

    // GET /api/trades/messages/unread - Get unread message count
    if (path === 'unread') {
        const result = await env.DBA.prepare(
            'SELECT COUNT(*) as count FROM trade_messages WHERE to_user_id = ? AND read = 0'
        ).bind(user.user_id).first();

        return successResponse({ unread_count: result.count });
    }

    // GET /api/trades/messages/conversations - Get list of conversations
    if (path === 'conversations') {
        // Get unique conversations with last message
        const { results } = await env.DBA.prepare(`
            SELECT
                CASE
                    WHEN from_user_id = ? THEN to_user_id
                    ELSE from_user_id
                END as other_user_id,
                listing_id,
                offer_id,
                MAX(created_at) as last_message_at,
                COUNT(CASE WHEN to_user_id = ? AND read = 0 THEN 1 END) as unread_count
            FROM trade_messages
            WHERE from_user_id = ? OR to_user_id = ?
            GROUP BY other_user_id, listing_id, offer_id
            ORDER BY last_message_at DESC
        `).bind(user.user_id, user.user_id, user.user_id, user.user_id).all();

        // Get details for each conversation
        const conversations = await Promise.all(results.map(async (conv) => {
            const otherUser = await getUserWithStats(env, conv.other_user_id);

            let listingTitle = null;
            if (conv.listing_id) {
                const listing = await env.DBA.prepare(
                    'SELECT title FROM trade_listings WHERE id = ?'
                ).bind(conv.listing_id).first();
                listingTitle = listing?.title;
            }

            return {
                other_user: {
                    user_id: otherUser.user_id,
                    username: otherUser.username,
                    display_name: otherUser.display_name,
                    avatar_url: otherUser.avatar_url,
                    average_rating: otherUser.average_rating || 0
                },
                listing_id: conv.listing_id,
                listing_title: listingTitle,
                offer_id: conv.offer_id,
                last_message_at: conv.last_message_at,
                unread_count: conv.unread_count
            };
        }));

        return successResponse({ conversations });
    }

    return errorResponse('Invalid request', 400);
}

// Handle POST requests
async function handlePost(request, env, path, user) {
    if (!user || !isAuthorized(user)) {
        return errorResponse('Unauthorized', 401);
    }

    // POST /api/trades/messages - Send a message
    if (!path || path === '') {
        const data = await request.json();

        const error = validateFields(data, ['to_user_id', 'message']);
        if (error) {
            return errorResponse(error);
        }

        const { to_user_id, message, listing_id, offer_id } = data;

        // Can't send message to self
        if (to_user_id === user.user_id) {
            return errorResponse('Cannot send message to yourself', 400);
        }

        // Verify recipient exists
        const recipient = await env.DBA.prepare(
            'SELECT user_id FROM users WHERE user_id = ?'
        ).bind(to_user_id).first();

        if (!recipient) {
            return errorResponse('Recipient not found', 404);
        }

        // If listing_id is provided, verify the users are involved in the listing
        if (listing_id) {
            const listing = await env.DBA.prepare(
                'SELECT user_id FROM trade_listings WHERE id = ?'
            ).bind(listing_id).first();

            if (!listing) {
                return errorResponse('Listing not found', 404);
            }

            // Check if user is listing owner or has made an offer
            const isListingOwner = listing.user_id === user.user_id;
            const hasOffer = await env.DBA.prepare(
                'SELECT id FROM trade_offers WHERE listing_id = ? AND (from_user_id = ? OR to_user_id = ?)'
            ).bind(listing_id, user.user_id, user.user_id).first();

            if (!isListingOwner && !hasOffer) {
                return errorResponse('You are not involved in this listing', 403);
            }
        }

        const now = Date.now();

        const result = await env.DBA.prepare(
            `INSERT INTO trade_messages
            (listing_id, offer_id, from_user_id, to_user_id, message, created_at)
            VALUES (?, ?, ?, ?, ?, ?)`
        ).bind(
            listing_id || null,
            offer_id || null,
            user.user_id,
            to_user_id,
            message,
            now
        ).run();

        // Create notification for recipient
        await createNotification(
            env,
            to_user_id,
            'new_message',
            'New Message',
            `${user.username} sent you a message`,
            listing_id ? `/trading/${listing_id}` : '/messages'
        );

        return successResponse({
            id: result.meta.last_row_id,
            message: 'Message sent successfully'
        }, 201);
    }

    // POST /api/trades/messages/:id/read - Mark message as read
    const parts = path.split('/');
    const messageId = parts[0];
    const action = parts[1];

    if (messageId && action === 'read') {
        const message = await env.DBA.prepare(
            'SELECT * FROM trade_messages WHERE id = ?'
        ).bind(messageId).first();

        if (!message) {
            return errorResponse('Message not found', 404);
        }

        // Must be the recipient
        if (message.to_user_id !== user.user_id) {
            return errorResponse('You can only mark your own messages as read', 403);
        }

        await env.DBA.prepare(
            'UPDATE trade_messages SET read = 1 WHERE id = ?'
        ).bind(messageId).run();

        return successResponse({ message: 'Message marked as read' });
    }

    return errorResponse('Invalid request', 400);
}

// Main handler
export async function onRequest(context) {
    const { request, env } = context;
    const url = new URL(request.url);
    const pathParts = url.pathname.split('/api/trades/messages/').filter(Boolean);
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
