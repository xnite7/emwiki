# R2 Image Migration Guide

This guide explains how to migrate item images from local filesystem storage to Cloudflare R2 with automatic image optimization.

## Overview

Item images are now served from Cloudflare R2 instead of local files. This provides:
- **Better Performance**: Images served from Cloudflare's global edge network
- **Automatic Optimization**: Cloudflare Image Resizing for format conversion (WebP/AVIF) and resizing
- **Scalability**: No need to manage local image files
- **Cost Efficiency**: R2 storage is more cost-effective than serving static files

## Architecture

### Image Storage
- Images are stored in R2 bucket under `items/` prefix
- Structure: `items/{category}/{filename}.{ext}`
- Example: `items/gears/yY4PlAA.png`

### Image Serving
- Endpoint: `/api/images/[[path]]`
- Automatically converts old paths (`imgs/gears/file.png`) to R2 paths (`items/gears/file.png`)
- Supports Cloudflare Image Resizing via query parameters

### Image Optimization

Cloudflare automatically optimizes images when Image Resizing is enabled:

1. **Format Optimization**: Automatically converts to WebP/AVIF based on browser support
2. **Resizing**: Use query parameters for on-the-fly resizing
3. **Quality Control**: Adjust JPEG/WebP quality

#### Query Parameters

- `width`: Target width in pixels
- `height`: Target height in pixels
- `quality`: JPEG/WebP quality (1-100, default: 85)
- `format`: Output format (webp, avif, jpeg, png)
- `fit`: Resize fit mode (scale-down, contain, cover, crop, pad)

#### Examples

```
# Original image
/api/images/items/gears/yY4PlAA.png

# Resized to 200x200
/api/images/items/gears/yY4PlAA.png?width=200&height=200

# WebP format with quality 85
/api/images/items/gears/yY4PlAA.png?format=webp&quality=85

# Resized WebP
/api/images/items/gears/yY4PlAA.png?width=200&height=200&format=webp&quality=90
```

## Migration Steps

### 1. Enable Cloudflare Image Resizing

1. Go to Cloudflare Dashboard
2. Navigate to **Speed** → **Optimization** → **Image Resizing**
3. Enable **Image Resizing**
4. Configure settings as needed

### 2. Upload Images to R2

Use the migration script to upload all images:

```bash
cd emwiki
node scripts/upload-images-to-r2.js
```

Or manually upload using Wrangler:

```bash
# Upload a single image
wrangler r2 object put items/gears/yY4PlAA.png \
  --file=./imgs/gears/yY4PlAA.png \
  --content-type=image/png

# Upload entire directory (requires custom script or manual upload)
```

### 3. Verify Images

After uploading, verify images are accessible:

```bash
# Check if image exists in R2
wrangler r2 object head items/gears/yY4PlAA.png

# Test image endpoint
curl https://emwiki.com/api/images/items/gears/yY4PlAA.png
```

### 4. Update Database (Optional)

If you want to update image paths in the database:

```sql
-- Update all image paths to use R2 URLs
UPDATE items 
SET img = 'https://emwiki.com/api/images/' || 
    REPLACE(REPLACE(img, 'imgs/', 'items/'), '\\', '/')
WHERE img IS NOT NULL AND img NOT LIKE 'http%';
```

**Note**: The API automatically normalizes image URLs, so database updates are optional.

## Code Changes

### API Endpoints

The `/api/items` endpoints now automatically normalize image URLs:

```javascript
// Old format (still works)
img: "imgs/gears/yY4PlAA.png"

// Automatically converted to
img: "https://emwiki.com/api/images/items/gears/yY4PlAA.png"
```

### Frontend

No changes needed! The frontend code continues to work as before. Images are automatically served from R2.

## Image Optimization Best Practices

### 1. Use Appropriate Formats

- **PNG**: For images with transparency or sharp edges
- **JPEG**: For photos or images without transparency
- **WebP**: Automatically served when browser supports it (via Cloudflare)
- **AVIF**: Best compression, automatically served when supported

### 2. Lazy Loading

Images are automatically optimized, but consider lazy loading for better performance:

```html
<img src="/api/images/items/gears/file.png" loading="lazy" />
```

### 3. Responsive Images

Use query parameters for responsive images:

```html
<!-- Small screens -->
<img src="/api/images/items/gears/file.png?width=200" 
     srcset="/api/images/items/gears/file.png?width=400 2x" />

<!-- Large screens -->
<img src="/api/images/items/gears/file.png?width=400" 
     srcset="/api/images/items/gears/file.png?width=800 2x" />
```

## Troubleshooting

### Images Not Loading

1. **Check R2 bucket**: Verify images are uploaded
   ```bash
   wrangler r2 object list --prefix=items/
   ```

2. **Check endpoint**: Test the image API endpoint
   ```bash
   curl -I https://emwiki.com/api/images/items/gears/yY4PlAA.png
   ```

3. **Check CORS**: Ensure CORS headers are set (already configured)

### Image Optimization Not Working

1. **Verify Image Resizing is enabled** in Cloudflare dashboard
2. **Check query parameters** are correct
3. **Verify domain** is proxied through Cloudflare (orange cloud)

### Migration Issues

If migration script fails:

1. **Check file paths**: Ensure images exist in `emwiki/imgs/`
2. **Check Wrangler config**: Verify R2 bucket binding is correct
3. **Manual upload**: Upload images manually using Wrangler CLI

## Cost Considerations

### R2 Storage
- **Storage**: $0.015 per GB/month
- **Class A Operations** (writes): $4.50 per million
- **Class B Operations** (reads): $0.36 per million

### Image Resizing
- **Free tier**: 100,000 images/month
- **Paid**: $1 per 100,000 images after free tier

### Estimated Costs

For a catalog with ~1000 images:
- **Storage**: ~100MB = $0.0015/month
- **Operations**: Minimal for catalog images
- **Resizing**: Free tier covers most use cases

## Future Enhancements

1. **CDN Caching**: Images are cached at Cloudflare edge
2. **Progressive Loading**: Consider implementing progressive image loading
3. **Image Preloading**: Preload critical images
4. **Format Detection**: Automatically detect best format per image type

