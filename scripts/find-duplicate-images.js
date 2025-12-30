/**
 * Script to find duplicate Cloudflare Images URLs in D1 database
 * 
 * This helps identify items that incorrectly share the same image URL
 * due to filename-only matching in the SQL update script.
 * 
 * Usage:
 *   node scripts/find-duplicate-images.js
 */

const https = require('https');
const http = require('http');

// API endpoint to query items
const API_BASE = process.env.API_BASE || 'https://emwiki.com';

/**
 * Fetch all items from D1 database via API endpoint
 */
async function getAllItems() {
    console.log('Fetching all items from D1 database...\n');
    
    const categories = ['gears', 'deaths', 'titles', 'pets', 'effects'];
    const allItems = [];
    
    for (const category of categories) {
        try {
            let offset = 0;
            const limit = 500;
            let hasMore = true;
            
            while (hasMore) {
                const url = `${API_BASE}/api/items?category=${category}&limit=${limit}&offset=${offset}`;
                
                let data;
                if (typeof fetch !== 'undefined') {
                    const response = await fetch(url);
                    if (!response.ok) {
                        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
                    }
                    data = await response.json();
                } else {
                    // Fallback for Node < 18
                    data = await new Promise((resolve, reject) => {
                        https.get(url, (res) => {
                            let body = '';
                            res.on('data', (chunk) => body += chunk);
                            res.on('end', () => {
                                try {
                                    resolve(JSON.parse(body));
                                } catch (e) {
                                    reject(e);
                                }
                            });
                        }).on('error', reject);
                    });
                }
                
                const items = data.items || [];
                if (items.length > 0) {
                    allItems.push(...items);
                    hasMore = items.length === limit;
                    offset += limit;
                } else {
                    hasMore = false;
                }
            }
        } catch (error) {
            console.error(`Error fetching ${category} items:`, error.message);
        }
    }
    
    console.log(`Found ${allItems.length} total items\n`);
    return allItems;
}

/**
 * Find duplicate Cloudflare Images URLs
 */
function findDuplicates(items) {
    console.log('Analyzing Cloudflare Images URLs...\n');
    
    // Group items by Cloudflare Images URL
    const urlMap = new Map();
    
    items.forEach(item => {
        if (item.img && (item.img.includes('imagedelivery.net') || item.img.includes('cloudflare-images.com'))) {
            const url = item.img.split('?')[0]; // Remove query params for grouping
            
            if (!urlMap.has(url)) {
                urlMap.set(url, []);
            }
            
            urlMap.get(url).push({
                id: item.id,
                name: item.name,
                category: item.category,
                originalImg: item.img
            });
        }
    });
    
    // Find duplicates (URLs with more than 1 item)
    const duplicates = [];
    for (const [url, items] of urlMap.entries()) {
        if (items.length > 1) {
            duplicates.push({ url, items });
        }
    }
    
    return duplicates;
}

/**
 * Main function
 */
async function main() {
    try {
        const items = await getAllItems();
        const duplicates = findDuplicates(items);
        
        if (duplicates.length === 0) {
            console.log('✅ No duplicate Cloudflare Images URLs found!');
            return;
        }
        
        console.log(`⚠️  Found ${duplicates.length} duplicate Cloudflare Images URLs:\n`);
        console.log('='.repeat(80));
        
        duplicates.forEach((dup, index) => {
            console.log(`\n${index + 1}. ${dup.url}`);
            console.log('   Items sharing this image:');
            dup.items.forEach(item => {
                console.log(`   - ${item.name} (${item.category}, ID: ${item.id})`);
            });
            console.log('-'.repeat(80));
        });
        
        console.log(`\n📊 Summary:`);
        console.log(`   Total duplicate URLs: ${duplicates.length}`);
        console.log(`   Total items affected: ${duplicates.reduce((sum, dup) => sum + dup.items.length, 0)}`);
        
        // Generate fix suggestions
        console.log(`\n💡 To fix this, we need to regenerate the SQL with full path matching.`);
        console.log(`   Run: node scripts/update-db-image-urls.js --full-path`);
        
    } catch (error) {
        console.error('Error:', error);
        process.exit(1);
    }
}

// Run
main();

