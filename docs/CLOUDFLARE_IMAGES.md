# Cloudflare Images Integration

This document describes how images are managed in emwiki using Cloudflare Images.

## Overview

All item images are stored and served via Cloudflare Images, which provides:
- **Automatic Optimization**: WebP/AVIF conversion based on browser support
- **On-the-fly Resizing**: Transform images via URL parameters
- **Global CDN**: Fast delivery from Cloudflare's edge network
- **Built-in Management**: Dashboard and API for managing images

## Image URLs

Images are stored with Cloudflare Images URLs in the format:
```
https://imagedelivery.net/{account_hash}/{image_id}/public
```

Example:
```
https://imagedelivery.net/I2Jsf9fuZwSztWJZaX0DJA/ab8345ef-15aa-486a-46d2-60fc43da1b00/public
```

## Image Optimization

### Using Query Parameters

Add query parameters to image URLs for transformations:

```javascript
// Resize to 200px width
Utils.getOptimizedImage(item.img, { width: 200 })

// Square thumbnail (200x200)
Utils.getOptimizedImage(item.img, { width: 200, height: 200, fit: 'cover' })

// High quality WebP
Utils.getOptimizedImage(item.img, { width: 400, quality: 90, format: 'webp' })
```

### Available Parameters

- `width` - Target width in pixels
- `height` - Target height in pixels
- `fit` - Resize mode: `scale-down`, `contain`, `cover`, `crop`, `pad`
- `quality` - JPEG/WebP quality (1-100, default: 85)
- `format` - Output format: `webp`, `avif`, `jpeg`, `png` (auto if not specified)

### Direct URL Usage

```
/api/images/items/gears/yY4PlAA.png?width=200
/api/images/items/gears/yY4PlAA.png?width=200&height=200&fit=cover
/api/images/items/gears/yY4PlAA.png?width=400&quality=90&format=webp
```

## Uploading Images

### Admin Panel

When creating or editing items in the admin panel, images are automatically uploaded to Cloudflare Images via `/api/images/upload`.

### API Endpoint

**POST** `/api/images/upload`

**Request:**
- Content-Type: `multipart/form-data`
- Body: FormData with `file` field

**Response:**
```json
{
  "success": true,
  "id": "image-id",
  "url": "https://imagedelivery.net/.../public",
  "variants": ["..."]
}
```

## Image Serving

Images are served via `/api/images/[[path]]` endpoint which:
1. Looks up the image URL in the database
2. Redirects to Cloudflare Images URL with transformations
3. Falls back to R2 if image not found in database (during migration)

## Configuration

Required environment variables:
- `CF_ACCOUNT_ID` - Cloudflare account ID
- `CF_ACCOUNT_HASH` - Cloudflare Images account hash
- `CF_IMAGES_API_TOKEN` - Cloudflare Images API token

Set these in Cloudflare Dashboard → Pages → Settings → Environment Variables.

## Migration

All images have been migrated from local files/R2 to Cloudflare Images. The migration scripts are available in `scripts/` for reference but are no longer needed for normal operations.

