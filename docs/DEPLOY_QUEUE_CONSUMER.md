# Quick Guide: Deploy Queue Consumer

## The Problem

Messages are queued but not processing because the queue consumer Worker isn't deployed yet.

## Quick Fix (3 Steps)

### Step 1: Get Your D1 Database ID

1. Go to **Cloudflare Dashboard → Workers & Pages → D1 → Your Database**
2. Click on your database (probably named "DBA")
3. Go to **Settings** tab
4. Copy the **Database ID** (looks like: `a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6`)

### Step 2: Update wrangler.toml

Open `emwiki/workers/scammer-queue-consumer-wrangler.toml` and replace:
```toml
database_id = "YOUR_D1_DATABASE_ID"
```
With your actual database ID.

### Step 3: Deploy the Worker

```bash
cd emwiki/workers
wrangler deploy --config scammer-queue-consumer-wrangler.toml
```

When prompted, set secrets:
- `DISCORD_BOT_TOKEN` - Your Discord bot token
- `DISCORD_CHANNEL_ID` - Your Discord channel ID

Or set them manually:
```bash
wrangler secret put DISCORD_BOT_TOKEN --config scammer-queue-consumer-wrangler.toml
wrangler secret put DISCORD_CHANNEL_ID --config scammer-queue-consumer-wrangler.toml
```

### Step 4: Verify

1. Go to **Cloudflare Dashboard → Workers & Pages → Queues → scammer-messages**
2. You should see:
   - Status: **Active** ✅
   - Consumer: **scammer-queue-consumer** ✅
   - Messages should start processing automatically

## Check Progress

```bash
# Check job status
curl "https://emwiki.com/api/roblox-proxy?mode=discord-scammers&action=status&jobId=YOUR_JOB_ID"
```

You should see `messages_processed` increasing as messages are processed.

## Troubleshooting

### Queue Still Shows "Inactive: no consumers attached"

1. Make sure Worker deployed successfully (check `wrangler deploy` output)
2. Verify queue name matches: `scammer-messages`
3. Check Worker logs: **Workers & Pages → scammer-queue-consumer → Logs**

### Messages Not Processing

1. Check Worker logs for errors
2. Verify D1 database binding is correct
3. Check secrets are set: `wrangler secret list --config scammer-queue-consumer-wrangler.toml`

### 401 Errors in Worker Logs

- Discord bot token is invalid or missing
- Set it: `wrangler secret put DISCORD_BOT_TOKEN --config scammer-queue-consumer-wrangler.toml`

