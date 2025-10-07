// Rate limiting helper
const rateLimits = new Map();

function checkRateLimit(ip, limit = 10, window = 60000) {
    const now = Date.now();
    const key = `${ip}`;
    const requests = rateLimits.get(key) || [];
    
    // Clean old requests
    const recent = requests.filter(time => now - time < window);
    
    if (recent.length >= limit) {
        return false;
    }
    
    recent.push(now);
    rateLimits.set(key, recent);
    return true;
}

function generateCode() {
    return Math.floor(100000 + Math.random() * 900000).toString();
}

async function handleGenerateCode(request, env) {
    const ip = request.headers.get('CF-Connecting-IP');
    if (!checkRateLimit(ip, 5, 60000)) {
        return new Response(JSON.stringify({ error: 'Rate limit exceeded' }), {
            status: 429,
            headers: { 'Content-Type': 'application/json' }
        });
    }

    const code = generateCode();
    const expiresAt = Date.now() + (5 * 60 * 1000); // 5 minutes

    await env.DBA.prepare(
        'INSERT INTO auth_codes (code, expires_at) VALUES (?, ?)'
    ).bind(code, expiresAt).run();

    return new Response(JSON.stringify({ code, expiresIn: 300 }), {
        headers: { 'Content-Type': 'application/json' }
    });
}

async function handleVerifyCode(request, env) {
    const data = await request.json();
    const { code, userId, username, displayName } = data;

    if (!code || !userId || !username) {
        return new Response(JSON.stringify({ error: 'Missing required fields' }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' }
        });
    }

    // Check if code exists and hasn't expired
    const authCode = await env.DBA.prepare(
        'SELECT * FROM auth_codes WHERE code = ? AND expires_at > ? AND used = 0'
    ).bind(code, Date.now()).first();

    if (!authCode) {
        return new Response(JSON.stringify({ error: 'Invalid or expired code' }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' }
        });
    }

    // Mark code as used
    await env.DBA.prepare('UPDATE auth_codes SET used = 1 WHERE code = ?').bind(code).run();

    // Get or fetch avatar
    let avatarUrl = null;
    const cachedAvatar = await env.DBA.prepare(
        'SELECT avatar_url FROM avatar_cache WHERE user_id = ? AND cached_at > ?'
    ).bind(userId, Date.now() - (7 * 24 * 60 * 60 * 1000)).first(); // Cache for 7 days

    if (cachedAvatar) {
        avatarUrl = cachedAvatar.avatar_url;
    } else {
        // Fetch from Roblox
        try {
            const response = await fetch(`https://thumbnails.roblox.com/v1/users/avatar-headshot?userIds=${userId}&size=150x150&format=Png`);
            const json = await response.json();
            avatarUrl = json.data?.[0]?.imageUrl || null;

            if (avatarUrl) {
                await env.DBA.prepare(
                    'INSERT OR REPLACE INTO avatar_cache (user_id, avatar_url, cached_at) VALUES (?, ?, ?)'
                ).bind(userId, avatarUrl, Date.now()).run();
            }
        } catch (e) {
            console.error('Failed to fetch avatar:', e);
        }
    }

    const now = Date.now();
    
    // Create or update user
    await env.DBA.prepare(`
        INSERT INTO users (user_id, username, display_name, avatar_url, created_at, last_online)
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(user_id) DO UPDATE SET
            username = excluded.username,
            display_name = excluded.display_name,
            avatar_url = excluded.avatar_url,
            last_online = excluded.last_online
    `).bind(userId, username, displayName || username, avatarUrl, now, now).run();

    // Create session
    const sessionToken = crypto.randomUUID();
    const expiresAt = now + (30 * 24 * 60 * 60 * 1000); // 30 days

    await env.DBA.prepare(
        'INSERT INTO sessions (token, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)'
    ).bind(sessionToken, userId, now, expiresAt).run();

    return new Response(JSON.stringify({
        success: true,
        token: sessionToken,
        user: { userId, username, displayName, avatarUrl }
    }), {
        headers: { 'Content-Type': 'application/json' }
    });
}

async function handleGetSession(request, env) {
    const authHeader = request.headers.get('Authorization');
    const token = authHeader?.replace('Bearer ', '');

    if (!token) {
        return new Response(JSON.stringify({ error: 'No token provided' }), {
            status: 401,
            headers: { 'Content-Type': 'application/json' }
        });
    }

    const session = await env.DBA.prepare(`
        SELECT s.*, u.* FROM sessions s
        JOIN users u ON s.user_id = u.user_id
        WHERE s.token = ? AND s.expires_at > ?
    `).bind(token, Date.now()).first();

    if (!session) {
        return new Response(JSON.stringify({ error: 'Invalid session' }), {
            status: 401,
            headers: { 'Content-Type': 'application/json' }
        });
    }

    // Update last_online
    await env.DBA.prepare('UPDATE users SET last_online = ? WHERE user_id = ?')
        .bind(Date.now(), session.user_id).run();

    return new Response(JSON.stringify({
        userId: session.user_id,
        username: session.username,
        displayName: session.display_name,
        avatarUrl: session.avatar_url,
        role: session.role
    }), {
        headers: { 'Content-Type': 'application/json' }
    });
}

async function handleLogout(request, env) {
    const authHeader = request.headers.get('Authorization');
    const token = authHeader?.replace('Bearer ', '');

    if (token) {
        await env.DBA.prepare('DELETE FROM sessions WHERE token = ?').bind(token).run();
    }

    return new Response(JSON.stringify({ success: true }), {
        headers: { 'Content-Type': 'application/json' }
    });
}

async function handleUpdateRole(request, env) {
    const authHeader = request.headers.get('Authorization');
    const token = authHeader?.replace('Bearer ', '');
    
    // Check if requester is admin
    const session = await env.DBA.prepare(`
        SELECT u.role, u.user_id FROM sessions s
        JOIN users u ON s.user_id = u.user_id
        WHERE s.token = ? AND s.expires_at > ?
    `).bind(token, Date.now()).first();

    if (!session || session.role !== 'admin') {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), {
            status: 403,
            headers: { 'Content-Type': 'application/json' }
        });
    }

    const { userId, role } = await request.json();
    
    if (!['user', 'vip', 'moderator', 'admin'].includes(role)) {
        return new Response(JSON.stringify({ error: 'Invalid role' }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' }
        });
    }

    await env.DBA.prepare('UPDATE users SET role = ? WHERE user_id = ?').bind(role, userId).run();

    return new Response(JSON.stringify({ success: true }), {
        headers: { 'Content-Type': 'application/json' }
    });
}

export async function onRequest(context) {
    const { request, env } = context;
    const url = new URL(request.url);
    const path = url.pathname.replace('/api/', '');

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
        let response;

        switch (path) {
            case 'generate-code':
                response = await handleGenerateCode(request, env);
                break;
            case 'verify-code':
                response = await handleVerifyCode(request, env);
                break;
            case 'session':
                response = await handleGetSession(request, env);
                break;
            case 'logout':
                response = await handleLogout(request, env);
                break;
            case 'admin/update-role':
                response = await handleUpdateRole(request, env);
                break;
            default:
                response = new Response(JSON.stringify({ error: 'Not found' }), {
                    status: 404,
                    headers: { 'Content-Type': 'application/json' }
                });
        }

        // Add CORS headers to response
        Object.entries(corsHeaders).forEach(([key, value]) => {
            response.headers.set(key, value);
        });

        return response;
    } catch (error) {
        return new Response(JSON.stringify({ error: error.message }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
    }
}