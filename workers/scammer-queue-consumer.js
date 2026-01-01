/**
 * ============================================================================
 * SCAMMER QUEUE CONSUMER WORKER
 * ============================================================================
 * 
 * Clean, simple queue consumer that processes Discord messages for scammer data.
 * 
 * KEY PRINCIPLE: The `scammer_job_messages` table is the SINGLE source of truth
 * for job completion. Each message is tracked individually. Job completes when
 * all messages are in a terminal state (completed, skipped, or failed).
 * 
 * Deploy: wrangler deploy --config scammer-queue-consumer-wrangler.toml
 * 
 * ============================================================================
 */

export default {
  async queue(batch, env) {
    const db = env.DB || env.DBA;
    if (!db) {
      console.error('[QUEUE] No database binding found');
      return;
    }

    console.log(`[QUEUE] Received batch of ${batch.messages.length} messages`);

    for (const message of batch.messages) {
      await processMessage(message, env, db);
    }
  }
};

// ============================================================================
// MESSAGE PROCESSING
// ============================================================================

async function processMessage(message, env, db) {
  // Thread evidence is now bundled with the message (pre-fetched in roblox-proxy.js)
  const { jobId, messageId, channelId, message: discordMsg, threadEvidence } = message.body;
  
  try {
    console.log(`[QUEUE] Processing ${messageId} for job ${jobId}${threadEvidence ? ' (has thread)' : ''}`);
    
    // 1. Mark message as processing
    await db.prepare(`
      UPDATE scammer_job_messages 
      SET status = 'processing'
      WHERE job_id = ? AND message_id = ?
    `).bind(jobId, messageId).run();
    
    // 2. Check if job is still active
    const job = await db.prepare(`
      SELECT status FROM scammer_job_status WHERE job_id = ?
    `).bind(jobId).first();
    
    if (!job || job.status === 'completed' || job.status === 'cancelled') {
      console.log(`[QUEUE] Job ${jobId} is ${job?.status || 'not found'}, skipping`);
      await markMessageDone(db, jobId, messageId, 'skipped', 'Job not active');
      message.ack();
      return;
    }
    
    // 3. Extract and store scammer data (with bundled thread evidence)
    const result = await extractAndStoreScammer(discordMsg, env, db, jobId, threadEvidence);
    
    // 4. Mark message with final status
    if (result.processed) {
      await markMessageDone(db, jobId, messageId, 'completed');
      await incrementProcessed(db, jobId);
      const evidenceNote = threadEvidence ? ` + ${threadEvidence.length} evidence msgs` : '';
      console.log(`[QUEUE] ✓ Processed ${messageId} - user ${result.userId}${evidenceNote}`);
    } else {
      await markMessageDone(db, jobId, messageId, 'skipped', result.reason);
      console.log(`[QUEUE] - Skipped ${messageId}: ${result.reason}`);
    }
    
    // 5. Check if job is complete (no separate thread fetch needed!)
    await checkJobCompletion(db, jobId);
    
    message.ack();
    
  } catch (err) {
    console.error(`[QUEUE ERROR] ${messageId}:`, err.message);
    await markMessageDone(db, jobId, messageId, 'failed', err.message);
    message.ack(); // Ack to prevent infinite retries - error is logged in table
  }
}

async function markMessageDone(db, jobId, messageId, status, error = null) {
  await db.prepare(`
    UPDATE scammer_job_messages 
    SET status = ?, processed_at = ?, error = ?
    WHERE job_id = ? AND message_id = ?
  `).bind(status, Date.now(), error, jobId, messageId).run();
}

async function incrementProcessed(db, jobId) {
  await db.prepare(`
    UPDATE scammer_job_status 
    SET messages_processed = messages_processed + 1, last_activity_at = ?
    WHERE job_id = ?
  `).bind(Date.now(), jobId).run();
}

async function checkJobCompletion(db, jobId) {
  // Count remaining messages (queued or still processing)
  const remaining = await db.prepare(`
    SELECT COUNT(*) as count 
    FROM scammer_job_messages 
    WHERE job_id = ? AND status IN ('queued', 'processing')
  `).bind(jobId).first();
  
  if (remaining.count > 0) {
    return; // Not done yet
  }
  
  // All messages processed - mark job complete
  // Thread evidence is already bundled in messages, no separate fetch needed!
  const lockResult = await db.prepare(`
    UPDATE scammer_job_status 
    SET status = 'completed', completed_at = ?, last_activity_at = ?
    WHERE job_id = ? AND status = 'running'
  `).bind(Date.now(), Date.now(), jobId).run();
  
  if (lockResult.changes > 0) {
    console.log(`[QUEUE] ✓ Job ${jobId} completed!`);
  }
}

