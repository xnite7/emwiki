/**
 * Migration script to upload item images from local filesystem to R2
 * 
 * Usage:
 *   node scripts/upload-images-to-r2.js [--dry-run] [--skip-existing]
 * 
 * Options:
 *   --dry-run: Show what would be uploaded without actually uploading
 *   --skip-existing: Skip images that already exist in R2
 * 
 * This script:
 * 1. Reads items.json to get all image paths
 * 2. Uploads each image to R2 under items/ prefix
 * 3. Preserves directory structure (items/gears/file.png)
 * 
 * Requires:
 * - Wrangler CLI configured with R2 bucket access
 * - Images in emwiki/imgs/ directory
 * - R2 bucket binding named MY_BUCKET in wrangler.toml
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ITEMS_JSON_PATH = path.join(__dirname, '../items.json');
const IMGS_DIR = path.join(__dirname, '../imgs');
const R2_BUCKET_NAME = 'MY_BUCKET'; // Your R2 bucket binding name

// Parse command line arguments
const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const SKIP_EXISTING = args.includes('--skip-existing');

async function uploadImagesToR2() {
    console.log('Starting image migration to R2...\n');

    // Read items.json
    if (!fs.existsSync(ITEMS_JSON_PATH)) {
        console.error(`Error: ${ITEMS_JSON_PATH} not found`);
        process.exit(1);
    }

    const itemsData = JSON.parse(fs.readFileSync(ITEMS_JSON_PATH, 'utf8'));
    
    // Collect all unique image paths
    const imagePaths = new Set();
    
    for (const category in itemsData) {
        if (Array.isArray(itemsData[category])) {
            itemsData[category].forEach(item => {
                if (item.img) {
                    // Normalize path: convert backslashes to forward slashes
                    let imgPath = item.img.replace(/\\/g, '/');
                    // Remove leading ./ or /
                    imgPath = imgPath.replace(/^\.?\//, '');
                    imagePaths.add(imgPath);
                }
            });
        }
    }

    console.log(`Found ${imagePaths.size} unique images to upload\n`);

    // Upload each image
    let uploaded = 0;
    let skipped = 0;
    let errors = 0;

    for (const imgPath of imagePaths) {
        const localPath = path.join(__dirname, '..', imgPath);
        const normalizedPath = imgPath.replace(/\\/g, '/');
        
        // Convert imgs/ to items/ for R2 storage
        let r2Key = normalizedPath;
        if (r2Key.startsWith('imgs/')) {
            r2Key = r2Key.replace('imgs/', 'items/');
        } else if (!r2Key.startsWith('items/')) {
            r2Key = `items/${r2Key}`;
        }

        // Check if file exists locally
        if (!fs.existsSync(localPath)) {
            console.log(`⚠️  Skipping (not found): ${localPath}`);
            skipped++;
            continue;
        }

        try {
            // Determine content type
            const ext = path.extname(localPath).toLowerCase();
            const contentTypeMap = {
                '.png': 'image/png',
                '.jpg': 'image/jpeg',
                '.jpeg': 'image/jpeg',
                '.webp': 'image/webp',
                '.gif': 'image/gif',
                '.svg': 'image/svg+xml'
            };
            const contentType = contentTypeMap[ext] || 'image/png';

            // Read file
            const fileBuffer = fs.readFileSync(localPath);

            // Check if already exists in R2
            if (SKIP_EXISTING) {
                try {
                    const checkCommand = `wrangler r2 object head ${r2Key}`;
                    execSync(checkCommand, { 
                        stdio: 'pipe',
                        cwd: path.join(__dirname, '..')
                    });
                    console.log(`⏭️  Skipping (already exists): ${r2Key}`);
                    skipped++;
                    continue;
                } catch (error) {
                    // Object doesn't exist, continue with upload
                }
            }

            if (DRY_RUN) {
                console.log(`[DRY RUN] Would upload: ${localPath} -> R2:${r2Key} (${contentType})`);
                uploaded++;
            } else {
                // Upload to R2 using wrangler
                // Note: This requires wrangler to be installed and configured
                console.log(`Uploading: ${localPath} -> R2:${r2Key}`);

                // Use wrangler r2 object put command
                // Format: wrangler r2 object put <key> --file=<file> --content-type=<type>
                const command = `wrangler r2 object put ${r2Key} --file="${localPath}" --content-type="${contentType}"`;
                
                try {
                    execSync(command, { 
                        stdio: 'pipe', // Suppress output for cleaner logs
                        cwd: path.join(__dirname, '..')
                    });
                    uploaded++;
                    console.log(`✅ Uploaded: ${r2Key}`);
                } catch (error) {
                    console.error(`❌ Failed to upload ${r2Key}:`, error.message);
                    errors++;
                }
            }

        } catch (error) {
            console.error(`❌ Error processing ${localPath}:`, error.message);
            errors++;
        }
    }

    console.log('\n=== Migration Summary ===');
    if (DRY_RUN) {
        console.log(`[DRY RUN] Would upload: ${uploaded}`);
    } else {
        console.log(`✅ Uploaded: ${uploaded}`);
    }
    console.log(`⚠️  Skipped: ${skipped}`);
    console.log(`❌ Errors: ${errors}`);
    console.log(`\nTotal processed: ${imagePaths.size}`);
    
    if (DRY_RUN) {
        console.log('\n💡 Run without --dry-run to actually upload images');
    }
}

// Run migration
uploadImagesToR2().catch(error => {
    console.error('Migration failed:', error);
    process.exit(1);
});

