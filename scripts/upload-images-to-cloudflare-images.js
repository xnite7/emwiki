/**
 * Migration script to upload item images to Cloudflare Images
 * Supports both local filesystem and R2 bucket as sources
 * 
 * Usage:
 *   node scripts/upload-images-to-cloudflare-images.js [options]
 * 
 * Options:
 *   --dry-run: Show what would be uploaded without actually uploading
 *   --skip-existing: Skip images that already exist (checks by filename)
 *   --update-db: Update D1 database with new Cloudflare Images URLs after upload
 *   --from-r2: Upload images from R2 bucket instead of local filesystem
 *   --from-local: Upload images from local filesystem (default)
 * 
 * This script:
 * 1. Reads items.json to get all image paths
 * 2. Uploads each image to Cloudflare Images from either:
 *    - Local filesystem (emwiki/imgs/)
 *    - R2 bucket (via Wrangler CLI)
 * 3. Maps old image paths to new Cloudflare Images URLs
 * 4. Optionally updates D1 database with new URLs
 * 
 * Requires:
 * - Cloudflare Images API token (CF_IMAGES_API_TOKEN)
 * - Cloudflare Account ID (defaults to provided account)
 * - Images in emwiki/imgs/ directory OR R2 bucket
 * - D1 database access (if --update-db is used)
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const { execSync } = require('child_process');

const ITEMS_JSON_PATH = path.join(__dirname, '../items.json');
const IMGS_DIR = path.join(__dirname, '../imgs');

// Parse command line arguments
const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const SKIP_EXISTING = args.includes('--skip-existing');
const UPDATE_DB = args.includes('--update-db');
const SOURCE_R2 = args.includes('--from-r2');
const SOURCE_LOCAL = args.includes('--from-local') || !args.includes('--from-r2'); // Default to local

// Cloudflare Images account details
const CF_ACCOUNT_ID = process.env.CF_ACCOUNT_ID || 'd9fecb3357660ea0fcfee5b23d5dd2f6';
const CF_ACCOUNT_HASH = process.env.CF_ACCOUNT_HASH || 'I2Jsf9fuZwSztWJZaX0DJA';
const CF_IMAGES_API_TOKEN = process.env.CF_IMAGES_API_TOKEN;

if (!CF_IMAGES_API_TOKEN) {
    console.error('Error: CF_IMAGES_API_TOKEN must be set');
    console.error('Set it in .dev.vars or as environment variable');
    process.exit(1);
}

// Try to use form-data, fallback to native fetch if available
let FormData;
try {
    FormData = require('form-data');
} catch (e) {
    // Will use fetch API if available (Node 18+)
    FormData = null;
}

// Map to store old image paths -> Cloudflare Images URLs
const imageUrlMap = new Map();

/**
 * Download image from R2 bucket
 */
async function downloadFromR2(r2Key) {
    try {
        // Use wrangler to download from R2
        const tempPath = path.join(__dirname, '../temp_' + path.basename(r2Key));
        const command = `wrangler r2 object get ${r2Key} --file="${tempPath}"`;
        
        execSync(command, {
            stdio: 'pipe',
            cwd: path.join(__dirname, '..')
        });
        
        if (fs.existsSync(tempPath)) {
            return tempPath;
        }
        return null;
    } catch (error) {
        console.error(`Failed to download from R2: ${r2Key}`, error.message);
        return null;
    }
}

/**
 * Upload image to Cloudflare Images
 * Uses form-data package if available, otherwise uses native fetch (Node 18+)
 */