// ============================================================================
// SCAMMER DATA EXTRACTION
// ============================================================================

async function extractAndStoreScammer(msg, env, db, jobId, threadEvidence = null) {
  // Aggregate all content from message
  const content = aggregateMessageContent(msg);
  
  // Extract Roblox user ID from profile URL
  const robloxUserId = extractRobloxUserId(content);
  if (!robloxUserId) {
    return { processed: false, reason: 'No Roblox profile URL' };
  }
  
  // Extract other data
  const displayName = extractDisplayName(content);
  const robloxUsername = extractRobloxUsername(content);
  const discordIds = extractDiscordIds(content);
  const victims = extractVictims(content);
  const itemsScammed = extractItemsScammed(content);
  const altIds = extractAltIds(content);
  
  // Thread ID = Message ID if we have thread evidence (Discord's design)
  const threadId = threadEvidence ? msg.id : (msg.thread?.id || null);
  
  // Fetch Roblox profile
  let robloxData = null;
  try {
    robloxData = await fetchRobloxProfile(robloxUserId);
  } catch (e) {
    console.warn(`[QUEUE] Failed to fetch Roblox profile for ${robloxUserId}`);
  }
  
  // Fetch Discord profiles
  const discordProfiles = [];
  for (const discordId of discordIds.slice(0, 3)) { // Limit to 3
    try {
      const profile = await fetchDiscordProfile(discordId, env);
      if (profile) discordProfiles.push(profile);
    } catch (e) {
      console.warn(`[QUEUE] Failed to fetch Discord profile for ${discordId}`);
    }
    await delay(200);
  }
  
  // Fetch alt profiles
  const altProfiles = [];
  for (const altId of altIds.slice(0, 5)) { // Limit to 5
    try {
      const profile = await fetchRobloxProfile(altId);
      if (profile) altProfiles.push(profile);
    } catch (e) {
      console.warn(`[QUEUE] Failed to fetch alt profile for ${altId}`);
    }
    await delay(200);
  }
  
  // Store in database with bundled thread evidence
  await storeScammerData({
    userId: robloxUserId,
    robloxUsername: robloxData?.name || robloxUsername,
    robloxDisplayName: robloxData?.displayName || displayName,
    robloxAvatar: robloxData?.avatar,
    discordProfiles,
    victims,
    itemsScammed,
    altProfiles,
    threadId,
    threadEvidence, // Pre-fetched thread evidence!
    messageId: msg.id
  }, db);
  
  return { processed: true, userId: robloxUserId };
}

function aggregateMessageContent(msg) {
  let content = msg.content || '';
  
  // Add embed content
  if (msg.embeds) {
    for (const embed of msg.embeds) {
      if (embed.description) content += '\n' + embed.description;
      if (embed.title) content += '\n' + embed.title;
      if (embed.fields) {
        for (const field of embed.fields) {
          content += '\n' + (field.name || '') + ' ' + (field.value || '');
        }
      }
    }
  }
  
  // Add referenced message content
  if (msg.referenced_message?.content) {
    content += '\n' + msg.referenced_message.content;
  }
  
  return content;
}

// ============================================================================
// EXTRACTION HELPERS
// ============================================================================

function extractRobloxUserId(content) {
  const patterns = [
    /roblox\.com\/users\/(\d+)/i,
    /roblox profile[:\s]*https?:\/\/(?:www\.)?roblox\.com\/users\/(\d+)/i,
    /roblox alts[:\s]*.*?roblox\.com\/users\/(\d+)/i
  ];
  
  for (const pattern of patterns) {
    const match = content.match(pattern);
    if (match) return match[1];
  }
  return null;
}

function extractDisplayName(content) {
  const match = content.match(/display[:\s*]+(\S+)/i);
  return match ? match[1].replace(/\*\*/g, '').trim() : null;
}

function extractRobloxUsername(content) {
  const match = content.match(/roblox user[:\s*]+(\S+)/i);
  return match ? match[1].replace(/\*\*/g, '').trim() : null;
}

function extractDiscordIds(content) {
  const ids = [];
  
  // Match patterns like "discord user: 123456, 789012" or "discord user: NA"
  const discordMatch = content.match(/discord user[:\s*]+([^\n]+)/i);
  if (discordMatch) {
    const value = discordMatch[1].replace(/\*\*/g, '').trim();
    if (value.toLowerCase() !== 'na') {
      const idMatches = value.match(/\d{17,20}/g);
      if (idMatches) ids.push(...idMatches);
    }
  }
  
  return [...new Set(ids)]; // Dedupe
}

