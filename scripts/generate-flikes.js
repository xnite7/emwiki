/**
 * Generate target_flikes values for all items
 * 
 * This script:
 * 1. Fetches all items from the production API
 * 2. For each item, fetches real preference count (favorites + wishlists)
 * 3. Calculates target_flikes = real + random boost
 *    - Under 10 real: boost 10-50
 *    - 10+ real: boost 50-80
 * 4. Outputs multiple SQL files (to avoid D1 size limits)
 * 
 * Usage:
 *   cd emwiki
 *   node scripts/generate-flikes.js
 *   # Then run each generated file:
 *   wrangler d1 execute DBA --file=flikes-update-1.sql
 *   wrangler d1 execute DBA --file=flikes-update-2.sql
 *   # etc.
 */

const fs = require('fs');
const path = require('path');

const API_BASE = 'https://emwiki.com/api';
const ITEMS_PER_FILE = 200; // Split into files of 200 items each

// Random integer between min and max (inclusive)
function randomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

// Calculate boost based on real like count
function calculateBoost(realCount) {
    if (realCount < 10) {
        // Low engagement: small boost (10-50)
        return randomInt(10, 50);
    } else {
        // Higher engagement: bigger boost (50-80)
        return randomInt(50, 80);
    }
}

// Escape single quotes for SQL
function escapeSql(str) {
    return str.replace(/'/g, "''");
}

// Fetch with retry
async function fetchWithRetry(url, retries = 3) {
    for (let i = 0; i < retries; i++) {
        try {
            const response = await fetch(url);
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }
            return await response.json();
        } catch (error) {
            if (i === retries - 1) throw error;
            await new Promise(r => setTimeout(r, 1000 * (i + 1))); // Exponential backoff
        }
    }
}

// Fetch REAL preference stats for an item (bypasses flikes, gets actual user counts)
async function getPreferenceStats(itemName) {
    try {
        // Use ?real=true to get actual counts from user_item_preferences table
        const url = `${API_BASE}/auth/user/preferences/stats?item=${encodeURIComponent(itemName)}&real=true`;
        const data = await fetchWithRetry(url);
        return (data.favorites_count || 0) + (data.wishlist_count || 0);
    } catch (error) {
        console.error(`-- Error fetching stats for "${itemName}": ${error.message}`);
        return 0;
    }
}

// Fetch all items from the API
async function getAllItems() {
    const items = [];
    let offset = 0;
    const limit = 100;
    
    console.log('Fetching items from API...');
    
    while (true) {
        const url = `${API_BASE}/items?limit=${limit}&offset=${offset}`;
        const data = await fetchWithRetry(url);
        
        if (!data.items || data.items.length === 0) {
            break;
        }
        
        items.push(...data.items);
        console.log(`  Fetched ${items.length} items...`);
        
        if (data.items.length < limit) {
            break;
        }
        
        offset += limit;
    }
    
    return items;
}

async function main() {
    console.log('=== Generate target_flikes Script ===\n');
    
    // Fetch all items
    const items = await getAllItems();
    console.log(`\nTotal items: ${items.length}\n`);
    
    // Process each item and collect SQL statements
    const sqlStatements = [];
    let processed = 0;
    const batchSize = 10; // Process in batches to avoid rate limiting
    
    for (let i = 0; i < items.length; i += batchSize) {
        const batch = items.slice(i, i + batchSize);
        
        // Fetch stats for batch in parallel
        const statsPromises = batch.map(item => getPreferenceStats(item.name));
        const stats = await Promise.all(statsPromises);
        
        // Generate SQL for each item
        for (let j = 0; j < batch.length; j++) {
            const item = batch[j];
            const realCount = stats[j];
            const boost = calculateBoost(realCount);
            const targetFlikes = realCount + boost;
            
            sqlStatements.push({
                comment: `-- "${item.name}": real=${realCount}, boost=${boost}, target=${targetFlikes}`,
                sql: `UPDATE items SET target_flikes = ${targetFlikes} WHERE name = '${escapeSql(item.name)}';`
            });
            
            processed++;
        }
        
        console.log(`  Processed ${processed}/${items.length} items...`);
        
        // Small delay between batches to be nice to the API
        if (i + batchSize < items.length) {
            await new Promise(r => setTimeout(r, 500));
        }
    }
    
    // Split into multiple files
    const totalFiles = Math.ceil(sqlStatements.length / ITEMS_PER_FILE);
    console.log(`\nWriting ${totalFiles} SQL files (${ITEMS_PER_FILE} items each)...\n`);
    
    const outputFiles = [];
    
    for (let fileNum = 0; fileNum < totalFiles; fileNum++) {
        const start = fileNum * ITEMS_PER_FILE;
        const end = Math.min(start + ITEMS_PER_FILE, sqlStatements.length);
        const chunk = sqlStatements.slice(start, end);
        
        const fileName = `flikes-update-${fileNum + 1}.sql`;
        const filePath = path.join(process.cwd(), fileName);
        
        let content = `-- Generated target_flikes values (Part ${fileNum + 1}/${totalFiles})\n`;
        content += `-- Generated at: ${new Date().toISOString()}\n`;
        content += `-- Items ${start + 1} to ${end} of ${sqlStatements.length}\n\n`;
        
        for (const stmt of chunk) {
            content += `${stmt.comment}\n${stmt.sql}\n\n`;
        }
        
        fs.writeFileSync(filePath, content);
        outputFiles.push(fileName);
        console.log(`  Created ${fileName} (${chunk.length} items)`);
    }
    
    console.log(`\n✅ Done! Generated ${totalFiles} SQL files.\n`);
    console.log('To apply to production, run each file:');
    console.log('');
    for (const file of outputFiles) {
        console.log(`  wrangler d1 execute DBA --file=${file}`);
    }
    console.log('');
}

main().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
});
