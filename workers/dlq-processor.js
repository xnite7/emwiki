/**
 * ============================================================================
 * DLQ PROCESSOR WORKER
 * ============================================================================
 * 
 * This Worker processes messages from the scammer-messages-dlq (Dead Letter Queue).
 * Messages end up here after failing max_retries times in the main queue.
 * 
 * This worker logs failed messages for debugging and monitoring.
 * 
 * Deploy as a separate Worker with queue consumer binding.
 * See emwiki/workers/dlq-processor-wrangler.toml for configuration.
 * 
 * ============================================================================
 */

export default {
  async queue(batch, env) {
    const messages = batch.messages;
    console.error(`[DLQ] Received ${messages.length} failed messages`);

    const db = env.DB || env.DBA;

    for (const message of messages) {
      try {
        const { jobId, messageId, channelId, message: msg } = message.body;

        console.error(`[DLQ] Failed message ${messageId} for job ${jobId}`);
        console.error(`[DLQ] Message content preview:`, msg.content?.substring(0, 200) || 'No content');

        // Log to database if available
        if (db) {
          try {
            // Update job status to note this message failed
            await db.prepare(`
              UPDATE scammer_job_status
              SET error = COALESCE(error || '\n', '') || ?
              WHERE job_id = ?
            `).bind(`Message ${messageId} failed and sent to DLQ`, jobId).run();

            // Also log to a separate table if you want to track DLQ messages
            // You could create a table like:
            // CREATE TABLE dlq_messages (
            //   message_id TEXT PRIMARY KEY,
            //   job_id TEXT,
            //   channel_id TEXT,
            //   failed_at INTEGER,
            //   message_body TEXT
            // );
          } catch (dbErr) {
            console.error(`[DLQ] Failed to log to database:`, dbErr);
          }
        }

        // Ack the message to remove it from DLQ
        // Or you can keep it in DLQ for manual inspection
        message.ack();
      } catch (err) {
        console.error(`[DLQ] Error processing DLQ message:`, err);
        // Don't retry DLQ messages - they've already failed
        message.ack();
      }
    }

    console.error(`[DLQ] Processed ${messages.length} DLQ messages`);
    return { processed: messages.length };
  }
};

