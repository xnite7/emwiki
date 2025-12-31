# Scammer Periodic Checker Setup

## Overview

The **Scammer Periodic Checker** Worker runs every hour to automatically:
1. **Check for new messages** in the Discord channel that haven't been processed yet
2. **Check for new threads** on existing messages (especially recent ones that might not have had threads initially)
3. **Process new messages** through the queue system
4. **Fetch new thread evidence** and download images/videos to R2

This ensures your scammer database stays up-to-date without manual intervention.

## Architecture

```
┌─────────────────────────────────────┐
│  Periodic Checker (Cron: hourly)    │
└──────────────┬──────────────────────┘
               │
       ┌───────┴────────┐
       │                 │
       ▼                 ▼
┌─────────────┐   ┌──────────────┐
│ New Messages│   │ New Threads │
│   Check     │   │   Check     │
└──────┬──────┘   └──────┬──────┘
       │                 │
       ▼                 ▼
┌─────────────┐   ┌──────────────┐
│   Enqueue   │   │ Fetch Thread │
│  Messages   │   │   Messages   │
└──────┬──────┘   └──────┬──────┘
       │                 │
       └────────┬────────┘
                ▼
         ┌─────────────┐
         │ Queue System│
         │  (Consumer) │
         └─────────────┘
```

## Deployment

### Step 1: Get Your D1 Database ID

1. Go to Cloudflare Dashboard → Workers & Pages → D1
2. Click on your database (`DBA`)
3. Copy the **Database ID** from the URL or settings

### Step 2: Update Configuration

Edit `emwiki/workers/scammer-periodic-checker-wrangler.toml`:

```toml
[[d1_databases]]
binding = "DB"  # Change to "DBA" if that's your binding name
database_name = "DBA"
database_id = "YOUR_D1_DATABASE_ID"  # Replace with actual ID

[[r2_buckets]]
binding = "MY_BUCKET"
bucket_name = "YOUR_R2_BUCKET_NAME"  # Replace with actual bucket name
```

### Step 3: Deploy the Worker

```bash
cd emwiki/workers
wrangler deploy --config scammer-periodic-checker-wrangler.toml
```

### Step 4: Set Environment Variables

Set the required secrets:

```bash
wrangler secret put DISCORD_BOT_TOKEN --config scammer-periodic-checker-wrangler.toml
wrangler secret put DISCORD_CHANNEL_ID --config scammer-periodic-checker-wrangler.toml
```

Optional (for Cloudflare Stream):

```bash
wrangler secret put CLOUDFLARE_ACCOUNT_ID --config scammer-periodic-checker-wrangler.toml
wrangler secret put CLOUDFLARE_STREAM_TOKEN --config scammer-periodic-checker-wrangler.toml
```

### Step 5: Verify Deployment

Check the Worker logs in Cloudflare Dashboard:
1. Go to Workers & Pages → `scammer-periodic-checker`
2. Click **Logs** tab
3. Wait for the next cron run (or trigger manually)
4. Verify logs show successful checks

## How It Works

### New Message Detection

1. Fetches last 100 messages from Discord channel
2. Compares with `last_message_id` in database
3. Finds messages newer than the last processed one
4. Enqueues new messages for processing by the queue consumer

### New Thread Detection

1. Gets last 50 messages that don't have threads yet
2. Fetches active threads from Discord
3. Matches threads to messages by `message_id`
4. Fetches thread messages and downloads attachments to R2
5. Updates database with thread evidence

### Rate Limiting

- Waits 1.5 seconds between thread fetches
- Respects Discord API rate limits (429 errors)
- Processes messages in batches

## Monitoring

### Check Logs

View logs in Cloudflare Dashboard:
- Workers & Pages → `scammer-periodic-checker` → Logs

### Manual Trigger

You can manually trigger the checker:

```bash
curl -X POST "https://scammer-periodic-checker.YOUR_SUBDOMAIN.workers.dev" \
  -H "Authorization: Bearer YOUR_API_TOKEN"
```

Or use Wrangler:

```bash
wrangler tail --config scammer-periodic-checker-wrangler.toml
```

## Cron Schedule

Default: `0 * * * *` (every hour at minute 0)

To change the schedule, edit `scammer-periodic-checker-wrangler.toml`:

```toml
[[triggers.crons]]
cron = "0 */2 * * *"  # Every 2 hours
# cron = "*/30 * * * *"  # Every 30 minutes
# cron = "0 0 * * *"  # Once per day at midnight
```

## Troubleshooting

### No New Messages Found

- Check if Discord channel has new messages
- Verify `DISCORD_CHANNEL_ID` is correct
- Check database `last_message_id` - might be too recent

### No New Threads Found

- Threads might not exist yet (they're created after messages)
- Check if messages have `thread_evidence` already
- Verify Discord API permissions (bot needs to see threads)

### Queue Not Processing

- Verify `SCAMMER_QUEUE` binding is configured
- Check queue consumer Worker is deployed and running
- Verify queue consumer has correct D1 database binding

### Rate Limit Errors

- Reduce frequency (change cron schedule)
- Increase delays between API calls
- Check Discord bot rate limits

## Integration with Other Systems

### Queue Consumer

New messages are automatically processed by:
- `emwiki/workers/scammer-queue-consumer.js`

### Thread Updates

Existing threads are updated by:
- `emwiki/workers/thread-evidence-updater.js` (every 5 hours)

### Full Refresh

For a complete refresh, use:
- `https://emwiki.com/api/roblox-proxy?mode=discord-scammers&action=start`

## Summary

The periodic checker ensures your scammer database stays current by:
- ✅ Automatically detecting new scammer reports
- ✅ Finding threads created after initial reports
- ✅ Processing everything through the queue system
- ✅ Downloading evidence to R2 for persistence

No manual intervention needed! 🎉

