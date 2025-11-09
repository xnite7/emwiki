-- Migration 004: Convert user_id from TEXT to INTEGER in gallery_items
--
-- This migration converts the user_id column in gallery_items from TEXT to INTEGER
-- to match the data type used in the users table and improve type consistency.
--
-- Note: SQLite doesn't support ALTER COLUMN, so we need to:
-- 1. Create a new table with INTEGER user_id
-- 2. Copy data (casting TEXT to INTEGER)
-- 3. Drop old table
-- 4. Rename new table

BEGIN TRANSACTION;

-- Create new gallery_items table with INTEGER user_id
CREATE TABLE gallery_items_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,                 -- Changed from TEXT to INTEGER
  title TEXT NOT NULL,
  description TEXT,
  media_url TEXT NOT NULL,
  thumbnail_url TEXT,
  status INTEGER NOT NULL DEFAULT 2,        -- 0=rejected, 1=approved, 2=pending
  moderated_by TEXT,
  moderated_at INTEGER,
  rejection_reason TEXT,
  created_at INTEGER NOT NULL,
  views INTEGER DEFAULT 0,                  -- Simple counter
  likes TEXT DEFAULT '[]',                  -- JSON array of user_ids (as numbers)
  FOREIGN KEY (user_id) REFERENCES users(user_id)
);

-- Copy all data from old table to new table, converting user_id to INTEGER
INSERT INTO gallery_items_new (
  id, user_id, title, description, media_url, thumbnail_url,
  status, moderated_by, moderated_at, rejection_reason,
  created_at, views, likes
)
SELECT
  id,
  CAST(user_id AS INTEGER),                -- Convert TEXT to INTEGER
  title,
  description,
  media_url,
  thumbnail_url,
  status,
  moderated_by,
  moderated_at,
  rejection_reason,
  created_at,
  views,
  likes
FROM gallery_items;

-- Drop the old table
DROP TABLE gallery_items;

-- Rename new table to original name
ALTER TABLE gallery_items_new RENAME TO gallery_items;

-- Recreate indexes for performance
CREATE INDEX idx_gallery_user_id ON gallery_items(user_id);
CREATE INDEX idx_gallery_status ON gallery_items(status);
CREATE INDEX idx_gallery_created_at ON gallery_items(created_at);

COMMIT;
