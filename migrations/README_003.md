# Simplify Views and Likes Storage

## Overview

This migration (003_simplify_views_and_likes.sql) simplifies the storage of views and likes:
1. Changes `views` from JSON array of user_ids back to simple INTEGER counter
2. Changes `likes` from array of strings to array of numbers for cleaner storage

## Why This Change?

### Views
- **Problem**: Tracking individual viewers in JSON array was overkill
- **Issue**: Array grows indefinitely, causing performance issues
- **Solution**: Simple counter is sufficient for analytics

### Likes
- **Problem**: Storing user_ids as strings like `["21313123123","21312312"]`
- **Issue**: Unnecessary quotes, larger storage, slower parsing
- **Solution**: Store as numbers: `[21313123123, 21312312]` - cleaner and more efficient

## Changes Made

### Schema Changes

**Before:**
```sql
views TEXT DEFAULT '[]'  -- JSON array: ["123", "456", "789"]
likes TEXT DEFAULT '[]'  -- JSON array: ["123", "456"]
```

**After:**
```sql
views INTEGER DEFAULT 0  -- Simple counter: 42
likes TEXT DEFAULT '[]'  -- JSON array of numbers: [123, 456]
```

### Data Migration

The migration:
1. Converts `views` JSON array to count: `["123", "456"]` → `2`
2. Converts `likes` strings to numbers: `["123", "456"]` → `[123, 456]`
3. Preserves all data during conversion

## Running the Migration

### Local Database
```bash
cd emwiki
wrangler d1 execute DBA --local --file=migrations/003_simplify_views_and_likes.sql
```

### Production Database
```bash
cd emwiki
wrangler d1 execute DBA --file=migrations/003_simplify_views_and_likes.sql
```

## API Changes

### Views Handling
**Before:** Tracked individual viewers, prevented duplicate views
```javascript
const views = JSON.parse(item.views || '[]');
if (!views.includes(user.user_id)) {
  views.push(user.user_id);
}
```

**After:** Simple counter, increments on every view
```javascript
await env.DBA.prepare(
  'UPDATE gallery_items SET views = views + 1 WHERE id = ?'
).bind(itemId).run();
```

### Likes Handling
**Before:** Stored user_ids as strings
```javascript
const likes = ["123456789", "987654321"];
likes.push(user.user_id.toString());
```

**After:** Stores user_ids as numbers
```javascript
const likes = [123456789, 987654321];
likes.push(parseInt(user.user_id));
```

## Benefits

1. **Simpler Views** - No longer tracks who viewed, just how many times
2. **Better Performance** - INTEGER counter much faster than JSON parsing
3. **Cleaner Likes** - Numbers instead of strings: `[123, 456]` vs `["123", "456"]`
4. **Smaller Storage** - Numbers are more compact than quoted strings
5. **Easier Queries** - Simple `views` column can be indexed and sorted

## Affected Files

### Backend Files (Updated):
- `functions/api/gallery/[[path]].js` - Main gallery API
- `functions/api/profile/[[path]].js` - Profile gallery posts
- `functions/gallery/[id].js` - Gallery post embeds

### Key Changes:
- Removed view tracking logic (no more checking if user already viewed)
- Changed likes from string to number parsing: `parseInt(user.user_id)`
- Simplified view increment: `SET views = views + 1`

## Frontend Impact

**No changes needed!** API still returns:
- `views`: Number (always was externally)
- `likes_count`: Number (always was externally)
- `user_liked`: Boolean (still checks if user_id in likes array)

## Verification

After running the migration:

```bash
# Check views are now integers
wrangler d1 execute DBA --local --command="SELECT id, views FROM gallery_items LIMIT 5"

# Check likes are now arrays of numbers (not strings)
wrangler d1 execute DBA --local --command="SELECT id, likes FROM gallery_items LIMIT 5"

# Verify no quotes around numbers in likes array
# Should see: [123, 456] not ["123", "456"]
```

## Rollback Plan

If needed, you can rollback by:
1. Converting views back to JSON array with empty array `'[]'`
2. Converting likes numbers back to strings

**Note**: View history is lost after this migration (only counts remain).

## Performance Impact

**Improvements:**
- ✅ Views increment is now O(1) instead of O(n) JSON parsing
- ✅ Likes parsing slightly faster (no string quotes to process)
- ✅ Database size reduced (numbers are smaller than quoted strings)
- ✅ Can now index and sort by views efficiently

**Trade-offs:**
- ⚠️ Can no longer see who viewed what (only total count)
- ⚠️ Users can view items multiple times (view count will increment)

## Summary

This migration strikes a better balance:
- **Views**: Simple counter for analytics (we don't need to track individual viewers)
- **Likes**: Still tracks who liked what, but stores IDs as numbers for efficiency
- **Result**: Cleaner code, better performance, smaller storage, same functionality
