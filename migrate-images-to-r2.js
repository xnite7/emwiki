#!/usr/bin/env node

/**
 * Image Migration Script - Uploads all local images to R2 and updates references
 *
 * This script:
 * 1. Scans the /imgs/ directory for all image files
 * 2. Uploads them to R2 via the bulk upload endpoint
 * 3. Creates a mapping file (old path -> new URL)
 * 4. Updates items.json with new R2 URLs
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');

// Configuration
const IMGS_DIR = './imgs';
const ITEMS_JSON = './items.json';
const MAPPING_FILE = './image-url-mapping.json';
const BATCH_SIZE = 10; // Upload 10 files at a time
const DELAY_BETWEEN_BATCHES = 1000; // 1 second delay

// Your deployed site URL - change this if needed
const UPLOAD_ENDPOINT = 'https://emwiki.pages.dev/api/bulk-upload-images';

// Supported image extensions
const IMAGE_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg'];

/**
 * Recursively get all image files from a directory
 */
function getAllImageFiles(dir, baseDir = dir) {
  let results = [];
  const items = fs.readdirSync(dir);

  for (const item of items) {
    const fullPath = path.join(dir, item);
    const stat = fs.statSync(fullPath);

    if (stat.isDirectory()) {
      results = results.concat(getAllImageFiles(fullPath, baseDir));
    } else {
      const ext = path.extname(item).toLowerCase();
      if (IMAGE_EXTENSIONS.includes(ext)) {
        // Store relative path from baseDir
        const relativePath = path.relative(baseDir, fullPath);
        results.push({
          fullPath,
          relativePath: relativePath.replace(/\\/g, '/'), // Normalize to forward slashes
          windowsPath: relativePath.replace(/\//g, '\\'), // Windows-style for items.json
          filename: item,
          size: stat.size
        });
      }
    }
  }

  return results;
}

/**
 * Upload a batch of files to R2
 */
async function uploadBatch(files, batchNumber) {
  return new Promise((resolve, reject) => {
    const FormData = require('form-data');
    const form = new FormData();

    console.log(`\nBatch ${batchNumber}: Uploading ${files.length} files...`);

    // Add all files to the form
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const fileStream = fs.createReadStream(file.fullPath);
      const fieldName = `file_${i}`;

      form.append(fieldName, fileStream, {
        filename: file.filename,
        contentType: getContentType(file.filename)
      });

      // Add the original path so the server knows where to put it
      form.append(`${fieldName}_path`, 'imgs/' + file.relativePath);

      console.log(`  - ${file.relativePath} (${formatBytes(file.size)})`);
    }

    const url = new URL(UPLOAD_ENDPOINT);
    const protocol = url.protocol === 'https:' ? https : http;

    const options = {
      method: 'POST',
      headers: form.getHeaders()
    };

    const req = protocol.request(url, options, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        try {
          const result = JSON.parse(data);
          console.log(`✓ Batch ${batchNumber} complete: ${result.uploaded} uploaded, ${result.errors} errors`);
          resolve(result);
        } catch (e) {
          console.error(`✗ Batch ${batchNumber} failed: Invalid response`);
          reject(new Error('Invalid JSON response: ' + data));
        }
      });
    });

    req.on('error', (error) => {
      console.error(`✗ Batch ${batchNumber} failed:`, error.message);
      reject(error);
    });

    form.pipe(req);
  });
}

/**
 * Get content type based on file extension
 */
function getContentType(filename) {
  const ext = path.extname(filename).toLowerCase();
  const types = {
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.svg': 'image/svg+xml'
  };
  return types[ext] || 'application/octet-stream';
}

/**
 * Format bytes to human readable
 */
function formatBytes(bytes) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
}

/**
 * Sleep for a given time
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Main migration function
 */
