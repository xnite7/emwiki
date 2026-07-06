import {
    authenticateUser,
    isAuthorized,
    isModerator,
    isTradeBanned,
    errorResponse,
    successResponse,
    validateFields,
    parsePagination,
    parseSort,
    getUserWithStats,
    safeJsonParse,
    normalizeUserId,
    userIdForms,
    isSameUser
} from '../_utils/helpers.js';

// Roles that unlock card themes (mirrors TradingHub.THEME_ROLES on the client).
const THEME_ROLES = ['donator', 'vip', 'moderator', 'mod', 'admin'];

// Whether an authenticated user (from authenticateUser, `user.roles` = raw
// `role` column, a JSON string or array) is allowed to use non-default themes.
function userHasThemeRole(user) {
    let roles = user?.roles;
    if (!roles) return false;
    if (typeof roles === 'string') {
        try { roles = JSON.parse(roles); } catch { roles = [roles]; }
    }
    if (!Array.isArray(roles)) return false;
    return roles.some(r => THEME_ROLES.includes(String(r).toLowerCase()));
}

// Handle GET requests
async function handleGet(request, env, path, user) {
    const url = new URL(request.url);
    // The signed-in viewer, used to flag which listings they've already liked.
    const viewerId = user ? normalizeUserId(user.user_id) : null;

    // GET /api/trades/listings - List all active listings
    if (!path || path === '') {
        const { limit, offset } = parsePagination(url);
        const { sortBy, sortOrder } = parseSort(url, ['created_at', 'updated_at', 'likes'], 'created_at', 'DESC');

        const params = url.searchParams;
        const category = params.get('category');
        const userId = params.get('user_id');
        const status = params.get('status') || 'active';
        const search = params.get('search');

        // Shared WHERE clause for both the page query and the total count, so
        // the client can render numbered pagination.
        let where = ' WHERE 1=1';
        const whereBindings = [];

        // 'all' (or empty) means no status filter — otherwise the query would
        // literally match `status = 'all'` and return nothing.
        if (status && status !== 'all') {
            where += ' AND tl.status = ?';
            whereBindings.push(status);
        }

        if (category && category !== 'all') {
            where += ' AND tl.category = ?';
            whereBindings.push(category);
        }

        if (userId) {
            // Match both the canonical id and the legacy ".0" float-artifact
            // form so pre-cleanup rows still show up (see helpers.userIdForms).
            where += ' AND tl.user_id IN (?, ?)';
            whereBindings.push(...userIdForms(userId));
        }

        if (search) {
            // Titles are auto-generated ("Trading X + 26 more"), so most item
            // names never appear in them — search the item JSON too, where the
            // stored item_name values live.
            where += ' AND (tl.title LIKE ? OR tl.description LIKE ? OR tl.offering_items LIKE ? OR tl.seeking_items LIKE ?)';
            const term = `%${search}%`;
            whereBindings.push(term, term, term, term);
        }

        // like_count is aggregated from trade_likes; `liked` flags whether the
        // signed-in viewer has liked each listing (0 for logged-out visitors).
        let query = `
            SELECT
                tl.*,
                u.user_id AS u_user_id,
                u.username AS u_username,
                u.display_name AS u_display_name,
                u.avatar_url AS u_avatar_url,
                uts.average_rating AS u_average_rating,
                uts.total_trades AS u_total_trades,
                (SELECT COUNT(*) FROM trade_likes lk WHERE lk.listing_id = tl.id) AS like_count,
                (SELECT COUNT(*) FROM trade_likes lk WHERE lk.listing_id = tl.id AND lk.user_id IN (?, ?)) AS liked
            FROM trade_listings tl
            LEFT JOIN users u ON u.user_id = tl.user_id
            LEFT JOIN user_trade_stats uts ON uts.user_id = tl.user_id
        `;
        // 'likes' sorts by the aggregated count; the rest are real columns.
        const orderBy = sortBy === 'likes' ? 'like_count' : `tl.${sortBy}`;
        query += where + ` ORDER BY ${orderBy} ${sortOrder} LIMIT ? OFFSET ?`;
        const likeBindings = viewerId ? userIdForms(viewerId) : ['\0', '\0'];
        const bindings = [...likeBindings, ...whereBindings, limit, offset];

        const [{ results }, countRow] = await Promise.all([
            env.DBA.prepare(query).bind(...bindings).all(),
            env.DBA.prepare(`SELECT COUNT(*) AS total FROM trade_listings tl${where}`)
                .bind(...whereBindings).first()
        ]);

        const listings = (results || []).map((row) => {
            const {
                u_user_id, u_username, u_display_name, u_avatar_url,
                u_average_rating, u_total_trades,
                offering_items, seeking_items,
                like_count, liked, views,
                ...listing
            } = row;

            return {
                ...listing,
                user_id: normalizeUserId(listing.user_id),
                offering_items: safeJsonParse(offering_items),
                seeking_items: seeking_items ? safeJsonParse(seeking_items, null) : null,
                like_count: like_count || 0,
                liked: !!liked,
                user: {
                    user_id: normalizeUserId(u_user_id),
                    username: u_username,
                    display_name: u_display_name,
                    avatar_url: u_avatar_url,
                    average_rating: u_average_rating || 0,
                    total_trades: u_total_trades || 0
                }
            };
        });

        return successResponse({ listings, limit, offset, total: countRow?.total ?? listings.length });
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

        // Get user info
        const owner = await getUserWithStats(env, listing.user_id);

        // Get offer count + like count, and whether the viewer has liked it.
        const [offerCount, likeCount, likedRow] = await Promise.all([
            env.DBA.prepare('SELECT COUNT(*) as count FROM trade_offers WHERE listing_id = ?')
                .bind(listingId).first(),
            env.DBA.prepare('SELECT COUNT(*) as count FROM trade_likes WHERE listing_id = ?')
                .bind(listingId).first(),
            viewerId
                ? env.DBA.prepare('SELECT id FROM trade_likes WHERE listing_id = ? AND user_id IN (?, ?)')
                    .bind(listingId, ...userIdForms(viewerId)).first()
                : Promise.resolve(null)
        ]);

        const { views, ...listingRest } = listing;
        return successResponse({
            ...listingRest,
            user_id: normalizeUserId(listing.user_id),
            offering_items: safeJsonParse(listing.offering_items),
            seeking_items: listing.seeking_items ? safeJsonParse(listing.seeking_items, null) : null,
            offer_count: offerCount.count,
            like_count: likeCount.count,
            liked: !!likedRow,
            user: {
                user_id: owner.user_id,
                username: owner.username,
                display_name: owner.display_name,
                avatar_url: owner.avatar_url,
                average_rating: owner.average_rating || 0,
                total_trades: owner.total_trades || 0,
                total_reviews: owner.total_reviews || 0
            }
        });
    }

    return errorResponse('Invalid request', 400);
}

