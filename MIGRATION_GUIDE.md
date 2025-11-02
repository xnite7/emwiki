# 📦 Image Migration to R2 - Complete Guide

This guide walks you through migrating all local images from `/imgs/` to your Cloudflare R2 bucket and updating all references to use the CDN URLs.

## 📋 Overview

**What this does:**
- Uploads all 91MB of images from `/imgs/` to your R2 bucket
- Preserves the directory structure (`imgs/gears/`, `imgs/pets/`, etc.)
- Updates `items.json` with new CDN URLs
- Updates your GitHub gist with the new references

**Current state:**
- Local images: `/imgs/` directory (91MB, ~1000+ files)
- R2 bucket: `MY_BUCKET` (already configured)
- CDN domain: `https://cdn.emwiki.com/`
- Gist ID: `0d0a3800287f3e7c6e5e944c8337fa91`

---

## 🚀 Quick Start

### Prerequisites

1. **Node.js installed** (v14 or higher)
2. **form-data package** installed:
   ```bash
   npm install form-data
   ```

### Step-by-Step Process

#### 1. Deploy the bulk upload endpoint

First, you need to deploy the new bulk upload function to Cloudflare Pages:

```bash
# Commit and push the new endpoint
git add functions/api/bulk-upload-images.js
git commit -m "Add bulk upload endpoint for R2 migration"
git push
```

Wait for Cloudflare Pages to deploy (~1-2 minutes).

#### 2. Update the migration script with your site URL

Open `migrate-images-to-r2.js` and update line 21:

```javascript
const UPLOAD_ENDPOINT = 'https://YOUR-SITE.pages.dev/api/bulk-upload-images';
```

Replace with your actual Cloudflare Pages URL (e.g., `https://emwiki.pages.dev/api/bulk-upload-images`).

#### 3. Run the migration

```bash
node migrate-images-to-r2.js
```

This will:
- Scan all images in `/imgs/` directory
- Upload them in batches of 10 files
- Save a mapping file (`image-url-mapping.json`)
- Update `items.json` with new R2 URLs
- Create a backup (`items.json.backup`)

**Estimated time:** 5-10 minutes depending on connection speed

#### 4. Verify the changes

Check a few random images:

```bash
# View the URL mapping
cat image-url-mapping.json | head -20

# Test a few URLs
curl -I https://cdn.emwiki.com/imgs/gears/yY4PlAA.png
curl -I https://cdn.emwiki.com/imgs/pets/cat-icon.png
```

#### 5. Test locally

If you have a local development server:

```bash
# Start your dev server and check if images load
npx wrangler pages dev
```

Visit your catalog page and verify images are loading from R2.

#### 6. Update the gist

Once you've verified everything works:

```bash
node update-gist-from-items.js
```

This will update the GitHub gist with the new R2 URLs.

#### 7. Commit and deploy

```bash
git add items.json image-url-mapping.json
git commit -m "Migrate all images to R2 bucket"
git push
```

---

## 📁 Files Created

| File | Purpose |
|------|---------|
| `functions/api/bulk-upload-images.js` | Worker endpoint for bulk uploads to R2 |
| `migrate-images-to-r2.js` | Main migration script |
| `update-gist-from-items.js` | Updates GitHub gist with new data |
| `image-url-mapping.json` | Maps old paths to new R2 URLs |
| `items.json.backup` | Backup of original items.json |
| `MIGRATION_GUIDE.md` | This guide |

---

## 🔍 What Gets Changed

### Before Migration

```json
{
  "name": "1st Place Trophy",
  "img": "imgs\\gears\\yY4PlAA.png",
  "price": "N/A"
}
```

### After Migration

```json
{
  "name": "1st Place Trophy",
  "img": "https://cdn.emwiki.com/imgs/gears/yY4PlAA.png",
  "price": "N/A"
}
```

---

## 🛠️ Troubleshooting

### Issue: "form-data package not found"

**Solution:**
```bash
npm install form-data
```

### Issue: "Upload endpoint returns 404"

**Solution:**
- Make sure you've deployed the `bulk-upload-images.js` function
- Check that your Cloudflare Pages deployment succeeded
- Verify the UPLOAD_ENDPOINT URL in the script matches your site

### Issue: "Some images failed to upload"

**Solution:**
- Check the error details in the console output
- The script will continue with remaining batches
- You can re-run the script - it will try to upload all images again
- Check the mapping file to see which images succeeded

### Issue: "Items.json too large to update"

**Solution:**
- The script handles large files automatically
- If you still have issues, you can split the upload into smaller batches
- Reduce `BATCH_SIZE` in the script (default is 10)

### Issue: "CORS errors when uploading"

**Solution:**
- Make sure the bulk-upload endpoint is deployed on Cloudflare Pages
- The endpoint includes CORS headers for local development
- If running locally, you may need to deploy first

---

## 📊 Migration Status Checklist

- [ ] Install Node.js dependencies (`npm install form-data`)
- [ ] Deploy bulk upload endpoint to Cloudflare Pages
- [ ] Update UPLOAD_ENDPOINT URL in migration script
- [ ] Run `migrate-images-to-r2.js`
- [ ] Verify images are accessible on R2
- [ ] Test site with new image URLs
- [ ] Run `update-gist-from-items.js`
- [ ] Commit and push changes
- [ ] Verify live site works correctly
- [ ] (Optional) Clean up local `/imgs/` directory

---

## 🎯 Next Steps After Migration

1. **Monitor bandwidth:** Check your Cloudflare R2 dashboard for usage
2. **Set up caching:** Configure cache rules for optimal performance
3. **Clean up local files:** You can optionally delete `/imgs/` directory after confirming everything works
4. **Update documentation:** Update any docs that reference local image paths

---

## 📞 Need Help?

If you run into issues:

1. Check the console output for detailed error messages
2. Verify your Cloudflare Pages deployment is successful
3. Check the R2 bucket dashboard to see if files are uploading
4. Review the `image-url-mapping.json` to see what's been uploaded

---

## 🔐 Security Notes

- The bulk upload endpoint does NOT require authentication (add if needed)
- R2 bucket is publicly accessible via CDN domain
- Original local files are preserved (not deleted)
- Backup of items.json is created automatically

---

## ⚡ Performance Tips

- **Batch size:** Default is 10 files per batch. Increase for faster uploads (if stable connection)
- **Delay:** Default is 1 second between batches. Reduce for faster uploads
- **Parallel uploads:** Consider uploading from multiple machines for very large datasets

---

## 📈 Expected Results

- **Upload speed:** ~10-20 images per minute (depends on connection)
- **Total time:** 5-10 minutes for ~1000 images
- **Final size on R2:** ~91MB
- **CDN cache:** Images will be cached globally after first access

---

*Last updated: 2025-11-02*
