-- Trading moderation + social features
--
-- Adds three tables backing the new trading features:
--   * trade_blocks  — a user blocks another so they stop receiving offers/messages
--   * trade_bans    — admins/mods ban a player from using the trading system
--   * trade_likes   — likes on trade listings (replaces the old view counter)
--
-- Idempotent (IF NOT EXISTS) so it is safe to run whether or not the tables
-- were previously created. Ids are stored as TEXT to match the other trade
-- tables (see migrations/026 for the id-normalization context).

-- ===== Tables =====

-- One row per (blocker, blocked) pair. The blocker no longer receives offers
-- or direct messages from the blocked user.
CREATE TABLE IF NOT EXISTS trade_blocks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    blocker_id TEXT NOT NULL,                   -- the user doing the blocking
    blocked_id TEXT NOT NULL,                   -- the user being blocked
    created_at INTEGER NOT NULL
);

-- Players banned from trading by an admin/mod. Presence of a row = banned.
CREATE TABLE IF NOT EXISTS trade_bans (
    user_id TEXT PRIMARY KEY,                   -- the banned player
    banned_by TEXT NOT NULL,                    -- admin/mod who issued the ban
    reason TEXT,
    created_at INTEGER NOT NULL
);

-- One row per (listing, user) like. The listing's like count is COUNT(*) over
-- this table; a user has liked a listing when their row exists.
CREATE TABLE IF NOT EXISTS trade_likes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    listing_id INTEGER NOT NULL,
    user_id TEXT NOT NULL,
    created_at INTEGER NOT NULL
);

-- ===== Indexes =====
CREATE INDEX IF NOT EXISTS idx_trade_blocks_blocker ON trade_blocks(blocker_id);
CREATE INDEX IF NOT EXISTS idx_trade_likes_listing ON trade_likes(listing_id);

-- One block per (blocker, blocked) and one like per (listing, user). Kept last
-- so a failure on pre-existing duplicate rows cannot block table creation.
CREATE UNIQUE INDEX IF NOT EXISTS idx_trade_blocks_unique ON trade_blocks(blocker_id, blocked_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_trade_likes_unique ON trade_likes(listing_id, user_id);