// Toggle the signed-in user's like on a listing. Returns the new like count
// and whether the user now likes it.
async function handleLikeToggle(env, listingId, user) {
    if (!listingId) {
        return errorResponse('Listing ID required', 400);
    }

    const listing = await env.DBA.prepare(
        'SELECT id FROM trade_listings WHERE id = ?'
    ).bind(listingId).first();
    if (!listing) {
        return errorResponse('Listing not found', 404);
    }

    const userId = normalizeUserId(user.user_id);
    const existing = await env.DBA.prepare(
        'SELECT id FROM trade_likes WHERE listing_id = ? AND user_id IN (?, ?)'
    ).bind(listingId, ...userIdForms(userId)).first();

    let liked;
    if (existing) {
        await env.DBA.prepare('DELETE FROM trade_likes WHERE id = ?').bind(existing.id).run();
        liked = false;
    } else {
        await env.DBA.prepare(
            'INSERT INTO trade_likes (listing_id, user_id, created_at) VALUES (?, ?, ?)'
        ).bind(listingId, userId, Date.now()).run();
        liked = true;
    }

    const { count } = await env.DBA.prepare(
        'SELECT COUNT(*) as count FROM trade_likes WHERE listing_id = ?'
    ).bind(listingId).first();

    return successResponse({ liked, like_count: count });
}

