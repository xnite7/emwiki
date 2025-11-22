// API endpoints for items
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

            // GET /api/items/:category/:name - Get single item
            const pathMatch = path.match(/^([^/]+)\/(.+)$/);
            if (pathMatch) {
                const [, category, name] = pathMatch;
                return await getItem(category, decodeURIComponent(name), env, corsHeaders);
            }

            // GET /api/items - List items with pagination and filtering
            return await listItems(request, env, corsHeaders);
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
                return await deleteItem(id, env, corsHeaders);
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
        WHERE removed = 0
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
               tradable, "new", weekly, weeklystar, retired, premium, removed, demand,
               demand_updated_at, updated_at
        FROM items
        WHERE removed = 0 AND name LIKE ?
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
        tradable: item.tradable === 1,
        new: item.new === 1,
        weekly: item.weekly === 1,
        weeklystar: item.weeklystar === 1,
        retired: item.retired === 1,
        premium: item.premium === 1,
        removed: item.removed === 1,
        'price/code/rarity': item.price_code_rarity
    }));

    return new Response(JSON.stringify({ items }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
}

// Get single item by category and name
async function getItem(category, name, env, corsHeaders) {
    const item = await env.DBA.prepare(`
        SELECT id, name, category, img, svg, price, "from", price_code_rarity,
               tradable, "new", weekly, weeklystar, retired, premium, removed,
               price_history, demand, demand_updated_at, created_at, updated_at
        FROM items
        WHERE category = ? AND name = ? AND removed = 0
    `).bind(category, name).first();

    if (!item) {
        return new Response(JSON.stringify({ error: 'Item not found' }), {
            status: 404,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
    }

    const result = {
        ...item,
        tradable: item.tradable === 1,
        new: item.new === 1,
        weekly: item.weekly === 1,
        weeklystar: item.weeklystar === 1,
        retired: item.retired === 1,
        premium: item.premium === 1,
        removed: item.removed === 1,
        'price/code/rarity': item.price_code_rarity,
        priceHistory: item.price_history ? JSON.parse(item.price_history) : null
    };

    return new Response(JSON.stringify({ item: result }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
}

// List items with pagination and filtering
async function listItems(request, env, corsHeaders) {
    const url = new URL(request.url);
    
    // Pagination
    const limit = Math.min(parseInt(url.searchParams.get('limit') || '100'), 500);
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
    const conditions = ['removed = 0'];
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

    // Get total count
    const countResult = await env.DBA.prepare(`
        SELECT COUNT(*) as total
        FROM items
        ${whereClause}
    `).bind(...params).first();

    const total = countResult?.total || 0;

    // Get items (include updated_at for optimistic locking)
    const { results } = await env.DBA.prepare(`
        SELECT id, name, category, img, svg, price, "from", price_code_rarity,
               tradable, "new", weekly, weeklystar, retired, premium, removed, demand, 
               demand_updated_at, updated_at
        FROM items
        ${whereClause}
        ORDER BY category, name
        LIMIT ? OFFSET ?
    `).bind(...params, limit, offset).all();

    const items = (results || []).map(item => ({
        ...item,
        tradable: item.tradable === 1,
        new: item.new === 1,
        weekly: item.weekly === 1,
        weeklystar: item.weeklystar === 1,
        retired: item.retired === 1,
        premium: item.premium === 1,
        removed: item.removed === 1,
        'price/code/rarity': item.price_code_rarity
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
            'Cache-Control': 'public, max-age=60' // Cache for 1 minute
        }
    });
}

// Create new item (admin only)
async function createItem(request, env, corsHeaders) {
    // TODO: Add admin authentication check
    const data = await request.json();
    
    const {
        name, category, img, svg, price, from, price_code_rarity,
        tradable, new: newItem, weekly, weeklystar, retired, premium, removed,
        price_history, demand
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
            tradable, "new", weekly, weeklystar, retired, premium, removed,
            price_history, demand, demand_updated_at, created_at, updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 
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
        price_history ? JSON.stringify(price_history.slice(-15)) : null,
        demand || 0,
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
    // TODO: Add admin authentication check
    const data = await request.json();
    
    const {
        name, category, img, svg, price, from, price_code_rarity,
        tradable, new: newItem, weekly, weeklystar, retired, premium, removed,
        price_history, demand, updated_at: clientUpdatedAt
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
                       tradable, "new", weekly, weeklystar, retired, premium, removed,
                       price_history, demand, demand_updated_at, updated_at
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
    let demandChanged = false;
    if (demand !== undefined) {
        const currentItem = await env.DBA.prepare(`
            SELECT demand FROM items WHERE id = ?
        `).bind(id).first();
        demandChanged = currentItem && currentItem.demand !== demand;
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
            price_history = ?,
            demand = COALESCE(?, demand),
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
        price_history ? JSON.stringify(price_history.slice(-15)) : null,
        demand,
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
async function deleteItem(id, env, corsHeaders) {
    // TODO: Add admin authentication check
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

