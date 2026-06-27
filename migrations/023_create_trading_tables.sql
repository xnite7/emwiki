-- Trading system schema
-- Creates all tables backing /api/trades/*. Idempotent (IF NOT EXISTS) so it is
-- safe to run whether or not the tables were previously created out-of-band.
-- Tables are created first and indexes last; the UNIQUE index is dead last so a
-- failure on pre-existing legacy data can never prevent a table from being created.
-- See emwiki/docs/TRADING_SYSTEM.md for the feature documentation.

-- ===== Tables =====

-- Public trade listings
CREATE TABLE IF NOT EXISTS trade_listings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    category TEXT DEFAULT 'other',
    status TEXT NOT NULL DEFAULT 'active',     -- active | completed | cancelled
    offering_items TEXT NOT NULL,              -- JSON array
    seeking_items TEXT,                        -- JSON array (null = open to offers)
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    expires_at INTEGER,
    views INTEGER DEFAULT 0
);

-- Offers made on listings
CREATE TABLE IF NOT EXISTS trade_offers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    listing_id INTEGER NOT NULL,
    from_user_id TEXT NOT NULL,                -- user making the offer
    to_user_id TEXT NOT NULL,                  -- listing owner
    offered_items TEXT NOT NULL,               -- JSON array
    message TEXT,
    status TEXT NOT NULL DEFAULT 'pending',    -- pending | accepted | rejected | cancelled
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
);

-- Direct messages between traders
CREATE TABLE IF NOT EXISTS trade_messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    listing_id INTEGER,
    offer_id INTEGER,
    from_user_id TEXT NOT NULL,
    to_user_id TEXT NOT NULL,
    message TEXT NOT NULL,
    read INTEGER DEFAULT 0,
    created_at INTEGER NOT NULL
);

-- In-app trade notifications
CREATE TABLE IF NOT EXISTS trade_notifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    type TEXT NOT NULL,
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    link TEXT,
    read INTEGER DEFAULT 0,
    created_at INTEGER NOT NULL
);

-- Reputation reviews left after a completed trade
CREATE TABLE IF NOT EXISTS trade_reviews (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    trade_id INTEGER NOT NULL,                 -- references completed_trades.id
    reviewer_id TEXT NOT NULL,
    reviewed_user_id TEXT NOT NULL,
    rating INTEGER NOT NULL,                   -- 1..5
    comment TEXT,
    created_at INTEGER NOT NULL
);

-- Historical record of completed trades
CREATE TABLE IF NOT EXISTS completed_trades (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    listing_id INTEGER NOT NULL,
    offer_id INTEGER NOT NULL,
    seller_id TEXT NOT NULL,                   -- listing owner
    buyer_id TEXT NOT NULL,                    -- offer sender
    seller_items TEXT NOT NULL,                -- JSON array (listing offering_items)
    buyer_items TEXT NOT NULL,                 -- JSON array (offer offered_items)
    completed_at INTEGER NOT NULL
);

-- Aggregate per-user trading stats (upserted via ON CONFLICT(user_id))
CREATE TABLE IF NOT EXISTS user_trade_stats (
    user_id TEXT PRIMARY KEY,
    total_trades INTEGER DEFAULT 0,
    successful_trades INTEGER DEFAULT 0,
    average_rating REAL DEFAULT 0,
    total_reviews INTEGER DEFAULT 0,
    last_trade_at INTEGER
);

-- ===== Indexes (match the common query filters) =====
CREATE INDEX IF NOT EXISTS idx_trade_listings_status ON trade_listings(status, created_at);
CREATE INDEX IF NOT EXISTS idx_trade_listings_user ON trade_listings(user_id);
CREATE INDEX IF NOT EXISTS idx_trade_offers_listing ON trade_offers(listing_id);
CREATE INDEX IF NOT EXISTS idx_trade_offers_from ON trade_offers(from_user_id);
CREATE INDEX IF NOT EXISTS idx_trade_offers_to ON trade_offers(to_user_id, status);
CREATE INDEX IF NOT EXISTS idx_trade_messages_unread ON trade_messages(to_user_id, read);
CREATE INDEX IF NOT EXISTS idx_trade_messages_pair ON trade_messages(from_user_id, to_user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_trade_notifications_user ON trade_notifications(user_id, read, created_at);
CREATE INDEX IF NOT EXISTS idx_trade_reviews_reviewed ON trade_reviews(reviewed_user_id);
CREATE INDEX IF NOT EXISTS idx_completed_trades_seller ON completed_trades(seller_id);
CREATE INDEX IF NOT EXISTS idx_completed_trades_buyer ON completed_trades(buyer_id);

-- One review per trade per reviewer (matches the dedupe check in reviews/[[path]].js).
-- Kept last so a failure on pre-existing duplicate rows cannot block table creation.
CREATE UNIQUE INDEX IF NOT EXISTS idx_trade_reviews_unique ON trade_reviews(trade_id, reviewer_id);
