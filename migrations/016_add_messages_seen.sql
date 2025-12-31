-- Migration 016: Add messages_seen column to track all messages processed (including skipped)
--
-- This fixes the issue where jobs with all skipped messages never complete.
-- messages_seen counts ALL messages (processed + skipped), while messages_processed
-- only counts messages that had Roblox URLs.

ALTER TABLE scammer_job_status ADD COLUMN messages_seen INTEGER DEFAULT 0;

-- Update existing jobs to set messages_seen = messages_processed (approximation)
UPDATE scammer_job_status SET messages_seen = messages_processed WHERE messages_seen = 0;

