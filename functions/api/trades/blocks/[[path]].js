import {
    authenticateUser,
    isAuthorized,
    errorResponse,
    successResponse,
    validateFields,
    getUserWithStats,
    normalizeUserId,
    userIdForms,
    isSameUser
} from '../_utils/helpers.js';

// GET /api/trades/blocks - list the users the signed-in user has blocked
async function handleGet(env, user) {
    if (!user || !isAuthorized(user)) {
        return errorResponse('Unauthorized', 401);
    }

    const { results } = await env.DBA.prepare(
        'SELECT blocked_id, created_at FROM trade_blocks WHERE blocker_id IN (?, ?) ORDER BY created_at DESC'
    ).bind(...userIdForms(user.user_id)).all();

    const blocked = await Promise.all((results || []).map(async (row) => {
        const info = await getUserWithStats(env, row.blocked_id);
        return {
            user_id: normalizeUserId(row.blocked_id),
            created_at: row.created_at,
            username: info?.username || null,
            display_name: info?.display_name || null,
            avatar_url: info?.avatar_url || null
        };
    }));

    return successResponse({ blocked });
}

// POST /api/trades/blocks - block a user { user_id }
async function handlePost(request, env, user) {
    if (!user || !isAuthorized(user)) {
        return errorResponse('Unauthorized', 401);
    }

    const data = await request.json();
    const error = validateFields(data, ['user_id']);
    if (error) {
        return errorResponse(error);
    }

    const blockedId = normalizeUserId(data.user_id);
    if (isSameUser(blockedId, user.user_id)) {
        return errorResponse('You cannot block yourself', 400);
    }

    // Idempotent: the UNIQUE index makes a repeat block a no-op.
    await env.DBA.prepare(
        'INSERT OR IGNORE INTO trade_blocks (blocker_id, blocked_id, created_at) VALUES (?, ?, ?)'
    ).bind(normalizeUserId(user.user_id), blockedId, Date.now()).run();

    return successResponse({ message: 'User blocked', user_id: blockedId }, 201);
}

// DELETE /api/trades/blocks/:userId - unblock a user
async function handleDelete(env, path, user) {
    if (!user || !isAuthorized(user)) {
        return errorResponse('Unauthorized', 401);
    }

    const blockedId = normalizeUserId(path.split('/')[0]);
    if (!blockedId) {
        return errorResponse('User ID required', 400);
    }

    await env.DBA.prepare(
        'DELETE FROM trade_blocks WHERE blocker_id IN (?, ?) AND blocked_id IN (?, ?)'
    ).bind(...userIdForms(user.user_id), ...userIdForms(blockedId)).run();

    return successResponse({ message: 'User unblocked', user_id: blockedId });
}

export async function onRequest(context) {
    const { request, env } = context;
    const url = new URL(request.url);
    const prefix = '/api/trades/blocks';
    const path = url.pathname.startsWith(prefix)
        ? url.pathname.slice(prefix.length).replace(/^\//, '')
        : '';

    const corsHeaders = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    };

    if (request.method === 'OPTIONS') {
        return new Response(null, { headers: corsHeaders });
    }

    try {
        const user = await authenticateUser(request, env);

        let response;
        switch (request.method) {
            case 'GET':
                response = await handleGet(env, user);
                break;
            case 'POST':
                response = await handlePost(request, env, user);
                break;
            case 'DELETE':
                response = await handleDelete(env, path, user);
                break;
            default:
                response = errorResponse('Method not allowed', 405);
        }

        const headers = new Headers(response.headers);
        Object.entries(corsHeaders).forEach(([key, value]) => headers.set(key, value));
        return new Response(response.body, { status: response.status, headers });
    } catch (error) {
        console.error('Trade blocks error:', error);
        return new Response(JSON.stringify({ error: 'Internal server error' }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
    }
}
