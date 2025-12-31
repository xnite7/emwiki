/**
 * ============================================================================
 * SCAMMER QUEUE CONSUMER WORKER
 * ============================================================================
 * 
 * This Worker processes messages from the SCAMMER_QUEUE queue.
 * Messages are enqueued by emwiki/functions/api/roblox-proxy.js
 * 
 * Deploy as a separate Worker with queue consumer binding.
 * See emwiki/workers/scammer-queue-consumer-wrangler.toml for configuration.
 * 
 * ============================================================================
 */

// ============================================================================
// SECTION 1: QUEUE CONSUMER HANDLER
// ============================================================================

export default {
  async queue(batch, env) {
    const messages = batch.messages;
    const results = [];
    
    // Process messages sequentially to avoid overwhelming Discord API
    for (const message of messages) {
      try {
        const { jobId, messageId, channelId, message: msg } = message.body;
        
        console.log(`[QUEUE] Processing message ${messageId} for job ${jobId}`);
        
        // Check database binding first
        const db = env.DB || env.DBA;
        if (!db) {
          throw new Error('D1 database binding not found. Check wrangler.toml - binding should be "DB" or "DBA". Also verify database_id is set correctly.');
        }
        
        // Process the message (pass db to avoid re-checking)
        const processed = await processQueuedMessage(msg, env, channelId, jobId, db);
        
        // Update job progress atomically
        // Only increment if message was actually processed (had Roblox URL)
        const jobStatus = await db.prepare(`
          SELECT messages_processed, total_messages
          FROM scammer_job_status
          WHERE job_id = ?
        `).bind(jobId).first();
        
        if (!jobStatus) {
          console.warn(`[QUEUE] Job ${jobId} not found in database`);
          message.ack(); // Ack to prevent infinite retries
          continue;
        }
        
        // Only increment if message was processed (not skipped)
        const newProcessed = processed ? (jobStatus.messages_processed || 0) + 1 : (jobStatus.messages_processed || 0);
        
        await db.prepare(`
          UPDATE scammer_job_status 
          SET messages_processed = ?, last_activity_at = ?, current_message_id = ?
          WHERE job_id = ?
        `).bind(newProcessed, Date.now(), messageId, jobId).run();
        
        // Check if all messages are processed
        if (newProcessed >= jobStatus.total_messages) {
          console.log(`[QUEUE] Job ${jobId} complete - all ${newProcessed} messages processed`);
          await logJobActivity(env, jobId, 'messages_complete', null, `All ${newProcessed} messages processed, fetching threads`, db);
          
          // Fetch threads after all messages are done
          await fetchAllThreadMessages(env, jobId, db);
          
          await db.prepare(`
            UPDATE scammer_job_status 
            SET status = 'completed', completed_at = ?, last_activity_at = ?
            WHERE job_id = ?
          `).bind(Date.now(), Date.now(), jobId).run();
        }
        
        if (processed) {
          results.push({ success: true, messageId });
        } else {
          // Message was skipped (no Roblox URL) - ack to remove from queue
          results.push({ success: true, messageId, skipped: true });
        }
        message.ack();
        
        // Small delay between messages to respect Discord rate limits
        if (messages.indexOf(message) < messages.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      } catch (err) {
        console.error(`[QUEUE ERROR] Processing message ${message.messageId || 'unknown'}:`, err);
        console.error(`[QUEUE ERROR] Stack:`, err.stack);
        results.push({ success: false, error: err.message });
        
        // Let queue handle retries - don't ack, don't retry manually
        // The queue will retry based on max_retries and retry_delay settings
        message.retry();
      }
    }
    
    console.log(`[QUEUE] Batch processed: ${results.filter(r => r.success).length}/${messages.length} successful`);
    return results;
  }
};

// ============================================================================
// SECTION 2: MESSAGE PROCESSING
// ============================================================================

/**
 * Process a single Discord message from the queue
 * Extracts scammer data and stores it in D1
 * Returns true if processed, false if skipped (no Roblox URL)
 */
async function processQueuedMessage(msg, env, channelId, jobId, db) {
  // Get content from message
  let content = msg.content || '';
  if (msg.referenced_message && msg.referenced_message.content) {
    content += '\n' + msg.referenced_message.content;
  }
  if (msg.embeds && msg.embeds.length > 0) {
    for (const embed of msg.embeds) {
      if (embed.description) content += '\n' + embed.description;
      if (embed.title) content += '\n' + embed.title;
      if (embed.fields && Array.isArray(embed.fields)) {
        for (const field of embed.fields) {
          if (field.name) content += '\n' + field.name;
          if (field.value) content += '\n' + field.value;
        }
      }
    }
  }
  
  // Extract Roblox User ID
  const userId = extractRobloxUserId(content);
  if (!userId) {
    console.log(`[QUEUE] Skipping message ${msg.id} - no Roblox profile URL found`);
    return false; // Skip messages without Roblox profile URL
  }
  
  console.log(`[QUEUE] Processing message ${msg.id} for user ${userId}`);
  
  // Extract fields
  const displayName = extractDisplayName(content);
  const robloxUsername = extractRobloxUsername(content);
  const discordIds = extractDiscordIds(content);
  const victims = extractVictims(content);
  const itemsScammed = extractItemsScammed(content);
  const altIds = extractAltIds(content);
  
  // Fetch Roblox profile
  let robloxData = null;
  try {
    const robloxPromise = fetchRobloxProfile(userId, env);
    const timeoutPromise = new Promise((_, reject) => 
      setTimeout(() => reject(new Error('Roblox profile fetch timeout')), 15000)
    );
    robloxData = await Promise.race([robloxPromise, timeoutPromise]);
  } catch (err) {
    console.warn(`[${msg.id}] Roblox profile fetch error:`, err.message);
  }
  
  // Fetch Discord profiles
  const discordProfiles = [];
  for (const discordId of discordIds) {
    try {
      const profilePromise = fetchDiscordProfile(discordId, env, userId);
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Discord profile fetch timeout')), 10000)
      );
      const profile = await Promise.race([profilePromise, timeoutPromise]);
      if (profile) {
        discordProfiles.push({ id: discordId, ...profile });
      }
    } catch (err) {
      console.warn(`[${msg.id}] Discord profile fetch error:`, err.message);
    }
  }
  
  // Fetch alt accounts
  const altProfiles = [];
  for (const alt of altIds) {
    try {
      const altPromise = fetchRobloxProfile(alt.userId, env);
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Alt profile fetch timeout')), 15000)
      );
      const altData = await Promise.race([altPromise, timeoutPromise]);
      if (altData) {
        altProfiles.push({
          userId: alt.userId,
          username: alt.username || altData.name,
          displayName: altData.displayName,
          avatar: altData.avatar
        });
      }
    } catch (err) {
      console.warn(`[${msg.id}] Alt profile fetch error:`, err.message);
    }
  }
  
  // Detect thread
  let threadId = null;
  if (msg.thread && msg.thread.id) {
    threadId = msg.thread.id;
  }
  
  // Store data (pass db to avoid re-checking)
  await storeScammerData({
    userId,
    robloxUsername: robloxData?.name || robloxUsername,
    robloxDisplayName: robloxData?.displayName || displayName,
    robloxAvatar: robloxData?.avatar,
    discordProfiles,
    victims,
    itemsScammed,
    altProfiles,
    threadId,
    messageId: msg.id
  }, env, db);
  
  return true; // Message was processed successfully
}

