import {
    authenticateUser,
    isAuthorized,
    errorResponse,
    successResponse,
    validateFields,
    parsePagination,
    parseSort,
    getUserWithStats
} from '../_utils/helpers.js';

// Handle GET requests
async function handleGet(request, env, path) {
    const url = new URL(request.url);

    // GET /api/trades/listings - List all active listings
    if (!path || path === '') {
        const { limit, offset } = parsePagination(url);
        const { sortBy, sortOrder } = parseSort(url, ['created_at', 'updated_at', 'views'], 'created_at', 'DESC');

        const params = url.searchParams;
        const category = params.get('category');
        const userId = params.get('user_id');
        const status = params.get('status') || 'active';
        const search = params.get('search');

        let query = 'SELECT * FROM trade_listings WHERE 1=1';
        const bindings = [];

        if (status) {
            query += ' AND status = ?';
            bindings.push(status);
        }

        if (category && category !== 'all') {
            query += ' AND category = ?';
            bindings.push(category);
        }

        if (userId) {
            query += ' AND user_id = ?';
            bindings.push(userId);
        }

        if (search) {
            query += ' AND (title LIKE ? OR description LIKE ?)';
            bindings.push(`%${search}%`, `%${search}%`);
        }

        query += ` ORDER BY ${sortBy} ${sortOrder} LIMIT ? OFFSET ?`;
        bindings.push(limit, offset);

        const { results } = await env.DBA.prepare(query).bind(...bindings).all();

        // Get user info for each listing
        const listings = await Promise.all(results.map(async (listing) => {
            const user = await getUserWithStats(env, listing.user_id);
            return {
                ...listing,
                offering_items: JSON.parse(listing.offering_items),
                seeking_items: listing.seeking_items ? JSON.parse(listing.seeking_items) : null,
                user: {
                    user_id: user.user_id,
                    username: user.username,
                    display_name: user.display_name,
                    avatar_url: user.avatar_url,
                    average_rating: user.average_rating || 0,
                    total_trades: user.total_trades || 0
                }
            };
        }));

        return successResponse({ listings, limit, offset });
    }

    // GET /api/trades/listings/:id - Get specific listing
    const listingId = path.split('/')[0];
    if (listingId) {
        const listing = await env.DBA.prepare(
            'SELECT * FROM trade_listings WHERE id = ?'
        ).bind(listingId).first();

        if (!listing) {
            return errorResponse('Listing not found', 404);
        }

        // Increment view count
        await env.DBA.prepare(
            'UPDATE trade_listings SET views = views + 1 WHERE id = ?'
        ).bind(listingId).run();

        // Get user info
        const user = await getUserWithStats(env, listing.user_id);

        // Get offer count
        const offerCount = await env.DBA.prepare(
            'SELECT COUNT(*) as count FROM trade_offers WHERE listing_id = ?'
        ).bind(listingId).first();

        return successResponse({
            ...listing,
            offering_items: JSON.parse(listing.offering_items),
            seeking_items: listing.seeking_items ? JSON.parse(listing.seeking_items) : null,
            views: listing.views + 1,
            offer_count: offerCount.count,
            user: {
                user_id: user.user_id,
                username: user.username,
                display_name: user.display_name,
                avatar_url: user.avatar_url,
                average_rating: user.average_rating || 0,
                total_trades: user.total_trades || 0,
                total_reviews: user.total_reviews || 0
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

    // POST /api/trades/listings - Create new listing
    if (!path || path === '') {
        const data = await request.json();

        const error = validateFields(data, ['title', 'offering_items']);
        if (error) {
            return errorResponse(error);
        }

        const {
            title,
            description,
            category = 'other',
            offering_items,
            seeking_items,
            expires_in_days = 30
        } = data;

        // Validate offering_items is an array
        if (!Array.isArray(offering_items) || offering_items.length === 0) {
            return errorResponse('offering_items must be a non-empty array');
        }

        const now = Date.now();
        const expiresAt = now + (expires_in_days * 24 * 60 * 60 * 1000);

        const result = await env.DBA.prepare(
            `INSERT INTO trade_listings
            (user_id, title, description, category, status, offering_items, seeking_items, created_at, updated_at, expires_at)
            VALUES (?, ?, ?, ?, 'active', ?, ?, ?, ?, ?)`
        ).bind(
            user.user_id,
            title,
            description || null,
            category,
            JSON.stringify(offering_items),
            seeking_items ? JSON.stringify(seeking_items) : null,
            now,
            now,
            expiresAt
        ).run();

        return successResponse({
            id: result.meta.last_row_id,
            message: 'Listing created successfully'
        }, 201);
    }

    return errorResponse('Invalid request', 400);
}

// Handle PUT/PATCH requests
async function handlePut(request, env, path, user) {
    if (!user || !isAuthorized(user)) {
        return errorResponse('Unauthorized', 401);
    }

    const listingId = path.split('/')[0];
    if (!listingId) {
        return errorResponse('Listing ID required', 400);
    }

    // Check ownership
    const listing = await env.DBA.prepare(
        'SELECT * FROM trade_listings WHERE id = ?'
    ).bind(listingId).first();

    if (!listing) {
        return errorResponse('Listing not found', 404);
    }

    if (listing.user_id !== user.user_id) {
        return errorResponse('You can only edit your own listings', 403);
    }

    const data = await request.json();
    const {
        title,
        description,
        category,
        offering_items,
        seeking_items,
        status
    } = data;

    // Build update query dynamically
    const updates = [];
    const bindings = [];

    if (title !== undefined) {
        updates.push('title = ?');
        bindings.push(title);
    }
    if (description !== undefined) {
        updates.push('description = ?');
        bindings.push(description);
    }
    if (category !== undefined) {
        updates.push('category = ?');
        bindings.push(category);
    }
    if (offering_items !== undefined) {
        updates.push('offering_items = ?');
        bindings.push(JSON.stringify(offering_items));
    }
    if (seeking_items !== undefined) {
        updates.push('seeking_items = ?');
        bindings.push(JSON.stringify(seeking_items));
    }
    if (status !== undefined && ['active', 'cancelled', 'completed'].includes(status)) {
        updates.push('status = ?');
        bindings.push(status);
    }

    if (updates.length === 0) {
        return errorResponse('No fields to update');
    }

    updates.push('updated_at = ?');
    bindings.push(Date.now());
    bindings.push(listingId);

    await env.DBA.prepare(
        `UPDATE trade_listings SET ${updates.join(', ')} WHERE id = ?`
    ).bind(...bindings).run();

    return successResponse({ message: 'Listing updated successfully' });
}

// Handle DELETE requests
async function handleDelete(request, env, path, user) {
    if (!user || !isAuthorized(user)) {
        return errorResponse('Unauthorized', 401);
    }

    const listingId = path.split('/')[0];
    if (!listingId) {
        return errorResponse('Listing ID required', 400);
    }

    // Check ownership
    const listing = await env.DBA.prepare(
        'SELECT * FROM trade_listings WHERE id = ?'
    ).bind(listingId).first();

    if (!listing) {
        return errorResponse('Listing not found', 404);
    }

    if (listing.user_id !== user.user_id) {
        return errorResponse('You can only delete your own listings', 403);
    }

    // Soft delete by setting status to cancelled
    await env.DBA.prepare(
        'UPDATE trade_listings SET status = ?, updated_at = ? WHERE id = ?'
    ).bind('cancelled', Date.now(), listingId).run();

    return successResponse({ message: 'Listing deleted successfully' });
}

// Main handler
export async function onRequest(context) {
    const { request, env } = context;
    const url = new URL(request.url);
    const pathParts = url.pathname.split('/api/trades/listings/').filter(Boolean);
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
        console.error('Trade listings error:', error);
        return new Response(JSON.stringify({ error: 'Internal server error' }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
    }
}
