-- Normalized table for tracking user item preferences (favorites/wishlist)
-- This replaces the inefficient JSON array scanning approach

CREATE TABLE IF NOT EXISTS user_item_preferences (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    item_name TEXT NOT NULL,
    preference_type TEXT NOT NULL CHECK (preference_type IN ('favorite', 'wishlist')),
    created_at TEXT DEFAULT (datetime('now')),
    UNIQUE(user_id, item_name, preference_type)
);

-- Index for counting favorites/wishlist per item (the main query)
CREATE INDEX IF NOT EXISTS idx_item_prefs_by_item ON user_item_preferences(item_name, preference_type);

-- Index for looking up a user's preferences
CREATE INDEX IF NOT EXISTS idx_item_prefs_by_user ON user_item_preferences(user_id, preference_type);

-- Migrate existing data from user_preferences JSON arrays
-- This needs to be run as a one-time migration script (see below for details)
-- 
-- After creating the table, run the migration endpoint:
-- POST /api/auth/admin/migrate-item-preferences


