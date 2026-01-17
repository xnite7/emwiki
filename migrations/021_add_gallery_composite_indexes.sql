-- Migration 021: Add composite indexes for gallery queries
-- This dramatically improves gallery listing performance by creating indexes
-- that match the exact query patterns used by the API.

-- Drop old single-column indexes that will be superseded
DROP INDEX IF EXISTS idx_gallery_status;
DROP INDEX IF EXISTS idx_gallery_created_at;

-- Composite index for "newest" sort: WHERE status = 1 ORDER BY created_at DESC
-- This covers the COUNT query too since it filters on status
CREATE INDEX idx_gallery_status_created ON gallery_items(status, created_at DESC);

-- Composite index for "likes" sort: WHERE status = 1 ORDER BY likes_count DESC, created_at DESC  
CREATE INDEX idx_gallery_status_likes_created ON gallery_items(status, likes_count DESC, created_at DESC);

-- Keep the user_id index for user-specific queries (my-submissions)
-- idx_gallery_user_id should already exist, but create if missing
CREATE INDEX IF NOT EXISTS idx_gallery_user_id ON gallery_items(user_id);

