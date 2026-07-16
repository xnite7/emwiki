// API endpoints for items
import { getRequestUser, isAdmin } from '../_utils/users.js';
import { uploadImageToCloudflareImages } from '../_utils/images.js';

function unauthorized(corsHeaders) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
}

function forbidden(corsHeaders) {
    return new Response(JSON.stringify({ error: 'Forbidden' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
}

async function requireAdmin(request, env, corsHeaders) {
    const user = await getRequestUser(request, env);
    if (!user) return { error: unauthorized(corsHeaders) };
    if (!isAdmin(user)) return { error: forbidden(corsHeaders) };
    return { user };
}

/**
 * Normalize image URL to use Cloudflare Images
 * 
 * If image is already a Cloudflare Images URL, return as-is.
 * Otherwise, convert local paths to our image API endpoint which will redirect to Cloudflare Images.
 */
function normalizeImageUrl(imgPath) {
    if (!imgPath) return null;
    
    // If already a full URL (Cloudflare Images or other), return as-is
    if (imgPath.startsWith('http://') || imgPath.startsWith('https://')) {
        return imgPath;
    }
    
    // Convert Windows backslashes to forward slashes
    let normalized = imgPath.replace(/\\/g, '/');
    
    // Remove leading ./ or / if present
    normalized = normalized.replace(/^\.?\//, '');
    
    // Convert imgs/ to items/ for consistency
    if (normalized.startsWith('imgs/')) {
        normalized = normalized.replace('imgs/', 'items/');
    } else if (!normalized.startsWith('items/')) {
        normalized = `items/${normalized}`;
    }
    
    // Return URL pointing to our image API endpoint
    // The endpoint will look up the Cloudflare Images URL from the database
    return `https://emwiki.com/api/images/${normalized}`;
}

export async function onRequest(context) {
    const { request, env } = context;
    const url = new URL(request.url);
    const pathParts = url.pathname.split('/').filter(p => p);
    
    // Extract path after /api/items/
    const pathIndex = pathParts.indexOf('items');
    const path = pathIndex >= 0 ? pathParts.slice(pathIndex + 1).join('/') : '';

    // CORS headers
    const corsHeaders = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    };

    if (request.method === 'OPTIONS') {
        return new Response(null, { headers: corsHeaders });
    }

    try {
        // Route handling
        if (request.method === 'GET') {
            // GET /api/items/categories - Get item counts per category
            if (path === 'categories') {
                return await getCategories(env, corsHeaders);
            }

            // GET /api/items/search - Search items by name
            if (path === 'search') {
                return await searchItems(request, env, corsHeaders);
            }

            // GET /api/items/homepage - Get items for homepage (new, weekly, weeklystar, random)
            if (path === 'homepage') {
                return await getHomepageItems(env, corsHeaders);
            }

            // GET /api/items/random - Get a single random item
            if (path === 'random') {
                return await getRandomItem(env, corsHeaders);
            }

            // GET /api/items/:category/:name - Get single item
            const pathMatch = path.match(/^([^/]+)\/(.+)$/);
            if (pathMatch) {
                const [, category, name] = pathMatch;
                return await getItem(category, decodeURIComponent(name), env, corsHeaders);
            }

            // GET /api/items - List items with pagination and filtering
            return await listItems(request, env, corsHeaders);
        }

        // POST /api/items/batch - Fetch multiple items by name
        if (request.method === 'POST' && path === 'batch') {
            return await batchGetItems(request, env, corsHeaders);
        }

        // POST /api/items/sync-icons - Fetch item icons from Roblox and store them (admin only)
        if (request.method === 'POST' && path === 'sync-icons') {
            return await syncIcons(request, env, corsHeaders);
        }

        // POST /api/items - Create new item (admin only)
        if (request.method === 'POST' && path === '') {
            return await createItem(request, env, corsHeaders);
        }

        // PUT /api/items/:id - Update item (admin only)
        if (request.method === 'PUT') {
            const idMatch = path.match(/^(\d+)$/);
            if (idMatch) {
                const [, id] = idMatch;
                return await updateItem(id, request, env, corsHeaders);
            }
        }

        // DELETE /api/items/:id - Delete item (admin only)
        if (request.method === 'DELETE') {
            const idMatch = path.match(/^(\d+)$/);
            if (idMatch) {
                const [, id] = idMatch;
                return await deleteItem(id, request, env, corsHeaders);
            }
        }

        return new Response(JSON.stringify({ error: 'Not found' }), {
            status: 404,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
    } catch (error) {
        console.error('Items API error:', error);
        return new Response(JSON.stringify({ error: error.message }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
    }
}

// Get item counts per category
async function getCategories(env, corsHeaders) {
    const { results } = await env.DBA.prepare(`
        SELECT category, COUNT(*) as count
        FROM items
        GROUP BY category
        ORDER BY category
    `).all();

    const categories = {};
    if (results) {
        results.forEach(row => {
            categories[row.category] = row.count;
        });
    }

    return new Response(JSON.stringify({ categories }), {
        headers: {
            ...corsHeaders,
            'Content-Type': 'application/json',
            'Cache-Control': 'public, max-age=300' // Cache for 5 minutes
        }
    });
}

// Get items for homepage (new, weekly, weeklystar items + random item + stats)
async function getHomepageItems(env, corsHeaders) {
    // Run queries in parallel for better performance
    const [featuredResults, statsResult, randomResult] = await Promise.all([
        // Get all featured items (new, weekly, or weeklystar)
        env.DBA.prepare(`
            SELECT id, name, category, img, svg, price, "from", price_code_rarity,
                   tradable, "new", weekly, weeklystar, retired, premium, removed, typicalgroup, unstable, demand,
                   credits, lore, alias, quantity, color, demand_updated_at, updated_at
            FROM items
            WHERE "new" = 1 OR weekly = 1 OR weeklystar = 1
            ORDER BY category, name
        `).all(),
        
        // Get stats (total items and new items count)
        env.DBA.prepare(`
            SELECT 
                COUNT(*) as totalItems,
                SUM(CASE WHEN "new" = 1 THEN 1 ELSE 0 END) as newItemsCount
            FROM items
        `).first(),
        
        // Get 1 random item
        env.DBA.prepare(`
            SELECT id, name, category, img, svg, price, "from", price_code_rarity,
                   tradable, "new", weekly, weeklystar, retired, premium, removed, typicalgroup, unstable, demand,
                   credits, lore, alias, quantity, color, demand_updated_at, updated_at
            FROM items
            ORDER BY RANDOM()
            LIMIT 1
        `).first()
    ]);

    const featured = featuredResults.results || [];
    
    // Transform items helper
    const transformItem = (item) => ({
        ...item,
        img: normalizeImageUrl(item.img),
        tradable: item.tradable === 1,
        new: item.new === 1,
        weekly: item.weekly === 1,
        weeklystar: item.weeklystar === 1,
        retired: item.retired === 1,
        premium: item.premium === 1,
        removed: item.removed === 1,
        'price/code/rarity': item.price_code_rarity,
        typicalgroup: item.typicalgroup === 1,
        unstable: item.unstable === 1
    });

    // Separate items into categories
    const newItems = featured.filter(item => item.new === 1).slice(0, 50).map(transformItem);
    const weeklyItems = featured.filter(item => item.weekly === 1).slice(0, 8).map(transformItem);
    const weeklystarItems = featured.filter(item => item.weeklystar === 1).slice(0, 8).map(transformItem);
    const randomItem = randomResult ? transformItem(randomResult) : null;

    return new Response(JSON.stringify({
        newItems,
        weeklyItems,
        weeklystarItems,
        randomItem,
        stats: {
            totalItems: statsResult?.totalItems || 0,
            newItemsCount: statsResult?.newItemsCount || 0
        }
    }), {
        headers: {
            ...corsHeaders,
            'Content-Type': 'application/json',
            'Cache-Control': 'public, max-age=60' // Cache for 1 minute
        }
    });
}

// Get a single random item
async function getRandomItem(env, corsHeaders) {
    const item = await env.DBA.prepare(`
        SELECT id, name, category, img, svg, price, "from", price_code_rarity,
               tradable, "new", weekly, weeklystar, retired, premium, removed, unstable, demand,
               credits, lore, alias, quantity, color, demand_updated_at, updated_at
        FROM items
        ORDER BY RANDOM()
        LIMIT 1
    `).first();

    if (!item) {
        return new Response(JSON.stringify({ error: 'No items found' }), {
            status: 404,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
    }

    const result = {
        ...item,
        img: normalizeImageUrl(item.img),
        tradable: item.tradable === 1,
        new: item.new === 1,
        weekly: item.weekly === 1,
        weeklystar: item.weeklystar === 1,
        retired: item.retired === 1,
        premium: item.premium === 1,
        removed: item.removed === 1,
        'price/code/rarity': item.price_code_rarity,
        typicalgroup: item.typicalgroup === 1,
        unstable: item.unstable === 1
    };

    return new Response(JSON.stringify({ item: result }), {
        headers: {
            ...corsHeaders,
            'Content-Type': 'application/json',
            'Cache-Control': 'no-cache' // Don't cache random items
        }
    });
}

// Search items by name (optimized for autocomplete)
async function searchItems(request, env, corsHeaders) {
    const url = new URL(request.url);
    const query = url.searchParams.get('q') || '';
    const category = url.searchParams.get('category') || '';
    const limit = Math.min(parseInt(url.searchParams.get('limit') || '50'), 100);

    if (!query || query.length < 1) {
        return new Response(JSON.stringify({ items: [] }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
    }

    let sql = `
        SELECT id, name, category, img, svg, price, "from", price_code_rarity,
               tradable, "new", weekly, weeklystar, retired, premium, removed, unstable, demand,
               credits, lore, alias, quantity, color, demand_updated_at, updated_at
        FROM items
        WHERE name LIKE ?
    `;
    const params = [`%${query}%`];

    if (category) {
        sql += ` AND category = ?`;
        params.push(category);
    }

    sql += ` ORDER BY name LIMIT ?`;
    params.push(limit);

    const { results } = await env.DBA.prepare(sql).bind(...params).all();

    const items = (results || []).map(item => ({
        ...item,
        img: normalizeImageUrl(item.img), // Normalize image URL to use R2
        tradable: item.tradable === 1,
        new: item.new === 1,
        weekly: item.weekly === 1,
        weeklystar: item.weeklystar === 1,
        retired: item.retired === 1,
        premium: item.premium === 1,
        removed: item.removed === 1,
        'price/code/rarity': item.price_code_rarity,
        typicalgroup: item.typicalgroup === 1,
        unstable: item.unstable === 1
    }));

    return new Response(JSON.stringify({ items }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
}

// Batch fetch items by name (for wishlists, etc.)
async function batchGetItems(request, env, corsHeaders) {
    let data;
    try {
        data = await request.json();
    } catch (e) {
        return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
    }

    const { names } = data;

    if (!names || !Array.isArray(names) || names.length === 0) {
        return new Response(JSON.stringify({ items: [] }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
    }

    // Limit to 100 items per batch to prevent abuse
    const limitedNames = names.slice(0, 100);

    // Build parameterized query with placeholders
    const placeholders = limitedNames.map(() => '?').join(', ');
    const sql = `
        SELECT id, name, category, img, svg, price, "from", price_code_rarity,
               tradable, "new", weekly, weeklystar, retired, premium, removed, demand,
               credits, lore, alias, quantity, color, demand_updated_at, updated_at, typicalgroup, unstable
        FROM items
        WHERE name IN (${placeholders})
        ORDER BY name
    `;

    const { results } = await env.DBA.prepare(sql).bind(...limitedNames).all();

    const items = (results || []).map(item => ({
        ...item,
        img: normalizeImageUrl(item.img),
        tradable: item.tradable === 1,
        new: item.new === 1,
        weekly: item.weekly === 1,
        weeklystar: item.weeklystar === 1,
        retired: item.retired === 1,
        premium: item.premium === 1,
        removed: item.removed === 1,
        typicalgroup: item.typicalgroup === 1,
        unstable: item.unstable === 1,
        'price/code/rarity': item.price_code_rarity,
        color: item.color ? JSON.parse(item.color) : null
    }));

    return new Response(JSON.stringify({ items }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
}

// Get single item by category and name
async function getItem(category, name, env, corsHeaders) {
    const item = await env.DBA.prepare(`
        SELECT id, name, category, img, svg, price, "from", price_code_rarity,
               tradable, "new", weekly, weeklystar, retired, premium, removed, typicalgroup, unstable,
               price_history, demand, credits, lore, alias, quantity, color, demand_updated_at, created_at, updated_at
        FROM items
        WHERE category = ? AND name = ?
    `).bind(category, name).first();

    if (!item) {
        return new Response(JSON.stringify({ error: 'Item not found' }), {
            status: 404,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
    }

    const result = {
        ...item,
        img: normalizeImageUrl(item.img), // Normalize image URL to use R2
        tradable: item.tradable === 1,
        new: item.new === 1,
        weekly: item.weekly === 1,
        weeklystar: item.weeklystar === 1,
        retired: item.retired === 1,
        premium: item.premium === 1,
        removed: item.removed === 1,
        'price/code/rarity': item.price_code_rarity,
        typicalgroup: item.typicalgroup === 1,
        unstable: item.unstable === 1,
        priceHistory: item.price_history ? JSON.parse(item.price_history) : null,
        color: item.color ? JSON.parse(item.color) : null
    };

    return new Response(JSON.stringify({ item: result }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
}

// List items with pagination and filtering
async function listItems(request, env, corsHeaders) {
    const url = new URL(request.url);
    
    // Pagination
    const limit = Math.min(parseInt(url.searchParams.get('limit') || '100'), 2500);
    const offset = Math.max(parseInt(url.searchParams.get('offset') || '0'), 0);
    
    // Filters
    const category = url.searchParams.get('category') || '';
    const search = url.searchParams.get('search') || '';
    const tradable = url.searchParams.get('tradable');
    const premium = url.searchParams.get('premium');
    const retired = url.searchParams.get('retired');
    const newFilter = url.searchParams.get('new');
    const weekly = url.searchParams.get('weekly');
    const weeklystar = url.searchParams.get('weeklystar');

    // Build WHERE clause
    const conditions = [];
    const params = [];

    if (category) {
        conditions.push('category = ?');
        params.push(category);
    }

    if (search) {
        conditions.push('name LIKE ?');
        params.push(`%${search}%`);
    }

    if (tradable !== null) {
        conditions.push('tradable = ?');
        params.push(tradable === 'true' || tradable === '1' ? 1 : 0);
    }

    if (premium !== null) {
        conditions.push('premium = ?');
        params.push(premium === 'true' || premium === '1' ? 1 : 0);
    }

    if (retired !== null) {
        conditions.push('retired = ?');
        params.push(retired === 'true' || retired === '1' ? 1 : 0);
    }

    if (newFilter !== null) {
        conditions.push('"new" = ?');
        params.push(newFilter === 'true' || newFilter === '1' ? 1 : 0);
    }

    if (weekly !== null) {
        conditions.push('weekly = ?');
        params.push(weekly === 'true' || weekly === '1' ? 1 : 0);
    }

    if (weeklystar !== null) {
        conditions.push('weeklystar = ?');
        params.push(weeklystar === 'true' || weeklystar === '1' ? 1 : 0);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    // Only run count query if specifically needed (offset pagination or smaller batches)
    // Skip for bulk fetches (limit >= 500 and offset === 0) to improve performance
    let total = null;
    if (offset > 0 || limit < 500) {
        const countResult = await env.DBA.prepare(`
            SELECT COUNT(*) as total
            FROM items
            ${whereClause}
        `).bind(...params).first();
        total = countResult?.total || 0;
    }

    // Get items (include updated_at for optimistic locking, target_flikes for sorting)
    const { results } = await env.DBA.prepare(`
        SELECT id, name, category, img, svg, price, "from", price_code_rarity,
               tradable, "new", weekly, weeklystar, retired, premium, removed, typicalgroup, unstable, demand,
               credits, lore, alias, quantity, color, demand_updated_at, updated_at, price_history,
               target_flikes, created_at
        FROM items
        ${whereClause}
        ORDER BY category, name
        LIMIT ? OFFSET ?
    `).bind(...params, limit, offset).all();

    // Helper to calculate displayed flikes (gradual ramp over 30 days)
    const calculateDisplayedFlikes = (targetFlikes, createdAt) => {
        if (!targetFlikes || targetFlikes <= 0) return 0;
        const now = Date.now();
        const createdAtMs = createdAt * 1000;
        const ageDays = (now - createdAtMs) / (1000 * 60 * 60 * 24);
        const progress = Math.min(ageDays / 30, 1);
        return Math.floor(targetFlikes * progress);
    };

    const items = (results || []).map(item => ({
        ...item,
        img: normalizeImageUrl(item.img), // Normalize image URL to use R2
        tradable: item.tradable === 1,
        new: item.new === 1,
        weekly: item.weekly === 1,
        weeklystar: item.weeklystar === 1,
        retired: item.retired === 1,
        premium: item.premium === 1,
        removed: item.removed === 1,
        'price/code/rarity': item.price_code_rarity,
        typicalgroup: item.typicalgroup === 1,
        unstable: item.unstable === 1,
        priceHistory: item.price_history ? JSON.parse(item.price_history) : null,
        color: item.color ? JSON.parse(item.color) : null,
        // Include calculated flikes for sorting (gradual ramp based on item age)
        flikes: calculateDisplayedFlikes(item.target_flikes, item.created_at)
    }));

    return new Response(JSON.stringify({
        items,
        total,
        limit,
        offset
    }), {
        headers: {
            ...corsHeaders,
            'Content-Type': 'application/json',
            'Cache-Control': 'public, max-age=3' // Cache for 3 seconds
        }
    });
}

// Create new item (admin only)
// Max entries per sync-icons request. Each entry can cost up to 7 fetch
// subrequests (assetdelivery meta + CDN + inner meta + inner CDN + thumbnail
// fallback meta + thumbnail CDN + CF Images upload); 6 * 7 = 42 stays under
// the 50-subrequest Workers cap.
const MAX_SYNC_ENTRIES = 6;

const IMAGE_MAGIC_BYTES = [
    { type: 'image/png', bytes: [0x89, 0x50, 0x4E, 0x47] },
    { type: 'image/jpeg', bytes: [0xFF, 0xD8] },
    { type: 'image/gif', bytes: [0x47, 0x49, 0x46, 0x38] },
];

function sniffImageType(bytes) {
    const view = new Uint8Array(bytes);
    for (const { type, bytes: magic } of IMAGE_MAGIC_BYTES) {
        if (magic.every((b, i) => view[i] === b)) return type;
    }
    // WebP: RIFF....WEBP
    if (view[0] === 0x52 && view[1] === 0x49 && view[2] === 0x46 && view[3] === 0x46 &&
        view[8] === 0x57 && view[9] === 0x45 && view[10] === 0x42 && view[11] === 0x50) {
        return 'image/webp';
    }
    return null;
}

/**
 * Fallback: fetch a rendered thumbnail of the asset (420x420 PNG) via the
 * public thumbnails API. Works anonymously for assets that assetdelivery
 * refuses to serve without authentication.
 */
async function fetchRobloxThumbnail(assetId) {
    const fail = (code, detail) => Object.assign(new Error(detail), { code });

    const metaResp = await fetch(
        `https://thumbnails.roblox.com/v1/assets?assetIds=${assetId}&size=420x420&format=Png`,
        { headers: { 'Accept': 'application/json' } }
    );
    if (!metaResp.ok) {
        throw fail('asset_unavailable', `thumbnails API returned HTTP ${metaResp.status} for asset ${assetId}`);
    }
    const meta = await metaResp.json();
    const thumb = meta.data?.[0];
    if (!thumb?.imageUrl || thumb.state === 'Blocked' || thumb.state === 'Error') {
        throw fail('asset_unavailable', `asset ${assetId}: thumbnail state ${thumb?.state || 'unknown'}`);
    }

    const imgResp = await fetch(thumb.imageUrl);
    if (!imgResp.ok) {
        throw fail('asset_unavailable', `thumbnail CDN returned HTTP ${imgResp.status} for asset ${assetId}`);
    }
    const bytes = await imgResp.arrayBuffer();
    const contentType = sniffImageType(bytes);
    if (!contentType) {
        throw fail('not_an_image', `asset ${assetId}: thumbnail content is not an image (state ${thumb.state})`);
    }
    return { bytes, contentType };
}

/**
 * Fetch an image asset from Roblox assetdelivery.
 * Handles Decal assets (Roblox XML wrapping the real image id) by following
 * the inner id exactly once. Falls back to the public thumbnails API when
 * assetdelivery requires authentication for the asset.
 *
 * @returns {Promise<{ bytes: ArrayBuffer, contentType: string }>}
 * @throws {Error} with .code set to asset_unavailable | decal_parse_failed | not_an_image
 */
async function fetchRobloxImageAsset(assetId, depth = 0) {
    const fail = (code, detail) => {
        const err = new Error(detail);
        err.code = code;
        return err;
    };

    // Assets that assetdelivery refuses to serve anonymously (401) can still
    // be fetched as a rendered thumbnail — good enough for catalog icons.
    const thumbnailFallback = async (detail) => {
        try {
            return await fetchRobloxThumbnail(assetId);
        } catch (thumbError) {
            throw fail(thumbError.code || 'asset_unavailable', `${detail}; thumbnail fallback: ${thumbError.message}`);
        }
    };

    const metaResp = await fetch(`https://assetdelivery.roblox.com/v2/assetId/${assetId}`, {
        headers: { 'Accept': 'application/json' }
    });
    if (!metaResp.ok) {
        return thumbnailFallback(`assetdelivery returned HTTP ${metaResp.status} for asset ${assetId}`);
    }
    const meta = await metaResp.json();
    if (meta.errors?.length) {
        return thumbnailFallback(`asset ${assetId}: ${meta.errors[0].message || 'error ' + meta.errors[0].code}`);
    }
    const location = meta.locations?.[0]?.location;
    if (!location) {
        return thumbnailFallback(`asset ${assetId}: no download location returned`);
    }

    const assetResp = await fetch(location);
    if (!assetResp.ok) {
        throw fail('asset_unavailable', `CDN returned HTTP ${assetResp.status} for asset ${assetId}`);
    }
    const bytes = await assetResp.arrayBuffer();

    // Decal assets are Roblox XML documents referencing the actual image asset
    const head = new TextDecoder('utf-8', { fatal: false })
        .decode(bytes.slice(0, 512));
    if (head.trimStart().startsWith('<roblox')) {
        if (depth >= 1) {
            throw fail('decal_parse_failed', `asset ${assetId}: nested Roblox XML beyond one level`);
        }
        const idMatch = head.match(/<url>[^<]*?[?&]id=(\d+)/i)
            || new TextDecoder('utf-8', { fatal: false }).decode(bytes).match(/<url>[^<]*?[?&]id=(\d+)/i)
            || new TextDecoder('utf-8', { fatal: false }).decode(bytes).match(/rbxassetid:\/\/(\d+)/i);
        if (!idMatch) {
            throw fail('decal_parse_failed', `asset ${assetId}: Roblox XML without an inner image id`);
        }
        return fetchRobloxImageAsset(Number(idMatch[1]), depth + 1);
    }

    const contentType = sniffImageType(bytes);
    if (!contentType) {
        throw fail('not_an_image', `asset ${assetId}: content is not a PNG/JPEG/GIF/WebP image`);
    }

    return { bytes, contentType };
}

// POST /api/items/sync-icons (admin only)
// Body: { entries: [{ id?, name?, assetId, force? }], force?, dryRun? }
async function syncIcons(request, env, corsHeaders) {
    const auth = await requireAdmin(request, env, corsHeaders);
    if (auth.error) return auth.error;

    const jsonHeaders = { ...corsHeaders, 'Content-Type': 'application/json' };
    const badRequest = (body) => new Response(JSON.stringify(body), { status: 400, headers: jsonHeaders });

    let data;
    try {
        data = await request.json();
    } catch (e) {
        return badRequest({ error: 'Invalid JSON body' });
    }

    const { entries, force: globalForce = false, dryRun = false } = data || {};
    if (!Array.isArray(entries) || entries.length === 0) {
        return badRequest({ error: 'entries must be a non-empty array' });
    }
    if (entries.length > MAX_SYNC_ENTRIES) {
        return badRequest({ error: `Too many entries (${entries.length})`, max: MAX_SYNC_ENTRIES });
    }

    const results = [];
    const summary = { updated: 0, skipped: 0, errors: 0, dryRun: !!dryRun };

    for (const entry of entries) {
        const result = {
            name: entry?.name ?? null,
            id: entry?.id ?? null,
            assetId: entry?.assetId ?? null
        };
        results.push(result);

        try {
            const assetId = Number(entry?.assetId);
            if (!Number.isInteger(assetId) || assetId <= 0) {
                throw Object.assign(new Error('assetId must be a positive integer'), { code: 'invalid_asset_id' });
            }
            const force = entry?.force !== undefined ? !!entry.force : !!globalForce;

            // Resolve item by id (preferred) or unique name
            let item;
            if (entry?.id !== undefined && entry?.id !== null) {
                item = await env.DBA.prepare(
                    'SELECT id, name, img FROM items WHERE id = ?'
                ).bind(entry.id).first();
                if (!item) {
                    throw Object.assign(new Error(`no item with id ${entry.id}`), { code: 'not_found' });
                }
            } else if (entry?.name) {
                const { results: matches } = await env.DBA.prepare(
                    'SELECT id, name, img FROM items WHERE name = ?'
                ).bind(entry.name).all();
                if (matches.length === 0) {
                    throw Object.assign(new Error(`no item named "${entry.name}"`), { code: 'not_found' });
                }
                if (matches.length > 1) {
                    throw Object.assign(
                        new Error(`multiple items named "${entry.name}" (ids: ${matches.map(m => m.id).join(', ')}) — retry with an explicit id`),
                        { code: 'ambiguous_name' }
                    );
                }
                item = matches[0];
            } else {
                throw Object.assign(new Error('entry needs an id or a name'), { code: 'invalid_entry' });
            }
            result.id = item.id;
            result.name = item.name;

            if (item.img && !force) {
                result.status = 'skipped_existing';
                summary.skipped++;
                continue;
            }

            const { bytes, contentType } = await fetchRobloxImageAsset(assetId);

            if (dryRun) {
                result.status = 'resolved';
                result.contentType = contentType;
                result.size = bytes.byteLength;
                summary.updated++;
                continue;
            }

            const ext = contentType.split('/')[1].replace('jpeg', 'jpg');
            const file = new File([bytes], `item-${item.id}-${assetId}.${ext}`, { type: contentType });
            const uploaded = await uploadImageToCloudflareImages(file, file.name, env);

            // Re-check emptiness at write time so concurrent syncs can't clobber
            // an icon that landed after our read (unless force is set).
            const writeResult = await env.DBA.prepare(`
                UPDATE items SET img = ?, updated_at = strftime('%s', 'now')
                WHERE id = ? AND (? = 1 OR img IS NULL OR img = '')
            `).bind(uploaded.url, item.id, force ? 1 : 0).run();

            if (writeResult.meta.changes === 0) {
                result.status = 'skipped_existing';
                summary.skipped++;
            } else {
                result.status = 'updated';
                result.img = uploaded.url;
                summary.updated++;
            }
        } catch (error) {
            result.status = 'error';
            result.error = error.code || 'internal_error';
            result.detail = error.message;
            summary.errors++;
        }
    }

    return new Response(JSON.stringify({ results, summary }), { headers: jsonHeaders });
}

async function createItem(request, env, corsHeaders) {
    const auth = await requireAdmin(request, env, corsHeaders);
    if (auth.error) return auth.error;

    const data = await request.json();
    
    const {
        name, category, img, svg, price, from, price_code_rarity,
        tradable, new: newItem, weekly, weeklystar, retired, premium, removed, typicalgroup, unstable,
        price_history, demand, credits, lore, alias, quantity, color
    } = data;

    if (!name || !category) {
        return new Response(JSON.stringify({ error: 'Name and category are required' }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
    }

    const result = await env.DBA.prepare(`
        INSERT INTO items (
            name, category, img, svg, price, "from", price_code_rarity,
            tradable, "new", weekly, weeklystar, retired, premium, removed, typicalgroup, unstable,
            price_history, demand, credits, lore, alias, quantity, color, demand_updated_at, created_at, updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
                CASE WHEN ? > 0 THEN strftime('%s', 'now') ELSE NULL END,
                strftime('%s', 'now'), strftime('%s', 'now'))
    `).bind(
        name, category, img || null, svg || null, price || null, from || null,
        price_code_rarity || null,
        tradable !== false ? 1 : 0,
        newItem === true ? 1 : 0,
        weekly === true ? 1 : 0,
        weeklystar === true ? 1 : 0,
        retired === true ? 1 : 0,
        premium === true ? 1 : 0,
        removed === true ? 1 : 0,
        typicalgroup === true ? 1 : 0,
        unstable === true ? 1 : 0,
        price_history ? JSON.stringify(price_history.slice(-15)) : null,
        demand || 0,
        credits || null,
        lore || null,
        alias || null,
        quantity || null,
        color ? JSON.stringify(color) : null,
        demand || 0 // For demand_updated_at check
    ).run();

    return new Response(JSON.stringify({
        success: true,
        id: result.meta.last_row_id,
        message: 'Item created successfully'
    }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
}

// Update item (admin only)
async function updateItem(id, request, env, corsHeaders) {
    const auth = await requireAdmin(request, env, corsHeaders);
    if (auth.error) return auth.error;

    const data = await request.json();
    
    const {
        name, category, img, svg, price, from, price_code_rarity,
        tradable, new: newItem, weekly, weeklystar, retired, premium, removed, typicalgroup, unstable,
        price_history, replace_price_history, demand, credits, lore, alias, quantity, color, updated_at: clientUpdatedAt,
        force_update_demand_timestamp
    } = data;

    // Optimistic locking: Check if item was modified since client loaded it
    if (clientUpdatedAt !== undefined) {
        const currentItem = await env.DBA.prepare(`
            SELECT updated_at FROM items WHERE id = ?
        `).bind(id).first();

        if (!currentItem) {
            return new Response(JSON.stringify({ error: 'Item not found' }), {
                status: 404,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
        }

        // If the item was updated after the client loaded it, return conflict
        if (currentItem.updated_at !== clientUpdatedAt) {
            // Get current item data to show what changed
            const currentItemData = await env.DBA.prepare(`
                SELECT id, name, category, img, svg, price, "from", price_code_rarity,
                       tradable, "new", weekly, weeklystar, retired, premium, removed, typicalgroup, unstable,
                       price_history, demand, credits, lore, demand_updated_at, updated_at
                FROM items WHERE id = ?
            `).bind(id).first();

            return new Response(JSON.stringify({
                error: 'Conflict: Item was modified by another admin',
                conflict: true,
                currentItem: {
                    ...currentItemData,
                    tradable: currentItemData.tradable === 1,
                    new: currentItemData.new === 1,
                    weekly: currentItemData.weekly === 1,
                    weeklystar: currentItemData.weeklystar === 1,
                    retired: currentItemData.retired === 1,
                    premium: currentItemData.premium === 1,
                    removed: currentItemData.removed === 1,
                    typicalgroup: currentItemData.typicalgroup === 1,
                    unstable: currentItemData.unstable === 1,
                    'price/code/rarity': currentItemData.price_code_rarity,
                    priceHistory: currentItemData.price_history ? JSON.parse(currentItemData.price_history) : null
                },
                clientUpdatedAt,
                serverUpdatedAt: currentItem.updated_at
            }), {
                status: 409,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
        }
    }

    // Check if demand is being updated - if so, update demand_updated_at
    // Also update if force_update_demand_timestamp flag is set (for "Keep Demand" button)
    let demandChanged = false;
    if (demand !== undefined) {
        const currentItem = await env.DBA.prepare(`
            SELECT demand FROM items WHERE id = ?
        `).bind(id).first();
        demandChanged = currentItem && currentItem.demand !== demand;
    }
    
    // Force update demand_updated_at if flag is set (even if demand didn't change)
    if (force_update_demand_timestamp === true) {
        demandChanged = true;
    }

    // Merge price_history: get existing history and merge with incoming history.
    // When replace_price_history === true (admin used the Price History editor),
    // bypass the merge entirely and store exactly the curated array instead — this
    // is the only way deletions/edits of existing points can actually stick.
    let mergedPriceHistory = null;
    if (price_history !== undefined) {
        let incomingHistory = Array.isArray(price_history) ? price_history : [];

        if (replace_price_history === true) {
            // Replace mode: trust the incoming array as the complete history.
            // Sanitize each entry, sort by timestamp, cap to last 50.
            const cleaned = incomingHistory
                .map(entry => ({
                    price: Number(entry.price),
                    timestamp: Number(entry.timestamp),
                    admin: entry.admin || null
                }))
                .filter(entry => Number.isFinite(entry.price) && Number.isFinite(entry.timestamp));
            cleaned.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
            mergedPriceHistory = cleaned.slice(-50);
        } else {
            // Merge mode (default): combine existing DB history with incoming entries.
            const currentItem = await env.DBA.prepare(`
                SELECT price_history FROM items WHERE id = ?
            `).bind(id).first();

            let existingHistory = [];
            if (currentItem && currentItem.price_history) {
                try {
                    existingHistory = JSON.parse(currentItem.price_history);
                    if (!Array.isArray(existingHistory)) {
                        existingHistory = [];
                    }
                } catch (e) {
                    existingHistory = [];
                }
            }

            // Combine histories and remove duplicates (same price and timestamp)
            const combinedHistory = [...existingHistory];
            incomingHistory.forEach(newEntry => {
                // Check if this entry already exists (same price and timestamp)
                const exists = combinedHistory.some(existing =>
                    existing.price === newEntry.price &&
                    existing.timestamp === newEntry.timestamp
                );
                if (!exists) {
                    combinedHistory.push(newEntry);
                }
            });

            // Sort by timestamp and keep only last 15 entries
            combinedHistory.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
            mergedPriceHistory = combinedHistory.slice(-15);
        }
    }

    const result = await env.DBA.prepare(`
        UPDATE items SET
            name = COALESCE(?, name),
            category = COALESCE(?, category),
            img = ?,
            svg = ?,
            price = ?,
            "from" = ?,
            price_code_rarity = ?,
            tradable = COALESCE(?, tradable),
            "new" = COALESCE(?, "new"),
            weekly = COALESCE(?, weekly),
            weeklystar = COALESCE(?, weeklystar),
            retired = COALESCE(?, retired),
            premium = COALESCE(?, premium),
            removed = COALESCE(?, removed),
            typicalgroup = COALESCE(?, typicalgroup),
            unstable = COALESCE(?, unstable),
            price_history = CASE WHEN ? IS NOT NULL THEN ? ELSE price_history END,
            demand = COALESCE(?, demand),
            credits = ?,
            lore = ?,
            alias = ?,
            quantity = ?,
            color = ?,
            demand_updated_at = CASE WHEN ? = 1 THEN strftime('%s', 'now') ELSE demand_updated_at END,
            updated_at = strftime('%s', 'now')
        WHERE id = ?
    `).bind(
        name, category, img, svg, price, from, price_code_rarity,
        tradable !== undefined ? (tradable ? 1 : 0) : null,
        newItem !== undefined ? (newItem ? 1 : 0) : null,
        weekly !== undefined ? (weekly ? 1 : 0) : null,
        weeklystar !== undefined ? (weeklystar ? 1 : 0) : null,
        retired !== undefined ? (retired ? 1 : 0) : null,
        premium !== undefined ? (premium ? 1 : 0) : null,
        removed !== undefined ? (removed ? 1 : 0) : null,
        typicalgroup !== undefined ? (typicalgroup ? 1 : 0) : null,
        unstable !== undefined ? (unstable ? 1 : 0) : null,
        mergedPriceHistory ? JSON.stringify(mergedPriceHistory) : null,
        mergedPriceHistory ? JSON.stringify(mergedPriceHistory) : null,
        demand,
        credits !== undefined ? credits : null,
        lore !== undefined ? lore : null,
        alias !== undefined ? alias : null,
        quantity !== undefined ? quantity : null,
        color !== undefined ? (color ? JSON.stringify(color) : null) : null,
        demandChanged ? 1 : 0, // Update demand_updated_at if demand changed
        id
    ).run();

    if (result.meta.changes === 0) {
        return new Response(JSON.stringify({ error: 'Item not found' }), {
            status: 404,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
    }

    return new Response(JSON.stringify({
        success: true,
        message: 'Item updated successfully'
    }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
}

// Delete item (admin only)
async function deleteItem(id, request, env, corsHeaders) {
    const auth = await requireAdmin(request, env, corsHeaders);
    if (auth.error) return auth.error;

    const result = await env.DBA.prepare(`
        DELETE FROM items WHERE id = ?
    `).bind(id).run();

    if (result.meta.changes === 0) {
        return new Response(JSON.stringify({ error: 'Item not found' }), {
            status: 404,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
    }

    return new Response(JSON.stringify({
        success: true,
        message: 'Item deleted successfully'
    }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
}

