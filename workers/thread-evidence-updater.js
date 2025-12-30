/**

 * Cloudflare Worker for scheduled thread evidence updates
 * 
 * This Worker runs every 5 hours and calls the Pages Function endpoint
 * to update thread evidence for the last 10 entries.
 * 
 * Deploy this as a separate Worker with cron trigger:
 * wrangler.toml:
 *   [[triggers.crons]]
 *   cron = "0 */5 * * *"
 */

export default {
  async scheduled(event, env, ctx) {
    ctx.waitUntil(updateThreadEvidence());
  }
};

async function updateThreadEvidence() {
  try {
    const response = await fetch('https://emwiki.com/api/roblox-proxy?mode=update-thread-evidence', {
      method: 'GET',
      headers: {
        'User-Agent': 'ThreadEvidenceUpdater/1.0'
      }
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Thread evidence update failed: ${response.status}`, errorText);
      return;
    }

    const result = await response.json();
    console.log('Thread evidence update completed:', {
      processed: result.processed,
      updated: result.updated,
      images_downloaded: result.images_downloaded,
      entries_checked: result.entries_checked,
      entries_processed: result.entries_processed
    });
  } catch (error) {
    console.error('Error calling thread evidence update:', error);
  }
}

