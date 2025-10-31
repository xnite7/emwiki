# Trading System Database Setup

This directory contains the database schema for the Epic Minigames Trading System.

## Setup Instructions

### Using Cloudflare Dashboard (Recommended for Production)

1. Log in to your Cloudflare Dashboard
2. Navigate to Workers & Pages > D1 databases
3. Select your `DBA` database
4. Go to the "Console" tab
5. Copy and paste the contents of `trading_schema.sql`
6. Execute the SQL statements

### Using Wrangler CLI (For Local Development)

```bash
# If you have wrangler configured
wrangler d1 execute DBA --file=./schema/trading_schema.sql
```

### Manual Migration via API

You can also run the migration programmatically using the D1 API from a Worker function.

## Database Tables Overview

### Core Trading Tables

- **user_inventory** - Items owned by users available for trading
- **trade_listings** - Public trade listings/offers
- **trade_offers** - Offers made on listings
- **trade_messages** - Private messages between traders
- **completed_trades** - Historical record of completed trades
- **trade_reviews** - User reviews and ratings
- **user_trade_stats** - Aggregate trading statistics per user
- **trade_notifications** - In-app notifications for trade events

## Schema Features

- ✅ Full referential integrity with foreign keys
- ✅ Optimized indexes for common queries
- ✅ JSON support for flexible item storage
- ✅ Status tracking for listings and offers
- ✅ Built-in reputation system
- ✅ Notification system
- ✅ Automatic cleanup via CASCADE deletes

## Sample Queries

### Get user's active listings
```sql
SELECT * FROM trade_listings
WHERE user_id = ? AND status = 'active'
ORDER BY created_at DESC;
```

### Get pending offers for a user
```sql
SELECT o.*, l.title as listing_title, u.username as from_username
FROM trade_offers o
JOIN trade_listings l ON o.listing_id = l.id
JOIN users u ON o.from_user_id = u.user_id
WHERE o.to_user_id = ? AND o.status = 'pending'
ORDER BY o.created_at DESC;
```

### Get user reputation
```sql
SELECT
    uts.*,
    u.username,
    u.display_name
FROM user_trade_stats uts
JOIN users u ON uts.user_id = u.user_id
WHERE uts.user_id = ?;
```
