-- Migration 017: Add message-level tracking for scammer jobs
--
-- This creates a table to track each individual message in a job,
-- allowing us to verify all messages were processed and recover lost messages.

CREATE TABLE IF NOT EXISTS scammer_job_messages (
  job_id TEXT NOT NULL,
  message_id TEXT NOT NULL,
  status TEXT DEFAULT 'queued',  -- queued, processing, completed, skipped, failed
  enqueued_at INTEGER NOT NULL,
  processed_at INTEGER,
  error TEXT,
  PRIMARY KEY (job_id, message_id)
);

CREATE INDEX IF NOT EXISTS idx_job_messages_status ON scammer_job_messages(job_id, status);
CREATE INDEX IF NOT EXISTS idx_job_messages_enqueued ON scammer_job_messages(enqueued_at) WHERE status = 'queued';