// ============================================================================
// SECTION 3: DATA EXTRACTION FUNCTIONS
// ============================================================================

/**
 * Extract Roblox user ID from message content
 */
function extractRobloxUserId(content) {
  const patterns = [
    /https:\/\/www\.roblox\.com\/users\/(\d+)\/profile/i,
    /roblox\.com\/users\/(\d+)\/profile/i,
    /roblox\.com\/users\/(\d+)\//i
  ];
  for (const pattern of patterns) {
    const match = content.match(pattern);
    if (match && match[1]) return match[1];
  }
  return null;
}

function extractDisplayName(content) {
  // Handle both :emoji: and <:emoji:id> formats, with optional ** markdown
  const patterns = [
    /<:\w+:\d+>\s*\*{0,2}\s*display:\s*\*{0,2}\s*([^\n\r]+)/i,
    /:\w+:\s*\*{0,2}\s*display:\s*\*{0,2}\s*([^\n\r]+)/i,
    /(?:display|display\s*name)[:\s]*\*{0,2}\s*([^\n:]+)/i
  ];
  
  for (const pattern of patterns) {
    const match = content.match(pattern);
    if (match) {
      let value = match[1].trim();
      // Remove markdown bold
      value = value.replace(/\*\*/g, '').replace(/\*/g, '').trim();
      if (!value || value.toUpperCase() === 'NA') return null;
      return value;
    }
  }
  return null;
}

function extractRobloxUsername(content) {
  // Handle both :emoji: and <:emoji:id> formats, with optional ** markdown
  const patterns = [
    /<:\w+:\d+>\s*\*{0,2}\s*roblox\s*user:\s*\*{0,2}\s*([^\n\r]+)/i,
    /:\w+:\s*\*{0,2}\s*roblox\s*user:\s*\*{0,2}\s*([^\n\r]+)/i,
    /(?:roblox\s*user|roblox\s*username)[:\s]*\*{0,2}\s*([^\n:]+)/i
  ];
  
  for (const pattern of patterns) {
    const match = content.match(pattern);
    if (match) {
      let value = match[1].trim();
      // Remove markdown bold
      value = value.replace(/\*\*/g, '').replace(/\*/g, '').trim();
      if (!value || value.toUpperCase() === 'NA') return null;
      return value;
    }
  }
  return null;
}

