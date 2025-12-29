-- Migration 013: Add thread tracking columns to scammer_profile_cache
--
-- This migration adds columns to track thread updates for periodic refresh:
-- - thread_last_checked_at: Timestamp of last thread check
-- - thread_last_message_id: Last message ID processed from thread
-- - thread_needs_update: Boolean flag for threads needing refresh
--
-- Note: SQLite doesn't support IF NOT EXISTS for ALTER TABLE ADD COLUMN
-- If the column already exists, this will fail - that's okay, just ignore the error

-- Add thread_last_checked_at column (timestamp in milliseconds)
ALTER TABLE scammer_profile_cache ADD COLUMN thread_last_checked_at INTEGER;

-- Add thread_last_message_id column (Discord message ID)
ALTER TABLE scammer_profile_cache ADD COLUMN thread_last_message_id TEXT;

-- Add thread_needs_update column (boolean flag: 0 = false, 1 = true)
ALTER TABLE scammer_profile_cache ADD COLUMN thread_needs_update INTEGER DEFAULT 0;

-- Create index for efficient querying of threads that need updates
CREATE INDEX IF NOT EXISTS idx_thread_needs_update ON scammer_profile_cache(thread_needs_update) WHERE thread_evidence IS NOT NULL;

-- Create index for efficient querying by thread_last_checked_at
CREATE INDEX IF NOT EXISTS idx_thread_last_checked ON scammer_profile_cache(thread_last_checked_at) WHERE thread_evidence IS NOT NULL;

