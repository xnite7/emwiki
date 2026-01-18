-- Migration 022: Add target_flikes column for boosted like counts
-- 
-- This stores the TARGET flikes value (real likes + boost).
-- The displayed value is calculated on-the-fly based on item age,
-- gradually ramping up from 0 to target_flikes over 30 days.

ALTER TABLE items ADD COLUMN target_flikes INTEGER DEFAULT 0;

