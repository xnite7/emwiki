import {
    authenticateUser,
    isAuthorized,
    errorResponse,
    successResponse
} from '../_utils/helpers.js';

// Handle GET requests
async function handleGet(request, env, path, user) {
    if (!user || !isAuthorized(user)) {
        return errorResponse('Unauthorized', 401);
    }

    const url = new URL(request.url);

    // GET /api/trades/notifications - Get user's notifications
    if (!path || path === '') {
        const unreadOnly = url.searchParams.get('unread_only') === 'true';
        const limit = Math.min(parseInt(url.searchParams.get('limit') || '50'), 100);
        const offset = parseInt(url.searchParams.get('offset') || '0');

        let query = 'SELECT * FROM trade_notifications WHERE user_id = ?';
        const bindings = [user.user_id];

        if (unreadOnly) {
            query += ' AND read = 0';
        }

        query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
        bindings.push(limit, offset);

        const { results: notifications } = await env.DBA.prepare(query).bind(...bindings).all();

        return successResponse({ notifications, limit, offset });
    }

    // GET /api/trades/notifications/unread-count - Get unread count
    if (path === 'unread-count') {
        const result = await env.DBA.prepare(
            'SELECT COUNT(*) as count FROM trade_notifications WHERE user_id = ? AND read = 0'
        ).bind(user.user_id).first();

        return successResponse({ unread_count: result.count });
    }

    // GET /api/trades/notifications/:id - Get specific notification
    const notificationId = path.split('/')[0];
    if (notificationId) {
        const notification = await env.DBA.prepare(
            'SELECT * FROM trade_notifications WHERE id = ?'
        ).bind(notificationId).first();

        if (!notification) {
            return errorResponse('Notification not found', 404);
        }

        // Can only view own notifications
        if (notification.user_id !== user.user_id) {
            return errorResponse('Unauthorized to view this notification', 403);
        }

        return successResponse({ notification });
    }

    return errorResponse('Invalid request', 400);
}

// Handle POST requests
async function handlePost(request, env, path, user) {
    if (!user || !isAuthorized(user)) {
        return errorResponse('Unauthorized', 401);
    }

    // POST /api/trades/notifications/:id/read - Mark notification as read
    const parts = path.split('/');
    const notificationId = parts[0];
    const action = parts[1];

    if (notificationId && action === 'read') {
        const notification = await env.DBA.prepare(
            'SELECT * FROM trade_notifications WHERE id = ?'
        ).bind(notificationId).first();

        if (!notification) {
            return errorResponse('Notification not found', 404);
        }

        // Can only mark own notifications as read
        if (notification.user_id !== user.user_id) {
            return errorResponse('Unauthorized', 403);
        }

        await env.DBA.prepare(
            'UPDATE trade_notifications SET read = 1 WHERE id = ?'
        ).bind(notificationId).run();

        return successResponse({ message: 'Notification marked as read' });
    }

    // POST /api/trades/notifications/read-all - Mark all as read
    if (path === 'read-all') {
        await env.DBA.prepare(
            'UPDATE trade_notifications SET read = 1 WHERE user_id = ? AND read = 0'
        ).bind(user.user_id).run();

        return successResponse({ message: 'All notifications marked as read' });
    }

    return errorResponse('Invalid request', 400);
}

// Handle DELETE requests
async function handleDelete(request, env, path, user) {
    if (!user || !isAuthorized(user)) {
        return errorResponse('Unauthorized', 401);
    }

    // DELETE /api/trades/notifications/:id - Delete notification
    const notificationId = path.split('/')[0];
    if (!notificationId) {
        return errorResponse('Notification ID required', 400);
    }

    const notification = await env.DBA.prepare(
        'SELECT * FROM trade_notifications WHERE id = ?'
    ).bind(notificationId).first();

    if (!notification) {
        return errorResponse('Notification not found', 404);
    }

    // Can only delete own notifications
    if (notification.user_id !== user.user_id) {
        return errorResponse('Unauthorized', 403);
    }

    await env.DBA.prepare(
        'DELETE FROM trade_notifications WHERE id = ?'
    ).bind(notificationId).run();

    return successResponse({ message: 'Notification deleted' });
}

// Main handler
export async function onRequest(context) {
    const { request, env } = context;
    const url = new URL(request.url);
    const pathParts = url.pathname.split('/api/trades/notifications/').filter(Boolean);
    const path = pathParts[0] || '';

    // CORS headers
    const corsHeaders = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
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
        console.error('Trade notifications error:', error);
        return new Response(JSON.stringify({ error: 'Internal server error' }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
    }
}
