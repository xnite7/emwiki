# Thread Evidence Updates Configuration

This document explains how to configure periodic updates for Discord thread evidence.

## Overview

The thread evidence update system automatically:
- Downloads Discord images to R2 to prevent expiration
- Checks for new messages in existing threads
- Detects threads created after initial scammer reports
- Updates thread evidence periodically

## Cron Trigger Setup

### Option 1: Cloudflare Dashboard

1. Go to Cloudflare Dashboard → Workers & Pages → Your Pages Project
2. Navigate to **Settings** → **Functions** → **Cron Triggers**
3. Click **Add Cron Trigger**
4. Configure:
   - **Cron Expression**: `0 * * * *` (every hour)
   - **Route**: `/api/roblox-proxy?mode=update-thread-evidence`
   - **Method**: GET

### Option 2: Wrangler CLI (if using wrangler.toml)

Add to `wrangler.toml`:

```toml
[[triggers.crons]]
cron = "0 * * * *"
```

Then create a scheduled worker that calls the endpoint.

### Option 3: Cloudflare API

Use the Cloudflare API to create a cron trigger programmatically.

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

1. **Periodic Updates**: Every hour, the cron trigger calls `update-thread-evidence` mode
2. **Incremental Fetching**: Only fetches messages after `thread_last_message_id`
3. **Image Download**: Automatically downloads new images to R2
4. **New Thread Detection**: Checks for threads created after initial report
5. **Frontend**: Uses R2 URLs with fallback to Discord URLs

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

