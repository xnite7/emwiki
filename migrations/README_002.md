# Gallery Schema Restructure Migration

## Overview

This migration (002_restructure_gallery_tables.sql) restructures the gallery system to:
1. Fix the `.0` suffix issue with user_id storage
2. Consolidate `gallery_likes` table into `gallery_items`
3. Remove redundant columns
4. Change status from TEXT to INTEGER
5. Track individual viewers and likers (not just counts)

## Changes Made

### 1. Fixed user_id Storage
- **Problem**: D1 (SQLite) was storing numeric user_ids in TEXT columns with `.0` suffix
- **Solution**: All user_ids are now explicitly stored as TEXT without `.0` suffix
- **Affected tables**: `gallery_items`, `auth_codes`

### 2. Consolidated Tables
- **Before**: Separate `gallery_items` and `gallery_likes` tables
- **After**: Single `gallery_items` table with `likes` JSON array
- **Benefits**: Simpler queries, no JOIN needed, can track who liked what

### 3. Removed Redundant Columns
- **username**: Removed (can be fetched from `users` table via `user_id`)
- **media_type**: Removed (can be determined from file extension in `media_url`)

### 4. Changed Status Column
- **Before**: TEXT values ('pending', 'approved', 'rejected')
- **After**: INTEGER values (2=pending, 1=approved, 0=rejected)
- **Benefits**: More efficient storage and queries

### 5. Enhanced Tracking
- **views**: Changed from simple counter to JSON array of user_ids
  - Can see exactly who viewed each item
  - Prevents duplicate view counting
- **likes**: Changed from separate table to JSON array of user_ids
  - Can see exactly who liked each item
  - Prevents duplicate likes

## New Schema

```sql
CREATE TABLE gallery_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,                    -- Fixed: no .0 suffix
  title TEXT NOT NULL,
  description TEXT,
  media_url TEXT NOT NULL,
  status INTEGER NOT NULL DEFAULT 2,        -- Changed: 0=rejected, 1=approved, 2=pending
  moderated_by TEXT,
  moderated_at INTEGER,
  rejection_reason TEXT,
  created_at INTEGER NOT NULL,
  views TEXT DEFAULT '[]',                  -- Changed: JSON array of user_ids
  likes TEXT DEFAULT '[]',                  -- Changed: JSON array of user_ids
  thumbnail_url TEXT,
  FOREIGN KEY (user_id) REFERENCES users(user_id)
);
```

## Running the Migration

### Local Database
```bash
cd emwiki
wrangler d1 execute DBA --local --file=migrations/002_restructure_gallery_tables.sql
```

### Production Database
```bash
cd emwiki
wrangler d1 execute DBA --file=migrations/002_restructure_gallery_tables.sql
```

## Verification

After running the migration, verify it worked:

```bash
# Check that gallery_items has the new schema
wrangler d1 execute DBA --local --command="PRAGMA table_info(gallery_items)"

# Check that gallery_likes table was dropped
wrangler d1 execute DBA --local --command="SELECT name FROM sqlite_master WHERE type='table'"

# Check that likes were migrated correctly
wrangler d1 execute DBA --local --command="SELECT id, likes FROM gallery_items LIMIT 5"

# Check that user_ids don't have .0 suffix
wrangler d1 execute DBA --local --command="SELECT user_id FROM gallery_items LIMIT 5"
```

## API Changes

The API endpoints have been updated to work with the new schema while maintaining backwards compatibility:

### Backwards Compatibility
The API still returns:
- `media_type`: Computed from file extension
- `likes_count`: Computed from `likes` JSON array length
- `views`: Computed from `views` JSON array length
- `status`: Returned as string ('pending', 'approved', 'rejected')

### Internal Changes
- Queries use `status = 1` instead of `status = 'approved'`
- Likes are managed via JSON array updates instead of separate table
- Views are tracked per-user in JSON array

## Affected Files

### Updated Backend Files:
- `functions/api/gallery/[[path]].js` - Main gallery API
- `functions/api/profile/[[path]].js` - Profile gallery posts
- `functions/gallery/[id].js` - Gallery post embeds

### Frontend Files:
- No changes needed! API maintains backwards compatibility

### Migration Files:
- `migrations/002_restructure_gallery_tables.sql` - The migration
- `migrations/README_002.md` - This documentation

## Rollback Plan

If you need to rollback, you would need to:
1. Recreate the old `gallery_items` and `gallery_likes` tables
2. Parse the JSON arrays back into the old structure
3. Convert status back to TEXT

**Warning**: It's recommended to backup your database before running this migration.

## Benefits Summary

1. **No more .0 suffix bug** - user_ids are stored correctly as TEXT
2. **Simpler schema** - One table instead of two
3. **Better tracking** - Know exactly who viewed/liked each item
4. **Prevent duplicate actions** - Users can't view/like multiple times
5. **More efficient** - No JOINs needed for likes
6. **Cleaner API code** - Removed fallback queries for missing gallery_likes table
