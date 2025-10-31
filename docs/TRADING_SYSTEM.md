# Trading System Documentation

Complete trading system for Epic Minigames Wiki, integrated with the existing accounts system.

## Table of Contents

- [Overview](#overview)
- [Architecture](#architecture)
- [Database Setup](#database-setup)
- [API Endpoints](#api-endpoints)
- [Frontend Integration](#frontend-integration)
- [Security & Authentication](#security--authentication)
- [Usage Examples](#usage-examples)

## Overview

The trading system allows users to:
- Create trade listings for items they want to trade
- Browse and search available trades
- Make offers on listings
- Message other traders
- Complete trades and leave reviews
- Build a trading reputation
- Track their inventory
- Receive notifications for trade activity

## Architecture

### Technology Stack

- **Backend**: Cloudflare Workers (Serverless)
- **Database**: Cloudflare D1 (SQLite)
- **Frontend**: Vanilla JavaScript
- **Authentication**: Integrated with existing Roblox auth system

### Database Schema

The system uses 8 main tables:

1. **user_inventory** - Items owned by users
2. **trade_listings** - Public trade listings
3. **trade_offers** - Offers made on listings
4. **trade_messages** - Private messaging
5. **completed_trades** - Historical trade records
6. **trade_reviews** - Reputation system
7. **user_trade_stats** - Aggregate statistics
8. **trade_notifications** - In-app notifications

See `schema/trading_schema.sql` for complete schema.

## Database Setup

### Option 1: Cloudflare Dashboard

1. Log in to Cloudflare Dashboard
2. Navigate to Workers & Pages > D1 databases
3. Select your `DBA` database
4. Go to Console tab
5. Run the SQL from `schema/trading_schema.sql`

### Option 2: Wrangler CLI

```bash
wrangler d1 execute DBA --file=./schema/trading_schema.sql
```

### Option 3: Migration Script

Deploy the migration worker and call it:

```bash
curl -X POST https://your-worker.workers.dev/migrate \
  -H "Authorization: Bearer YOUR_MIGRATION_SECRET"
```

## API Endpoints

All endpoints are prefixed with `/api/trades/`

### Trade Listings

#### GET /api/trades/listings
List all trade listings

**Query Parameters:**
- `status` - Filter by status (active, completed, cancelled)
- `category` - Filter by category
- `user_id` - Filter by user
- `search` - Search in title/description
- `limit` - Results per page (default: 20, max: 100)
- `offset` - Pagination offset
- `sort` - Sort field (created_at, updated_at, views)
- `order` - Sort order (ASC, DESC)

**Response:**
```json
{
  "listings": [
    {
      "id": 1,
      "user_id": "123456",
      "title": "Trading Epic Sword",
      "description": "Looking for cool pets",
      "category": "gears",
      "status": "active",
      "offering_items": [
        {
          "item_id": "sword_123",
          "item_name": "Epic Sword",
          "item_image": "https://..."
        }
      ],
      "seeking_items": [],
      "created_at": 1234567890000,
      "updated_at": 1234567890000,
      "views": 15,
      "user": {
        "user_id": "123456",
        "username": "CoolTrader",
        "display_name": "Cool Trader",
        "avatar_url": "https://...",
        "average_rating": 4.5,
        "total_trades": 10
      }
    }
  ],
  "limit": 20,
  "offset": 0
}
```

#### GET /api/trades/listings/:id
Get specific listing details

**Response:** Single listing object with additional fields:
- `offer_count` - Number of offers received

#### POST /api/trades/listings
Create a new listing

**Authentication Required:** Yes

**Request Body:**
```json
{
  "title": "Trading Epic Sword",
  "description": "Looking for cool pets or effects",
  "category": "gears",
  "offering_items": [
    {
      "item_id": "sword_123",
      "item_name": "Epic Sword",
      "item_image": "https://..."
    }
  ],
  "seeking_items": [
    {
      "item_id": "pet_456",
      "item_name": "Cool Pet"
    }
  ],
  "expires_in_days": 30
}
```

**Response:**
```json
{
  "id": 123,
  "message": "Listing created successfully"
}
```

#### PUT /api/trades/listings/:id
Update a listing (own listings only)

**Authentication Required:** Yes

**Request Body:** (all fields optional)
```json
{
  "title": "New title",
  "description": "New description",
  "category": "pets",
  "status": "cancelled",
  "offering_items": [...],
  "seeking_items": [...]
}
```

#### DELETE /api/trades/listings/:id
Delete/cancel a listing (own listings only)

**Authentication Required:** Yes

### Trade Offers

#### GET /api/trades/offers
List user's offers (sent and received)

**Authentication Required:** Yes

**Query Parameters:**
- `type` - Filter by type (all, sent, received)
- `status` - Filter by status (pending, accepted, rejected, cancelled, completed)

**Response:**
```json
{
  "offers": [
    {
      "id": 1,
      "listing_id": 123,
      "listing_title": "Trading Epic Sword",
      "from_user_id": "123456",
      "to_user_id": "789012",
      "offered_items": [...],
      "message": "Great trade!",
      "status": "pending",
      "created_at": 1234567890000,
      "from_user": {...},
      "to_user": {...}
    }
  ]
}
```

#### GET /api/trades/offers/:id
Get specific offer details

**Authentication Required:** Yes (must be sender or receiver)

#### POST /api/trades/offers
Create a new offer

**Authentication Required:** Yes

**Request Body:**
```json
{
  "listing_id": 123,
  "offered_items": [
    {
      "item_id": "pet_456",
      "item_name": "Cool Pet",
      "item_image": "https://..."
    }
  ],
  "message": "I'd love to trade!"
}
```

#### POST /api/trades/offers/:id/accept
Accept an offer (listing owner only)

**Authentication Required:** Yes

**Effects:**
- Sets offer status to "accepted"
- Sets listing status to "completed"
- Creates completed trade record
- Rejects all other pending offers on the listing
- Updates both users' stats
- Sends notification to offer sender

#### POST /api/trades/offers/:id/reject
Reject an offer (listing owner only)

**Authentication Required:** Yes

#### POST /api/trades/offers/:id/cancel
Cancel own offer (offer sender only)

**Authentication Required:** Yes

### Trade Messages

#### GET /api/trades/messages
Get messages for current user

**Authentication Required:** Yes

**Query Parameters:**
- `listing_id` - Filter by listing
- `offer_id` - Filter by offer
- `with_user_id` - Filter by conversation partner

**Response:**
```json
{
  "messages": [
    {
      "id": 1,
      "listing_id": 123,
      "offer_id": 456,
      "from_user_id": "123456",
      "to_user_id": "789012",
      "message": "Is this item still available?",
      "read": false,
      "created_at": 1234567890000,
      "from_user": {...},
      "to_user": {...}
    }
  ]
}
```

#### GET /api/trades/messages/conversations
Get list of conversations

**Authentication Required:** Yes

**Response:**
```json
{
  "conversations": [
    {
      "other_user": {...},
      "listing_id": 123,
      "listing_title": "Trading Epic Sword",
      "offer_id": 456,
      "last_message_at": 1234567890000,
      "unread_count": 3
    }
  ]
}
```

#### GET /api/trades/messages/unread
Get unread message count

**Authentication Required:** Yes

#### POST /api/trades/messages
Send a message

**Authentication Required:** Yes

**Request Body:**
```json
{
  "to_user_id": "789012",
  "message": "Is this item still available?",
  "listing_id": 123,
  "offer_id": 456
}
```

### Trade Inventory

#### GET /api/trades/inventory
Get user's inventory

**Authentication Optional** (can view others' inventory)

**Query Parameters:**
- `user_id` - User to get inventory for (defaults to current user)
- `for_trade` - Filter by for_trade status (true/false)

**Response:**
```json
{
  "items": [
    {
      "id": 1,
      "user_id": "123456",
      "item_id": "sword_123",
      "item_name": "Epic Sword",
      "item_image": "https://...",
      "quantity": 1,
      "for_trade": true,
      "added_at": 1234567890000
    }
  ]
}
```

#### POST /api/trades/inventory
Add item to inventory

**Authentication Required:** Yes

**Request Body:**
```json
{
  "item_id": "sword_123",
  "item_name": "Epic Sword",
  "item_image": "https://...",
  "quantity": 1,
  "for_trade": false
}
```

#### POST /api/trades/inventory/bulk
Add multiple items at once

**Authentication Required:** Yes

**Request Body:**
```json
{
  "items": [
    {
      "item_id": "sword_123",
      "item_name": "Epic Sword",
      "quantity": 1
    },
    ...
  ]
}
```

#### PUT /api/trades/inventory/:id
Update inventory item

**Authentication Required:** Yes (own items only)

**Request Body:**
```json
{
  "quantity": 2,
  "for_trade": true
}
```

#### DELETE /api/trades/inventory/:id
Remove item from inventory

**Authentication Required:** Yes (own items only)

### Trade Reviews

#### GET /api/trades/reviews
Get reviews for a user

**Query Parameters:**
- `user_id` - User to get reviews for (required)

**Response:**
```json
{
  "reviews": [...],
  "stats": {
    "total_trades": 10,
    "successful_trades": 10,
    "average_rating": 4.5,
    "total_reviews": 8
  }
}
```

#### POST /api/trades/reviews
Leave a review after trade

**Authentication Required:** Yes (must have completed trade with user)

**Request Body:**
```json
{
  "trade_id": 123,
  "rating": 5,
  "comment": "Great trader, fast and friendly!"
}
```

#### PUT /api/trades/reviews/:id
Update own review

**Authentication Required:** Yes

#### DELETE /api/trades/reviews/:id
Delete own review (or admin/moderator)

**Authentication Required:** Yes

### Trade Notifications

#### GET /api/trades/notifications
Get user's notifications

**Authentication Required:** Yes

**Query Parameters:**
- `unread_only` - Only show unread (true/false)
- `limit` - Results per page (default: 50)
- `offset` - Pagination offset

#### GET /api/trades/notifications/unread-count
Get unread notification count

**Authentication Required:** Yes

#### POST /api/trades/notifications/:id/read
Mark notification as read

**Authentication Required:** Yes

#### POST /api/trades/notifications/read-all
Mark all notifications as read

**Authentication Required:** Yes

#### DELETE /api/trades/notifications/:id
Delete notification

**Authentication Required:** Yes

## Frontend Integration

The frontend is located at `/js/trading.js` and integrates with the existing auth system.

### Key Features

- **Authentication Integration**: Automatically detects logged-in users
- **Real-time Updates**: Fetches latest listings from API
- **Filtering & Sorting**: Category, status, and sort options
- **Responsive Design**: Works on all devices
- **Error Handling**: Graceful fallback to mock data

### Usage Example

```javascript
// Create a new listing
const listing = await tradingHub.createListing({
  title: "Trading Epic Sword",
  description: "Looking for pets",
  category: "gears",
  offering_items: [
    {
      item_id: "sword_123",
      item_name: "Epic Sword",
      item_image: "https://..."
    }
  ]
});

// Make an offer
const offer = await tradingHub.submitOffer(123, {
  offered_items: [
    {
      item_id: "pet_456",
      item_name: "Cool Pet"
    }
  ],
  message: "Great trade!"
});
```

## Security & Authentication

### Authentication Flow

1. User logs in via Roblox (existing auth system)
2. Session token stored in localStorage
3. Token sent with API requests via Authorization header
4. Server verifies token using existing auth utilities

### Authorization Rules

- **Public**: View listings, reviews
- **Authenticated**: Create listings, make offers, message
- **Owner**: Edit/delete own listings and offers
- **Admin/Moderator**: Delete any reviews

### Rate Limiting

Rate limiting is handled at the auth level (existing system).

### Scammer Protection

Users with "scammer" role are blocked from trading activities.

## Usage Examples

### Complete Trade Flow

```javascript
// 1. User A creates a listing
const listing = await fetch('/api/trades/listings', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer ' + sessionToken
  },
  body: JSON.stringify({
    title: "Trading Epic Sword",
    offering_items: [{...}],
    seeking_items: [{...}]
  })
});

// 2. User B makes an offer
const offer = await fetch('/api/trades/offers', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer ' + sessionToken
  },
  body: JSON.stringify({
    listing_id: 123,
    offered_items: [{...}],
    message: "Interested!"
  })
});

// 3. User A accepts the offer
await fetch('/api/trades/offers/456/accept', {
  method: 'POST',
  headers: {
    'Authorization': 'Bearer ' + sessionToken
  }
});

// 4. Both users leave reviews
await fetch('/api/trades/reviews', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer ' + sessionToken
  },
  body: JSON.stringify({
    trade_id: 789,
    rating: 5,
    comment: "Great trader!"
  })
});
```

## Troubleshooting

### Common Issues

1. **401 Unauthorized**
   - Check that session token is valid
   - Ensure user is logged in

2. **403 Forbidden**
   - User may be trying to access/modify others' resources
   - Check if user has "scammer" role

3. **404 Not Found**
   - Verify listing/offer/message ID exists
   - Check if resource was deleted

4. **Database Errors**
   - Ensure all tables were created successfully
   - Check foreign key constraints

### Debug Mode

Enable console logging in trading.js to see API calls:

```javascript
console.log('API Response:', data);
```

## Future Enhancements

- [ ] Real-time messaging with WebSockets
- [ ] Trade value estimation
- [ ] Advanced search and filters
- [ ] Trade history export
- [ ] Mobile app integration
- [ ] Push notifications
- [ ] Item verification system
- [ ] Trade templates
- [ ] Bulk operations
- [ ] Analytics dashboard

## Support

For issues or questions:
- Check the console for error messages
- Review API response codes
- Consult this documentation
- Contact system administrator

---

**Version:** 1.0.0
**Last Updated:** 2025-10-31
**Author:** Trading System Development Team