async function migrate() {
  console.log('='.repeat(60));
  console.log('📦 Image Migration to R2');
  console.log('='.repeat(60));

  // Step 1: Scan for images
  console.log('\n1️⃣  Scanning for images...');
  if (!fs.existsSync(IMGS_DIR)) {
    console.error(`Error: ${IMGS_DIR} directory not found!`);
    process.exit(1);
  }

  const allImages = getAllImageFiles(IMGS_DIR);
  const totalSize = allImages.reduce((sum, file) => sum + file.size, 0);

  console.log(`   Found ${allImages.length} images (${formatBytes(totalSize)})`);

  // Step 2: Upload in batches
  console.log('\n2️⃣  Uploading to R2...');
  const urlMapping = {};
  const allResults = [];

  for (let i = 0; i < allImages.length; i += BATCH_SIZE) {
    const batch = allImages.slice(i, i + BATCH_SIZE);
    const batchNumber = Math.floor(i / BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(allImages.length / BATCH_SIZE);

    try {
      const result = await uploadBatch(batch, batchNumber);
      allResults.push(result);

      // Build URL mapping
      if (result.results) {
        for (const item of result.results) {
          // Map both forward slash and backslash versions
          urlMapping[item.originalPath] = item.url;
          urlMapping[item.originalPath.replace(/\//g, '\\')] = item.url;
        }
      }

      // Save mapping after each batch
      fs.writeFileSync(MAPPING_FILE, JSON.stringify(urlMapping, null, 2));

      // Wait between batches to avoid rate limiting
      if (i + BATCH_SIZE < allImages.length) {
        console.log(`   Waiting ${DELAY_BETWEEN_BATCHES}ms before next batch...`);
        await sleep(DELAY_BETWEEN_BATCHES);
      }
    } catch (error) {
      console.error(`   Error in batch ${batchNumber}:`, error.message);
      console.log('   Continuing with next batch...');
    }

    const progress = Math.min(((i + BATCH_SIZE) / allImages.length) * 100, 100);
    console.log(`   Progress: ${progress.toFixed(1)}% (Batch ${batchNumber}/${totalBatches})`);
  }

  // Step 3: Save mapping
  console.log('\n3️⃣  Saving URL mapping...');
  fs.writeFileSync(MAPPING_FILE, JSON.stringify(urlMapping, null, 2));
  console.log(`   ✓ Saved to ${MAPPING_FILE}`);
  console.log(`   ✓ Mapped ${Object.keys(urlMapping).length / 2} images`);

  // Step 4: Update items.json
  console.log('\n4️⃣  Updating items.json...');
  if (!fs.existsSync(ITEMS_JSON)) {
    console.error(`   ✗ ${ITEMS_JSON} not found!`);
    process.exit(1);
  }

  const itemsData = JSON.parse(fs.readFileSync(ITEMS_JSON, 'utf8'));
  let updateCount = 0;

  // Update image paths in all categories
  for (const category in itemsData) {
    if (Array.isArray(itemsData[category])) {
      for (const item of itemsData[category]) {
        if (item.img && urlMapping[item.img]) {
          item.img = urlMapping[item.img];
          updateCount++;
        }
      }
    }
  }

  // Save backup
  const backupFile = ITEMS_JSON + '.backup';
  fs.copyFileSync(ITEMS_JSON, backupFile);
  console.log(`   ✓ Backup saved to ${backupFile}`);

  // Save updated file
  fs.writeFileSync(ITEMS_JSON, JSON.stringify(itemsData, null, 2));
  console.log(`   ✓ Updated ${updateCount} image references`);

  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('✅ Migration Complete!');
  console.log('='.repeat(60));
  console.log(`Total images: ${allImages.length}`);
  console.log(`Total size: ${formatBytes(totalSize)}`);
  console.log(`References updated: ${updateCount}`);
  console.log(`Mapping file: ${MAPPING_FILE}`);
  console.log(`Backup file: ${backupFile}`);
  console.log('\n📋 Next steps:');
  console.log('   1. Review the changes in items.json');
  console.log('   2. Test the site to ensure images load correctly');
  console.log('   3. Update the gist with: node update-gist.js');
  console.log('   4. Commit and push your changes');
  console.log('='.repeat(60));
}

// Check for form-data dependency
try {
  require.resolve('form-data');
} catch (e) {
  console.error('Error: form-data package not found!');
  console.error('Please install it first: npm install form-data');
  process.exit(1);
}

// Run migration
migrate().catch(error => {
  console.error('\n❌ Migration failed:', error);
  process.exit(1);
});
