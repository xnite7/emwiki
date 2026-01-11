# Cloudflare Images Migration Quick Start

## Your Account Details

- **Account ID**: `d9fecb3357660ea0fcfee5b23d5dd2f6`
- **Account Hash**: `I2Jsf9fuZwSztWJZaX0DJA`
- **Image Delivery URL Format**: `https://imagedelivery.net/I2Jsf9fuZwSztWJZaX0DJA/<image_id>/<variant_name>`

## Quick Start

### 1. Set API Token

Add to `emwiki/.dev.vars`:
```env
CF_IMAGES_API_TOKEN=your_api_token_here
```

The Account ID and Hash are already configured in the scripts.

### 2. Upload Images

#### From Local Filesystem (Default)
```bash
cd emwiki

# Preview what will be uploaded
node scripts/upload-images-to-cloudflare-images.js --dry-run

# Actually upload
node scripts/upload-images-to-cloudflare-images.js
```

#### From R2 Bucket
```bash
# Upload from R2 instead of local files
node scripts/upload-images-to-cloudflare-images.js --from-r2
```

#### Combined Options
```bash
# Upload from local, skip existing, and update database
node scripts/upload-images-to-cloudflare-images.js --skip-existing --update-db

# Upload from R2 and update database
node scripts/upload-images-to-cloudflare-images.js --from-r2 --update-db
```

### 3. Update Database

After uploading, update the database with new URLs:

```bash
# Generate and execute SQL
node scripts/update-db-image-urls.js

# Or preview SQL first
node scripts/update-db-image-urls.js --dry-run
```

### 4. Verify

Check that images are loading:
```bash
# Test image endpoint
curl https://emwiki.com/api/images/items/gears/yY4PlAA.png

# Should redirect to Cloudflare Images URL
```

## Image URL Format

After migration, images will be served as:
```
https://imagedelivery.net/I2Jsf9fuZwSztWJZaX0DJA/<image_id>/public
```

With transformations:
```
https://imagedelivery.net/I2Jsf9fuZwSztWJZaX0DJA/<image_id>/public?width=200&height=200&fit=scale-down
```

## Script Options

### upload-images-to-cloudflare-images.js

- `--dry-run`: Preview without uploading
- `--skip-existing`: Skip images that already exist
- `--update-db`: Update database after upload
- `--from-r2`: Upload from R2 bucket instead of local files
- `--from-local`: Upload from local filesystem (default)

### update-db-image-urls.js

- `--dry-run`: Generate SQL file without executing

## Troubleshooting

### "CF_IMAGES_API_TOKEN not set"
- Add token to `.dev.vars` or set as environment variable
- Get token from Cloudflare Dashboard → API Tokens

### "Failed to download from R2"
- Ensure Wrangler CLI is configured
- Check R2 bucket has images under `items/` prefix
- Verify bucket binding name is `MY_BUCKET`

### "Image not found" after migration
- Verify database was updated with new URLs
- Check `image-url-mapping.json` was created
- Ensure image paths match database entries

## Next Steps

1. ✅ Set API token in `.dev.vars`
2. ✅ Run upload script (dry-run first)
3. ✅ Upload images to Cloudflare Images
4. ✅ Update database with new URLs
5. ✅ Verify images load correctly

## Support

For detailed documentation, see:
- `docs/CLOUDFLARE_IMAGES_SETUP.md` - Full setup guide
- `docs/CLOUDFLARE_IMAGES_VS_R2.md` - Comparison guide


