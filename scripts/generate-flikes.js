/**
 * Generate target_flikes values for all items
 * 
 * This script:
 * 1. Fetches all items from the production API (with IDs)
 * 2. For each item, fetches real preference count (favorites + wishlists)
 * 3. Calculates target_flikes = real + random boost
 *    - Under 10 real: boost 10-50
 *    - 10+ real: boost 50-80
 * 4. Outputs SQL files optimized for D1 (using IDs, batched updates)
 * 
 * Usage:
 *   cd emwiki
 *   node scripts/generate-flikes.js
 *   # Then run each generated file:
 *   wrangler d1 execute DBA --file=flikes-update-1.sql
 */

const fs = require('fs');
const path = require('path');

const API_BASE = 'https://emwiki.com/api';
const ITEMS_PER_FILE = 500; // More items per file since we're using IDs (faster)

// Random integer between min and max (inclusive)
function randomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

// Calculate boost based on real like count
function calculateBoost(realCount) {
    if (realCount < 10) {
        return randomInt(10, 50);
    } else {
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
            await new Promise(r => setTimeout(r, 1000 * (i + 1)));
        }
    }
}

// Fetch REAL preference stats for multiple items at once (bulk API)
async function getBulkPreferenceStats(itemNames) {
    try {
        const url = `${API_BASE}/auth/user/preferences/stats?real=true`;
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ items: itemNames })
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        return data.itemCounts || {};
    } catch (error) {
        console.error(`Error fetching bulk stats: ${error.message}`);
        // Return zeros for all items on error
        const result = {};
        itemNames.forEach(name => { result[name] = 0; });
        return result;
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
    console.log('=== Generate target_flikes Script (Optimized) ===\n');
    
    // Fetch all items
    const items = await getAllItems();
    console.log(`\nTotal items: ${items.length}\n`);
    
    // Check that items have IDs
    const itemsWithIds = items.filter(item => item.id);
    if (itemsWithIds.length !== items.length) {
        console.log(`Warning: ${items.length - itemsWithIds.length} items missing IDs, will use names for those`);
    }
    
    // Process items in larger batches for bulk stats API
    const sqlStatements = [];
    let processed = 0;
    const batchSize = 50; // Larger batch for bulk API
    
    console.log('Fetching preference stats and calculating flikes...\n');
    
    for (let i = 0; i < items.length; i += batchSize) {
        const batch = items.slice(i, i + batchSize);
        const itemNames = batch.map(item => item.name);
        
        // Fetch stats for all items in batch at once
        const statsMap = await getBulkPreferenceStats(itemNames);
        
        // Generate SQL for each item using ID (primary key = fast!)
        for (const item of batch) {
            const realCount = statsMap[item.name] || 0;
            const boost = calculateBoost(realCount);
            const targetFlikes = realCount + boost;
            
            // Use ID for fast primary key lookup
            if (item.id) {
                sqlStatements.push({
                    comment: `-- [${item.id}] "${item.name}": real=${realCount}, boost=${boost}, target=${targetFlikes}`,
                    sql: `UPDATE items SET target_flikes = ${targetFlikes} WHERE id = ${item.id};`
                });
            } else {
                // Fallback to name if no ID
                sqlStatements.push({
                    comment: `-- "${item.name}": real=${realCount}, boost=${boost}, target=${targetFlikes}`,
                    sql: `UPDATE items SET target_flikes = ${targetFlikes} WHERE name = '${escapeSql(item.name)}';`
                });
            }
            
            processed++;
        }
        
        console.log(`  Processed ${processed}/${items.length} items...`);
        
        // Small delay between batches
        if (i + batchSize < items.length) {
            await new Promise(r => setTimeout(r, 200));
        }
    }
    
    // Split into files
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
        content += `-- Items ${start + 1} to ${end} of ${sqlStatements.length}\n`;
        content += `-- Using IDs for fast primary key lookups\n\n`;
        
        // Just the SQL statements, no comments (smaller file, faster execution)
        for (const stmt of chunk) {
            content += `${stmt.sql}\n`;
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
    
    // Also generate a batch script
    const batchScript = outputFiles.map(f => `wrangler d1 execute DBA --file=${f}`).join('\n');
    fs.writeFileSync('run-flikes-updates.ps1', batchScript);
    console.log('Or run all at once: .\\run-flikes-updates.ps1');
}

main().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
});
