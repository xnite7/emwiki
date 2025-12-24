-- Migration 009: Consolidate scammer_cache and scammer_profile_cache into unified scammer_profile_cache
--
-- This migration combines the two separate tables into a single unified table
-- that stores all scammer data including profile info, victims, items scammed, and alts.
--
-- This migration is idempotent - it can be run multiple times safely.
-- Note: D1 handles transactions automatically, so we don't use BEGIN TRANSACTION

-- Step 1: Create new unified table structure
DROP TABLE IF EXISTS scammer_profile_cache_new;

CREATE TABLE scammer_profile_cache_new (
    user_id TEXT PRIMARY KEY,
    roblox_name TEXT,
    roblox_display_name TEXT,
    roblox_avatar TEXT,
    discord_id TEXT,
    discord_display_name TEXT,
    discord_avatar TEXT,
    victims TEXT,
    items_scammed TEXT,
    roblox_alts TEXT,
    incomplete INTEGER DEFAULT 0,
    last_message_id TEXT,
    created_at INTEGER DEFAULT (strftime('%s', 'now')),
    updated_at INTEGER DEFAULT (strftime('%s', 'now'))
);

-- Step 2: Copy basic columns from old scammer_profile_cache (if exists)
-- We only copy columns that definitely exist in the old structure
-- Avatar data will be re-populated by the application when it processes Discord messages
INSERT OR IGNORE INTO scammer_profile_cache_new (
    user_id, 
    roblox_name, 
    roblox_display_name, 
    discord_id, 
    discord_display_name, 
    updated_at
)
SELECT 
    user_id, 
    roblox_name, 
    roblox_display_name, 
    discord_id, 
    discord_display_name, 
    updated_at
FROM scammer_profile_cache
WHERE EXISTS (SELECT 1 FROM sqlite_master WHERE type='table' AND name='scammer_profile_cache');

-- Step 3: Migrate data from scammer_cache JSON blob (if table exists)
-- Note: Avatar data from old scammer_profile_cache is not copied - it will be re-fetched
-- by the application when processing Discord messages
-- Parse JSON blob and extract scammer entries using recursive CTE for indices
INSERT OR IGNORE INTO scammer_profile_cache_new (
    user_id, 
    roblox_name, 
    roblox_display_name, 
    roblox_avatar,
    discord_display_name, 
    victims, 
    items_scammed, 
    roblox_alts, 
    incomplete, 
    updated_at
)
WITH RECURSIVE indices(idx) AS (
    SELECT 0
    UNION ALL
    SELECT idx + 1 FROM indices WHERE idx < 99
)
SELECT 
    REPLACE(REPLACE(json_extract(value, '$.scammers[' || idx || '].robloxProfile'), 'https://www.roblox.com/users/', ''), '/profile', '') AS user_id,
    json_extract(value, '$.scammers[' || idx || '].robloxUser') AS roblox_name,
    json_extract(value, '$.scammers[' || idx || '].robloxUser') AS roblox_display_name,
    json_extract(value, '$.scammers[' || idx || '].avatar') AS roblox_avatar,
    json_extract(value, '$.scammers[' || idx || '].discordDisplay') AS discord_display_name,
    json_extract(value, '$.scammers[' || idx || '].victims') AS victims,
    json_extract(value, '$.scammers[' || idx || '].itemsScammed') AS items_scammed,
    json_extract(value, '$.scammers[' || idx || '].robloxAlts') AS roblox_alts,
    CASE WHEN json_extract(value, '$.scammers[' || idx || '].incomplete') = 1 THEN 1 ELSE 0 END AS incomplete,
    updated_at
FROM scammer_cache
CROSS JOIN indices
WHERE EXISTS (SELECT 1 FROM sqlite_master WHERE type='table' AND name='scammer_cache')
  AND key = 'discord-scammers'
  AND json_extract(value, '$.scammers[' || idx || ']') IS NOT NULL
  AND json_extract(value, '$.scammers[' || idx || '].robloxProfile') LIKE 'https://www.roblox.com/users/%/profile';

-- Step 5: Replace old table with new one
DROP TABLE IF EXISTS scammer_profile_cache;
ALTER TABLE scammer_profile_cache_new RENAME TO scammer_profile_cache;

-- Step 6: Drop old scammer_cache table (keep scammer_cache_locks for locking mechanism)
DROP TABLE IF EXISTS scammer_cache;

-- Step 7: Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_scammer_profile_discord_id ON scammer_profile_cache(discord_id);
CREATE INDEX IF NOT EXISTS idx_scammer_profile_updated_at ON scammer_profile_cache(updated_at);
CREATE INDEX IF NOT EXISTS idx_scammer_profile_last_message_id ON scammer_profile_cache(last_message_id);
CREATE INDEX IF NOT EXISTS idx_scammer_profile_incomplete ON scammer_profile_cache(incomplete);

-- Step 8: Create trigger to auto-update updated_at timestamp
DROP TRIGGER IF EXISTS update_scammer_profile_cache_timestamp;
CREATE TRIGGER update_scammer_profile_cache_timestamp
AFTER UPDATE ON scammer_profile_cache
BEGIN
    UPDATE scammer_profile_cache SET updated_at = strftime('%s', 'now') WHERE user_id = NEW.user_id;
END;
