# Queue-Based Scammer Message Processing Setup

This document explains how to set up the queue-based system for processing Discord scammer messages.

## Overview

The queue system processes messages independently, avoiding Worker timeout issues:
- Messages are added to a queue when job starts
- Queue consumer processes each message independently
- Automatic retries on failure
- No timeout issues since each message is processed separately

## Queue Setup

### Step 1: Create Queue in Cloudflare Dashboard

1. Go to Cloudflare Dashboard → Workers & Pages → Queues
2. Click **Create Queue**
3. Name it: `scammer-messages`
4. Note the queue ID

### Step 2: Configure Queue Binding

#### Option A: Using wrangler.toml (if deploying with Wrangler)

Add to `emwiki/wrangler.toml`:

```toml
[[queues.producers]]
queue = "scammer-messages"
binding = "SCAMMER_QUEUE"

[[queues.consumers]]
queue = "scammer-messages"
max_batch_size = 10
max_batch_timeout = 30
```

#### Option B: Using Cloudflare Dashboard (Pages)

1. Go to Workers & Pages → Your Pages Project → Settings → Functions
2. Scroll to **Queue Bindings**
3. Add binding:
   - **Variable name**: `SCAMMER_QUEUE`
   - **Queue name**: `scammer-messages`
   - **Type**: Producer

4. For the consumer, you need to create a separate Worker or use Pages Functions queue consumer

### Step 3: Deploy Queue Consumer

The queue consumer is in `emwiki/functions/_queue/scammer-messages.js`.

For Pages Functions, queue consumers need to be in `functions/_queue/` directory.

## Usage

### Start a Job

```bash
curl "https://emwiki.com/api/roblox-proxy?mode=discord-scammers&action=start"
```

Response:
```json
{
  "jobId": "job_1234567890_abc123",
  "status": "queued",
  "queued": 183,
  "total": 183,
  "message": "Added 183 messages to queue. They will be processed automatically."
}
```

### Check Job Status

```bash
curl "https://emwiki.com/api/roblox-proxy?mode=discord-scammers&action=status&jobId=job_1234567890_abc123"
```

### How It Works

1. **Job Start**: Fetches all messages from Discord channel and adds them to queue
2. **Queue Processing**: Queue consumer processes messages one at a time (or in small batches)
3. **Progress Tracking**: Job status is updated after each message
4. **Thread Fetching**: After all messages are processed, threads are fetched automatically
5. **Completion**: Job status is marked as 'completed'

## Queue Consumer Configuration

The queue consumer processes messages in batches:
- **max_batch_size**: 10 messages per batch
- **max_batch_timeout**: 30 seconds max wait time

You can adjust these in `wrangler.toml`:

```toml
[[queues.consumers]]
queue = "scammer-messages"
max_batch_size = 20  # Process more messages per batch
max_batch_timeout = 60  # Wait longer for batch
```

## Benefits

✅ **No Timeouts**: Each message processed independently  
✅ **Automatic Retries**: Failed messages are retried automatically  
✅ **Scalable**: Can handle thousands of messages  
✅ **Progress Tracking**: See exactly which message is being processed  
✅ **Resilient**: One failed message doesn't stop the entire job  

## Troubleshooting

### Queue Not Processing

1. Check queue binding is configured correctly
2. Verify queue consumer is deployed
3. Check Cloudflare Dashboard → Queues → scammer-messages → Metrics

### Messages Stuck in Queue

1. Check queue consumer logs in Cloudflare Dashboard
2. Verify database connection is working
3. Check for rate limiting errors

### Job Not Completing

1. Check job status: `?action=status&jobId=xxx`
2. Look at `current_message_id` and `current_step` in job status
3. Check queue metrics for failed messages

