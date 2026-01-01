# Gallery Feature Documentation

## Overview

The Gallery feature allows users to submit images and videos from their Epic Minigames experiences. All submissions go through admin moderation before appearing in the public gallery.

## Features

### For Users
- **Upload Media**: Submit images (JPEG, PNG, GIF, WebP) and videos (MP4, WebM, MOV)
- **View Gallery**: Browse approved community submissions
- **Track Submissions**: View status of your own submissions (pending, approved, rejected)
- **Delete Own Content**: Remove your own submissions

### For Admins
- **Moderation Queue**: View all pending submissions
- **Approve/Reject**: Moderate content with optional rejection reasons
- **Auto-refresh**: Pending items refresh every 30 seconds

## Architecture

### Frontend

#### Pages
- **`gallery.html`**: Main gallery page with:
  - Public gallery grid (approved items only)
  - Upload modal for authenticated users
  - My Submissions modal
  - Media viewer modal

- **`admin.html`**: Admin panel with new "Gallery Moderation" section

#### Styles
- **`css/gallery.css`**: Complete gallery styling with:
  - Responsive grid layout
  - Modal designs
  - Upload progress bars
  - Status badges

#### JavaScript
- **`js/gallery.js`**: Gallery functionality including:
  - Upload handling with file validation
  - Gallery loading with pagination
  - Modal management
  - Submission tracking

### Backend

#### API Endpoints

**`/api/gallery/[[path]].js`** - Gallery API with the following endpoints:

##### Public Endpoints
- `GET /api/gallery` - List approved gallery items
  - Query params: `limit` (default: 50), `offset` (default: 0)
  - Returns: `{ items: [...] }`

##### Authenticated Endpoints
- `POST /api/gallery/upload` - Upload media file to Cloudflare Images/Stream
  - Body: `FormData` with `file`
  - Returns: `{ url, type, cf_id, provider }` for images, `{ url, type, stream_uid, iframe_url, provider }` for videos
  - Validates: file type, file size (10MB images, 100MB videos)

- `POST /api/gallery/submit` - Submit gallery item
  - Body: `{ title, description, media_url, media_type }`
  - Returns: `{ success, id, message }`
  - Status: 'pending' by default

- `GET /api/gallery/my-submissions` - Get user's submissions
  - Returns: `{ items: [...] }` with all statuses

- `DELETE /api/gallery/:id` - Delete own submission
  - Requires: ownership or admin role
  - Also deletes file from Cloudflare Images/Stream

##### Admin-Only Endpoints
- `GET /api/gallery/pending` - List pending submissions
  - Requires: admin or moderator role
  - Returns: `{ items: [...] }`

- `POST /api/gallery/moderate/:id` - Approve or reject item
  - Body: `{ action: 'approve'|'reject', reason?: string }`
  - Requires: admin or moderator role
  - Updates status and records moderator info

### Database

#### Table: `gallery_items`

```sql
CREATE TABLE gallery_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  username TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  media_url TEXT NOT NULL,
  media_type TEXT NOT NULL CHECK(media_type IN ('image', 'video')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'approved', 'rejected')),
  moderated_by TEXT,
  moderated_at INTEGER,
  rejection_reason TEXT,
  created_at INTEGER NOT NULL,
  views INTEGER DEFAULT 0,
  FOREIGN KEY (user_id) REFERENCES users(user_id)
);
```

**Indexes:**
- `idx_gallery_user_id` - Fast user queries
- `idx_gallery_status` - Fast status filtering
- `idx_gallery_created_at` - Sorted chronological queries

### Storage

Media files are stored in **Cloudflare Images** (for images) and **Cloudflare Stream** (for videos):

**Images:**
- Service: Cloudflare Images API
- URL format: `https://imagedelivery.net/{accountHash}/{imageId}/public`
- Custom ID format: `gallery-{user_id}-{timestamp}-{random}`
- Automatic optimization and WebP/AVIF conversion