function extractVictims(content) {
  const match = content.match(/victims[:\s*]+([^\n]+)/i);
  if (!match) return null;
  const value = match[1].replace(/\*\*/g, '').replace(/\*/g, '').trim();
  return value.toLowerCase() === 'na' ? null : value;
}

function extractItemsScammed(content) {
  const match = content.match(/items scammed[:\s*]+([^\n]+)/i);
  if (!match) return null;
  const value = match[1].replace(/\*\*/g, '').replace(/\*/g, '').trim();
  return value.toLowerCase() === 'na' ? null : value;
}

function extractAltIds(content) {
  const ids = [];
  
  // Find roblox alts section
  const altsMatch = content.match(/roblox alts[:\s*]+(.+?)(?=\n\n|$)/is);
  if (altsMatch) {
    const altsSection = altsMatch[1];
    if (altsSection.toLowerCase().trim() !== 'na') {
      const urlMatches = altsSection.match(/roblox\.com\/users\/(\d+)/gi);
      if (urlMatches) {
        for (const url of urlMatches) {
          const idMatch = url.match(/(\d+)/);
          if (idMatch) ids.push(idMatch[1]);
        }
      }
    }
  }
  
  return [...new Set(ids)]; // Dedupe
}

// ============================================================================
// API HELPERS
// ============================================================================

async function fetchRobloxProfile(userId) {
  const response = await fetch(`https://users.roblox.com/v1/users/${userId}`);
  if (!response.ok) return null;
  
  const user = await response.json();
  
  // Get avatar
  let avatar = null;
  try {
    const avatarRes = await fetch(
      `https://thumbnails.roblox.com/v1/users/avatar-headshot?userIds=${userId}&size=150x150&format=Png`
    );
    if (avatarRes.ok) {
      const avatarData = await avatarRes.json();
      avatar = avatarData.data?.[0]?.imageUrl;
    }
  } catch (e) { /* ignore */ }
  
  return {
    userId,
    name: user.name,
    displayName: user.displayName,
    avatar
  };
}

async function fetchDiscordProfile(discordId, env) {
  if (!env.DISCORD_BOT_TOKEN) return null;
  
  const response = await fetch(`https://discord.com/api/v10/users/${discordId}`, {
    headers: { Authorization: `Bot ${env.DISCORD_BOT_TOKEN}` }
  });
  
  if (!response.ok) return null;
  
  const user = await response.json();
  return {
    id: user.id,
    username: user.username,
    displayName: user.global_name || user.username
  };
}

async function storeScammerData(data, db) {
  const primaryDiscordId = data.discordProfiles[0]?.id || null;
  const primaryDiscordName = data.discordProfiles[0]?.displayName || null;
  const altsJson = data.altProfiles.length > 0 ? JSON.stringify(data.altProfiles) : null;
  // Thread evidence is pre-fetched and bundled - store it directly
  const threadEvidenceJson = data.threadEvidence ? JSON.stringify(data.threadEvidence) : null;
  
  await db.prepare(`
    INSERT INTO scammer_profile_cache (
      user_id, roblox_username, roblox_display_name, avatar_url,
      discord_id, discord_display_name, victims, items_scammed,
      roblox_alts, thread_id, thread_evidence, message_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(user_id) DO UPDATE SET
      roblox_username = COALESCE(excluded.roblox_username, roblox_username),
      roblox_display_name = COALESCE(excluded.roblox_display_name, roblox_display_name),
      avatar_url = COALESCE(excluded.avatar_url, avatar_url),
      discord_id = COALESCE(excluded.discord_id, discord_id),
      discord_display_name = COALESCE(excluded.discord_display_name, discord_display_name),
      victims = CASE WHEN excluded.victims IS NOT NULL AND excluded.victims != '' THEN excluded.victims ELSE victims END,
      items_scammed = CASE WHEN excluded.items_scammed IS NOT NULL AND excluded.items_scammed != '' THEN excluded.items_scammed ELSE items_scammed END,
      roblox_alts = CASE WHEN excluded.roblox_alts IS NOT NULL THEN excluded.roblox_alts ELSE roblox_alts END,
      thread_id = COALESCE(excluded.thread_id, thread_id),
      thread_evidence = CASE WHEN excluded.thread_evidence IS NOT NULL THEN excluded.thread_evidence ELSE thread_evidence END,
      message_id = COALESCE(excluded.message_id, message_id)
  `).bind(
    data.userId,
    data.robloxUsername,
    data.robloxDisplayName,
    data.robloxAvatar,
    primaryDiscordId,
    primaryDiscordName,
    data.victims,
    data.itemsScammed,
    altsJson,
    data.threadId,
    threadEvidenceJson,
    data.messageId
  ).run();
}

// ============================================================================
// UTILITIES
// ============================================================================

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
