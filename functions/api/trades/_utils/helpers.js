// Canonical form of a user id: a plain digit string.
// Historic rows (and any id that round-tripped through a D1 number bind) can
// carry a float artifact ("137377499.0") because the trade tables store ids as
// TEXT while `users.user_id` is INTEGER — D1 sends JS numbers as doubles, and
// TEXT affinity stringifies them with the trailing ".0". Every id that gets
// bound into a query or compared must go through here.
export function normalizeUserId(id) {
    if (id === null || id === undefined) return null;
    return String(id).replace(/\.0+$/, '');
}

// The two forms a user id may take in legacy TEXT columns: clean ("123") and
// float-artifact ("123.0"). Spread into `col IN (?, ?)` so reads keep working
// on any rows written before the normalization fix / data cleanup.
export function userIdForms(id) {
    const clean = normalizeUserId(id);
    return [clean, `${clean}.0`];
}

// True when two user ids refer to the same user, regardless of which historic
// encoding (number, "123", "123.0") each side carries.
export function isSameUser(a, b) {
    if (a === null || a === undefined || b === null || b === undefined) return false;
    return normalizeUserId(a) === normalizeUserId(b);
}

// Authenticate user from request.
// Validates the opaque session token against the `sessions` table, matching the
// scheme used by the rest of the site (see api/auth). The single JOIN to `users`
// avoids a second round-trip. `role` is aliased to `roles` so downstream helpers
// (isAuthorized, etc.) keep working.
export async function authenticateUser(request, env) {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return null;
    }

    const token = authHeader.substring(7);

    const user = await env.DBA.prepare(`
        SELECT u.user_id, u.username, u.display_name, u.avatar_url, u.role AS roles
        FROM sessions s
        JOIN users u ON u.user_id = s.user_id
        WHERE s.token = ? AND s.expires_at > ?
    `).bind(token, Date.now()).first();

    if (user) user.user_id = normalizeUserId(user.user_id);
    return user || null;
}

// Check if user is authorized (authenticated and not banned)
export function isAuthorized(user) {
    if (!user) return false;

    const roles = typeof user.roles === 'string' ? JSON.parse(user.roles) : user.roles;
    return !roles.includes('scammer');
}

// Standard error response
export function errorResponse(message, status = 400) {
    return new Response(JSON.stringify({ error: message }), {
        status,
        headers: { 'Content-Type': 'application/json' }
    });
}

// Standard success response
export function successResponse(data, status = 200) {
    return new Response(JSON.stringify(data), {
        status,
        headers: { 'Content-Type': 'application/json' }
    });
}

// Safely parse a JSON column from the database. Returns `fallback` instead of
// throwing if the stored value is missing or malformed, so a single bad row
// can't turn a list endpoint into a 500.
export function safeJsonParse(value, fallback = []) {
    if (value == null) return fallback;
    try {
        return JSON.parse(value);
    } catch {
        return fallback;
    }
}

// Validate required fields
export function validateFields(data, requiredFields) {
    const missing = requiredFields.filter(field => !data[field]);
    if (missing.length > 0) {
        return `Missing required fields: ${missing.join(', ')}`;
    }
    return null;
}

// Create notification
export async function createNotification(env, userId, type, title, message, link = null) {
    await env.DBA.prepare(
        'INSERT INTO trade_notifications (user_id, type, title, message, link, created_at) VALUES (?, ?, ?, ?, ?, ?)'
    ).bind(normalizeUserId(userId), type, title, message, link, Date.now()).run();
}

// Update user trade stats
export async function updateUserStats(env, rawUserId) {
    const userId = normalizeUserId(rawUserId);
    const forms = userIdForms(userId);
    const stats = await env.DBA.prepare(`
        SELECT
            COUNT(*) as total_trades,
            COUNT(*) as successful_trades
        FROM completed_trades
        WHERE seller_id IN (?, ?) OR buyer_id IN (?, ?)
    `).bind(...forms, ...forms).first();

    const reviews = await env.DBA.prepare(`
        SELECT
            AVG(rating) as avg_rating,
            COUNT(*) as review_count
        FROM trade_reviews
        WHERE reviewed_user_id IN (?, ?)
    `).bind(...forms).first();

    await env.DBA.prepare(`
        INSERT INTO user_trade_stats (user_id, total_trades, successful_trades, average_rating, total_reviews, last_trade_at)
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(user_id) DO UPDATE SET
            total_trades = excluded.total_trades,
            successful_trades = excluded.successful_trades,
            average_rating = excluded.average_rating,
            total_reviews = excluded.total_reviews,
            last_trade_at = excluded.last_trade_at
    `).bind(
        userId,
        stats.total_trades || 0,
        stats.successful_trades || 0,
        reviews.avg_rating || 0,
        reviews.review_count || 0,
        Date.now()
    ).run();
}

// Get user with stats
export async function getUserWithStats(env, rawUserId) {
    const userId = normalizeUserId(rawUserId);
    const user = await env.DBA.prepare(`
        SELECT
            u.user_id,
            u.username,
            u.display_name,
            u.avatar_url,
            u.role AS roles,
            uts.total_trades,
            uts.successful_trades,
            uts.average_rating,
            uts.total_reviews,
            uts.last_trade_at
        FROM users u
        LEFT JOIN user_trade_stats uts ON u.user_id = uts.user_id
        WHERE u.user_id = ?
    `).bind(userId).first();

    if (user) {
        user.roles = typeof user.roles === 'string' ? JSON.parse(user.roles) : user.roles;
        // Hand ids back in canonical string form so they don't re-enter the
        // float-artifact cycle when clients echo them into later requests.
        user.user_id = normalizeUserId(user.user_id);
    }

    return user;
}

// Parse pagination parameters
export function parsePagination(url) {
    const params = new URL(url).searchParams;
    const limit = Math.min(parseInt(params.get('limit') || '20'), 100);
    const offset = parseInt(params.get('offset') || '0');
    return { limit, offset };
}

// Parse sort parameters
export function parseSort(url, allowedFields, defaultField = 'created_at', defaultOrder = 'DESC') {
    const params = new URL(url).searchParams;
    const sortBy = params.get('sort') || defaultField;
    const sortOrder = params.get('order')?.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

    // Validate sort field
    if (!allowedFields.includes(sortBy)) {
        return { sortBy: defaultField, sortOrder: defaultOrder };
    }

    return { sortBy, sortOrder };
}
