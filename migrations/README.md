# Database Migrations

This directory contains SQL migration files for the emwiki database.

## Gallery Feature Migration

### File: `001_create_gallery_items.sql`

This migration creates the `gallery_items` table for the community gallery feature, which allows users to submit images and videos for admin moderation.

### Running the Migration

Since this project uses Cloudflare D1 database, you need to run migrations using the Cloudflare CLI:

#### Option 1: Using wrangler CLI

```bash
# Apply migration to local D1 database
wrangler d1 execute DBA --local --file=migrations/001_create_gallery_items.sql

# Apply migration to production D1 database
wrangler d1 execute DBA --file=migrations/001_create_gallery_items.sql
```

#### Option 2: Manual SQL Execution

You can also execute the SQL directly in the Cloudflare Dashboard:

1. Go to Cloudflare Dashboard > Workers & Pages > D1
2. Select your `DBA` database
3. Go to the Console tab
4. Copy and paste the contents of `001_create_gallery_items.sql`
5. Click "Execute"

### Database Schema

The `gallery_items` table includes:

- `id` - Auto-incrementing primary key
- `user_id` - Foreign key to users table
- `username` - Display name of the user who submitted
- `title` - Title of the submission (required)
- `description` - Optional description
- `media_url` - R2 bucket URL for the image/video
- `media_type` - Either 'image' or 'video'
- `status` - One of: 'pending', 'approved', 'rejected' (default: 'pending')
- `moderated_by` - Username of admin who moderated
- `moderated_at` - Timestamp of moderation
- `rejection_reason` - Reason for rejection (if applicable)
- `created_at` - Timestamp of submission
- `views` - View counter (default: 0)

### Indexes

Three indexes are created for performance:
- `idx_gallery_user_id` - For querying by user
- `idx_gallery_status` - For filtering by status (pending/approved/rejected)
- `idx_gallery_created_at` - For sorting by date (descending)

## Future Migrations

When adding new migrations, follow this naming convention:

```
{sequence}_{description}.sql
```

Example: `002_add_gallery_categories.sql`
