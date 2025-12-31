# Queue Configuration Guide

## Recommended Settings

Based on Discord API rate limits and processing requirements:

### Queue Consumer Settings

- **Batch Size**: `10` messages per batch
  - Good balance between throughput and rate limiting
  - Each message takes ~1-2 seconds to process (Discord API calls)

- **Max Wait Time**: `10` seconds
  - Waits up to 10 seconds for batch to fill before processing
  - Prevents waiting too long for small batches

- **Max Retries**: `3` attempts
  - Gives enough chances for transient errors
  - Prevents infinite retries on permanent failures

- **Retry Delay**: `2` seconds (recommended)
  - Helps respect Discord rate limits
  - Gives time for transient issues to resolve

- **Max Consumer Concurrency**: `auto` (recommended)
  - Automatically scales based on queue depth
  - Cloudflare handles scaling optimally

### Dead Letter Queue (Optional but Recommended)

Create a separate queue `scammer-messages-dlq` for messages that fail after all retries:
- Helps debug persistent failures
- Allows manual reprocessing
- Prevents message loss

## Configuration in Dashboard

1. Go to **Workers & Pages → Queues → scammer-messages**
2. Click **Edit Consumer**
3. Set the values above
4. Optionally configure Dead Letter Queue

## Configuration in wrangler.toml

```toml
[[queues.consumers]]
queue = "scammer-messages"
max_batch_size = 10
max_batch_timeout = 10
max_retries = 3
retry_delay = 2
# dead_letter_queue = "scammer-messages-dlq"  # Optional
```

## Rate Limiting Considerations

Discord API limits:
- **50 requests/second** per bot
- Each message processing makes ~3-5 API calls:
  - 1x Fetch Roblox profile
  - 1-2x Fetch Discord profiles
  - 0-3x Fetch alt accounts
  - 1x Store in database

With batch size of 10 and 500ms delay between messages:
- ~20 messages/minute per consumer
- With auto-scaling, can handle hundreds of messages/minute

## Monitoring

Check queue metrics in Cloudflare Dashboard:
- **Messages in queue**: Should decrease as messages are processed
- **Messages processed**: Should increase
- **Failed messages**: Should be low (< 1%)
- **Consumer lag**: Should be minimal

## Troubleshooting

### Messages Not Processing

1. Check consumer is attached: Queue → scammer-messages → should show "Active"
2. Check Worker logs: Workers → scammer-queue-consumer → Logs
3. Verify D1 database binding is correct
4. Check secrets are set: `DISCORD_BOT_TOKEN`, `DISCORD_CHANNEL_ID`

### High Failure Rate

1. Check Dead Letter Queue for error patterns
2. Review Worker logs for specific errors
3. Verify Discord bot token is valid
4. Check D1 database connection

### Slow Processing

1. Increase `max_batch_size` (but watch rate limits)
2. Increase `max_consumer_concurrency` (if not auto)
3. Check if Discord API is rate limiting (429 errors)
4. Verify network latency to Discord API

