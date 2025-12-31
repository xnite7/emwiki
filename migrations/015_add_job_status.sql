-- Migration 015: Add job status table for tracking scammer data processing jobs
--
-- This migration creates a table to track background jobs for processing Discord scammer messages.
-- Used to track progress and status of long-running data processing tasks.

CREATE TABLE IF NOT EXISTS scammer_job_status (
  job_id TEXT PRIMARY KEY,
  status TEXT NOT NULL, -- 'running', 'completed', 'failed'
  messages_processed INTEGER DEFAULT 0,
  total_messages INTEGER DEFAULT 0,
  started_at INTEGER NOT NULL,
  completed_at INTEGER,
  last_activity_at INTEGER, -- Last time job made progress
  current_message_id TEXT, -- Currently processing message ID
  current_step TEXT, -- What step the job is on
  error TEXT,
  logs TEXT -- JSON array of log entries
);

-- Create index for querying active jobs
CREATE INDEX IF NOT EXISTS idx_job_status ON scammer_job_status(status, started_at);