function extractDiscordIds(content) {
  const ids = [];
  // Handle both :emoji: and <:emoji:id> formats
  const patterns = [
    /<:\w+:\d+>\s*\*{0,2}\s*discord\s*user:\s*\*{0,2}\s*([^\n\r]+)/i,
    /:\w+:\s*\*{0,2}\s*discord\s*user:\s*\*{0,2}\s*([^\n\r]+)/i,
    /(?:discord\s*user)[:\s]*\*{0,2}\s*([^\n]+)/i
  ];
  
  for (const pattern of patterns) {
    const match = content.match(pattern);
    if (match) {
      let idsStr = match[1].trim();
      // Remove markdown bold
      idsStr = idsStr.replace(/\*\*/g, '').replace(/\*/g, '').trim();
      if (idsStr.toLowerCase() !== 'na') {
        const idMatches = idsStr.match(/\d{17,19}/g);
        if (idMatches) ids.push(...idMatches);
      }
      break; // Use first match
    }
  }
  return ids;
}

function extractVictims(content) {
  // Handle both :emoji: and <:emoji:id> formats, with optional ** markdown
  const patterns = [
    /<:\w+:\d+>\s*\*{0,2}\s*victims?:\s*\*{0,2}\s*([^\n\r]+)/i,
    /:\w+:\s*\*{0,2}\s*victims?:\s*\*{0,2}\s*([^\n\r]+)/i,
    /(?:victims?)[:\s]*\*{0,2}\s*([^\n]+)/i
  ];
  
  for (const pattern of patterns) {
    const match = content.match(pattern);
    if (match) {
      let value = match[1].trim();
      // Remove markdown bold (**) and single asterisks
      value = value.replace(/\*\*/g, '').replace(/\*/g, '').trim();
      if (!value || value.toUpperCase() === 'NA') return null;
      return value;
    }
  }
  return null;
}

function extractItemsScammed(content) {
  // Handle both :emoji: and <:emoji:id> formats, with optional ** markdown
  const patterns = [
    /<:\w+:\d+>\s*\*{0,2}\s*items?\s+scammed?:\s*\*{0,2}\s*([^\n\r]+)/i,
    /:\w+:\s*\*{0,2}\s*items?\s+scammed?:\s*\*{0,2}\s*([^\n\r]+)/i,
    /(?:items?\s*scammed)[:\s]*\*{0,2}\s*([^\n]+)/i
  ];
  
  for (const pattern of patterns) {
    const match = content.match(pattern);
    if (match) {
      let value = match[1].trim();
      // Remove markdown bold (**) and single asterisks
      value = value.replace(/\*\*/g, '').replace(/\*/g, '').trim();
      if (!value || value.toUpperCase() === 'NA') return null;
      return value;
    }
  }
  return null;
}

function extractAltIds(content) {
  const alts = [];
  const altSection = content.match(/(?:roblox\s*alts?)[:\s]*([\s\S]+?)(?:\n\n|\n\*\*|$)/i);
  if (altSection && altSection[1].toLowerCase().trim() !== 'na') {
    const urlMatches = altSection[1].match(/https?:\/\/[^\s]+/g);
    if (urlMatches) {
      for (const url of urlMatches) {
        const userIdMatch = url.match(/\/users\/(\d+)\//);
        if (userIdMatch) {
          const usernameMatch = url.match(/\(([^)]+)\)/);
          alts.push({
            userId: userIdMatch[1],
            username: usernameMatch ? usernameMatch[1] : null
          });
        }
      }
    }
  }
  return alts;
}

// ============================================================================
// SECTION 4: API FETCHING FUNCTIONS
// ============================================================================

/**
 * Fetch Roblox profile data
 */
async function fetchRobloxProfile(userId, env) {
  if (!userId || !/^\d+$/.test(userId)) return null;
  
  const [userData, avatarData] = await Promise.all([
    fetch(`https://users.roblox.com/v1/users/${userId}`).then(r => r.ok ? r.json() : null),
    fetch(`https://thumbnails.roblox.com/v1/users/avatar-headshot?userIds=${userId}&size=150x150&format=Png&isCircular=true`)
      .then(r => r.ok ? r.json() : null)
  ]);
  
  if (!userData) return null;
  
  return {
    name: userData.name,
    displayName: userData.displayName,
    avatar: avatarData?.data?.[0]?.imageUrl || null
  };
}

/**
 * Fetch Discord profile data
 */
