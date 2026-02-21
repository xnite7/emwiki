export async function onRequest(context) {
    const { request, env } = context;
    const url = new URL(request.url);
    const pathParts = url.pathname.split('/').filter(p => p);

    const pathIndex = pathParts.indexOf('chests');
    const path = pathIndex >= 0 ? pathParts.slice(pathIndex + 1).join('/') : '';

    const corsHeaders = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    };

    if (request.method === 'OPTIONS') {
        return new Response(null, { headers: corsHeaders });
    }

    try {
        if (request.method === 'GET' && (path === '' || path === '/')) {
            return await listChests(env, corsHeaders);
        }

        const authResult = await checkAdmin(request, env);
        if (!authResult.ok) {
            return new Response(JSON.stringify({ error: 'Unauthorized' }), {
                status: 403,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
        }

        if (request.method === 'POST' && (path === '' || path === '/')) {
            return await createChest(request, env, corsHeaders);
        }

        if (request.method === 'PUT' && path) {
            return await updateChest(path, request, env, corsHeaders);
        }

        if (request.method === 'DELETE' && path) {
            return await deleteChest(path, env, corsHeaders);
        }

        return new Response(JSON.stringify({ error: 'Not found' }), {
            status: 404,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
    } catch (error) {
        console.error('Chests API error:', error);
        return new Response(JSON.stringify({ error: error.message }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
    }
}

async function checkAdmin(request, env) {
    const authHeader = request.headers.get('Authorization');
    const token = authHeader?.replace('Bearer ', '');
    if (!token) return { ok: false };

    const session = await env.DBA.prepare(`
        SELECT u.role, u.user_id FROM sessions s
        JOIN users u ON s.user_id = u.user_id
        WHERE s.token = ? AND s.expires_at > ?
    `).bind(token, Date.now()).first();

    const roles = JSON.parse(session?.role || '["user"]');
    if (!session || !roles.includes('admin')) return { ok: false };
    return { ok: true, userId: session.user_id };
}

async function listChests(env, corsHeaders) {
    const { results } = await env.DBA.prepare(`
        SELECT * FROM chests ORDER BY sort_order ASC, name ASC
    `).all();

    return new Response(JSON.stringify({ chests: results || [] }), {
        headers: {
            ...corsHeaders,
            'Content-Type': 'application/json',
            'Cache-Control': 'public, max-age=60'
        }
    });
}

async function createChest(request, env, corsHeaders) {
    const data = await request.json();
    const { id, name, image_url, meta_type, meta_value, meta_icon, meta_style, from_keywords, sort_order, rainbow_effect } = data;

    if (!id || !name || !image_url || !from_keywords) {
        return new Response(JSON.stringify({ error: 'Missing required fields: id, name, image_url, from_keywords' }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
    }

    const slug = id.toLowerCase().replace(/[^a-z0-9]/g, '');

    const existing = await env.DBA.prepare('SELECT id FROM chests WHERE id = ?').bind(slug).first();
    if (existing) {
        return new Response(JSON.stringify({ error: 'A chest with this ID already exists' }), {
            status: 409,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
    }

    await env.DBA.prepare(`
        INSERT INTO chests (id, name, image_url, meta_type, meta_value, meta_icon, meta_style, from_keywords, sort_order, rainbow_effect)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
        slug,
        name.trim(),
        image_url.trim(),
        meta_type || 'text',
        meta_value || null,
        meta_icon || null,
        meta_style || null,
        from_keywords.toLowerCase().trim(),
        sort_order ?? 0,
        rainbow_effect ? 1 : 0
    ).run();

    const chest = await env.DBA.prepare('SELECT * FROM chests WHERE id = ?').bind(slug).first();

    return new Response(JSON.stringify({ chest }), {
        status: 201,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
}

async function updateChest(id, request, env, corsHeaders) {
    const existing = await env.DBA.prepare('SELECT * FROM chests WHERE id = ?').bind(id).first();
    if (!existing) {
        return new Response(JSON.stringify({ error: 'Chest not found' }), {
            status: 404,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
    }

    const data = await request.json();
    const name = data.name?.trim() ?? existing.name;
    const image_url = data.image_url?.trim() ?? existing.image_url;
    const meta_type = data.meta_type ?? existing.meta_type;
    const meta_value = data.meta_value ?? existing.meta_value;
    const meta_icon = data.meta_icon ?? existing.meta_icon;
    const meta_style = data.meta_style ?? existing.meta_style;
    const from_keywords = data.from_keywords?.toLowerCase().trim() ?? existing.from_keywords;
    const sort_order = data.sort_order ?? existing.sort_order;
    const rainbow_effect = data.rainbow_effect !== undefined ? (data.rainbow_effect ? 1 : 0) : existing.rainbow_effect;

    await env.DBA.prepare(`
        UPDATE chests SET name = ?, image_url = ?, meta_type = ?, meta_value = ?, meta_icon = ?, meta_style = ?,
            from_keywords = ?, sort_order = ?, rainbow_effect = ?, updated_at = datetime('now')
        WHERE id = ?
    `).bind(name, image_url, meta_type, meta_value, meta_icon, meta_style, from_keywords, sort_order, rainbow_effect, id).run();

    const chest = await env.DBA.prepare('SELECT * FROM chests WHERE id = ?').bind(id).first();

    return new Response(JSON.stringify({ chest }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
}

async function deleteChest(id, env, corsHeaders) {
    const result = await env.DBA.prepare('DELETE FROM chests WHERE id = ?').bind(id).run();

    if (result.meta.changes === 0) {
        return new Response(JSON.stringify({ error: 'Chest not found' }), {
            status: 404,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
    }

    return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
}