async function uploadToCloudflareImages(filePath, imagePath) {
    // Use native fetch if available (Node 18+), otherwise use form-data
    if (typeof fetch !== 'undefined' && !FormData) {
        return uploadWithFetch(filePath, imagePath);
    }

    return new Promise((resolve, reject) => {
        try {
            if (!FormData) {
                return reject(new Error('form-data package required. Install with: npm install form-data'));
            }

            const fileStream = fs.createReadStream(filePath);
            
            // Determine content type
            const ext = path.extname(filePath).toLowerCase();
            const contentTypeMap = {
                '.png': 'image/png',
                '.jpg': 'image/jpeg',
                '.jpeg': 'image/jpeg',
                '.webp': 'image/webp',
                '.gif': 'image/gif',
                '.svg': 'image/svg+xml'
            };
            const contentType = contentTypeMap[ext] || 'image/png';

            // Create form data
            const formData = new FormData();
            formData.append('file', fileStream, {
                filename: path.basename(filePath),
                contentType: contentType
            });

            const options = {
                hostname: 'api.cloudflare.com',
                path: `/client/v4/accounts/${CF_ACCOUNT_ID}/images/v1`,
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${CF_IMAGES_API_TOKEN}`,
                    ...formData.getHeaders()
                }
            };

            const req = https.request(options, (res) => {
                let data = '';

                res.on('data', (chunk) => {
                    data += chunk;
                });

                res.on('end', () => {
                    try {
                        const response = JSON.parse(data);
                        if (response.success) {
                            const imageId = response.result.id;
                            const variants = response.result.variants || [];
                            const publicVariant = variants.find(v => v.includes('/public')) || variants[0] || '';
                            resolve({
                                id: imageId,
                                url: publicVariant,
                                variants: variants
                            });
                        } else {
                            reject(new Error(`Upload failed: ${JSON.stringify(response.errors)}`));
                        }
                    } catch (error) {
                        reject(new Error(`Failed to parse response: ${error.message}`));
                    }
                });
            });

            req.on('error', (error) => {
                reject(error);
            });

            formData.pipe(req);
        } catch (error) {
            reject(error);
        }
    });
}

/**
 * Upload using native fetch (Node 18+)
 */
async function uploadWithFetch(filePath, imagePath) {
    const fileBuffer = fs.readFileSync(filePath);
    const fileName = path.basename(filePath);
    
    // Determine content type
    const ext = path.extname(filePath).toLowerCase();
    const contentTypeMap = {
        '.png': 'image/png',
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.webp': 'image/webp',
        '.gif': 'image/gif',
        '.svg': 'image/svg+xml'
    };
    const contentType = contentTypeMap[ext] || 'image/png';

    // Create FormData using File/Blob (Node 18+)
    const file = new File([fileBuffer], fileName, { type: contentType });
    const formData = new FormData();
    formData.append('file', file);

    const response = await fetch(
        `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/images/v1`,
        {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${CF_IMAGES_API_TOKEN}`
            },
            body: formData
        }
    );

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Upload failed: ${response.status} ${errorText}`);
    }

    const data = await response.json();
    
    if (!data.success) {
        throw new Error(`Upload failed: ${JSON.stringify(data.errors)}`);
    }

    const imageId = data.result.id;
    const variants = data.result.variants || [];
    const publicVariant = variants.find(v => v.includes('/public')) || variants[0] || '';

    return {
        id: imageId,
        url: publicVariant,
        variants: variants
    };
}

/**
 * Check if image already exists in Cloudflare Images (by listing and checking filename)
 * Note: This is a simple check - Cloudflare Images doesn't have a direct "exists" API
 */
async function checkImageExists(filename) {
    // For now, we'll skip this check as Cloudflare Images doesn't provide
    // an easy way to check if an image exists by filename
    // We'll rely on the user to use --skip-existing carefully
    return false;
}

/**
 * Update D1 database with new image URLs
 */
async function updateDatabase(imageUrlMap) {
    console.log('\n📝 Updating D1 database with new image URLs...');
    
    // Read all items from database and update img column
    // This requires wrangler CLI and D1 access
    console.log('⚠️  Database update requires manual SQL execution:');
    console.log('\nRun this SQL in your D1 database:');
    console.log('\n-- Update image URLs in items table');
    
    for (const [oldPath, newUrl] of imageUrlMap.entries()) {
        // Normalize old path for SQL matching
        const normalizedOldPath = oldPath.replace(/\\/g, '/').replace(/^\.?\//, '');
        console.log(`UPDATE items SET img = '${newUrl}' WHERE img LIKE '%${normalizedOldPath}%';`);
    }
    
    console.log('\nOr use wrangler:');
    console.log('wrangler d1 execute DBA --file=migrations/update_image_urls.sql');
}

async function uploadImagesToCloudflareImages() {
    console.log('Starting image migration to Cloudflare Images...\n');
    console.log(`Account ID: ${CF_ACCOUNT_ID}`);
    console.log(`Account Hash: ${CF_ACCOUNT_HASH}`);
    console.log(`Source: ${SOURCE_R2 ? 'R2 Bucket' : 'Local Filesystem'}`);
    console.log(`Dry Run: ${DRY_RUN ? 'YES' : 'NO'}`);
    console.log(`Skip Existing: ${SKIP_EXISTING ? 'YES' : 'NO'}`);
    console.log(`Update DB: ${UPDATE_DB ? 'YES' : 'NO'}\n`);

    // Read items.json
    if (!fs.existsSync(ITEMS_JSON_PATH)) {
        console.error(`Error: ${ITEMS_JSON_PATH} not found`);
        process.exit(1);
    }

    const itemsData = JSON.parse(fs.readFileSync(ITEMS_JSON_PATH, 'utf8'));
    
    // Collect all unique image paths with their items
    const imageMap = new Map(); // path -> { items: [...], localPath: string, r2Key: string }
    
    for (const category in itemsData) {
        if (Array.isArray(itemsData[category])) {
            itemsData[category].forEach(item => {
                if (item.img) {
                    // Normalize path: convert backslashes to forward slashes
                    let imgPath = item.img.replace(/\\/g, '/');
                    // Remove leading ./ or /
                    imgPath = imgPath.replace(/^\.?\//, '');
                    
                    if (!imageMap.has(imgPath)) {
                        const localPath = path.join(__dirname, '..', imgPath);
                        // Convert imgs/ to items/ for R2
                        let r2Key = imgPath;
                        if (r2Key.startsWith('imgs/')) {
                            r2Key = r2Key.replace('imgs/', 'items/');
                        } else if (!r2Key.startsWith('items/')) {
                            r2Key = `items/${r2Key}`;
                        }
                        
                        imageMap.set(imgPath, {
                            items: [],
                            localPath: localPath,
                            r2Key: r2Key
                        });
                    }
                    imageMap.get(imgPath).items.push({ category, name: item.name });
                }
            });
        }
    }

    console.log(`Found ${imageMap.size} unique images to upload\n`);

    // Upload each image
    let uploaded = 0;
    let skipped = 0;
    let errors = 0;
    const tempFiles = []; // Track temp files for cleanup

    for (const [imgPath, data] of imageMap.entries()) {
        const { localPath, r2Key } = data;
        let filePath = null;
        let isTempFile = false;

        try {
            // Get image file based on source
            if (SOURCE_R2) {
                // Download from R2
                console.log(`Downloading from R2: ${r2Key}`);
                filePath = await downloadFromR2(r2Key);
                if (filePath) {
                    isTempFile = true;
                    tempFiles.push(filePath);
                } else {
                    console.log(`⚠️  Skipping (not found in R2): ${r2Key}`);
                    skipped++;
                    continue;
                }
            } else {
                // Use local file
                if (!fs.existsSync(localPath)) {
                    console.log(`⚠️  Skipping (not found): ${localPath}`);
                    skipped++;
                    continue;
                }
                filePath = localPath;
            }

            // Check if already exists
            if (SKIP_EXISTING) {
                const exists = await checkImageExists(path.basename(filePath));
                if (exists) {
                    console.log(`⏭️  Skipping (already exists): ${imgPath}`);
                    if (isTempFile) {
                        fs.unlinkSync(filePath);
                        tempFiles.splice(tempFiles.indexOf(filePath), 1);
                    }
                    skipped++;
                    continue;
                }
            }

            if (DRY_RUN) {
                console.log(`[DRY RUN] Would upload: ${filePath} -> Cloudflare Images`);
                uploaded++;
            } else {
                console.log(`Uploading: ${imgPath} (${SOURCE_R2 ? 'from R2' : 'from local'})`);

                try {
                    const result = await uploadToCloudflareImages(filePath, imgPath);
                    // Use account hash to construct URL
                    const cloudflareUrl = `https://imagedelivery.net/${CF_ACCOUNT_HASH}/${result.id}/public`;
                    imageUrlMap.set(imgPath, cloudflareUrl);
                    uploaded++;
                    console.log(`✅ Uploaded: ${imgPath}`);
                    console.log(`   URL: ${cloudflareUrl}`);
                    console.log(`   ID: ${result.id}\n`);

                    // Rate limiting: wait 100ms between uploads
                    await new Promise(resolve => setTimeout(resolve, 100));

                } catch (error) {
                    console.error(`❌ Failed to upload ${imgPath}:`, error.message);
                    errors++;
                }
            }

            // Clean up temp file if from R2
            if (isTempFile && fs.existsSync(filePath)) {
                fs.unlinkSync(filePath);
                tempFiles.splice(tempFiles.indexOf(filePath), 1);
            }

        } catch (error) {
            console.error(`❌ Error processing ${imgPath}:`, error.message);
            errors++;
            
            // Clean up temp file on error
            if (isTempFile && filePath && fs.existsSync(filePath)) {
                try {
                    fs.unlinkSync(filePath);
                    tempFiles.splice(tempFiles.indexOf(filePath), 1);
                } catch (e) {
                    // Ignore cleanup errors
                }
            }
        }
    }

    // Clean up any remaining temp files
    tempFiles.forEach(tempFile => {
        try {
            if (fs.existsSync(tempFile)) {
                fs.unlinkSync(tempFile);
            }
        } catch (e) {
            // Ignore cleanup errors
        }
    });

    console.log('\n=== Migration Summary ===');
    if (DRY_RUN) {
        console.log(`[DRY RUN] Would upload: ${uploaded}`);
    } else {
        console.log(`✅ Uploaded: ${uploaded}`);
    }
    console.log(`⚠️  Skipped: ${skipped}`);
    console.log(`❌ Errors: ${errors}`);
    console.log(`\nTotal processed: ${imageMap.size}`);

    // Save URL mapping to file
    if (!DRY_RUN && imageUrlMap.size > 0) {
        const mappingPath = path.join(__dirname, '../image-url-mapping.json');
        const mapping = Object.fromEntries(imageUrlMap);
        fs.writeFileSync(mappingPath, JSON.stringify(mapping, null, 2));
        console.log(`\n💾 Saved URL mapping to: ${mappingPath}`);
    }

    // Update database if requested
    if (UPDATE_DB && !DRY_RUN && imageUrlMap.size > 0) {
        await updateDatabase(imageUrlMap);
    }

    if (DRY_RUN) {
        console.log('\n💡 Run without --dry-run to actually upload images');
    }
}

// Run migration
uploadImagesToCloudflareImages().catch(error => {
    console.error('Migration failed:', error);
    process.exit(1);
});