async function fetchDiscordProfile(discordId, env, robloxUserId) {
  try {
    const response = await fetch(`https://discord.com/api/v10/users/${discordId}`, {
      headers: { Authorization: `Bot ${env.DISCORD_BOT_TOKEN}` }
    });
    
    if (!response.ok) return null;
    
    const data = await response.json();
    return {
      displayName: data.global_name || data.username,
      username: data.username
    };
  } catch (err) {
    return null;
  }
}

// ============================================================================
// SECTION 5: DATA STORAGE
// ============================================================================

/**
 * Store scammer data in D1 database
 */
async function storeScammerData(data, env, db) {
  // db is passed from caller, but check if not provided
  if (!db) {
    db = env.DB || env.DBA;
    if (!db) {
      throw new Error('D1 database binding not found');
    }
  }
  
  const primaryDiscordId = data.discordProfiles[0]?.id || null;
  const primaryDiscordDisplay = data.discordProfiles[0]?.displayName || null;
  
  const threadEvidence = data.threadId ? JSON.stringify({
    thread_id: data.threadId,
    _pending_fetch: true
  }) : null;
  
  await db.prepare(`
    INSERT INTO scammer_profile_cache (
      user_id, roblox_name, roblox_display_name, roblox_avatar,
      discord_id, discord_display_name,
      victims, items_scammed, roblox_alts,
      thread_evidence, last_message_id
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(user_id) DO UPDATE SET
      roblox_name = excluded.roblox_name,
      roblox_display_name = excluded.roblox_display_name,
      roblox_avatar = excluded.roblox_avatar,
      discord_id = excluded.discord_id,
      discord_display_name = excluded.discord_display_name,
      victims = CASE WHEN excluded.victims IS NOT NULL AND excluded.victims != '' THEN excluded.victims ELSE victims END,
      items_scammed = CASE WHEN excluded.items_scammed IS NOT NULL AND excluded.items_scammed != '' THEN excluded.items_scammed ELSE items_scammed END,
      roblox_alts = excluded.roblox_alts,
      thread_evidence = CASE 
        WHEN excluded.thread_evidence IS NOT NULL THEN excluded.thread_evidence 
        ELSE thread_evidence 
      END,
      last_message_id = excluded.last_message_id
  `).bind(
    data.userId,
    data.robloxUsername,
    data.robloxDisplayName,
    data.robloxAvatar,
    primaryDiscordId,
    primaryDiscordDisplay,
    data.victims,
    data.itemsScammed,
    JSON.stringify(data.altProfiles),
    threadEvidence,
    data.messageId
  ).run();
}

async function logJobActivity(env, jobId, step, messageId, details) {
  try {
    const db = env.DB || env.DBA;
    if (!db) {
      console.warn(`[QUEUE] D1 database binding not found, skipping log`);
      return;
    }
    
    const jobStatus = await db.prepare(`
      SELECT logs FROM scammer_job_status WHERE job_id = ?
    `).bind(jobId).first();
    
    let logs = [];
    if (jobStatus?.logs) {
      try {
        logs = JSON.parse(jobStatus.logs);
      } catch (e) {
        logs = [];
      }
    }
    
    logs.push({
      timestamp: Date.now(),
      step,
      messageId,
      details
    });
    
    // Keep only last 100 log entries
    if (logs.length > 100) {
      logs = logs.slice(-100);
    }
    
    await db.prepare(`
      UPDATE scammer_job_status 
      SET logs = ?, last_activity_at = ?, current_step = ?, current_message_id = ?
      WHERE job_id = ?
    `).bind(JSON.stringify(logs), Date.now(), step, messageId || null, jobId).run();
  } catch (err) {
    console.error(`Failed to log job activity:`, err);
  }
}

// ============================================================================
// SECTION 6: THREAD FETCHING
// ============================================================================

/**
 * Fetch all thread messages for scammers after main messages are processed
 */
async function fetchAllThreadMessages(env, jobId, db = null) {
  if (!db) {
    db = env.DB || env.DBA;
    if (!db) {
      console.warn(`[QUEUE] D1 database binding not found, skipping thread fetch`);
      return;
    }
  }
  
  const { results } = await db.prepare(`
    SELECT user_id, thread_evidence, last_message_id
    FROM scammer_profile_cache
    WHERE thread_evidence IS NOT NULL
  `).all();
  
  if (!results || results.length === 0) return;
  
  await logJobActivity(env, jobId, 'threads_found', null, `Found ${results.length} scammers with threads`);
  
  // Import fetchDiscordThread from main file logic
  // For now, just mark threads as pending - full implementation can be added later
  for (const row of results) {
    try {
      const threadEvidence = JSON.parse(row.thread_evidence);
      const threadId = threadEvidence?.thread_id;
      if (!threadId) continue;
      
      await logJobActivity(env, jobId, 'thread_pending', threadId, `Thread ${threadId} queued for processing`);
    } catch (err) {
      console.error(`Error processing thread:`, err);
    }
  }
}