// Handle POST requests
async function handlePost(request, env, path, user) {
    if (!user || !isAuthorized(user)) {
        return errorResponse('Unauthorized', 401);
    }

    // POST /api/trades/listings/:id/like - toggle a like on a listing
    {
        const parts = path.split('/');
        if (parts[1] === 'like') {
            return handleLikeToggle(env, parts[0], user);
        }
    }

    // Banned players cannot create listings.
    if (await isTradeBanned(env, user.user_id)) {
        return errorResponse('You are banned from trading', 403);
    }

    // POST /api/trades/listings - Create new listing
    if (!path || path === '') {
        const data = await request.json();

        const error = validateFields(data, ['offering_items']);
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

        // Only allow known themes; anything else falls back to 'default'.
        const allowedThemes = ['default', 'ocean', 'sunset', 'forest'];
        let theme = allowedThemes.includes(data.theme) ? data.theme : 'default';
        // Non-default themes are a donator perk — enforce server-side so the
        // client-side lock can't just be bypassed.
        if (theme !== 'default' && !userHasThemeRole(user)) {
            theme = 'default';
        }

        // Validate offering_items is an array
        if (!Array.isArray(offering_items) || offering_items.length === 0) {
            return errorResponse('offering_items must be a non-empty array');
        }

        // Validate item types and robux amounts
        const validateItems = (items, fieldName) => {
            for (const item of items) {
                if (item.type === 'robux') {
                    const amount = parseInt(item.amount);
                    if (isNaN(amount) || amount < 0 || amount > 1000000) {
                        return `Invalid robux amount in ${fieldName}: must be between 0 and 1,000,000`;
                    }
                } else if (item.type === 'other-game') {
                    if (!item.game_name || !item.item_name) {
                        return `Invalid other-game item in ${fieldName}: game_name and item_name are required`;
                    }
                } else if (item.type === 'game-item') {
                    if (!item.item_name) {
                        return `Invalid game-item in ${fieldName}: item_name is required`;
                    }
                }
            }
            return null;
        };

        const offeringError = validateItems(offering_items, 'offering_items');
        if (offeringError) {
            return errorResponse(offeringError);
        }

        if (seeking_items && Array.isArray(seeking_items)) {
            const seekingError = validateItems(seeking_items, 'seeking_items');
            if (seekingError) {
                return errorResponse(seekingError);
            }
        }

        // Generate auto title if not provided
        let finalTitle = title;
        if (!finalTitle) {
            const firstOffering = offering_items[0];
            let offeringText = '';
            if (firstOffering.type === 'robux') {
                offeringText = `${firstOffering.amount} R$`;
            } else if (firstOffering.type === 'other-game') {
                offeringText = `${firstOffering.game_name} ${firstOffering.item_name}`;
            } else {
                offeringText = firstOffering.item_name;
            }
            if (offering_items.length > 1) {
                offeringText += ` + ${offering_items.length - 1} more`;
            }
            
            if (seeking_items && seeking_items.length > 0) {
                const firstSeeking = seeking_items[0];
                let seekingText = '';
                if (firstSeeking.type === 'robux') {
                    seekingText = `${firstSeeking.amount} R$`;
                } else if (firstSeeking.type === 'other-game') {
                    seekingText = `${firstSeeking.game_name} ${firstSeeking.item_name}`;
                } else {
                    seekingText = firstSeeking.item_name;
                }
                if (seeking_items.length > 1) {
                    seekingText += ` + ${seeking_items.length - 1} more`;
                }
                finalTitle = `Trading ${offeringText} for ${seekingText}`;
            } else {
                finalTitle = `Trading ${offeringText}`;
            }
        }

        const now = Date.now();
        const expiresAt = now + (expires_in_days * 24 * 60 * 60 * 1000);

        const result = await env.DBA.prepare(
            `INSERT INTO trade_listings
            (user_id, title, description, category, status, offering_items, seeking_items, theme, created_at, updated_at, expires_at)
            VALUES (?, ?, ?, ?, 'active', ?, ?, ?, ?, ?, ?)`
        ).bind(
            user.user_id,
            finalTitle,
            description || null,
            category,
            JSON.stringify(offering_items),
            seeking_items ? JSON.stringify(seeking_items) : null,
            theme,
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

    if (!isSameUser(listing.user_id, user.user_id)) {
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

    const owner = isSameUser(listing.user_id, user.user_id);
    const mod = isModerator(user);
    if (!owner && !mod) {
        return errorResponse('You can only delete your own listings', 403);
    }

    // Moderators hard-delete the listing (and its dependent rows) so it is
    // removed outright; owners keep the existing soft-delete (cancelled) so
    // their trade history is preserved.
    if (mod && !owner) {
        await env.DBA.batch([
            env.DBA.prepare('DELETE FROM trade_likes WHERE listing_id = ?').bind(listingId),
            env.DBA.prepare('DELETE FROM trade_offers WHERE listing_id = ?').bind(listingId),
            env.DBA.prepare('DELETE FROM trade_listings WHERE id = ?').bind(listingId)
        ]);
        return successResponse({ message: 'Listing removed by moderator' });
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
    const prefix = '/api/trades/listings';
    const path = url.pathname.startsWith(prefix)
        ? url.pathname.slice(prefix.length).replace(/^\//, '')
        : '';

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
        // Authenticate on every method: GET stays public, but a token (when
        // present) lets the response flag which listings the viewer has liked.
        const user = await authenticateUser(request, env);

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
        console.error('Trade listings error:', error);
        return new Response(JSON.stringify({ error: 'Internal server error' }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
    }
}
