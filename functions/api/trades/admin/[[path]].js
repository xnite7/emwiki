import {
    authenticateUser,
    isModerator,
    errorResponse,
    successResponse,
    validateFields,
    getUserWithStats,
    normalizeUserId,
    userIdForms
} from '../_utils/helpers.js';

// GET /api/trades/admin/bans - list banned players (moderators only)
async function handleGet(env, path, user) {
    if (!isModerator(user)) {
        return errorResponse('Forbidden', 403);
    }

    if (path === 'bans') {
        const { results } = await env.DBA.prepare(
            'SELECT user_id, banned_by, reason, created_at FROM trade_bans ORDER BY created_at DESC'
        ).all();

        const bans = await Promise.all((results || []).map(async (row) => {
            const info = await getUserWithStats(env, row.user_id);
            return {
                user_id: normalizeUserId(row.user_id),
                reason: row.reason,
                created_at: row.created_at,
                banned_by: normalizeUserId(row.banned_by),
                username: info?.username || null,
                display_name: info?.display_name || null,
                avatar_url: info?.avatar_url || null
            };
        }));

        return successResponse({ bans });
    }

    return errorResponse('Invalid request', 400);
}

// POST /api/trades/admin/ban - ban a player from trading (moderators only)
async function handlePost(request, env, path, user) {
    if (!isModerator(user)) {
        return errorResponse('Forbidden', 403);
    }

    if (path === 'ban') {
        const data = await request.json();
        const error = validateFields(data, ['user_id']);
        if (error) {
            return errorResponse(error);
        }

        const targetId = normalizeUserId(data.user_id);

        // Don't allow banning a fellow moderator/admin.
        const target = await getUserWithStats(env, targetId);
        if (target && isModerator({ roles: target.roles })) {
            return errorResponse('Cannot ban a moderator or admin', 403);
        }

        await env.DBA.prepare(
            `INSERT INTO trade_bans (user_id, banned_by, reason, created_at)
             VALUES (?, ?, ?, ?)
             ON CONFLICT(user_id) DO UPDATE SET
                banned_by = excluded.banned_by,
                reason = excluded.reason,
                created_at = excluded.created_at`
        ).bind(targetId, normalizeUserId(user.user_id), data.reason || null, Date.now()).run();

        return successResponse({ message: 'Player banned from trading', user_id: targetId }, 201);
    }

    return errorResponse('Invalid request', 400);
}

// DELETE /api/trades/admin/ban/:userId - lift a trading ban (moderators only)
async function handleDelete(env, path, user) {
    if (!isModerator(user)) {
        return errorResponse('Forbidden', 403);
    }

    const parts = path.split('/');
    if (parts[0] === 'ban' && parts[1]) {
        const targetId = normalizeUserId(parts[1]);
        await env.DBA.prepare(
            'DELETE FROM trade_bans WHERE user_id IN (?, ?)'
        ).bind(...userIdForms(targetId)).run();

        return successResponse({ message: 'Ban lifted', user_id: targetId });
    }

    return errorResponse('Invalid request', 400);
}

export async function onRequest(context) {
    const { request, env } = context;
    const url = new URL(request.url);
    const prefix = '/api/trades/admin';
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
        if (!user) {
            return new Response(JSON.stringify({ error: 'Unauthorized' }), {
                status: 401,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
        }

        let response;
        switch (request.method) {
            case 'GET':
                response = await handleGet(env, path, user);
                break;
            case 'POST':
                response = await handlePost(request, env, path, user);
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
        console.error('Trade admin error:', error);
        return new Response(JSON.stringify({ error: 'Internal server error' }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
    }
}
