-- Migration 010: Add thread_evidence column to scammer_profile_cache
--
-- This migration adds a column to store Discord thread evidence (messages, attachments, images, videos)
-- Thread evidence is stored as JSON containing all messages and media from the thread
--
-- Note: SQLite doesn't support IF NOT EXISTS for ALTER TABLE ADD COLUMN
-- If the column already exists, this will fail - that's okay, just ignore the error

-- Add thread_evidence column
-- If column already exists, this will fail silently (you can ignore the error)
ALTER TABLE scammer_profile_cache ADD COLUMN thread_evidence TEXT;
