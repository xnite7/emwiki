# Dead Letter Queue (DLQ) Setup Guide

## What is a DLQ?

A Dead Letter Queue (DLQ) is a special queue where messages that fail after all retry attempts are sent. This prevents message loss and allows you to:
- Monitor failed messages
- Debug why messages failed
- Manually retry failed messages
- Get alerts when messages fail

## Step 1: Create the DLQ Queue

### Via Cloudflare Dashboard:

1. Go to **Cloudflare Dashboard** → **Workers & Pages** → **Queues**
2. Click **Create Queue**
3. Name it: `scammer-messages-dlq`
4. Click **Create Queue**

### Via Wrangler CLI:

```bash
wrangler queues create scammer-messages-dlq
```

## Step 2: Update Queue Consumer Configuration

Update `emwiki/workers/scammer-queue-consumer-wrangler.toml`:

```toml
[[queues.consumers]]
queue = "scammer-messages"
max_batch_size = 10
max_batch_timeout = 10
max_retries = 3
retry_delay = 2
dead_letter_queue = "scammer-messages-dlq"  # Add this line
```

## Step 3: Redeploy Queue Consumer

```bash
cd emwiki/workers
wrangler deploy --config scammer-queue-consumer-wrangler.toml
```

## Step 4: Monitor DLQ Messages

### Via Dashboard:
1. Go to **Queues** → **scammer-messages-dlq**
2. Check message count
3. View message details to see why they failed

### Via API:
You can query the DLQ to see failed messages and their error details.

## Step 5: (Optional) Create DLQ Processor Worker

Create a worker to process DLQ messages and log them for debugging:

```javascript
// emwiki/workers/dlq-processor.js
export default {
  async queue(batch, env) {
    for (const message of batch.messages) {
      const { jobId, messageId, channelId, message: msg } = message.body;
      console.error(`[DLQ] Failed message: ${messageId} for job ${jobId}`);
      console.error(`[DLQ] Message body:`, JSON.stringify(msg, null, 2));
      
      // Log to database or external service
      // You can also manually retry by sending back to main queue
    }
  }
};
```

## Important Notes:

- **DLQ messages don't expire automatically** - you need to manually process or delete them
- **DLQ messages contain the original message body** - you can inspect why they failed
- **You can manually retry DLQ messages** by sending them back to the main queue
- **Set up alerts** in Cloudflare Dashboard to notify you when DLQ has messages

## Troubleshooting:

If messages aren't going to DLQ:
1. Check that `dead_letter_queue` is set correctly in `wrangler.toml`
2. Verify the DLQ queue exists and is named correctly
3. Check that `max_retries` is set (messages only go to DLQ after all retries fail)
4. Redeploy the queue consumer after updating configuration