**Videos:**
- Service: Cloudflare Stream API
- URL format: `https://customer-{accountId}.cloudflarestream.com/{streamUid}/manifest/video.m3u8` (HLS)
- Iframe embed: `https://iframe.videodelivery.net/{streamUid}`
- Automatic transcoding and adaptive bitrate streaming

**Thumbnails:**
- Video thumbnails are generated client-side and uploaded to Cloudflare Images

## Setup Instructions

### 1. Run Database Migration

```bash
# Local database
wrangler d1 execute DBA --local --file=migrations/001_create_gallery_items.sql

# Production database
wrangler d1 execute DBA --file=migrations/001_create_gallery_items.sql
```

### 2. Configure Cloudflare Images & Stream

Add the following environment variables to your `.dev.vars` (local) or Cloudflare Dashboard (production):

```bash
# Cloudflare Images Configuration
CF_ACCOUNT_ID=your-account-id
CF_ACCOUNT_HASH=your-account-hash
CF_IMAGES_API_TOKEN=your-images-api-token

# Cloudflare Stream Configuration (optional, uses CF_IMAGES_API_TOKEN if not set)
CLOUDFLARE_STREAM_TOKEN=your-stream-api-token
```

To get these values:
1. **CF_ACCOUNT_ID**: Cloudflare Dashboard → Account Home → Account ID (sidebar)
2. **CF_ACCOUNT_HASH**: Cloudflare Dashboard → Images → Overview → Account Hash
3. **CF_IMAGES_API_TOKEN**: Create API token with "Cloudflare Images" + "Cloudflare Stream" permissions

### 3. Deploy

```bash
# Deploy to Cloudflare Workers
wrangler deploy
```

### 4. Test

1. Visit `/gallery` page
2. Log in with Roblox account
3. Click "Upload Media"
4. Submit test image/video
5. As admin, visit `/admin`
6. Check "Gallery Moderation" section
7. Approve/reject the submission

## File Validation

### Supported Formats

**Images:**
- JPEG (`image/jpeg`)
- PNG (`image/png`)
- GIF (`image/gif`)
- WebP (`image/webp`)

**Videos:**
- MP4 (`video/mp4`)
- WebM (`video/webm`)
- MOV (`video/quicktime`)

### Size Limits
- Maximum file size: 100MB
- Enforced at upload endpoint

## Security

### Authentication
- Uses existing Roblox authentication system
- Session tokens via `localStorage['auth_token']`
- Bearer token authentication for API calls

### Authorization
- Public: View approved gallery items
- Authenticated Users: Upload, view own submissions, delete own content
- Admins/Moderators: Access pending items, moderate all content

### Input Validation
- File type checking (MIME type)
- File size limits
- Title/description length limits
- XSS protection (escapeHtml utility)

## User Flow

### Submission Flow
1. User logs in
2. Clicks "Upload Media" button
3. Selects file (preview shown)
4. For videos: thumbnail generated from first frame
5. Enters title and optional description
6. Submits for review
7. File uploads to Cloudflare Images (images) or Cloudflare Stream (videos)
8. Thumbnail uploaded to Cloudflare Images (for videos)
9. Database entry created with status='pending' (or 'approved' for VIP/admins)
10. Success message shown

### Moderation Flow
1. Admin logs into admin panel
2. Views "Gallery Moderation" section
3. Reviews pending submissions (auto-refreshes every 30s)
4. Clicks "Approve" or "Reject"
5. For rejection, enters optional reason
6. Status updates in database
7. Item appears in public gallery (if approved) or user sees rejection (if rejected)

### Viewing Flow
1. Anyone visits `/gallery`
2. Approved items load in grid (24 per page)
3. Click item to view full-size in modal
4. Video plays in viewer
5. View counter increments (future feature)

## Admin Features

### Gallery Moderation Panel

Located in Admin Panel at `/admin` under "Gallery Moderation" section.

**Features:**
- Real-time pending items display
- Media preview (images/videos)
- Submission metadata (title, description, user, date)
- One-click approve/reject buttons
- Optional rejection reason
- Auto-refresh every 30 seconds

