adadadadad# Donations System Documentation

This document explains the donations tracking system that integrates with Roblox transaction records.

## Overview

The donations system tracks user donations/purchases using two methods:
1. **Webhook Endpoint**: Real-time updates from the Roblox game when transactions occur (increments totals)
2. **Scheduled Fetch**: Hourly updates (24 per day) from the Roblox API (replaces totals to avoid duplicates)

**Important**: The scheduled fetch:
- Only fetches transactions for the **owner's user ID** (configured via `DONATIONS_OWNER_USER_ID`)
- Uses the owner's **Roblox cookie** for authentication (configured via `ROBLOX_COOKIE`)
- Filters transactions to only **specific developer product IDs** (configured via `DONATIONS_PRODUCT_IDS`)
- **Replaces** all donation totals (recalculates from scratch) to avoid duplicates

## Storage Structure

The system uses Cloudflare KV (`DONATIONS_KV` binding) to store:

- `purchase:{userId}` - Aggregated totals per user
  - Format: `{"userId": 123456789, "totalSpent": 350, "purchases": 3}`
  - Example: `purchase:113220762` → `{"userId":113220762,"totalSpent":350,"purchases":3}`

## API Endpoints

### 1. Webhook Endpoint (Real-time from Roblox Game)

**POST** `/api/donations/webhook`

Receives transaction data from the Roblox game when purchases occur.

**Request Body:**
```json
{
  "transactionType": "Sale",
  "agent": {
    "id": 123456789,
    "type": "User",
    "name": "Username"
  },
  "currency": {
    "amount": 70,
    "type": "Robux"
  },
  "details": {
    "id": 68227472,
    "name": "100",
    "type": "DeveloperProduct"
  },
  "purchaseToken": "7bcf46af-fb10-4310-9d3-374343ea9ed0",
  "created": "2025-07-19T07:48:55.209Z"
}
```

**Alternative formats:**
- Array of transactions: `[{...}, {...}]`
- Wrapped format: `{"transactions": [{...}, {...}]}`
- Single transaction: `{...}`

**Response:**
```json
{
  "status": "ok",
  "processed": 1,
  "transactions": [
    {
      "userId": "123456789",
      "price": 70,
      "purchaseToken": "7bcf46af-fb10-4310-9d3-374343ea9ed0",
      "totalSpent": 70,
      "purchases": 1
    }
  ]
}
```

### 2. Scheduled Fetch Endpoint (Hourly from Roblox API)

**GET** `/api/donations?mode=fetch`

Fetches transactions from the Roblox API for the **owner's account only**. This endpoint:
- Uses the owner's Roblox cookie for authentication
- Filters to only specific developer product IDs
- **Replaces** all donation totals (recalculates from scratch) to avoid duplicates

**Query Parameters:**
- `mode=fetch` (required) - Enables scheduled fetch mode

**Response:**
```json
{
  "status": "ok",
  "ownerUserId": "123456789",
  "totalTransactions": 150,
  "processedUsers": 45,
  "allowedProductIds": [68227472, 68227552],
  "results": [
    {
      "userId": "987654321",
      "totalSpent": 350,
      "purchases": 3
    },
    {
      "userId": "111222333",
      "totalSpent": 175,
      "purchases": 2
    }
  ]
}
```

**Note**: This endpoint requires environment variables:
- `DONATIONS_OWNER_USER_ID` - Your Roblox user ID
- `ROBLOX_COOKIE` - Your Roblox authentication cookie
- `DONATIONS_PRODUCT_IDS` - Comma-separated list of developer product IDs to filter (optional, if not set, processes all products)

### 3. Leaderboard Endpoint

**GET** `/api/donations`

Returns the donation leaderboard sorted by total spent.

**Query Parameters:**
- `limit` (optional) - Number of users to return (default: 50)

**Response:**
```json
[
  {
    "userId": "123456789",
    "totalSpent": 1750,
    "purchases": 3,
    "name": "Username",
    "displayName": "Display Name",
    "avatar": "https://thumbnails.roblox.com/..."
  },
  ...
]
```

