#!/usr/bin/env node
/**
 * Cleanup Script: Remove R2 Gallery Images After Migration
 *
 * Run this AFTER successfully migrating gallery images to Cloudflare Images.
 * This script will delete the old R2 objects to free up storage.
 *
 * ⚠️  WARNING: This is destructive! Make sure migration is complete first.
 *
 * Usage:
 *   # Dry run - preview what would be deleted
 *   node scripts/cleanup-gallery-r2-after-migration.js --dry-run
 *
 *   # Actually delete R2 objects
 *   node scripts/cleanup-gallery-r2-after-migration.js --confirm-delete
 *
 * Required Environment Variables:
 *   CLOUDFLARE_API_TOKEN - Cloudflare API token with R2 delete permissions
 *   CF_ACCOUNT_ID        - Cloudflare account ID
 *   D1_DATABASE_ID       - D1 database ID
 *   R2_BUCKET_NAME       - R2 bucket name
 */

const fs = require('fs');
const path = require('path');

// Load environment variables
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

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const CONFIRM_DELETE = args.includes('--confirm-delete');

// URL patterns for Cloudflare Images (migrated successfully)
const CLOUDFLARE_IMAGES_PATTERNS = [
  'imagedelivery.net',
  'cloudflare-images.com',
];

// URL patterns for Cloudflare Stream (videos migrated successfully)
const CLOUDFLARE_STREAM_PATTERNS = [
  'cloudflarestream.com',
  'videodelivery.net',
];

function isCloudflareImagesUrl(url) {
  if (!url) return false;
  return CLOUDFLARE_IMAGES_PATTERNS.some(pattern => url.includes(pattern));
}

function isCloudflareStreamUrl(url) {
  if (!url) return false;
  return CLOUDFLARE_STREAM_PATTERNS.some(pattern => url.includes(pattern));
}

function isMigratedUrl(url) {
  return isCloudflareImagesUrl(url) || isCloudflareStreamUrl(url);
}

async function queryD1(sql, params = []) {
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

async function listR2GalleryObjects() {
  // List objects with gallery prefix
  const response = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${CONFIG.CF_ACCOUNT_ID}/r2/buckets/${CONFIG.R2_BUCKET_NAME}/objects?prefix=gallery/`,
    {
      headers: {
        'Authorization': `Bearer ${CONFIG.CF_STREAM_TOKEN}`,
      },
    }
  );

  const data = await response.json();
  if (!data.success) {
    throw new Error(`R2 list failed: ${JSON.stringify(data.errors)}`);
  }
  return data.result?.objects || [];
}

async function deleteR2Object(key) {
  const response = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${CONFIG.CF_ACCOUNT_ID}/r2/buckets/${CONFIG.R2_BUCKET_NAME}/objects/${encodeURIComponent(key)}`,
    {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${CONFIG.CF_STREAM_TOKEN}`,
      },
    }
  );

  if (!response.ok) {
    throw new Error(`R2 delete failed: ${response.status} ${response.statusText}`);
  }
}

async function cleanup() {
  console.log('🧹 Gallery R2 Cleanup (Post-Migration)\n');

  if (!CONFIRM_DELETE && !DRY_RUN) {
    console.error('⚠️  Please specify --dry-run or --confirm-delete');
    console.log('\nUsage:');
    console.log('  node scripts/cleanup-gallery-r2-after-migration.js --dry-run');
    console.log('  node scripts/cleanup-gallery-r2-after-migration.js --confirm-delete');
    process.exit(1);
  }

  // First, verify all gallery items have been migrated
  console.log('📊 Verifying migration status...\n');

  const items = await queryD1('SELECT id, title, media_url, thumbnail_url FROM gallery_items');

  let allMigrated = true;
  const notMigrated = [];

  for (const item of items) {
    // Media URL must be migrated to either Cloudflare Images or Stream
    if (!isMigratedUrl(item.media_url)) {
      allMigrated = false;
      notMigrated.push(item);
    }
    // Thumbnails must be migrated to Cloudflare Images (they're always images)
    if (item.thumbnail_url && !isCloudflareImagesUrl(item.thumbnail_url)) {
      if (!notMigrated.find(i => i.id === item.id)) {
        allMigrated = false;
        notMigrated.push(item);
      }
    }
  }

  if (!allMigrated) {
    console.log('❌ Not all gallery items have been migrated!\n');
    console.log('The following items still have R2/non-Cloudflare-Images URLs:\n');
    for (const item of notMigrated) {
      console.log(`  [${item.id}] ${item.title}`);
      console.log(`       Media: ${item.media_url}`);
      if (item.thumbnail_url) {
        console.log(`       Thumb: ${item.thumbnail_url}`);
      }
    }
    console.log('\nPlease run the migration script first:');
    console.log('  node scripts/migrate-gallery-r2-to-images.js');
    process.exit(1);
  }

  console.log('✅ All gallery items have been migrated to Cloudflare Images\n');

  // List R2 objects to delete
  console.log('📋 Listing R2 gallery objects...\n');

  let r2Objects;
  try {
    r2Objects = await listR2GalleryObjects();
  } catch (err) {
    console.error('❌ Failed to list R2 objects:', err.message);
    console.log('\nNote: You may need to delete manually via Cloudflare Dashboard or wrangler:');
    console.log(`  npx wrangler r2 object list ${CONFIG.R2_BUCKET_NAME} --prefix=gallery/`);
    process.exit(1);
  }

  if (r2Objects.length === 0) {
    console.log('✅ No gallery objects found in R2. Already cleaned up!');
    return;
  }

  console.log(`Found ${r2Objects.length} objects to delete:\n`);
  for (const obj of r2Objects) {
    console.log(`  - ${obj.key} (${(obj.size / 1024).toFixed(1)} KB)`);
  }

  if (DRY_RUN) {
    console.log('\n🔍 DRY RUN - No objects will be deleted');
    return;
  }

  // Delete objects
  console.log('\n🗑️  Deleting R2 objects...\n');

  let deleted = 0;
  let failed = 0;

  for (const obj of r2Objects) {
    try {
      await deleteR2Object(obj.key);
      console.log(`  ✅ Deleted: ${obj.key}`);
      deleted++;
    } catch (err) {
      console.error(`  ❌ Failed: ${obj.key} - ${err.message}`);
      failed++;
    }
  }

  console.log('\n' + '='.repeat(50));
  console.log('📊 Cleanup Summary:');
  console.log(`   ✅ Deleted: ${deleted}`);
  console.log(`   ❌ Failed: ${failed}`);
  console.log(`   📦 Total: ${r2Objects.length}`);
}

cleanup().catch(err => {
  console.error('Cleanup failed:', err);
  process.exit(1);
});
