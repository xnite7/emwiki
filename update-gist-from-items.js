#!/usr/bin/env node

/**
 * Update Gist Script - Updates the GitHub gist with the current items.json data
 *
 * This script reads items.json and sends it to the /api/update-gist endpoint
 */

const fs = require('fs');
const https = require('https');

// Configuration
const ITEMS_JSON = './items.json';
const UPDATE_GIST_ENDPOINT = 'https://emwiki.com/api/update-gist';
const USERNAME = 'migration-script'; // Change this to your username

/**
 * Update the gist with new data
 */
async function updateGist() {
  console.log('='.repeat(60));
  console.log('📝 Updating GitHub Gist');
  console.log('='.repeat(60));

  // Read items.json
  console.log('\n1️⃣  Reading items.json...');
  if (!fs.existsSync(ITEMS_JSON)) {
    console.error(`   ✗ ${ITEMS_JSON} not found!`);
    process.exit(1);
  }

  const itemsData = JSON.parse(fs.readFileSync(ITEMS_JSON, 'utf8'));
  console.log(`   ✓ Loaded items.json`);

  // Count items
  let totalItems = 0;
  for (const category in itemsData) {
    if (Array.isArray(itemsData[category])) {
      totalItems += itemsData[category].length;
    }
  }
  console.log(`   ✓ Found ${totalItems} items across ${Object.keys(itemsData).length} categories`);

  // Send to API
  console.log('\n2️⃣  Sending to API...');
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify({
      username: USERNAME,
      content: itemsData,
      force: true // Force update without version check
    });

    const url = new URL(UPDATE_GIST_ENDPOINT);
    const options = {
      method: 'POST',
      hostname: url.hostname,
      path: url.pathname,
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload)
      }
    };

    const req = https.request(options, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        try {
          if (res.statusCode !== 200) {
            console.error(`   ✗ API returned status ${res.statusCode}`);
            console.error(`   Response: ${data}`);
            reject(new Error(`API error: ${res.statusCode}`));
            return;
          }

          const result = JSON.parse(data);
          console.log('   ✓ Gist updated successfully!');

          if (result.readableDiff) {
            console.log('\n📋 Changes:');
            console.log(result.readableDiff.split('\n').map(line => '   ' + line).join('\n'));
          }

          console.log('\n' + '='.repeat(60));
          console.log('✅ Gist Update Complete!');
          console.log('='.repeat(60));
          console.log(`Version: ${result.newVersion || 'unknown'}`);
          console.log('\n🔗 View gist at:');
          console.log('   https://gist.github.com/0d0a3800287f3e7c6e5e944c8337fa91');
          console.log('='.repeat(60));

          resolve(result);
        } catch (e) {
          console.error(`   ✗ Invalid response: ${data}`);
          reject(new Error('Invalid JSON response'));
        }
      });
    });

    req.on('error', (error) => {
      console.error('   ✗ Request failed:', error.message);
      reject(error);
    });

    req.write(payload);
    req.end();
  });
}

// Run update
updateGist().catch(error => {
  console.error('\n❌ Update failed:', error.message);
  process.exit(1);
});
