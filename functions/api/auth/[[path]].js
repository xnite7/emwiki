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

// Lightweight session validation - just verifies token and returns user_id
// Does NOT update last_online or roles - use for read-only operations
async function validateSessionLight(request, env) {
    const authHeader = request.headers.get('Authorization');
    const token = authHeader?.replace('Bearer ', '');

    if (!token) {
        return null;
    }

    // Use a simpler query that only fetches what we need
    const session = await env.DBA.prepare(`
        SELECT s.user_id FROM sessions s
        WHERE s.token = ? AND s.expires_at > ?
    `).bind(token, Date.now()).first();

    return session?.user_id || null;
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
    const oneDayAgo = Date.now() - (24 * 60 * 60 * 1000);

    if (existingUser?.avatar_url && existingUser.avatar_cached_at > oneDayAgo) {
        // Use cached avatar (24h cache, background cron refreshes daily)
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

    const now = Date.now();
    const session = await env.DBA.prepare(`
        SELECT s.*, u.* FROM sessions s
        JOIN users u ON s.user_id = u.user_id
        WHERE s.token = ? AND s.expires_at > ?
    `).bind(token, now).first();

    if (!session) {
        return new Response(JSON.stringify({ error: 'Invalid session' }), {
            status: 401,
            headers: { 'Content-Type': 'application/json' }
        });
    }

    // Safely parse roles with fallback
    let userRoles;
    try {
        userRoles = session.role ? JSON.parse(session.role) : null;
    } catch (e) {
        console.error('Failed to parse user role:', e);
        userRoles = null;
    }

    // Ensure it's a valid array
    const needsRoleUpdate = !Array.isArray(userRoles) || userRoles.length === 0;
    if (needsRoleUpdate) {
        userRoles = ['user'];
    }

    // Throttle last_online updates: only update if more than 5 minutes since last update
    const fiveMinutesAgo = now - (5 * 60 * 1000);
    const needsOnlineUpdate = !session.last_online || session.last_online < fiveMinutesAgo;
    
    // Batch both updates into one query if needed, or do single update, or skip entirely
    if (needsRoleUpdate && needsOnlineUpdate) {
        // Both updates needed - batch them
        await env.DBA.prepare('UPDATE users SET last_online = ?, role = ? WHERE user_id = ?')
            .bind(now, '["user"]', session.user_id).run();
    } else if (needsRoleUpdate) {
        // Only role update
        await env.DBA.prepare('UPDATE users SET role = ? WHERE user_id = ?')
            .bind('["user"]', session.user_id).run();
    } else if (needsOnlineUpdate) {
        // Only last_online update - fire and forget (don't await)
        env.DBA.prepare('UPDATE users SET last_online = ? WHERE user_id = ?')
            .bind(now, session.user_id).run();
    }
    // If neither needed, skip database update entirely

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

async function handleUserSearch(request, env) {
    const authHeader = request.headers.get('Authorization');
    const token = authHeader?.replace('Bearer ', '');

    // Check if requester is admin/moderator
   // const session = await env.DBA.prepare(`
       // SELECT u.role, u.user_id FROM sessions s
        //JOIN users u ON s.user_id = u.user_id
       //WHERE s.token = ? AND s.expires_at > ?
    //`).bind(token, Date.now()).first();

    //const adminRoles = JSON.parse(session?.role || '["user"]');
    //if (!session || (!adminRoles.includes('admin') && !adminRoles.includes('moderator'))) {
        //return new Response(JSON.stringify({ error: 'Unauthorized' }), {
            //status: 403,
            //headers: { 'Content-Type': 'application/json' }
        //});
    //}

    // Get search query from URL parameter
    const url = new URL(request.url);
    const query = url.searchParams.get('q') || '';
    const limit = parseInt(url.searchParams.get('limit')) || 10;

    // Ensure limit doesn't exceed 100
    const safeLimit = Math.min(limit, 100);

    // Search by username or user_id
    let users;

    try {
        // Try to query with trade stats (if user_trade_stats table exists)
        if (!query || query.trim() === '') {
            // If no query, return recent users with trade stats
            users = await env.DBA.prepare(`
                SELECT
                    u.user_id,
                    u.username,
                    u.display_name,
                    u.avatar_url,
                    u.role,
                    COALESCE(uts.total_trades, 0) as total_trades,
                    COALESCE(uts.average_rating, 0) as average_rating
                FROM users u
                LEFT JOIN user_trade_stats uts ON u.user_id = uts.user_id
                ORDER BY u.created_at DESC
                LIMIT ?
            `).bind(safeLimit).all();
        } else if (/^\d+$/.test(query)) {
            // Check if query is a number (user_id)
            users = await env.DBA.prepare(`
                SELECT
                    u.user_id,
                    u.username,
                    u.display_name,
                    u.avatar_url,
                    u.role,
                    COALESCE(uts.total_trades, 0) as total_trades,
                    COALESCE(uts.average_rating, 0) as average_rating
                FROM users u
                LEFT JOIN user_trade_stats uts ON u.user_id = uts.user_id
                WHERE u.user_id = ?
                LIMIT ?
            `).bind(query, safeLimit).all();
        } else {
            // Search by username or display name (case-insensitive)
            users = await env.DBA.prepare(`
                SELECT
                    u.user_id,
                    u.username,
                    u.display_name,
                    u.avatar_url,
                    u.role,
                    COALESCE(uts.total_trades, 0) as total_trades,
                    COALESCE(uts.average_rating, 0) as average_rating
                FROM users u
                LEFT JOIN user_trade_stats uts ON u.user_id = uts.user_id
                WHERE LOWER(u.username) LIKE LOWER(?) OR LOWER(u.display_name) LIKE LOWER(?)
                LIMIT ?
            `).bind(`%${query}%`, `%${query}%`, safeLimit).all();
        }
    } catch (error) {
        // If user_trade_stats table doesn't exist, fall back to basic query without stats
        console.error('Failed to query with trade stats, falling back to basic query:', error);

        if (!query || query.trim() === '') {
            users = await env.DBA.prepare(`
                SELECT
                    u.user_id,
                    u.username,
                    u.display_name,
                    u.avatar_url,
                    u.role,
                    0 as total_trades,
                    0 as average_rating
                FROM users u
                ORDER BY u.created_at DESC
                LIMIT ?
            `).bind(safeLimit).all();
        } else if (/^\d+$/.test(query)) {
            users = await env.DBA.prepare(`
                SELECT
                    u.user_id,
                    u.username,
                    u.display_name,
                    u.avatar_url,
                    u.role,
                    0 as total_trades,
                    0 as average_rating
                FROM users u
                WHERE u.user_id = ?
                LIMIT ?
            `).bind(query, safeLimit).all();
        } else {
            users = await env.DBA.prepare(`
                SELECT
                    u.user_id,
                    u.username,
                    u.display_name,
                    u.avatar_url,
                    u.role,
                    0 as total_trades,
                    0 as average_rating
                FROM users u
                WHERE LOWER(u.username) LIKE LOWER(?) OR LOWER(u.display_name) LIKE LOWER(?)
                LIMIT ?
            `).bind(`%${query}%`, `%${query}%`, safeLimit).all();
        }
    }

    return new Response(JSON.stringify({ users: users.results || [] }), {
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
    const userId = session.user_id;

    // Collect all statements for batch execution
    const batch = [];

    for (const [key, value] of Object.entries(preferences)) {
        const valueJson = JSON.stringify(value);

        // Upsert preference
        batch.push(
            env.DBA.prepare(`
                INSERT INTO user_preferences (user_id, preference_key, preference_value, updated_at)
                VALUES (?, ?, ?, ?)
                ON CONFLICT(user_id, preference_key) DO UPDATE SET
                    preference_value = excluded.preference_value,
                    updated_at = excluded.updated_at
            `).bind(userId, key, valueJson, now)
        );

        // Sync favorites/wishlist to normalized table for efficient counting
        if ((key === 'favorites' || key === 'wishlist') && Array.isArray(value)) {
            const prefType = key === 'favorites' ? 'favorite' : 'wishlist';

            // Delete existing entries for this user/type
            batch.push(
                env.DBA.prepare(`
                    DELETE FROM user_item_preferences
                    WHERE user_id = ? AND preference_type = ?
                `).bind(userId, prefType)
            );

            // Insert new entries
            for (const itemName of value) {
                if (typeof itemName === 'string' && itemName.trim()) {
                    batch.push(
                        env.DBA.prepare(`
                            INSERT OR IGNORE INTO user_item_preferences (user_id, item_name, preference_type)
                            VALUES (?, ?, ?)
                        `).bind(userId, itemName, prefType)
                    );
                }
            }
        }
    }

    // Execute all statements in a single batch
    if (batch.length > 0) {
        await env.DBA.batch(batch);
    }

    return new Response(JSON.stringify({ success: true }), {
        headers: { 'Content-Type': 'application/json' }
    });
}

async function handleLoadPreferences(request, env) {
    // Use lightweight validation for read-only operation
    const userId = await validateSessionLight(request, env);

    if (!userId) {
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
        ).bind(userId, key).first();

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
        ).bind(userId).all();

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

// Get aggregated favorite/wishlist counts for items
// Helper: Calculate displayed flikes based on target and item age
// Gradually ramps up from 0 to target_flikes over 30 days
function calculateDisplayedFlikes(targetFlikes, createdAt) {
    if (!targetFlikes || targetFlikes <= 0) return 0;
    
    const now = Date.now();
    const createdAtMs = createdAt * 1000; // created_at is in seconds
    const ageMs = now - createdAtMs;
    const ageDays = ageMs / (1000 * 60 * 60 * 24);
    
    // Progress from 0 to 1 over 30 days
    const progress = Math.min(ageDays / 30, 1);
    
    return Math.floor(targetFlikes * progress);
}

async function handleGetPreferenceStats(request, env) {
    const url = new URL(request.url);
    
    // Support bulk requests via POST with JSON body
    if (request.method === 'POST') {
        try {
            const body = await request.json();
            const itemNames = body.items || [];
            
            if (!Array.isArray(itemNames) || itemNames.length === 0) {
                return new Response(JSON.stringify({ itemCounts: {} }), {
                    headers: { 'Content-Type': 'application/json' }
                });
            }
            
            // Get target_flikes and created_at from items table for gradual display
            const placeholders = itemNames.map(() => '?').join(',');
            const { results } = await env.DBA.prepare(`
                SELECT name, target_flikes, created_at
                FROM items
                WHERE name IN (${placeholders})
            `).bind(...itemNames).all();
            
            // Build result map with gradual flikes calculation
            const itemCounts = {};
            itemNames.forEach(name => { itemCounts[name] = 0; });
            (results || []).forEach(row => {
                itemCounts[row.name] = calculateDisplayedFlikes(row.target_flikes, row.created_at);
            });
            
            return new Response(JSON.stringify({ itemCounts }), {
                headers: { 
                    'Content-Type': 'application/json',
                    'Cache-Control': 'public, max-age=60'
                }
            });
        } catch (e) {
            console.error('Error fetching bulk preference stats:', e);
            return new Response(JSON.stringify({ itemCounts: {} }), {
                headers: { 'Content-Type': 'application/json' }
            });
        }
    }
    
    // Support single item via GET query param
    const itemName = url.searchParams.get('item');
    
    if (itemName) {
        try {
            // Get item's target_flikes and created_at for gradual display calculation
            const item = await env.DBA.prepare(`
                SELECT target_flikes, created_at
                FROM items
                WHERE name = ?
            `).bind(itemName).first();
            
            // Calculate displayed value based on item age (gradual ramp over 30 days)
            const displayedCount = item ? calculateDisplayedFlikes(item.target_flikes, item.created_at) : 0;
            
            return new Response(JSON.stringify({
                favorites_count: displayedCount,
                wishlist_count: 0,
                total_count: displayedCount
            }), {
                headers: { 
                    'Content-Type': 'application/json',
                    'Cache-Control': 'public, max-age=60' // Cache for 1 minute
                }
            });
        } catch (e) {
            console.error('Error fetching preference stats:', e);
            return new Response(JSON.stringify({
                favorites_count: 0,
                wishlist_count: 0,
                total_count: 0
            }), {
                headers: { 'Content-Type': 'application/json' }
            });
        }
    }
    
    // If no item specified, return empty
    return new Response(JSON.stringify({
        favorites_count: 0,
        wishlist_count: 0,
        total_count: 0
    }), {
        headers: { 'Content-Type': 'application/json' }
    });
}

// Migrate existing JSON preferences to normalized table (one-time admin operation)
async function handleMigrateItemPreferences(request, env) {
    // Admin check - require authorization
    const authHeader = request.headers.get('Authorization');
    const token = authHeader?.replace('Bearer ', '');
    
    if (!token) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), {
            status: 401,
            headers: { 'Content-Type': 'application/json' }
        });
    }
    
    const session = await env.DBA.prepare(`
        SELECT u.user_id, u.role FROM sessions s
        JOIN users u ON s.user_id = u.user_id
        WHERE s.token = ? AND s.expires_at > ?
    `).bind(token, Date.now()).first();
    
    if (!session || !session.role?.includes('admin')) {
        return new Response(JSON.stringify({ error: 'Admin access required' }), {
            status: 403,
            headers: { 'Content-Type': 'application/json' }
        });
    }
    
    try {
        let migratedUsers = 0;
        let migratedItems = 0;
        
        // Get all favorites preferences
        const { results: favResults } = await env.DBA.prepare(`
            SELECT user_id, preference_value
            FROM user_preferences
            WHERE preference_key = 'favorites'
        `).all();
        
        for (const row of (favResults || [])) {
            try {
                const items = JSON.parse(row.preference_value || '[]');
                if (Array.isArray(items)) {
                    for (const itemName of items) {
                        if (typeof itemName === 'string' && itemName.trim()) {
                            await env.DBA.prepare(`
                                INSERT OR IGNORE INTO user_item_preferences (user_id, item_name, preference_type)
                                VALUES (?, ?, 'favorite')
                            `).bind(row.user_id, itemName).run();
                            migratedItems++;
                        }
                    }
                    migratedUsers++;
                }
            } catch (e) {
                // Skip invalid JSON
            }
        }
        
        // Get all wishlist preferences
        const { results: wishResults } = await env.DBA.prepare(`
            SELECT user_id, preference_value
            FROM user_preferences
            WHERE preference_key = 'wishlist'
        `).all();
        
        for (const row of (wishResults || [])) {
            try {
                const items = JSON.parse(row.preference_value || '[]');
                if (Array.isArray(items)) {
                    for (const itemName of items) {
                        if (typeof itemName === 'string' && itemName.trim()) {
                            await env.DBA.prepare(`
                                INSERT OR IGNORE INTO user_item_preferences (user_id, item_name, preference_type)
                                VALUES (?, ?, 'wishlist')
                            `).bind(row.user_id, itemName).run();
                            migratedItems++;
                        }
                    }
                }
            } catch (e) {
                // Skip invalid JSON
            }
        }
        
        return new Response(JSON.stringify({
            success: true,
            migratedUsers,
            migratedItems
        }), {
            headers: { 'Content-Type': 'application/json' }
        });
    } catch (e) {
        console.error('Migration error:', e);
        return new Response(JSON.stringify({ error: e.message }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        });
    }
}

// ==================== OAUTH 2.0 ====================

async function handleOAuthAuthorize(request, env) {
    const clientId = env.ROBLOX_OAUTH_CLIENT_ID;
    const redirectUri = env.ROBLOX_OAUTH_REDIRECT_URI;

    if (!clientId || !redirectUri) {
        return new Response(JSON.stringify({ error: 'OAuth not configured' }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        });
    }

    // Generate state parameter for CSRF protection
    const state = crypto.randomUUID();

    // Store state in a temporary table or use a different method
    // For now, we'll pass it through and verify it in the callback

    const authUrl = new URL('https://apis.roblox.com/oauth/v1/authorize');
    authUrl.searchParams.set('client_id', clientId);
    authUrl.searchParams.set('redirect_uri', redirectUri);
    authUrl.searchParams.set('scope', 'openid profile');
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('state', state);

    // Redirect to Roblox OAuth
    return Response.redirect(authUrl.toString(), 302);
}

async function handleOAuthCallback(request, env) {
    const url = new URL(request.url);
    const origin = url.origin; // Get the full origin (e.g., https://emwiki.com)
    const code = url.searchParams.get('code');
    const state = url.searchParams.get('state');
    const error = url.searchParams.get('error');

    if (error) {
        // Redirect back to site with error
        return Response.redirect(`${origin}/?auth_error=${encodeURIComponent(error)}`, 302);
    }

    if (!code) {
        return Response.redirect(`${origin}/?auth_error=no_code`, 302);
    }

    const clientId = env.ROBLOX_OAUTH_CLIENT_ID;
    const clientSecret = env.ROBLOX_OAUTH_CLIENT_SECRET;
    const redirectUri = env.ROBLOX_OAUTH_REDIRECT_URI;

    try {
        // Exchange code for access token
        const tokenResponse = await fetch('https://apis.roblox.com/oauth/v1/token', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Authorization': 'Basic ' + btoa(`${clientId}:${clientSecret}`)
            },
            body: new URLSearchParams({
                grant_type: 'authorization_code',
                code: code,
                redirect_uri: redirectUri
            })
        });

        if (!tokenResponse.ok) {
            const errorText = await tokenResponse.text();
            console.error('Token exchange failed:', errorText);
            return Response.redirect(`${origin}/?auth_error=token_exchange_failed`, 302);
        }

        const tokenData = await tokenResponse.json();
        const accessToken = tokenData.access_token;

        // Fetch user info
        const userInfoResponse = await fetch('https://apis.roblox.com/oauth/v1/userinfo', {
            headers: {
                'Authorization': `Bearer ${accessToken}`
            }
        });

        if (!userInfoResponse.ok) {
            console.error('Failed to fetch user info');
            return Response.redirect(`${origin}/?auth_error=userinfo_failed`, 302);
        }

        const userInfo = await userInfoResponse.json();
        const userId = userInfo.sub; // Roblox user ID
        const username = userInfo.preferred_username;
        const displayName = userInfo.nickname || username;
        const avatarUrl = userInfo.picture || null;

        // Create or update user in database
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
        `).bind(userId, username, displayName, avatarUrl, now, now, now, '["user"]').run();

        // Create session
        const sessionToken = crypto.randomUUID();
        const expiresAt = now + (3000 * 24 * 60 * 60 * 1000); // 3000 days

        await env.DBA.prepare(
            'INSERT INTO sessions (token, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)'
        ).bind(sessionToken, userId, now, expiresAt).run();

        // Redirect back to site with token
        return Response.redirect(`${origin}/?auth_success=true&token=${sessionToken}`, 302);
    } catch (error) {
        console.error('OAuth callback error:', error);
        return Response.redirect(`${origin}/?auth_error=unexpected_error`, 302);
    }
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
            case 'user/search':
                response = await handleUserSearch(request, env);
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
            case 'user/preferences/stats':
                response = await handleGetPreferenceStats(request, env);
                break;
            case 'admin/migrate-item-preferences':
                response = await handleMigrateItemPreferences(request, env);
                break;
            // OAUTH 2.0 ENDPOINTS
            case 'oauth/authorize':
                response = await handleOAuthAuthorize(request, env);
                break;
            case 'oauth/callback':
                response = await handleOAuthCallback(request, env);
                break;
            default:
                response = new Response(JSON.stringify({ error: 'Not found' }), {
                    status: 404,
                    headers: { 'Content-Type': 'application/json' }
                });
        }

        // Add CORS headers to response (skip for redirects as they're immutable)
        const isRedirect = response.status >= 300 && response.status < 400;
        if (!isRedirect) {
            Object.entries(corsHeaders).forEach(([key, value]) => {
                response.headers.set(key, value);
            });
        }

        return response;
    } catch (error) {
        return new Response(JSON.stringify({ error: error.message }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
    }
}