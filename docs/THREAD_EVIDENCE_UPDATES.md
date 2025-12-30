# Thread Evidence Updates Configuration

This document explains how to configure periodic updates for Discord thread evidence.

## Overview

The thread evidence update system automatically:
- Downloads Discord images to R2 to prevent expiration
- Checks for new messages in existing threads
- Detects threads created after initial scammer reports
- Updates thread evidence periodically

## Cron Trigger Setup

**Note**: Cloudflare Pages Functions don't support cron triggers directly. You need to use one of these options:

### Option 1: Cloudflare Workers (Recommended)

Create a separate scheduled Worker that calls the endpoint:

1. Create a new Worker in Cloudflare Dashboard
2. Add this code:

```javascript
export default {
  async scheduled(event, env, ctx) {
    // Call the Pages Function endpoint
    await fetch('https://emwiki.com/api/roblox-proxy?mode=update-thread-evidence', {
      method: 'GET'
    });
  }
}
```

3. In `wrangler.toml`:

```toml
name = "thread-evidence-updater"
main = "src/index.js"
compatibility_date = "2024-01-01"

[[triggers.crons]]
cron = "0 */5 * * *"  # Every 5 hours
```

### Option 2: External Cron Service

Use an external service like:
- **cron-job.org** (free)
- **EasyCron** (free tier available)
- **GitHub Actions** (if using GitHub)

Configure to call: `https://emwiki.com/api/roblox-proxy?mode=update-thread-evidence` every 5 hours (`0 */5 * * *`)

### Option 3: Manual Updates

Call the endpoint manually or via script when needed.

## Manual Updates

You can also trigger updates manually:

```bash
# Update all threads
curl "https://emwiki.com/api/roblox-proxy?mode=update-thread-evidence"

# Update specific user's thread
curl "https://emwiki.com/api/roblox-proxy?mode=update-thread-evidence&userId=123456789"

# Process in batches
curl "https://emwiki.com/api/roblox-proxy?mode=update-thread-evidence&limit=10&offset=0"
```

## Migration

### Migrate Existing Images to R2

To download existing Discord images to R2:

```bash
# Migrate all images (processes one entry at a time)
curl "https://emwiki.com/api/roblox-proxy?mode=migrate-images-to-r2"

# Migrate specific user
curl "https://emwiki.com/api/roblox-proxy?mode=migrate-images-to-r2&userId=123456789"

# Process in batches
curl "https://emwiki.com/api/roblox-proxy?mode=migrate-images-to-r2&limit=1&offset=0"
```

The migration processes entries one at a time to avoid Worker timeouts. You'll need to call it multiple times with increasing `offset` values until `has_more` is `false`.

## Database Migration

Run the migration to add thread tracking columns:

```bash
wrangler d1 execute DBA --file=migrations/013_add_thread_tracking.sql
```

Or via Cloudflare Dashboard:
1. Go to Workers & Pages → D1 → Your Database
2. Open Console tab
3. Paste and run the SQL from `migrations/013_add_thread_tracking.sql`

## How It Works

1. **Periodic Updates**: Every 5 hours, the cron trigger calls `update-thread-evidence` mode
2. **Batch Processing**: Processes 1 entry at a time, checking only the last 10 entries
3. **Incremental Fetching**: Only fetches messages after `thread_last_message_id`
4. **Image Download**: Automatically downloads new images to R2
5. **New Thread Detection**: Checks for threads created after initial report
6. **Frontend**: Uses R2 URLs with fallback to Discord URLs

### Update Schedule

- **Frequency**: Every 5 hours (`0 */5 * * *`)
- **Batch Size**: 1 entry per call
- **Check Range**: Last 10 entries only (most recently updated)
- **Check Threshold**: Entries not checked in the last 5 hours

## Monitoring

Check update status by calling the endpoint:

```bash
curl "https://emwiki.com/api/roblox-proxy?mode=update-thread-evidence&limit=1"
```

Response includes:
- `processed`: Number of threads checked
- `updated`: Number of threads with new messages
- `has_more`: Whether more threads need processing
- `errors`: Any errors encountered

## Troubleshooting

### Images Not Loading

1. Check if images were downloaded to R2:
   ```bash
   curl "https://emwiki.com/api/roblox-proxy?mode=migrate-images-to-r2&userId=USER_ID"
   ```

2. Verify R2 bucket is accessible and `MY_BUCKET` env var is set

3. Check if Discord images are expired (will fail silently)

### Threads Not Updating

1. Check `thread_needs_update` flag in database
2. Verify cron trigger is running (check Cloudflare Dashboard logs)
3. Check Discord API rate limits (429 errors)

### Rate Limiting

The system handles Discord API rate limits automatically with retries. If you see frequent 429 errors:
- Reduce batch size (`limit` parameter)
- Increase delay between requests
- Check Discord bot permissions

