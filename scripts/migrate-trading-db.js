/**
 * Trading System Database Migration Script
 *
 * This script can be run via Cloudflare Workers to set up the trading database tables.
 *
 * Usage:
 * 1. Deploy this as a Worker function
 * 2. Call the endpoint with proper authentication
 * 3. The script will create all necessary tables
 *
 * Alternatively, you can run the SQL directly via:
 * - Cloudflare Dashboard > D1 > Console
 * - wrangler d1 execute DBA --file=./schema/trading_schema.sql
 */

const migrations = [
    {
        name: 'create_user_inventory',
        sql: `
            CREATE TABLE IF NOT EXISTS user_inventory (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id TEXT NOT NULL,
                item_id TEXT NOT NULL,
                item_name TEXT NOT NULL,
                item_image TEXT,
                quantity INTEGER DEFAULT 1,
                for_trade BOOLEAN DEFAULT 0,
                added_at INTEGER NOT NULL,
                FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
            );
            CREATE INDEX IF NOT EXISTS idx_inventory_user ON user_inventory(user_id);
            CREATE INDEX IF NOT EXISTS idx_inventory_trade ON user_inventory(for_trade, user_id);
        `
    },
    {
        name: 'create_trade_listings',
        sql: `
            CREATE TABLE IF NOT EXISTS trade_listings (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id TEXT NOT NULL,
                title TEXT NOT NULL,
                description TEXT,
                category TEXT DEFAULT 'other',
                status TEXT DEFAULT 'active',
                offering_items TEXT NOT NULL,
                seeking_items TEXT,
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL,
                expires_at INTEGER,
                views INTEGER DEFAULT 0,
                FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
            );
            CREATE INDEX IF NOT EXISTS idx_listings_status ON trade_listings(status, created_at);
            CREATE INDEX IF NOT EXISTS idx_listings_user ON trade_listings(user_id);
            CREATE INDEX IF NOT EXISTS idx_listings_category ON trade_listings(category, status);
        `
    },
    {
        name: 'create_trade_offers',
        sql: `
            CREATE TABLE IF NOT EXISTS trade_offers (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                listing_id INTEGER NOT NULL,
                from_user_id TEXT NOT NULL,
                to_user_id TEXT NOT NULL,
                offered_items TEXT NOT NULL,
                message TEXT,
                status TEXT DEFAULT 'pending',
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL,
                FOREIGN KEY (listing_id) REFERENCES trade_listings(id) ON DELETE CASCADE,
                FOREIGN KEY (from_user_id) REFERENCES users(user_id) ON DELETE CASCADE,
                FOREIGN KEY (to_user_id) REFERENCES users(user_id) ON DELETE CASCADE
            );
            CREATE INDEX IF NOT EXISTS idx_offers_listing ON trade_offers(listing_id);
            CREATE INDEX IF NOT EXISTS idx_offers_from_user ON trade_offers(from_user_id);
            CREATE INDEX IF NOT EXISTS idx_offers_to_user ON trade_offers(to_user_id, status);
        `
    },
    {
        name: 'create_trade_messages',
        sql: `
            CREATE TABLE IF NOT EXISTS trade_messages (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                listing_id INTEGER,
                offer_id INTEGER,
                from_user_id TEXT NOT NULL,
                to_user_id TEXT NOT NULL,
                message TEXT NOT NULL,
                read BOOLEAN DEFAULT 0,
                created_at INTEGER NOT NULL,
                FOREIGN KEY (listing_id) REFERENCES trade_listings(id) ON DELETE CASCADE,
                FOREIGN KEY (offer_id) REFERENCES trade_offers(id) ON DELETE CASCADE,
                FOREIGN KEY (from_user_id) REFERENCES users(user_id) ON DELETE CASCADE,
                FOREIGN KEY (to_user_id) REFERENCES users(user_id) ON DELETE CASCADE
            );
            CREATE INDEX IF NOT EXISTS idx_messages_listing ON trade_messages(listing_id);
            CREATE INDEX IF NOT EXISTS idx_messages_offer ON trade_messages(offer_id);
            CREATE INDEX IF NOT EXISTS idx_messages_to_user ON trade_messages(to_user_id, read);
        `
    },
    {
        name: 'create_completed_trades',
        sql: `
            CREATE TABLE IF NOT EXISTS completed_trades (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                listing_id INTEGER,
                offer_id INTEGER,
                seller_id TEXT NOT NULL,
                buyer_id TEXT NOT NULL,
                seller_items TEXT NOT NULL,
                buyer_items TEXT NOT NULL,
                completed_at INTEGER NOT NULL,
                FOREIGN KEY (listing_id) REFERENCES trade_listings(id) ON DELETE SET NULL,
                FOREIGN KEY (offer_id) REFERENCES trade_offers(id) ON DELETE SET NULL,
                FOREIGN KEY (seller_id) REFERENCES users(user_id) ON DELETE CASCADE,
                FOREIGN KEY (buyer_id) REFERENCES users(user_id) ON DELETE CASCADE
            );
            CREATE INDEX IF NOT EXISTS idx_completed_seller ON completed_trades(seller_id);
            CREATE INDEX IF NOT EXISTS idx_completed_buyer ON completed_trades(buyer_id);
        `
    },
    {
        name: 'create_trade_reviews',
        sql: `
            CREATE TABLE IF NOT EXISTS trade_reviews (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                trade_id INTEGER NOT NULL,
                reviewer_id TEXT NOT NULL,
                reviewed_user_id TEXT NOT NULL,
                rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
                comment TEXT,
                created_at INTEGER NOT NULL,
                UNIQUE(trade_id, reviewer_id),
                FOREIGN KEY (trade_id) REFERENCES completed_trades(id) ON DELETE CASCADE,
                FOREIGN KEY (reviewer_id) REFERENCES users(user_id) ON DELETE CASCADE,
                FOREIGN KEY (reviewed_user_id) REFERENCES users(user_id) ON DELETE CASCADE
            );
            CREATE INDEX IF NOT EXISTS idx_reviews_user ON trade_reviews(reviewed_user_id);
            CREATE INDEX IF NOT EXISTS idx_reviews_trade ON trade_reviews(trade_id);
        `
    },
    {
        name: 'create_user_trade_stats',
        sql: `
            CREATE TABLE IF NOT EXISTS user_trade_stats (
                user_id TEXT PRIMARY KEY,
                total_trades INTEGER DEFAULT 0,
                successful_trades INTEGER DEFAULT 0,
                cancelled_trades INTEGER DEFAULT 0,
                average_rating REAL DEFAULT 0,
                total_reviews INTEGER DEFAULT 0,
                last_trade_at INTEGER,
                FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
            );
        `
    },
    {
        name: 'create_trade_notifications',
        sql: `
            CREATE TABLE IF NOT EXISTS trade_notifications (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id TEXT NOT NULL,
                type TEXT NOT NULL,
                title TEXT NOT NULL,
                message TEXT NOT NULL,
                link TEXT,
                read BOOLEAN DEFAULT 0,
                created_at INTEGER NOT NULL,
                FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
            );
            CREATE INDEX IF NOT EXISTS idx_notifications_user ON trade_notifications(user_id, read);
            CREATE INDEX IF NOT EXISTS idx_notifications_created ON trade_notifications(created_at);
        `
    }
];

// Worker function to run migrations
export async function onRequest(context) {
    const { request, env } = context;

    // Simple authentication - you should implement proper auth
    const authHeader = request.headers.get('Authorization');
    if (!authHeader || authHeader !== `Bearer ${env.MIGRATION_SECRET}`) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), {
            status: 401,
            headers: { 'Content-Type': 'application/json' }
        });
    }

    if (request.method !== 'POST') {
        return new Response(JSON.stringify({ error: 'Method not allowed' }), {
            status: 405,
            headers: { 'Content-Type': 'application/json' }
        });
    }

    const results = [];

    for (const migration of migrations) {
        try {
            // Split SQL by semicolons and execute each statement
            const statements = migration.sql
                .split(';')
                .map(s => s.trim())
                .filter(s => s.length > 0);

            for (const statement of statements) {
                await env.DBA.prepare(statement).run();
            }

            results.push({
                migration: migration.name,
                status: 'success'
            });
        } catch (error) {
            results.push({
                migration: migration.name,
                status: 'error',
                error: error.message
            });
        }
    }

    return new Response(JSON.stringify({
        message: 'Migrations completed',
        results
    }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
    });
}

// For running locally/testing
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { migrations, onRequest };
}
