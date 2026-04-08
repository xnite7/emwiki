-- Migration 023: Add profile_refreshed_at column to scammer_profile_cache
-- This tracks when Roblox avatar/username data was last fetched from the API.
-- Roblox CDN avatar URLs (tr.rbxcdn.com) expire after ~30 days, so we need
-- to periodically re-fetch them to prevent broken images and stale usernames.

ALTER TABLE scammer_profile_cache ADD COLUMN profile_refreshed_at INTEGER DEFAULT 0;

-- Index to quickly find stale profiles that need refreshing
CREATE INDEX IF NOT EXISTS idx_profile_refreshed_at ON scammer_profile_cache(profile_refreshed_at);
