import { verifySession } from '../../_utils/auth.js';

// Authenticate user from request
export async function authenticateUser(request, env) {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return null;
    }

    const token = authHeader.substring(7);
    const session = await verifySession(token, env.SESSION_SECRET);

    if (!session) {
        return null;
    }

    // Get user from database
    const user = await env.DBA.prepare(
        'SELECT user_id, username, display_name, avatar_url, roles FROM users WHERE user_id = ?'
    ).bind(session.name).first();

    return user;
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
    ).bind(userId, type, title, message, link, Date.now()).run();
}

// Update user trade stats
export async function updateUserStats(env, userId) {
    const stats = await env.DBA.prepare(`
        SELECT
            COUNT(*) as total_trades,
            SUM(CASE WHEN seller_id = ? OR buyer_id = ? THEN 1 ELSE 0 END) as successful_trades
        FROM completed_trades
        WHERE seller_id = ? OR buyer_id = ?
    `).bind(userId, userId, userId, userId).first();

    const reviews = await env.DBA.prepare(`
        SELECT
            AVG(rating) as avg_rating,
            COUNT(*) as review_count
        FROM trade_reviews
        WHERE reviewed_user_id = ?
    `).bind(userId).first();

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
export async function getUserWithStats(env, userId) {
    const user = await env.DBA.prepare(`
        SELECT
            u.user_id,
            u.username,
            u.display_name,
            u.avatar_url,
            u.roles,
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
