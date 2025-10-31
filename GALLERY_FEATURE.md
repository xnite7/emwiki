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
- `POST /api/gallery/upload` - Upload media file to R2
  - Body: `FormData` with `file`
  - Returns: `{ url, type }`
  - Validates: file type, file size (max 100MB)

- `POST /api/gallery/submit` - Submit gallery item
  - Body: `{ title, description, media_url, media_type }`
  - Returns: `{ success, id, message }`
  - Status: 'pending' by default

- `GET /api/gallery/my-submissions` - Get user's submissions
  - Returns: `{ items: [...] }` with all statuses

- `DELETE /api/gallery/:id` - Delete own submission
  - Requires: ownership or admin role
  - Also deletes file from R2 bucket

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

Media files are stored in Cloudflare R2 bucket (`MY_BUCKET`) with the following structure:

```
gallery/
  {user_id}/
    {timestamp}-{random}.{ext}
```

Public URL format: `https://pub-49351598fde84dec89feb871921190e9.r2.dev/gallery/...`

## Setup Instructions

### 1. Run Database Migration

```bash
# Local database
wrangler d1 execute DBA --local --file=migrations/001_create_gallery_items.sql

# Production database
wrangler d1 execute DBA --file=migrations/001_create_gallery_items.sql
```

### 2. Verify R2 Bucket

Ensure `MY_BUCKET` is configured in your Cloudflare Workers environment:

```toml
# wrangler.toml
[[r2_buckets]]
binding = "MY_BUCKET"
bucket_name = "your-bucket-name"
```

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
4. Enters title and optional description
5. Submits for review
6. File uploads to R2
7. Database entry created with status='pending'
8. Success message shown

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
- Check file size (< 100MB)
- Verify file type is supported
- Ensure user is authenticated
- Check R2 bucket permissions

### Items Not Appearing
- Verify database migration ran successfully
- Check item status (must be 'approved' for public gallery)
- Look for console errors in browser

### Admin Can't Moderate
- Verify admin has 'admin' or 'moderator' in roles array
- Check session token is valid
- Ensure admin is logged in

### R2 Upload Issues
- Verify MY_BUCKET binding exists
- Check bucket CORS settings if needed
- Verify bucket is public or has correct access policies

## API Response Examples

### GET /api/gallery
```json
{
  "items": [
    {
      "id": 1,
      "user_id": "123456789",
      "username": "EpicGamer123",
      "title": "Amazing Victory!",
      "description": "Won the final minigame!",
      "media_url": "https://pub-49351598fde84dec89feb871921190e9.r2.dev/gallery/123456789/1234567890-abc123.jpg",
      "media_type": "image",
      "created_at": 1698765432000,
      "views": 42
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
      "user_id": "987654321",
      "username": "ProPlayer456",
      "title": "Epic Clutch Moment",
      "description": "Last second win!",
      "media_url": "https://pub-49351598fde84dec89feb871921190e9.r2.dev/gallery/987654321/1234567890-def456.mp4",
      "media_type": "video",
      "status": "pending",
      "created_at": 1698765432000,
      "views": 0
    }
  ]
}
```

## Credits

- Built with Cloudflare Workers, D1, and R2
- Uses existing emwiki authentication system
- Responsive design with CSS custom properties
- Vanilla JavaScript (no frameworks)