### 4. Legacy POST Endpoint (Backward Compatibility)

**POST** `/api/donations`

Legacy endpoint for simple donation tracking (backward compatibility).

**Request Body:**
```json
{
  "userId": 123456789,
  "productId": 68227472,
  "price": 70
}
```

**Response:**
```json
{
  "status": "ok",
  "totalSpent": 70,
  "purchases": 1
}
```

## Setting Up Cron Trigger (Hourly Updates)

### Option 1: Cloudflare Dashboard (Recommended)

**Step-by-step instructions:**

1. **Log in to Cloudflare Dashboard**
   - Go to [dash.cloudflare.com](https://dash.cloudflare.com)
   - Select your account

2. **Navigate to your Pages Project**
   - Click **Workers & Pages** in the left sidebar
   - Find and click on your Pages project (e.g., `emwiki`)

3. **Open Functions Settings**
   - Click on the **Settings** tab at the top
   - Scroll down to the **Functions** section
   - Look for **Cron Triggers** subsection

4. **Add a New Cron Trigger**
   - Click **Add Cron Trigger** button
   - Fill in the following:
     - **Cron Expression**: `0 * * * *` 
       - This means: every hour at minute 0 (e.g., 1:00, 2:00, 3:00, etc.)
       - Format: `minute hour day month weekday`
     - **Route**: `/api/donations?mode=fetch`
       - This is the path to your endpoint (relative to your domain)
     - **Method**: `GET`
       - Select GET from the dropdown

5. **Save the Cron Trigger**
   - Click **Save** or **Add Trigger**
   - The cron trigger will now run automatically every hour

**Note:** The cron trigger will make an HTTP GET request to `https://your-domain.com/api/donations?mode=fetch` every hour. Make sure your Pages project is deployed and the endpoint is accessible.

### Option 2: Using a Separate Worker (Alternative)

If cron triggers aren't available in your Pages Functions settings, you can create a separate Worker that calls your Pages Function endpoint:

1. **Create a new Worker** (e.g., `donations-scheduler`)

2. **Create `wrangler.toml`**:
```toml
name = "donations-scheduler"
main = "scheduler.js"
compatibility_date = "2024-01-01"

[[triggers.crons]]
cron = "0 * * * *"  # Every hour
```

3. **Create `scheduler.js`**:
```javascript
export default {
  async scheduled(event, env, ctx) {
    // Call your Pages Function endpoint
    const response = await fetch('https://emwiki.com/api/donations?mode=fetch');
    const result = await response.json();
    console.log('Donations fetch result:', result);
  }
};
```

4. **Deploy the Worker**:
```bash
wrangler deploy
```

### Option 3: Manual Testing

You can manually trigger the scheduled fetch for testing:

```bash
# Test the endpoint
curl "https://emwiki.com/api/donations?mode=fetch"

# Test for a specific user
curl "https://emwiki.com/api/donations?mode=fetch&userId=123456789"

# Test with limit
curl "https://emwiki.com/api/donations?mode=fetch&limit=10"
```

### Verifying the Cron Trigger

After setting up the cron trigger:

1. **Check Cloudflare Logs**
   - Go to your Pages project → **Logs** tab
   - Filter for requests to `/api/donations?mode=fetch`
   - You should see requests every hour

2. **Check Function Execution**
   - Look for successful responses (status 200)
   - Check the response body for `{"status":"ok","processed":...}`

3. **Monitor KV Store**
   - Check that `purchase:{userId}` entries are being updated
   - Verify `totalSpent` and `purchases` values are increasing

### Troubleshooting Cron Triggers

**Cron trigger not running:**
- Verify the cron expression is correct: `0 * * * *`
- Check that your Pages project is deployed
- Ensure the route path matches exactly: `/api/donations?mode=fetch`
- Verify the method is set to `GET`

**Cron trigger running but no updates:**
- Check the function logs for errors
- Verify `DONATIONS_KV` binding is configured in Pages settings
- Test the endpoint manually to ensure it works
- Check if there are any users in the KV store to process

**Rate limiting issues:**
- The Roblox API may rate limit if processing too many users
- Reduce the `limit` parameter in the scheduled fetch
- Add delays between API calls (already implemented)

## Roblox Transaction API

The system uses the Roblox Transaction Records API:
```
GET https://apis.roblox.com/transaction-records/v1/users/{userId}/transactions
```

**Query Parameters:**
- `transactionType=Sale` - Only fetch sale transactions
- `itemPricingType=PaidAndLimited` - Only paid items
- `limit=100` - Maximum transactions per page
- `cursor` - Pagination cursor

**Response Format:**
```json
{
  "previousPageCursor": null,
  "nextPageCursor": "...",
  "data": [
    {
      "id": 0,
      "idHash": "ZHYeMRglXlgkrw74rtSkaA",
      "transactionType": "Sale",
      "created": "2025-07-19T07:48:55.209Z",
      "isPending": false,
      "agent": {
        "id": 2965223247,
        "type": "User",
        "name": "HarvestMoon"
      },
      "details": {
        "id": 68227472,
        "name": "100",
        "type": "DeveloperProduct",
        "place": {
          "placeId": 122649225404413,
          "universeId": 7469027374,
          "name": "👤 EMWIKI Account Linker 🌐"
        }
      },
      "currency": {
        "amount": 70,
        "type": "Robux"
      },
      "purchaseToken": "7bcf46af-fb10-4310-9d3-374343ea9ed0"
    }
  ]
}
```

## Processing Logic

### Transaction Filtering

The scheduled fetch only processes transactions that meet these criteria:
- `transactionType === 'Sale'`
- `currency.type === 'Robux'`
- `currency.amount > 0`
- Has a valid `agent.id` (buyer's user ID)
- `details.id` matches one of the allowed product IDs (if `DONATIONS_PRODUCT_IDS` is set)

### Duplicate Prevention

**Scheduled Fetch (Replace Mode)**:
- Recalculates totals from scratch each time
- Groups all transactions by buyer (`agent.id`)
- Replaces entire KV entry for each user
- This ensures no duplicates even if the same transaction appears multiple times

**Webhook (Increment Mode)**:
- Uses `purchaseToken` to prevent duplicate processing
- Increments existing totals
- Stores `token:{purchaseToken}` to track processed transactions

### Data Aggregation

For each user, the system maintains:
- **userId**: The buyer's Roblox user ID
- **totalSpent**: Sum of all transaction amounts for allowed products
- **purchases**: Count of all transactions for allowed products

**Scheduled Fetch**: Replaces these values completely each run (recalculates from all transactions)
**Webhook**: Increments these values for each new transaction

## Integration with Roblox Game

### Setting Up Webhook in Roblox Game

1. In your Roblox game's server script, add code to send webhook on purchase:

```lua
game:GetService("MarketplaceService").ProcessReceipt = function(receiptInfo)
    local playerId = receiptInfo.PlayerId
    local productId = receiptInfo.ProductId
    local purchaseId = receiptInfo.PurchaseId
    
    -- Process the purchase in your game
    -- ...
    
    -- Send webhook to your API
    local httpService = game:GetService("HttpService")
    local url = "https://emwiki.com/api/donations/webhook"
    
    local transactionData = {
        transactionType = "Sale",
        agent = {
            id = playerId,
            type = "User",
            name = game.Players:GetPlayerByUserId(playerId).Name
        },
        currency = {
            amount = receiptInfo.CurrencySpent,
            type = "Robux"
        },
        details = {
            id = productId,
            name = receiptInfo.ProductName,
            type = "DeveloperProduct"
        },
        purchaseToken = purchaseId,
        created = DateTime.now():ToIsoDate()
    }
    
    httpService:PostAsync(url, httpService:JSONEncode(transactionData))
    
    return Enum.ProductPurchaseDecision.PurchaseGranted
end
```

2. Or use Roblox's built-in webhook system (if available) to send transaction data directly.

## Monitoring

### Check Logs

View logs in Cloudflare Dashboard:
- Workers & Pages → Your Pages Project → Logs

### Verify Data

Check donation leaderboard:
```bash
curl "https://emwiki.com/api/donations?limit=10"
```

### Manual Processing

Process transactions for a specific user:
```bash
curl "https://emwiki.com/api/donations?mode=fetch&userId=123456789"
```

## Rate Limiting

The scheduled fetch includes rate limiting:
- Waits 500ms between API calls when fetching multiple pages
- Processes users sequentially to avoid overwhelming the Roblox API
- Limits to 50 users per run by default

## Troubleshooting

### Webhook Not Receiving Data

1. Check if the webhook endpoint is accessible:
   ```bash
   curl -X POST "https://emwiki.com/api/donations/webhook" \
     -H "Content-Type: application/json" \
     -d '{"transactionType":"Sale",...}'
   ```

2. Verify Roblox game is sending webhook correctly
3. Check Cloudflare logs for errors

### Scheduled Fetch Not Running

1. Verify cron trigger is configured in Cloudflare Dashboard
2. Check cron expression: `0 * * * *` (every hour)
3. Manually trigger to test: `curl "https://emwiki.com/api/donations?mode=fetch"`

### Duplicate Transactions

- The system uses `purchaseToken` to prevent duplicates
- If duplicates occur, check if `purchaseToken` is being generated correctly
- Verify `token:{purchaseToken}` entries in KV store

### Missing Transactions

- Roblox API may have rate limits
- Transactions older than available history may not appear
- Check if transaction meets filtering criteria (Sale, Robux, etc.)

## Environment Variables

### Required Cloudflare Bindings

- `DONATIONS_KV` - KV namespace for storing donation data

### Required Environment Variables (for scheduled fetch)

Set these in Cloudflare Dashboard → Your Pages Project → Settings → Environment Variables:

1. **`DONATIONS_OWNER_USER_ID`** (required)
   - Your Roblox user ID (the account that owns the developer products)
   - Example: `123456789`

2. **`ROBLOX_COOKIE`** (required)
   - Your Roblox authentication cookie (`.ROBLOSECURITY` cookie value)
   - This is used to authenticate API requests to fetch your transaction history
   - **Security Note**: Store this as a secret/environment variable, never commit to git
   - Example: `_|WARNING:-DO-NOT-SHARE-THIS.--YOUR-ACCOUNT-IS-AT-RISK.-DO-NOT-SHARE-THIS.|_abc123...`

3. **`DONATIONS_PRODUCT_IDS`** (optional)
   - Comma-separated list of developer product IDs to filter transactions
   - If not set, all transactions will be processed
   - Example: `68227472,68227552,68227468`

### How to Get Your Roblox Cookie

1. Log in to [Roblox.com](https://www.roblox.com)
2. Open browser Developer Tools (F12)
3. Go to **Application** tab → **Cookies** → `https://www.roblox.com`
4. Find the `.ROBLOSECURITY` cookie
5. Copy the entire value (it's very long, starts with `_|WARNING:`)

**Cookie Format Options:**
- You can store just the cookie value: `_|WARNING:-DO-NOT-SHARE-THIS.--YOUR-ACCOUNT-IS-AT-RISK.-DO-NOT-SHARE-THIS.|_abc123...`
- Or the full cookie string: `.ROBLOSECURITY=_|WARNING:-DO-NOT-SHARE-THIS.--YOUR-ACCOUNT-IS-AT-RISK.-DO-NOT-SHARE-THIS.|_abc123...`
- The code will automatically format it correctly for the API request

**⚠️ Security Warning**: 
- Never share your `.ROBLOSECURITY` cookie
- Store it securely as an environment variable/secret
- If compromised, immediately change your Roblox password

