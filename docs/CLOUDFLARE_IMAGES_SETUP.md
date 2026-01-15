# Cloudflare Images Setup Guide

This guide explains how to migrate from local/R2 image storage to Cloudflare Images.

## Overview

Cloudflare Images provides:
- ✅ **Automatic optimization**: WebP/AVIF conversion
- ✅ **Built-in resizing**: URL-based transformations
- ✅ **Global CDN**: Fast delivery worldwide
- ✅ **100k free images**: Perfect for catalog images
- ✅ **Simple API**: Easy upload and management

## Prerequisites

1. **Cloudflare Account** with Images enabled
2. **API Token** with Images permissions
3. **Account ID** from Cloudflare dashboard

## Step 1: Get Cloudflare Images Credentials

### 1.1 Get Account ID

1. Go to [Cloudflare Dashboard](https://dash.cloudflare.com)
2. Select your account
3. Copy your **Account ID** from the right sidebar

### 1.2 Create API Token

1. Go to [API Tokens](https://dash.cloudflare.com/profile/api-tokens)
2. Click **"Create Token"**
3. Use **"Edit Cloudflare Images"** template, or create custom token with:
   - **Permissions**: `Account` → `Cloudflare Images` → `Edit`
   - **Account Resources**: Include your account
4. Click **"Continue to summary"** → **"Create Token"**
5. **Copy the token** (you won't see it again!)

## Step 2: Configure Environment Variables

### Local Development (.dev.vars)

Add to `emwiki/.dev.vars`:

```env
# Cloudflare Images Configuration
CF_ACCOUNT_ID=your_account_id_here
CF_IMAGES_API_TOKEN=your_api_token_here
```

### Production (Cloudflare Dashboard)

1. Go to your Cloudflare Pages project
2. Navigate to **Settings** → **Environment Variables**
3. Add:
   - `CF_ACCOUNT_ID` = your account ID
   - `CF_IMAGES_API_TOKEN` = your API token (mark as **Secret**)

## Step 3: Upload Images

### 3.1 Install Dependencies

The upload script uses `form-data` package:

```bash
cd emwiki
npm install form-data
```

### 3.2 Run Upload Script

```bash
# Dry run (preview what will be uploaded)
node scripts/upload-images-to-cloudflare-images.js --dry-run

# Actually upload images
node scripts/upload-images-to-cloudflare-images.js

# Skip existing images (if re-running)
node scripts/upload-images-to-cloudflare-images.js --skip-existing

# Upload and update database
node scripts/upload-images-to-cloudflare-images.js --update-db
```

The script will:
1. Read `items.json` to find all image paths
2. Upload each image to Cloudflare Images
3. Create `image-url-mapping.json` with old path → new URL mapping

## Step 4: Update Database

### 4.1 Generate SQL File

```bash
# Generate SQL file (dry run)
node scripts/update-db-image-urls.js --dry-run

# Generate and execute SQL file
node scripts/update-db-image-urls.js
```

### 4.2 Manual Database Update

If you prefer to update manually:

```bash
# Generate SQL file only
node scripts/update-db-image-urls.js --dry-run

# Review the generated SQL file
cat migrations/012_update_image_urls.sql

# Execute manually
wrangler d1 execute DBA --file=migrations/012_update_image_urls.sql

# Or for local database
wrangler d1 execute DBA --local --file=migrations/012_update_image_urls.sql
```

## Step 5: Verify Migration

### 5.1 Check Image URLs

Query the database to verify URLs are updated:

```sql
SELECT name, img FROM items WHERE img LIKE '%imagedelivery.net%' LIMIT 10;
```

### 5.2 Test Image Endpoint

```bash
# Test image serving endpoint
curl https://emwiki.com/api/images/items/gears/yY4PlAA.png

# Should redirect to Cloudflare Images URL
```

### 5.3 Test Image Transformations

Cloudflare Images supports URL-based transformations:

```
# Resize to 200x200
/api/images/items/gears/yY4PlAA.png?width=200&height=200

# Scale down (maintain aspect ratio)
/api/images/items/gears/yY4PlAA.png?width=200&fit=scale-down

# Quality adjustment
/api/images/items/gears/yY4PlAA.png?width=200&quality=90
```

## Image URL Format

### Cloudflare Images URLs

Cloudflare Images URLs look like:
```
https://imagedelivery.net/{account_hash}/{image_id}/public
```

### Transformations

Add query parameters for transformations:
```
https://imagedelivery.net/{account_hash}/{image_id}/public?width=200&height=200&fit=scale-down
```

### Variants

Cloudflare Images supports variants:
- `/public` - Public optimized variant (default)
- `/thumbnail` - Thumbnail variant (if configured)
- Custom variants can be created in dashboard

## API Endpoints

### Upload Image

```
POST /api/images/upload
Content-Type: multipart/form-data

Body:
  file: <image file>

Response:
{
  "success": true,
  "id": "image_id",
  "url": "https://imagedelivery.net/.../public",
  "variants": [...]
}
```

### Serve Image

```
GET /api/images/{path}

Query Parameters:
  width: Target width in pixels
  height: Target height in pixels
  fit: Resize fit mode (scale-down, contain, cover, crop, pad)
  quality: JPEG/WebP quality (1-100)

Example:
GET /api/images/items/gears/yY4PlAA.png?width=200&height=200
```

## Migration Checklist

- [ ] Get Cloudflare Account ID
- [ ] Create API Token with Images permissions
- [ ] Add environment variables to `.dev.vars`
- [ ] Add environment variables to Cloudflare Dashboard
- [ ] Install dependencies (`npm install form-data`)
- [ ] Run upload script (dry run first)
- [ ] Upload all images to Cloudflare Images
- [ ] Generate database update SQL
- [ ] Review and execute database update
- [ ] Verify images are loading correctly
- [ ] Test image transformations

## Troubleshooting

### "CF_ACCOUNT_ID not set"

Ensure environment variables are set:
- Check `.dev.vars` for local development
- Check Cloudflare Dashboard → Pages → Environment Variables for production

### "Upload failed: 401 Unauthorized"

- Verify API token is correct
- Check token has Images permissions
- Ensure Account ID matches your account

### "Image not found" after migration

- Verify database was updated with new URLs
- Check `image-url-mapping.json` exists
- Ensure image path matches database entry

### Images not optimizing

- Cloudflare Images automatically optimizes format (WebP/AVIF)
- Check browser supports these formats
- Verify image URL is correct Cloudflare Images URL

## Cost Considerations

### Free Tier
- **100,000 images stored** per month
- **100,000 images delivered** per month
- Perfect for catalog images!

### Paid Tier (after free tier)
- Storage: $5 per 100,000 images/month
- Delivery: $1 per 100,000 images/month

### Estimated Costs

For ~1,000 catalog images:
- **Storage**: Free (within 100k limit)
- **Delivery**: Free (within 100k limit)
- **Total**: $0/month ✅

## Best Practices

1. **Use public variant**: Always use `/public` variant for catalog images
2. **Lazy loading**: Implement lazy loading for better performance
3. **Responsive images**: Use width/height parameters for responsive images
4. **Cache headers**: Cloudflare Images sets optimal cache headers automatically
5. **Format optimization**: Let Cloudflare handle format conversion (WebP/AVIF)

## Next Steps

After migration:
1. Monitor image delivery in Cloudflare Dashboard
2. Consider creating custom variants for thumbnails
3. Implement lazy loading for better performance
4. Use image transformations for responsive images

## Support

For issues:
- Check [Cloudflare Images Documentation](https://developers.cloudflare.com/images/)
- Review upload script logs
- Check database for correct URLs
- Verify environment variables are set



