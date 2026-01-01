#!/usr/bin/env node
/**
 * Migration Script: R2 Gallery Images → Cloudflare Images
 *
 * This script migrates gallery items from R2 storage to Cloudflare Images.
 *
 * Usage:
 *   # Dry run (preview what would be migrated)
 *   node scripts/migrate-gallery-r2-to-images.js --dry-run
 *
 *   # Actually run the migration
 *   node scripts/migrate-gallery-r2-to-images.js
 *
 *   # Skip items that already have Cloudflare Images URLs
 *   node scripts/migrate-gallery-r2-to-images.js --skip-existing
 *
 *   # Migrate only specific item by ID
 *   node scripts/migrate-gallery-r2-to-images.js --id=123
 *
 * Required Environment Variables:
 *   CF_STREAM_TOKEN - Cloudflare API token with R2 read + Images write permissions
 *   CF_ACCOUNT_ID        - Cloudflare account ID
 *   CF_STREAM_TOKEN  - Cloudflare Images API token (can be same as CF_STREAM_TOKEN)
 *   CF_ACCOUNT_HASH      - Cloudflare Images account hash (for URL construction)
 *   D1_DATABASE_ID       - D1 database ID (DBA)
 *   R2_BUCKET_NAME       - R2 bucket name (e.g., "emwiki-media")
 *
 * The script will:
 *   1. Query gallery_items from D1 database
 *   2. Identify items with R2 URLs (not imagedelivery.net)
 *   3. Download each image from R2
 *   4. Upload to Cloudflare Images
 *   5. Update database with new URLs
 */

const fs = require('fs');
const path = require('path');

// Load environment variables from .dev.vars if it exists
function loadEnvVars() {
  const devVarsPath = path.join(__dirname, '..', '.dev.vars');
  if (fs.existsSync(devVarsPath)) {
    const content = fs.readFileSync(devVarsPath, 'utf-8');
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#')) {
        const [key, ...valueParts] = trimmed.split('=');
        const value = valueParts.join('=').trim();
        if (key && value && !process.env[key.trim()]) {
          process.env[key.trim()] = value;
        }
      }
    }
  }
}

loadEnvVars();

// Configuration
const CONFIG = {
  CF_ACCOUNT_ID: process.env.CLOUDFLARE_ACCOUNT_ID,
  CF_ACCOUNT_HASH: process.env.CF_ACCOUNT_HASH || 'I2Jsf9fuZwSztWJZaX0DJA',
  CF_STREAM_TOKEN: process.env.CLOUDFLARE_STREAM_TOKEN,
  D1_DATABASE_ID: process.env.D1_DATABASE_ID,
  R2_BUCKET_NAME: process.env.MY_BUCKET,
};

// Parse CLI arguments
const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const SKIP_EXISTING = args.includes('--skip-existing');
const SPECIFIC_ID = args.find(a => a.startsWith('--id='))?.split('=')[1];
const VERBOSE = args.includes('--verbose') || args.includes('-v');

// URL patterns
const CLOUDFLARE_IMAGES_PATTERNS = [
  'imagedelivery.net',
  'cloudflare-images.com',
];

const CLOUDFLARE_STREAM_PATTERNS = [
  'videodelivery.net',
  'cloudflarestream.com',
];

/**
 * Check if a URL is already a Cloudflare Images URL
 */
function isCloudflareImagesUrl(url) {
  if (!url) return false;
  return CLOUDFLARE_IMAGES_PATTERNS.some(pattern => url.includes(pattern));
}

/**
 * Check if a URL is a Cloudflare Stream URL (videos)
 */
function isCloudflareStreamUrl(url) {
  if (!url) return false;
  return CLOUDFLARE_STREAM_PATTERNS.some(pattern => url.includes(pattern));
}

/**
 * Check if a URL is an R2 URL or local path that needs migration
 */
function needsMigration(url) {
  if (!url) return false;
  if (isCloudflareImagesUrl(url)) return false;
  if (isCloudflareStreamUrl(url)) return false;

  // These are R2 or local URLs that need migration
  const r2Patterns = [
    'r2.cloudflarestorage.com',
    'r2.dev',
    '/api/images/',
    '/gallery/',
    'MY_BUCKET',
  ];

  return r2Patterns.some(pattern => url.includes(pattern)) ||
         url.startsWith('gallery/') ||
         url.startsWith('uploads/') ||
         url.startsWith('items/');
}

/**
 * Extract R2 object key from URL
 */
