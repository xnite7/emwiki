# Migration 004: Convert user_id to INTEGER

## Overview

This migration converts the `user_id` column in `gallery_items` from TEXT to INTEGER for better type consistency and to match the data type used in the `users` table.

## Motivation

While TEXT user_ids worked to avoid the `.0` suffix issue mentioned in Migration 002, using INTEGER is more appropriate because:

1. **Type Consistency**: User IDs are inherently numeric (Roblox user IDs)
2. **Better Performance**: INTEGER comparisons are faster than TEXT comparisons
3. **Cleaner Code**: No need for `parseInt()` conversions in application code
4. **Reduced Storage**: INTEGERs use less space than TEXT
5. **FK Integrity**: Matches the type in the `users` table

## Changes Made

### Schema Change

**Before:**
```sql
user_id TEXT NOT NULL
```

**After:**
```sql
user_id INTEGER NOT NULL
```

### Migration Process

Since SQLite doesn't support `ALTER COLUMN`, the migration:
1. Creates a new table `gallery_items_new` with INTEGER user_id
2. Copies all existing data, casting TEXT user_id to INTEGER
3. Drops the old `gallery_items` table
4. Renames `gallery_items_new` to `gallery_items`
5. Recreates indexes for performance

## API Code Changes

The API code in `functions/api/gallery/[[path]].js` already handles user_id correctly:

### No Changes Needed

The code already works with INTEGER user_ids because:

1. **Inserts** use `user.user_id` directly (line 435):
   ```javascript
   .bind(user.user_id, title, description, ...)
   ```

2. **Queries** use parameterized queries (line 129):
   ```javascript
   .bind(user.user_id).all()
   ```

3. **Comparisons** already use `parseInt()` for likes array (line 539):
   ```javascript
   const userIdNum = parseInt(user.user_id);
   ```

4. **JOINs** work correctly:
   ```javascript
   LEFT JOIN users u ON g.user_id = u.user_id
   ```

## Running the Migration

### Local Database
```bash
wrangler d1 execute DBA --local --file=migrations/004_convert_user_id_to_integer.sql
```

### Production Database
```bash
wrangler d1 execute DBA --file=migrations/004_convert_user_id_to_integer.sql
```

## Verification

After running the migration, verify the change:

```bash
# Check new schema
wrangler d1 execute DBA --local --command="PRAGMA table_info(gallery_items)"

# Verify user_id is now INTEGER (look for type column)
# Should show: 1|user_id|INTEGER|1||0

# Check that data was preserved
wrangler d1 execute DBA --local --command="SELECT id, user_id, title FROM gallery_items LIMIT 5"

# Verify indexes were recreated
wrangler d1 execute DBA --local --command="SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='gallery_items'"
```

## Affected Tables

- ✅ `gallery_items` - user_id converted to INTEGER
- ℹ️ `users` - No changes (already has INTEGER user_id)
- ℹ️ Other tables - No changes needed

## Affected Files

### Backend Files - No Changes Needed
- ✅ `functions/api/gallery/[[path]].js` - Already compatible
- ✅ `functions/api/_utils/auth.js` - No changes needed

### Frontend Files - No Changes Needed
- ✅ `js/gallery.js` - No changes needed
- ✅ `gallery.html` - No changes needed

## Rollback Plan

If you need to rollback:

```sql
BEGIN TRANSACTION;

-- Create table with TEXT user_id
CREATE TABLE gallery_items_rollback (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  media_url TEXT NOT NULL,
  thumbnail_url TEXT,
  status INTEGER NOT NULL DEFAULT 2,
  moderated_by TEXT,
  moderated_at INTEGER,
  rejection_reason TEXT,
  created_at INTEGER NOT NULL,
  views INTEGER DEFAULT 0,
  likes TEXT DEFAULT '[]',
  FOREIGN KEY (user_id) REFERENCES users(user_id)
);

-- Copy data back, converting INTEGER to TEXT
INSERT INTO gallery_items_rollback
SELECT id, CAST(user_id AS TEXT), title, description, media_url,
       thumbnail_url, status, moderated_by, moderated_at,
       rejection_reason, created_at, views, likes
FROM gallery_items;

DROP TABLE gallery_items;
ALTER TABLE gallery_items_rollback RENAME TO gallery_items;

-- Recreate indexes
CREATE INDEX idx_gallery_user_id ON gallery_items(user_id);
CREATE INDEX idx_gallery_status ON gallery_items(status);
CREATE INDEX idx_gallery_created_at ON gallery_items(created_at);

COMMIT;
```

## Testing Checklist

After migration, test the following:

- [ ] View gallery items (GET /api/gallery)
- [ ] View specific item (GET /api/gallery/:id)
- [ ] Submit new gallery item (POST /api/gallery/submit)
- [ ] View my submissions (GET /api/gallery/my-submissions)
- [ ] Like/unlike items (POST /api/gallery/like/:id)
- [ ] Moderate items as admin (POST /api/gallery/moderate/:id)
- [ ] Delete own item (DELETE /api/gallery/:id)
- [ ] Verify user_id in database is INTEGER
- [ ] Check that JOINs with users table still work

## Benefits

1. **Type Safety**: INTEGER type matches the actual data
2. **Performance**: Faster comparisons and indexes
3. **Consistency**: Matches `users.user_id` type
4. **Storage**: More efficient storage
5. **Future-Proof**: Better foundation for future features

## Notes

- This migration is safe to run on production with existing data
- All existing user_id TEXT values will be converted to INTEGER
- Foreign key relationship with `users` table is preserved
- Indexes are recreated for optimal performance
- No API or frontend code changes required
