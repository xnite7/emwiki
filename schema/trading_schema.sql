-- Trading System Database Schema for Epic Minigames Trading Hub
-- Run these queries on the DBA database (accounts database)

-- User Inventory Table
-- Stores items that users own and want to trade
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

CREATE INDEX idx_inventory_user ON user_inventory(user_id);
CREATE INDEX idx_inventory_trade ON user_inventory(for_trade, user_id);

-- Trade Listings Table
-- Public listings where users offer items for trade
CREATE TABLE IF NOT EXISTS trade_listings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    category TEXT DEFAULT 'other',
    status TEXT DEFAULT 'active', -- active, completed, cancelled, expired
    offering_items TEXT NOT NULL, -- JSON array of item objects
    seeking_items TEXT, -- JSON array of item IDs or text description
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    expires_at INTEGER,
    views INTEGER DEFAULT 0,
    FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
);

CREATE INDEX idx_listings_status ON trade_listings(status, created_at);
CREATE INDEX idx_listings_user ON trade_listings(user_id);
CREATE INDEX idx_listings_category ON trade_listings(category, status);

-- Trade Offers Table
-- Offers made on trade listings
CREATE TABLE IF NOT EXISTS trade_offers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    listing_id INTEGER NOT NULL,
    from_user_id TEXT NOT NULL,
    to_user_id TEXT NOT NULL,
    offered_items TEXT NOT NULL, -- JSON array of item objects
    message TEXT,
    status TEXT DEFAULT 'pending', -- pending, accepted, rejected, cancelled, completed
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    FOREIGN KEY (listing_id) REFERENCES trade_listings(id) ON DELETE CASCADE,
    FOREIGN KEY (from_user_id) REFERENCES users(user_id) ON DELETE CASCADE,
    FOREIGN KEY (to_user_id) REFERENCES users(user_id) ON DELETE CASCADE
);

CREATE INDEX idx_offers_listing ON trade_offers(listing_id);
CREATE INDEX idx_offers_from_user ON trade_offers(from_user_id);
CREATE INDEX idx_offers_to_user ON trade_offers(to_user_id, status);

-- Trade Messages Table
-- Private messaging between traders
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

CREATE INDEX idx_messages_listing ON trade_messages(listing_id);
CREATE INDEX idx_messages_offer ON trade_messages(offer_id);
CREATE INDEX idx_messages_to_user ON trade_messages(to_user_id, read);

-- Completed Trades Table
-- Record of successful trades for history/analytics
CREATE TABLE IF NOT EXISTS completed_trades (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    listing_id INTEGER,
    offer_id INTEGER,
    seller_id TEXT NOT NULL,
    buyer_id TEXT NOT NULL,
    seller_items TEXT NOT NULL, -- JSON array of items
    buyer_items TEXT NOT NULL, -- JSON array of items
    completed_at INTEGER NOT NULL,
    FOREIGN KEY (listing_id) REFERENCES trade_listings(id) ON DELETE SET NULL,
    FOREIGN KEY (offer_id) REFERENCES trade_offers(id) ON DELETE SET NULL,
    FOREIGN KEY (seller_id) REFERENCES users(user_id) ON DELETE CASCADE,
    FOREIGN KEY (buyer_id) REFERENCES users(user_id) ON DELETE CASCADE
);

CREATE INDEX idx_completed_seller ON completed_trades(seller_id);
CREATE INDEX idx_completed_buyer ON completed_trades(buyer_id);

-- Trade Reviews/Reputation Table
-- Users can review each other after trades
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

CREATE INDEX idx_reviews_user ON trade_reviews(reviewed_user_id);
CREATE INDEX idx_reviews_trade ON trade_reviews(trade_id);

-- User Trading Stats Table
-- Aggregate statistics for user reputation
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

-- Trade Notifications Table
-- Notifications for trade activity
CREATE TABLE IF NOT EXISTS trade_notifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    type TEXT NOT NULL, -- new_offer, offer_accepted, offer_rejected, new_message, trade_completed, review_received
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    link TEXT, -- URL to relevant trade/offer
    read BOOLEAN DEFAULT 0,
    created_at INTEGER NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
);

CREATE INDEX idx_notifications_user ON trade_notifications(user_id, read);
CREATE INDEX idx_notifications_created ON trade_notifications(created_at);