function extractR2Key(url) {
  // Handle different URL formats
  if (url.includes('r2.cloudflarestorage.com') || url.includes('r2.dev')) {
    // Full R2 URL: extract path after bucket name
    const urlObj = new URL(url);
    return urlObj.pathname.replace(/^\//, '');
  }

  if (url.includes('/api/images/')) {
    // Local API URL: extract path after /api/images/
    return url.split('/api/images/')[1];
  }

  // Assume it's a relative path
  return url.replace(/^\//, '');
}

/**
 * Query D1 database via Cloudflare API
 */
async function queryD1(sql, params = []) {
  if (!CONFIG.CF_STREAM_TOKEN || !CONFIG.D1_DATABASE_ID) {
    console.error('Missing CF_STREAM_TOKEN or D1_DATABASE_ID');
    console.error('Set these environment variables or add them to .dev.vars');
    process.exit(1);
  }

  const response = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${CONFIG.CF_ACCOUNT_ID}/d1/database/${CONFIG.D1_DATABASE_ID}/query`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${CONFIG.CF_STREAM_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ sql, params }),
    }
  );

  const data = await response.json();

  if (!data.success) {
    throw new Error(`D1 query failed: ${JSON.stringify(data.errors)}`);
  }

  return data.result[0]?.results || [];
}

/**
 * Download image from R2 via Cloudflare API
 */
async function downloadFromR2(key) {
  if (!CONFIG.CF_STREAM_TOKEN) {
    throw new Error('Missing CF_STREAM_TOKEN');
  }

  const response = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${CONFIG.CF_ACCOUNT_ID}/r2/buckets/${CONFIG.R2_BUCKET_NAME}/objects/${encodeURIComponent(key)}`,
    {
      headers: {
        'Authorization': `Bearer ${CONFIG.CF_STREAM_TOKEN}`,
      },
    }
  );

  if (!response.ok) {
    throw new Error(`R2 download failed: ${response.status} ${response.statusText}`);
  }

  return {
    data: await response.arrayBuffer(),
    contentType: response.headers.get('content-type') || 'image/png',
  };
}

/**
 * Alternative: Download from public R2 URL or /api/images endpoint
 */
async function downloadFromPublicUrl(url) {
  // If it's a relative URL, construct full URL
  let fullUrl = url;
  if (url.startsWith('/')) {
    // Assume production domain
    fullUrl = `https://emwiki.com${url}`;
  } else if (!url.startsWith('http')) {
    fullUrl = `https://emwiki.com/api/images/${url}`;
  }

  const response = await fetch(fullUrl);

  if (!response.ok) {
    throw new Error(`Download failed: ${response.status} ${response.statusText}`);
  }

  return {
    data: await response.arrayBuffer(),
    contentType: response.headers.get('content-type') || 'image/png',
  };
}

/**
 * Upload image to Cloudflare Images
 */
async function uploadToCloudflareImages(imageData, contentType, customId, metadata = {}) {
  const FormData = (await import('form-data')).default;
  const form = new FormData();

  // Create a buffer from ArrayBuffer
  const buffer = Buffer.from(imageData);

  // Determine file extension from content type
  const extMap = {
    'image/jpeg': '.jpg',
    'image/png': '.png',
    'image/gif': '.gif',
    'image/webp': '.webp',
  };
  const ext = extMap[contentType] || '.png';
  const filename = `${customId}${ext}`;

  form.append('file', buffer, {
    filename,
    contentType,
  });
  form.append('id', customId);
  form.append('metadata', JSON.stringify(metadata));

  const response = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${CONFIG.CF_ACCOUNT_ID}/images/v1`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${CONFIG.CF_STREAM_TOKEN}`,
        ...form.getHeaders(),
      },
      body: form,
    }
  );

  const data = await response.json();

  if (!data.success) {
    throw new Error(`Cloudflare Images upload failed: ${JSON.stringify(data.errors)}`);
  }

  // Return the public variant URL
  return data.result.variants[0];
}

/**
 * Update gallery item in D1 database
 */
async function updateGalleryItem(id, mediaUrl, thumbnailUrl = null) {
  let sql, params;

  if (thumbnailUrl !== null) {
    sql = 'UPDATE gallery_items SET media_url = ?, thumbnail_url = ? WHERE id = ?';
    params = [mediaUrl, thumbnailUrl, id];
  } else {
    sql = 'UPDATE gallery_items SET media_url = ? WHERE id = ?';
    params = [mediaUrl, id];
  }

  await queryD1(sql, params);
}

/**
 * Main migration function
 */
