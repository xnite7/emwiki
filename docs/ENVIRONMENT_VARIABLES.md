# Environment Variables Setup

## Required Environment Variables

The scammer processing system requires these environment variables to be set:

### 1. DISCORD_BOT_TOKEN

Your Discord bot token. Get it from:
1. Go to https://discord.com/developers/applications
2. Select your bot application
3. Go to **Bot** section
4. Click **Reset Token** or **Copy** to get your token

**Setting in Cloudflare Pages:**

1. Go to **Workers & Pages → Your Pages Project → Settings → Environment Variables**
2. Click **Add Variable**
3. Name: `DISCORD_BOT_TOKEN`
4. Value: Your bot token (starts with something like `MTIzNDU2Nzg5...`)
5. Select **Encrypt** (recommended)
6. Click **Save**

**Setting via Wrangler CLI:**

```bash
cd emwiki
wrangler pages secret put DISCORD_BOT_TOKEN
# Enter your token when prompted
```

### 2. DISCORD_CHANNEL_ID

The Discord channel ID where scammer messages are posted.

**Finding Channel ID:**

1. Enable Developer Mode in Discord (User Settings → Advanced → Developer Mode)
2. Right-click on the channel → **Copy ID**

**Setting in Cloudflare Pages:**

1. Go to **Workers & Pages → Your Pages Project → Settings → Environment Variables**
2. Click **Add Variable**
3. Name: `DISCORD_CHANNEL_ID`
4. Value: Your channel ID (numeric string like `1234567890123456789`)
5. Click **Save**

**Setting via Wrangler CLI:**

```bash
cd emwiki
wrangler pages secret put DISCORD_CHANNEL_ID
# Enter your channel ID when prompted
```

## For Queue Consumer Worker

The queue consumer Worker also needs these variables. Set them separately:

```bash
cd emwiki/workers
wrangler secret put DISCORD_BOT_TOKEN --config scammer-queue-consumer-wrangler.toml
wrangler secret put DISCORD_CHANNEL_ID --config scammer-queue-consumer-wrangler.toml
```

## Verifying Setup

After setting variables, test the endpoint:

```bash
curl "https://emwiki.com/api/roblox-proxy?mode=discord-scammers&action=start"
```

If you get a 401 error, the token is invalid or not set correctly.

## Troubleshooting

### 401 Unauthorized Error

- **Check token is set**: Verify `DISCORD_BOT_TOKEN` exists in environment variables
- **Check token format**: Should start with bot token format (usually alphanumeric)
- **Check token validity**: Token might be expired or revoked - generate a new one
- **Check bot permissions**: Bot needs `Read Message History` permission in the channel

### 403 Forbidden Error

- Bot doesn't have permission to read the channel
- Add bot to server with appropriate permissions
- Check bot has `Read Message History` and `View Channels` permissions

### 404 Not Found Error

- Channel ID is incorrect
- Bot is not in the server/channel
- Channel doesn't exist

## Security Notes

- **Never commit tokens to git** - Use environment variables or secrets
- **Use encrypted secrets** in Cloudflare Dashboard
- **Rotate tokens regularly** if compromised
- **Use least privilege** - Only give bot necessary permissions