**Permissions:**
- Requires admin or moderator role
- Checks user roles from `users.role` JSON array

## Future Enhancements

Potential improvements:

1. **View Counter**: Track and display view counts
2. **Categories**: Add categories/tags for filtering
3. **Likes/Comments**: Social features
4. **Reporting**: Allow users to report inappropriate content
5. **Batch Moderation**: Approve/reject multiple items at once
6. **Search/Filter**: Search by title, filter by user, date range
7. **Featured Items**: Highlight exceptional submissions
8. **User Galleries**: Dedicated page per user
9. **Download Statistics**: Track downloads
10. **Notifications**: Notify users when their submission is moderated

## Troubleshooting

### Upload Fails
- Check file size (10MB for images, 100MB for videos)
- Verify file type is supported
- Ensure user is authenticated
- Check CF_IMAGES_API_TOKEN is valid

### Items Not Appearing
- Verify database migration ran successfully
- Check item status (must be 'approved' for public gallery)
- Look for console errors in browser

### Admin Can't Moderate
- Verify admin has 'admin' or 'moderator' in roles array
- Check session token is valid
- Ensure admin is logged in

### Cloudflare Images/Stream Upload Issues
- Verify CF_ACCOUNT_ID and CF_IMAGES_API_TOKEN are set
- Check API token has "Cloudflare Images" and "Cloudflare Stream" permissions
- Verify account has Cloudflare Images enabled (it's a paid feature)
- For videos: ensure CLOUDFLARE_STREAM_TOKEN is set if using separate token

## API Response Examples

### GET /api/gallery
```json
{
  "items": [
    {
      "id": 1,
      "user_id": 123456789,
      "username": "EpicGamer123",
      "title": "Amazing Victory!",
      "description": "Won the final minigame!",
      "media_url": "https://imagedelivery.net/I2Jsf9fuZwSztWJZaX0DJA/gallery-123456789-1234567890-abc123/public",
      "thumbnail_url": null,
      "created_at": 1698765432000,
      "views": 42,
      "likes_count": 5,
      "user_liked": false
    }
  ]
}
```

### POST /api/gallery/submit
```json
{
  "success": true,
  "id": 5,
  "message": "Submission received! It will be reviewed by admins before appearing in the gallery."
}
```

### GET /api/gallery/pending (Admin)
```json
{
  "items": [
    {
      "id": 3,
      "user_id": 987654321,
      "username": "ProPlayer456",
      "title": "Epic Clutch Moment",
      "description": "Last second win!",
      "media_url": "https://customer-d9fecb3357660ea0fcfee5b23d5dd2f6.cloudflarestream.com/abc123def456/manifest/video.m3u8",
      "thumbnail_url": "https://imagedelivery.net/I2Jsf9fuZwSztWJZaX0DJA/gallery-thumb-987654321-1234567890-xyz/public",
      "status": 2,
      "created_at": 1698765432000,
      "views": 0
    }
  ]
}
```

## Migrating from R2 to Cloudflare Images

If you have legacy gallery items stored in R2, use the migration scripts:

```bash
# Preview what would be migrated
node scripts/migrate-gallery-r2-to-images.js --dry-run

# Run the migration
node scripts/migrate-gallery-r2-to-images.js

# After migration, clean up R2 objects
node scripts/cleanup-gallery-r2-after-migration.js --dry-run
node scripts/cleanup-gallery-r2-after-migration.js --confirm-delete
```

Required environment variables for migration:
- `CLOUDFLARE_API_TOKEN` - API token with R2 read + Images write permissions
- `CF_ACCOUNT_ID` - Cloudflare account ID
- `D1_DATABASE_ID` - D1 database ID
- `R2_BUCKET_NAME` - R2 bucket name (default: `emwiki-media`)

## Credits

- Built with Cloudflare Workers, D1, Cloudflare Images, and Cloudflare Stream
- Uses existing emwiki authentication system
- Responsive design with CSS custom properties
- Vanilla JavaScript (no frameworks)