async function migrate() {
  console.log('🔄 Gallery R2 → Cloudflare Images Migration\n');
  console.log('Configuration:');
  console.log(`  Account ID: ${CONFIG.CF_ACCOUNT_ID}`);
  console.log(`  Account Hash: ${CONFIG.CF_ACCOUNT_HASH}`);
  console.log(`  R2 Bucket: ${CONFIG.R2_BUCKET_NAME}`);
  console.log(`  Dry Run: ${DRY_RUN}`);
  console.log(`  Skip Existing: ${SKIP_EXISTING}`);
  console.log(`  Specific ID: ${SPECIFIC_ID || 'all'}\n`);

  // Validate required config
  if (!CONFIG.CF_ACCOUNT_ID) {
    console.error('❌ Missing CF_ACCOUNT_ID');
    process.exit(1);
  }
  if (!CONFIG.CF_STREAM_TOKEN) {
    console.error('❌ Missing CF_STREAM_TOKEN');
    process.exit(1);
  }

  // Query gallery items
  let sql = 'SELECT id, user_id, title, media_url, thumbnail_url FROM gallery_items';
  const params = [];

  if (SPECIFIC_ID) {
    sql += ' WHERE id = ?';
    params.push(parseInt(SPECIFIC_ID));
  }

  sql += ' ORDER BY id';

  console.log('📊 Fetching gallery items from database...\n');

  let items;
  try {
    items = await queryD1(sql, params);
  } catch (err) {
    console.error('❌ Failed to query database:', err.message);
    console.log('\nMake sure you have set:');
    console.log('  - CF_STREAM_TOKEN');
    console.log('  - D1_DATABASE_ID');
    console.log('\nYou can find D1_DATABASE_ID by running:');
    console.log('  npx wrangler d1 list');
    process.exit(1);
  }

  console.log(`Found ${items.length} gallery items\n`);

  // Filter items that need migration
  const itemsToMigrate = items.filter(item => {
    const mediaNeeds = needsMigration(item.media_url);
    const thumbNeeds = item.thumbnail_url && needsMigration(item.thumbnail_url);

    if (SKIP_EXISTING) {
      // Skip if media is already Cloudflare Images
      if (isCloudflareImagesUrl(item.media_url) &&
          (!item.thumbnail_url || isCloudflareImagesUrl(item.thumbnail_url))) {
        return false;
      }
    }

    return mediaNeeds || thumbNeeds;
  });

  console.log(`Items needing migration: ${itemsToMigrate.length}\n`);

  if (itemsToMigrate.length === 0) {
    console.log('✅ No items need migration!');
    return;
  }

  // Show what will be migrated
  console.log('Items to migrate:');
  for (const item of itemsToMigrate) {
    console.log(`  [${item.id}] ${item.title}`);
    console.log(`       Media: ${item.media_url}`);
    if (item.thumbnail_url) {
      console.log(`       Thumb: ${item.thumbnail_url}`);
    }
  }
  console.log('');

  if (DRY_RUN) {
    console.log('🔍 DRY RUN - No changes will be made\n');
    return;
  }

  // Process each item
  let migrated = 0;
  let failed = 0;

  for (const item of itemsToMigrate) {
    console.log(`\n📦 Processing item ${item.id}: "${item.title}"`);

    try {
      let newMediaUrl = item.media_url;
      let newThumbnailUrl = item.thumbnail_url;

      // Migrate media_url if needed
      if (needsMigration(item.media_url)) {
        console.log(`   ⬇️  Downloading media from: ${item.media_url}`);

        let imageData;
        try {
          // Try R2 API first
          const r2Key = extractR2Key(item.media_url);
          imageData = await downloadFromR2(r2Key);
        } catch (err) {
          if (VERBOSE) console.log(`   ⚠️  R2 API failed, trying public URL: ${err.message}`);
          // Fallback to public URL
          imageData = await downloadFromPublicUrl(item.media_url);
        }

        console.log(`   ⬆️  Uploading to Cloudflare Images...`);

        const customId = `gallery-migrated-${item.id}-${Date.now()}`;
        newMediaUrl = await uploadToCloudflareImages(
          imageData.data,
          imageData.contentType,
          customId,
          {
            gallery_item_id: item.id,
            user_id: item.user_id,
            migrated_from: 'r2',
            original_url: item.media_url,
          }
        );

        console.log(`   ✅ Media uploaded: ${newMediaUrl}`);
      }

      // Migrate thumbnail_url if needed
      if (item.thumbnail_url && needsMigration(item.thumbnail_url)) {
        console.log(`   ⬇️  Downloading thumbnail from: ${item.thumbnail_url}`);

        let thumbData;
        try {
          const r2Key = extractR2Key(item.thumbnail_url);
          thumbData = await downloadFromR2(r2Key);
        } catch (err) {
          if (VERBOSE) console.log(`   ⚠️  R2 API failed, trying public URL: ${err.message}`);
          thumbData = await downloadFromPublicUrl(item.thumbnail_url);
        }

        console.log(`   ⬆️  Uploading thumbnail to Cloudflare Images...`);

        const thumbCustomId = `gallery-thumb-migrated-${item.id}-${Date.now()}`;
        newThumbnailUrl = await uploadToCloudflareImages(
          thumbData.data,
          thumbData.contentType,
          thumbCustomId,
          {
            gallery_item_id: item.id,
            user_id: item.user_id,
            type: 'thumbnail',
            migrated_from: 'r2',
            original_url: item.thumbnail_url,
          }
        );

        console.log(`   ✅ Thumbnail uploaded: ${newThumbnailUrl}`);
      }

      // Update database
      console.log(`   📝 Updating database...`);
      await updateGalleryItem(item.id, newMediaUrl, newThumbnailUrl);
      console.log(`   ✅ Database updated`);

      migrated++;

    } catch (err) {
      console.error(`   ❌ Failed: ${err.message}`);
      if (VERBOSE) console.error(err);
      failed++;
    }
  }

  console.log('\n' + '='.repeat(50));
  console.log('📊 Migration Summary:');
  console.log(`   ✅ Migrated: ${migrated}`);
  console.log(`   ❌ Failed: ${failed}`);
  console.log(`   📦 Total: ${itemsToMigrate.length}`);
}

// Run migration
migrate().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});
