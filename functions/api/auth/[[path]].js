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
function cleanUserRole(roles) {
    // If user has other roles besides 'user', remove 'user'
    if (!roles || roles.length === 0) return ['user'];

    const filtered = roles.filter(r => r !== 'user');

    // If after removing 'user' we have other roles, return them
    // Otherwise keep ['user'] as default
    return filtered.length > 0 ? filtered : ['user'];
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

    // Mark code as used AND store who used it
    await env.DBA.prepare(
        'UPDATE auth_codes SET used = 1, user_id = ? WHERE code = ?'
    ).bind(userId, code).run();

    // Get or fetch avatar
    const existingUser = await env.DBA.prepare(
        'SELECT avatar_url, avatar_cached_at FROM users WHERE user_id = ?'
    ).bind(userId).first();

    let avatarUrl = null;
    const sevenDaysAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);

    if (existingUser?.avatar_url && existingUser.avatar_cached_at > sevenDaysAgo) {
        // Use cached avatar
        avatarUrl = existingUser.avatar_url;
    } else {
        // Fetch fresh avatar from Roblox
        try {
            const response = await fetch(`https://thumbnails.roblox.com/v1/users/avatar-headshot?userIds=${userId}&size=150x150&format=Png`);
            const json = await response.json();
            avatarUrl = json.data?.[0]?.imageUrl || null;
        } catch (e) {
            console.error('Failed to fetch avatar:', e);
            // Fallback to old cached avatar if fetch fails
            avatarUrl = existingUser?.avatar_url || null;
        }
    }

    const now = Date.now();

    await env.DBA.prepare(`
INSERT INTO users (user_id, username, display_name, avatar_url, avatar_cached_at, created_at, last_online, role)
VALUES (?, ?, ?, ?, ?, ?, ?, ?)
ON CONFLICT(user_id) DO UPDATE SET
    username = excluded.username,
    display_name = excluded.display_name,
    avatar_url = excluded.avatar_url,
    avatar_cached_at = excluded.avatar_cached_at,
    last_online = excluded.last_online
`).bind(userId, username, displayName || username, avatarUrl, now, now, now, '["user"]').run();

    // Create session
    const sessionToken = crypto.randomUUID();
    const expiresAt = now + (3000 * 24 * 60 * 60 * 1000); // 3000 days

    await env.DBA.prepare(
        'INSERT INTO sessions (token, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)'
    ).bind(sessionToken, userId, now, expiresAt).run();

    return new Response(JSON.stringify({
        success: true,
        token: sessionToken,
        user: { userId, username, displayName, avatarUrl, role: ['user'] }  // Add role here
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

    // Safely parse roles with fallback
    let userRoles;
    try {
        userRoles = session.role ? JSON.parse(session.role) : null;
    } catch (e) {
        console.error('Failed to parse user role:', e);
        userRoles = null;
    }

    // Ensure it's a valid array
    if (!Array.isArray(userRoles) || userRoles.length === 0) {
        userRoles = ['user'];
        
        // Update the database with default role for this user
        await env.DBA.prepare('UPDATE users SET role = ? WHERE user_id = ?')
            .bind('["user"]', session.user_id).run();
    }

    return new Response(JSON.stringify({
        userId: session.user_id,
        username: session.username,
        displayName: session.display_name,
        avatarUrl: session.avatar_url,
        role: cleanUserRole(userRoles)
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

    const adminRoles = JSON.parse(session?.role || '["user"]');
    if (!session || !adminRoles.includes('admin')) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), {
            status: 403,
            headers: { 'Content-Type': 'application/json' }
        });
    }

    const { userId, role, action } = await request.json(); // action: 'add' or 'remove'

    if (!['user', 'vip', 'moderator', 'admin'].includes(role)) {
        return new Response(JSON.stringify({ error: 'Invalid role' }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' }
        });
    }

    // Get current roles
    const user = await env.DBA.prepare('SELECT role FROM users WHERE user_id = ?').bind(userId).first();
    const currentRoles = JSON.parse(user?.role || '["user"]');

    let newRoles;
    if (action === 'add') {
        // Add role if not already present
        newRoles = currentRoles.includes(role) ? currentRoles : [...currentRoles, role];
        newRoles = cleanUserRole(newRoles); // Add this line
    } else if (action === 'remove') {
        // Remove role, but ensure at least 'user' remains
        newRoles = currentRoles.filter(r => r !== role);
        if (newRoles.length === 0) newRoles = ['user'];
    } else {
        return new Response(JSON.stringify({ error: 'Action must be "add" or "remove"' }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' }
        });
    }

    await env.DBA.prepare('UPDATE users SET role = ? WHERE user_id = ?')
        .bind(JSON.stringify(newRoles), userId).run();

    return new Response(JSON.stringify({ success: true, roles: cleanUserRole(newRoles) }), {
        headers: { 'Content-Type': 'application/json' }
    });
}

async function handleCheckCode(request, env) {
    const { code } = await request.json();

    if (!code) {
        return new Response(JSON.stringify({ error: 'Code required' }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' }
        });
    }

    // Check if code was used and get the user_id
    const authCode = await env.DBA.prepare(
        'SELECT * FROM auth_codes WHERE code = ? AND used = 1'
    ).bind(code).first();

    if (!authCode || !authCode.user_id) {
        return new Response(JSON.stringify({ verified: false }), {
            headers: { 'Content-Type': 'application/json' }
        });
    }

    // Get the user's most recent session
    const session = await env.DBA.prepare(`
        SELECT s.token, u.* FROM sessions s
        JOIN users u ON s.user_id = u.user_id
        WHERE s.user_id = ? AND s.expires_at > ?
        ORDER BY s.created_at DESC
        LIMIT 1
    `).bind(authCode.user_id, Date.now()).first();

    if (session) {
        return new Response(JSON.stringify({
            verified: true,
            token: session.token,
            user: {
                userId: session.user_id,
                username: session.username,
                displayName: session.display_name,
                avatarUrl: session.avatar_url,
                role: session.role
            }
        }), {
            headers: { 'Content-Type': 'application/json' }
        });
    }

    return new Response(JSON.stringify({ verified: false }), {
        headers: { 'Content-Type': 'application/json' }
    });
}

async function handleDonationStatus(request, env) {
    const authHeader = request.headers.get('Authorization');
    const token = authHeader?.replace('Bearer ', '');

    if (!token) {
        return new Response(JSON.stringify({ error: 'No token provided' }), {
            status: 401,
            headers: { 'Content-Type': 'application/json' }
        });
    }

    // Get user from session
    const session = await env.DBA.prepare(`
        SELECT u.* FROM sessions s
        JOIN users u ON s.user_id = u.user_id
        WHERE s.token = ? AND s.expires_at > ?
    `).bind(token, Date.now()).first();

    if (!session) {
        return new Response(JSON.stringify({ error: 'Invalid session' }), {
            status: 401,
            headers: { 'Content-Type': 'application/json' }
        });
    }

    // Parse current roles safely
    let currentRoles;
    try {
        currentRoles = session.role ? JSON.parse(session.role) : ['user'];
    } catch (e) {
        currentRoles = ['user'];
    }

    // Ensure it's a valid array
    if (!Array.isArray(currentRoles) || currentRoles.length === 0) {
        currentRoles = ['user'];
    }

    // Get donation data from KV
    const donationKey = `purchase:${session.user_id}`;
    const donationData = await env.DONATIONS_KV.get(donationKey);

    let totalSpent = 0;
    let purchases = 0;

    if (donationData) {
        const data = JSON.parse(donationData);
        totalSpent = data.totalSpent || 0;
        purchases = data.purchases || 0;
    }

    const isDonator = totalSpent >= 500;
    const progress = Math.min((totalSpent / 500) * 100, 100);
    const remaining = Math.max(500 - totalSpent, 0);

    // Check if user just became a donator (qualifies but doesn't have the role yet)
    const hasDonatorRole = currentRoles.includes('donator');
    const justBecameDonator = isDonator && !hasDonatorRole;

    let updatedRoles = currentRoles;

    // Update roles based on donation status
    if (isDonator && !hasDonatorRole) {
        // Add donator role
        updatedRoles = [...currentRoles, 'donator'];
        updatedRoles = cleanUserRole(updatedRoles);
        
        await env.DBA.prepare(
            'UPDATE users SET role = ? WHERE user_id = ?'
        ).bind(JSON.stringify(updatedRoles), session.user_id).run();
    } else if (!isDonator && hasDonatorRole) {
        // Remove donator role if they no longer qualify (e.g., refund)
        updatedRoles = currentRoles.filter(r => r !== 'donator');
        if (updatedRoles.length === 0) updatedRoles = ['user'];
        
        await env.DBA.prepare(
            'UPDATE users SET role = ? WHERE user_id = ?'
        ).bind(JSON.stringify(updatedRoles), session.user_id).run();
    }

    return new Response(JSON.stringify({
        totalSpent,
        purchases,
        isDonator,
        progress,
        remaining,
        justBecameDonator,
        roles: updatedRoles  // Return full roles array instead of single role
    }), {
        headers: { 'Content-Type': 'application/json' }
    });
}

// ==================== USER PREFERENCES ====================

async function handleSavePreferences(request, env) {
    const authHeader = request.headers.get('Authorization');
    const token = authHeader?.replace('Bearer ', '');

    if (!token) {
        return new Response(JSON.stringify({ error: 'No token provided' }), {
            status: 401,
            headers: { 'Content-Type': 'application/json' }
        });
    }

    // Get user from session
    const session = await env.DBA.prepare(`
        SELECT u.user_id FROM sessions s
        JOIN users u ON s.user_id = u.user_id
        WHERE s.token = ? AND s.expires_at > ?
    `).bind(token, Date.now()).first();

    if (!session) {
        return new Response(JSON.stringify({ error: 'Invalid session' }), {
            status: 401,
            headers: { 'Content-Type': 'application/json' }
        });
    }

    const preferences = await request.json();
    const now = Date.now();

    // Save each preference key
    for (const [key, value] of Object.entries(preferences)) {
        const valueJson = JSON.stringify(value);

        await env.DBA.prepare(`
            INSERT INTO user_preferences (user_id, preference_key, preference_value, updated_at)
            VALUES (?, ?, ?, ?)
            ON CONFLICT(user_id, preference_key) DO UPDATE SET
                preference_value = excluded.preference_value,
                updated_at = excluded.updated_at
        `).bind(session.user_id, key, valueJson, now).run();
    }

    return new Response(JSON.stringify({ success: true }), {
        headers: { 'Content-Type': 'application/json' }
    });
}

async function handleLoadPreferences(request, env) {
    const authHeader = request.headers.get('Authorization');
    const token = authHeader?.replace('Bearer ', '');

    if (!token) {
        return new Response(JSON.stringify({ error: 'No token provided' }), {
            status: 401,
            headers: { 'Content-Type': 'application/json' }
        });
    }

    // Get user from session
    const session = await env.DBA.prepare(`
        SELECT u.user_id FROM sessions s
        JOIN users u ON s.user_id = u.user_id
        WHERE s.token = ? AND s.expires_at > ?
    `).bind(token, Date.now()).first();

    if (!session) {
        return new Response(JSON.stringify({ error: 'Invalid session' }), {
            status: 401,
            headers: { 'Content-Type': 'application/json' }
        });
    }

    const url = new URL(request.url);
    const key = url.searchParams.get('key');

    if (key) {
        // Load specific preference
        const pref = await env.DBA.prepare(
            'SELECT preference_value FROM user_preferences WHERE user_id = ? AND preference_key = ?'
        ).bind(session.user_id, key).first();

        if (pref) {
            return new Response(JSON.stringify({
                [key]: JSON.parse(pref.preference_value)
            }), {
                headers: { 'Content-Type': 'application/json' }
            });
        }

        return new Response(JSON.stringify({}), {
            headers: { 'Content-Type': 'application/json' }
        });
    } else {
        // Load all preferences
        const prefs = await env.DBA.prepare(
            'SELECT preference_key, preference_value FROM user_preferences WHERE user_id = ?'
        ).bind(session.user_id).all();

        const result = {};
        prefs.results.forEach(pref => {
            result[pref.preference_key] = JSON.parse(pref.preference_value);
        });

        return new Response(JSON.stringify(result), {
            headers: { 'Content-Type': 'application/json' }
        });
    }
}

async function handleMigratePreferences(request, env) {
    const authHeader = request.headers.get('Authorization');
    const token = authHeader?.replace('Bearer ', '');

    if (!token) {
        return new Response(JSON.stringify({ error: 'No token provided' }), {
            status: 401,
            headers: { 'Content-Type': 'application/json' }
        });
    }

    // Get user from session
    const session = await env.DBA.prepare(`
        SELECT u.user_id FROM sessions s
        JOIN users u ON s.user_id = u.user_id
        WHERE s.token = ? AND s.expires_at > ?
    `).bind(token, Date.now()).first();

    if (!session) {
        return new Response(JSON.stringify({ error: 'Invalid session' }), {
            status: 401,
            headers: { 'Content-Type': 'application/json' }
        });
    }

    const localData = await request.json();
    const now = Date.now();

    // Check if user already has preferences (avoid overwriting cloud data)
    const existingPrefs = await env.DBA.prepare(
        'SELECT COUNT(*) as count FROM user_preferences WHERE user_id = ?'
    ).bind(session.user_id).first();

    // Only migrate if no existing preferences
    if (existingPrefs.count === 0) {
        for (const [key, value] of Object.entries(localData)) {
            const valueJson = JSON.stringify(value);

            await env.DBA.prepare(`
                INSERT INTO user_preferences (user_id, preference_key, preference_value, updated_at)
                VALUES (?, ?, ?, ?)
                ON CONFLICT(user_id, preference_key) DO UPDATE SET
                    preference_value = excluded.preference_value,
                    updated_at = excluded.updated_at
            `).bind(session.user_id, key, valueJson, now).run();
        }

        return new Response(JSON.stringify({ success: true, migrated: true }), {
            headers: { 'Content-Type': 'application/json' }
        });
    }

    return new Response(JSON.stringify({ success: true, migrated: false, message: 'User already has cloud preferences' }), {
        headers: { 'Content-Type': 'application/json' }
    });
}

export async function onRequest(context) {
    const { request, env } = context;
    const url = new URL(request.url);
    const path = url.pathname.replace('/api/auth/', '');

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
            case 'check-code':
                response = await handleCheckCode(request, env);
                break;
            case 'donation-status':
                response = await handleDonationStatus(request, env);
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
            // NEW PREFERENCE ENDPOINTS
            case 'user/preferences':
                if (request.method === 'POST') {
                    response = await handleSavePreferences(request, env);
                } else if (request.method === 'GET') {
                    response = await handleLoadPreferences(request, env);
                }
                break;
            case 'user/preferences/migrate':
                response = await handleMigratePreferences(request, env);
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