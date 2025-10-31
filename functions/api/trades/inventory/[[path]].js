import {
    authenticateUser,
    isAuthorized,
    errorResponse,
    successResponse,
    validateFields
} from '../_utils/helpers.js';

// Handle GET requests
async function handleGet(request, env, path, user) {
    const url = new URL(request.url);

    // GET /api/trades/inventory - Get user's inventory
    if (!path || path === '') {
        // Allow viewing other users' inventory if user_id is provided
        const userId = url.searchParams.get('user_id') || user?.user_id;
        const forTrade = url.searchParams.get('for_trade'); // Filter by for_trade status

        if (!userId) {
            return errorResponse('User ID required', 400);
        }

        let query = 'SELECT * FROM user_inventory WHERE user_id = ?';
        const bindings = [userId];

        if (forTrade !== null) {
            query += ' AND for_trade = ?';
            bindings.push(forTrade === 'true' ? 1 : 0);
        }

        query += ' ORDER BY added_at DESC';

        const { results: items } = await env.DBA.prepare(query).bind(...bindings).all();

        return successResponse({ items });
    }

    // GET /api/trades/inventory/:id - Get specific item
    const itemId = path.split('/')[0];
    if (itemId) {
        const item = await env.DBA.prepare(
            'SELECT * FROM user_inventory WHERE id = ?'
        ).bind(itemId).first();

        if (!item) {
            return errorResponse('Item not found', 404);
        }

        return successResponse({ item });
    }

    return errorResponse('Invalid request', 400);
}

// Handle POST requests
async function handlePost(request, env, path, user) {
    if (!user || !isAuthorized(user)) {
        return errorResponse('Unauthorized', 401);
    }

    // POST /api/trades/inventory - Add item to inventory
    if (!path || path === '') {
        const data = await request.json();

        const error = validateFields(data, ['item_id', 'item_name']);
        if (error) {
            return errorResponse(error);
        }

        const {
            item_id,
            item_name,
            item_image,
            quantity = 1,
            for_trade = false
        } = data;

        // Check if item already exists in inventory
        const existing = await env.DBA.prepare(
            'SELECT * FROM user_inventory WHERE user_id = ? AND item_id = ?'
        ).bind(user.user_id, item_id).first();

        if (existing) {
            // Update quantity
            await env.DBA.prepare(
                'UPDATE user_inventory SET quantity = quantity + ? WHERE id = ?'
            ).bind(quantity, existing.id).run();

            return successResponse({
                id: existing.id,
                message: 'Item quantity updated',
                new_quantity: existing.quantity + quantity
            });
        }

        // Add new item
        const result = await env.DBA.prepare(
            `INSERT INTO user_inventory
            (user_id, item_id, item_name, item_image, quantity, for_trade, added_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)`
        ).bind(
            user.user_id,
            item_id,
            item_name,
            item_image || null,
            quantity,
            for_trade ? 1 : 0,
            Date.now()
        ).run();

        return successResponse({
            id: result.meta.last_row_id,
            message: 'Item added to inventory'
        }, 201);
    }

    // POST /api/trades/inventory/bulk - Add multiple items at once
    if (path === 'bulk') {
        const data = await request.json();

        if (!data.items || !Array.isArray(data.items)) {
            return errorResponse('items array required');
        }

        const now = Date.now();
        const addedItems = [];

        for (const item of data.items) {
            const error = validateFields(item, ['item_id', 'item_name']);
            if (error) continue; // Skip invalid items

            const {
                item_id,
                item_name,
                item_image,
                quantity = 1,
                for_trade = false
            } = item;

            // Check if item already exists
            const existing = await env.DBA.prepare(
                'SELECT * FROM user_inventory WHERE user_id = ? AND item_id = ?'
            ).bind(user.user_id, item_id).first();

            if (existing) {
                await env.DBA.prepare(
                    'UPDATE user_inventory SET quantity = quantity + ? WHERE id = ?'
                ).bind(quantity, existing.id).run();
                addedItems.push({ id: existing.id, updated: true });
            } else {
                const result = await env.DBA.prepare(
                    `INSERT INTO user_inventory
                    (user_id, item_id, item_name, item_image, quantity, for_trade, added_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?)`
                ).bind(
                    user.user_id,
                    item_id,
                    item_name,
                    item_image || null,
                    quantity,
                    for_trade ? 1 : 0,
                    now
                ).run();
                addedItems.push({ id: result.meta.last_row_id, updated: false });
            }
        }

        return successResponse({
            message: `${addedItems.length} items processed`,
            items: addedItems
        });
    }

    return errorResponse('Invalid request', 400);
}

// Handle PUT/PATCH requests
async function handlePut(request, env, path, user) {
    if (!user || !isAuthorized(user)) {
        return errorResponse('Unauthorized', 401);
    }

    const itemId = path.split('/')[0];
    if (!itemId) {
        return errorResponse('Item ID required', 400);
    }

    // Check ownership
    const item = await env.DBA.prepare(
        'SELECT * FROM user_inventory WHERE id = ?'
    ).bind(itemId).first();

    if (!item) {
        return errorResponse('Item not found', 404);
    }

    if (item.user_id !== user.user_id) {
        return errorResponse('You can only edit your own inventory items', 403);
    }

    const data = await request.json();
    const { quantity, for_trade } = data;

    // Build update query
    const updates = [];
    const bindings = [];

    if (quantity !== undefined) {
        if (quantity < 0) {
            return errorResponse('Quantity cannot be negative');
        }
        updates.push('quantity = ?');
        bindings.push(quantity);
    }

    if (for_trade !== undefined) {
        updates.push('for_trade = ?');
        bindings.push(for_trade ? 1 : 0);
    }

    if (updates.length === 0) {
        return errorResponse('No fields to update');
    }

    bindings.push(itemId);

    await env.DBA.prepare(
        `UPDATE user_inventory SET ${updates.join(', ')} WHERE id = ?`
    ).bind(...bindings).run();

    return successResponse({ message: 'Item updated successfully' });
}

// Handle DELETE requests
async function handleDelete(request, env, path, user) {
    if (!user || !isAuthorized(user)) {
        return errorResponse('Unauthorized', 401);
    }

    const itemId = path.split('/')[0];
    if (!itemId) {
        return errorResponse('Item ID required', 400);
    }

    // Check ownership
    const item = await env.DBA.prepare(
        'SELECT * FROM user_inventory WHERE id = ?'
    ).bind(itemId).first();

    if (!item) {
        return errorResponse('Item not found', 404);
    }

    if (item.user_id !== user.user_id) {
        return errorResponse('You can only delete your own inventory items', 403);
    }

    await env.DBA.prepare(
        'DELETE FROM user_inventory WHERE id = ?'
    ).bind(itemId).run();

    return successResponse({ message: 'Item removed from inventory' });
}

// Main handler
export async function onRequest(context) {
    const { request, env } = context;
    const url = new URL(request.url);
    const pathParts = url.pathname.split('/api/trades/inventory/').filter(Boolean);
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
        if (request.method === 'GET') {
            // Optional auth for GET
            const authHeader = request.headers.get('Authorization');
            if (authHeader) {
                user = await authenticateUser(request, env);
            }
        } else {
            user = await authenticateUser(request, env);
        }

        let response;
        switch (request.method) {
            case 'GET':
                response = await handleGet(request, env, path, user);
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
        console.error('Trade inventory error:', error);
        return new Response(JSON.stringify({ error: 'Internal server error' }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
    }
}
