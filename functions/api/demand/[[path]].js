// API endpoints for item demand ratings
import { verifySession } from '../_utils/auth.js';

export async function onRequest(context) {
    const { request, env } = context;
    const url = new URL(request.url);
    const path = url.pathname.split('/').slice(4).join('/'); // After /api/demand/

    // CORS headers
    const corsHeaders = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    };

    if (request.method === 'OPTIONS') {
        return new Response(null, { headers: corsHeaders });
    }

    try {
        // Route handling
        if (path === 'all' && request.method === 'GET') {
            return await getAllDemand(env, corsHeaders);
        }

        if (path.startsWith('category/') && request.method === 'GET') {
            const category = path.split('/')[1];
            return await getCategoryDemand(env, category, corsHeaders);
        }

        if (path === 'set' && request.method === 'POST') {
            return await setDemand(request, env, corsHeaders);
        }

        if (path === 'bulk' && request.method === 'POST') {
            return await bulkSetDemand(request, env, corsHeaders);
        }

        return new Response(JSON.stringify({ error: 'Not found' }), {
            status: 404,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
    } catch (error) {
        console.error('Demand API error:', error);
        return new Response(JSON.stringify({ error: error.message }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
    }
}

// Get all demand ratings
async function getAllDemand(env, corsHeaders) {
    const { results } = await env.DBA.prepare(`
        SELECT name as item_name, category, demand, demand_updated_at as updated_at
        FROM items
        ORDER BY category, name
    `).all();

    return new Response(JSON.stringify({ demand: results || [] }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
}

// Get demand ratings for a specific category
async function getCategoryDemand(env, category, corsHeaders) {
    const { results } = await env.DBA.prepare(`
        SELECT name as item_name, demand, demand_updated_at as updated_at
        FROM items
        WHERE category = ?
        ORDER BY name
    `).bind(category).all();

    return new Response(JSON.stringify({ demand: results || [] }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
}

// Set demand for a single item (admin only)
async function setDemand(request, env, corsHeaders) {
    // Verify admin session - check cookie
    const cookieHeader = request.headers.get('Cookie') || '';
    const sessionToken = cookieHeader
        .split('; ')
        .find(c => c.startsWith('session='))
        ?.split('=')[1];

    if (!sessionToken) {
        return new Response(JSON.stringify({ error: 'Unauthorized - No session' }), {
            status: 401,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
    }

    const session = await verifySession(sessionToken, env.SECRET_KEY);
    if (!session) {
        return new Response(JSON.stringify({ error: 'Unauthorized - Invalid session' }), {
            status: 401,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
    }

    // Check if user is admin (using DBH for admins table)
    const admin = await env.DBH.prepare('SELECT name FROM admins WHERE name = ?')
        .bind(session.name)
        .first();

    if (!admin) {
        return new Response(JSON.stringify({ error: 'Insufficient permissions' }), {
            status: 403,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
    }

    const data = await request.json();
    const { item_name, category, demand } = data;

    if (!item_name || !category || demand === undefined) {
        return new Response(JSON.stringify({ error: 'Missing required fields' }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
    }

    if (demand < 0 || demand > 5 || !Number.isInteger(demand)) {
        return new Response(JSON.stringify({ error: 'Demand must be an integer between 0 and 5' }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
    }

    // Update demand rating in items table
    const result = await env.DBA.prepare(`
        UPDATE items
        SET demand = ?, demand_updated_at = strftime('%s', 'now')
        WHERE name = ? AND category = ?
    `).bind(demand, item_name, category).run();

    if (result.meta.changes === 0) {
        return new Response(JSON.stringify({ error: 'Item not found' }), {
            status: 404,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
    }

    return new Response(JSON.stringify({
        success: true,
        message: 'Demand updated successfully',
        demand: { item_name, category, demand }
    }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
}

// Bulk set demand ratings (admin only)
async function bulkSetDemand(request, env, corsHeaders) {
    // Verify admin session - check cookie
    const cookieHeader = request.headers.get('Cookie') || '';
    const sessionToken = cookieHeader
        .split('; ')
        .find(c => c.startsWith('session='))
        ?.split('=')[1];

    if (!sessionToken) {
        return new Response(JSON.stringify({ error: 'Unauthorized - No session' }), {
            status: 401,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
    }

    const session = await verifySession(sessionToken, env.SECRET_KEY);
    if (!session) {
        return new Response(JSON.stringify({ error: 'Unauthorized - Invalid session' }), {
            status: 401,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
    }

    // Check if user is admin (using DBH for admins table)
    const admin = await env.DBH.prepare('SELECT name FROM admins WHERE name = ?')
        .bind(session.name)
        .first();

    if (!admin) {
        return new Response(JSON.stringify({ error: 'Insufficient permissions' }), {
            status: 403,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
    }

    const data = await request.json();
    const { items } = data;

    if (!Array.isArray(items) || items.length === 0) {
        return new Response(JSON.stringify({ error: 'items must be a non-empty array' }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
    }

    // Validate all items before processing
    for (const item of items) {
        if (!item.item_name || !item.category || item.demand === undefined) {
            return new Response(JSON.stringify({ error: 'Each item must have item_name, category, and demand' }), {
                status: 400,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
        }
        if (item.demand < 0 || item.demand > 5 || !Number.isInteger(item.demand)) {
            return new Response(JSON.stringify({ error: 'Demand must be an integer between 0 and 5' }), {
                status: 400,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
        }
    }

    // Process all items in a batch - update demand in items table
    const batch = [];
    for (const item of items) {
        batch.push(
            env.DBA.prepare(`
                UPDATE items
                SET demand = ?, demand_updated_at = strftime('%s', 'now')
                WHERE name = ? AND category = ?
            `).bind(item.demand, item.item_name, item.category)
        );
    }

    await env.DBA.batch(batch);

    return new Response(JSON.stringify({
        success: true,
        message: `Successfully updated ${items.length} item(s)`,
        count: items.length
    }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
}
