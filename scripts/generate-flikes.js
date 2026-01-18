/**
 * Generate target_flikes values for all items
 * 
 * This script:
 * 1. Fetches all items from the production API
 * 2. For each item, fetches real preference count (favorites + wishlists)
 * 3. Calculates target_flikes = real + random boost
 *    - Under 10 real: boost 10-50
 *    - 10+ real: boost 50-80
 * 4. Outputs SQL UPDATE statements to stdout
 * 
 * Usage:
 *   node scripts/generate-flikes.js > flikes-update.sql
 *   wrangler d1 execute DBA --file=flikes-update.sql
 */

const API_BASE = 'https://emwiki.com/api';

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

// Fetch preference stats for an item
async function getPreferenceStats(itemName) {
    try {
        const url = `${API_BASE}/auth/user/preferences/stats?item=${encodeURIComponent(itemName)}`;
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
    
    console.error('Fetching items from API...');
    
    while (true) {
        const url = `${API_BASE}/items?limit=${limit}&offset=${offset}`;
        const data = await fetchWithRetry(url);
        
        if (!data.items || data.items.length === 0) {
            break;
        }
        
        items.push(...data.items);
        console.error(`  Fetched ${items.length} items...`);
        
        if (data.items.length < limit) {
            break;
        }
        
        offset += limit;
    }
    
    return items;
}

async function main() {
    console.error('=== Generate target_flikes Script ===\n');
    
    // Fetch all items
    const items = await getAllItems();
    console.error(`\nTotal items: ${items.length}\n`);
    
    // Output SQL header
    console.log('-- Generated target_flikes values');
    console.log(`-- Generated at: ${new Date().toISOString()}`);
    console.log(`-- Total items: ${items.length}`);
    console.log('');
    console.log('BEGIN TRANSACTION;');
    console.log('');
    
    // Process each item
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
            
            console.log(`-- "${item.name}": real=${realCount}, boost=${boost}, target=${targetFlikes}`);
            console.log(`UPDATE items SET target_flikes = ${targetFlikes} WHERE name = '${escapeSql(item.name)}';`);
            console.log('');
            
            processed++;
        }
        
        console.error(`  Processed ${processed}/${items.length} items...`);
        
        // Small delay between batches to be nice to the API
        if (i + batchSize < items.length) {
            await new Promise(r => setTimeout(r, 500));
        }
    }
    
    console.log('COMMIT;');
    console.log('');
    console.log(`-- Done! Updated ${processed} items.`);
    
    console.error(`\nDone! Generated SQL for ${processed} items.`);
    console.error('Pipe output to a file: node scripts/generate-flikes.js > flikes-update.sql');
}

main().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
});

