/**
 * Queue Consumer for Scammer Message Processing
 * 
 * This file processes messages from the SCAMMER_QUEUE queue.
 * Each message is processed independently, avoiding timeout issues.
 * 
 * Queue binding must be configured in wrangler.toml or Pages settings:
 * [[queues.consumers]]
 * queue = "scammer-messages"
 * max_batch_size = 10
 * max_batch_timeout = 30
 */

export async function onQueueBatch(batch, env) {
  const messages = batch.messages;
  const results = [];
  
  for (const message of messages) {
    try {
      const { jobId, messageId, channelId, message: msg } = message.body;
      
      // Import processScammerMessage from the main file
      // Since we can't import directly, we'll inline the processing logic
      await processQueuedMessage(msg, env, channelId, jobId);
      
      // Update job progress
      const jobStatus = await env.DB.prepare(`
        SELECT messages_processed, total_messages
        FROM scammer_job_status
        WHERE job_id = ?
      `).bind(jobId).first();
      
      const newProcessed = (jobStatus?.messages_processed || 0) + 1;
      
      await env.DB.prepare(`
        UPDATE scammer_job_status 
        SET messages_processed = ?, last_activity_at = ?, current_message_id = ?
        WHERE job_id = ?
      `).bind(newProcessed, Date.now(), messageId, jobId).run();
      
      // Check if all messages are processed
      if (jobStatus && newProcessed >= jobStatus.total_messages) {
        // Import logJobActivity and fetchAllThreadMessages
        await logJobActivity(env, jobId, 'messages_complete', null, 'All messages processed, fetching threads');
        await fetchAllThreadMessages(env, jobId);
        
        await env.DB.prepare(`
          UPDATE scammer_job_status 
          SET status = 'completed', completed_at = ?, last_activity_at = ?
          WHERE job_id = ?
        `).bind(Date.now(), Date.now(), jobId).run();
      }
      
      results.push({ success: true, messageId });
      message.ack();
    } catch (err) {
      console.error(`[QUEUE ERROR] Processing message:`, err);
      results.push({ success: false, error: err.message });
      // Don't ack on error - queue will retry automatically
      message.retry();
    }
  }
  
  return results;
}

// Helper function to process a queued message
// This duplicates processScammerMessage logic but keeps queue consumer independent
async function processQueuedMessage(msg, env, channelId, jobId) {
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
    return; // Skip messages without Roblox profile URL
  }
  
  // Extract fields (reuse extraction functions from main file)
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
  
  // Store data
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
  }, env);
}

// Import helper functions - these need to be available
// For now, we'll need to duplicate them or use a shared module
// TODO: Extract to shared module

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
  const match = content.match(/(?:display|display\s*name)[:\s]*([^\n:]+)/i);
  return match ? match[1].trim() : null;
}

function extractRobloxUsername(content) {
  const match = content.match(/(?:roblox\s*user|roblox\s*username)[:\s]*([^\n:]+)/i);
  return match ? match[1].trim() : null;
}

function extractDiscordIds(content) {
  const ids = [];
  const match = content.match(/(?:discord\s*user)[:\s]*([^\n]+)/i);
  if (match) {
    const idsStr = match[1].trim();
    if (idsStr.toLowerCase() !== 'na') {
      const idMatches = idsStr.match(/\d{17,19}/g);
      if (idMatches) ids.push(...idMatches);
    }
  }
  return ids;
}

function extractVictims(content) {
  const match = content.match(/(?:victims?)[:\s]*([^\n]+)/i);
  return match ? match[1].trim() : null;
}

function extractItemsScammed(content) {
  const match = content.match(/(?:items?\s*scammed)[:\s]*([^\n]+)/i);
  return match ? match[1].trim() : null;
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

async function storeScammerData(data, env) {
  const primaryDiscordId = data.discordProfiles[0]?.id || null;
  const primaryDiscordDisplay = data.discordProfiles[0]?.displayName || null;
  
  const threadEvidence = data.threadId ? JSON.stringify({
    thread_id: data.threadId,
    _pending_fetch: true
  }) : null;
  
  await env.DB.prepare(`
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
    const jobStatus = await env.DB.prepare(`
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
    
    await env.DB.prepare(`
      UPDATE scammer_job_status 
      SET logs = ?, last_activity_at = ?, current_step = ?, current_message_id = ?
      WHERE job_id = ?
    `).bind(JSON.stringify(logs), Date.now(), step, messageId || null, jobId).run();
  } catch (err) {
    console.error(`Failed to log job activity:`, err);
  }
}

async function fetchAllThreadMessages(env, jobId) {
  // This function is imported from main file - duplicate logic here
  // TODO: Extract to shared module
  const { results } = await env.DB.prepare(`
    SELECT user_id, thread_evidence, last_message_id
    FROM scammer_profile_cache
    WHERE thread_evidence IS NOT NULL
  `).all();
  
  if (!results || results.length === 0) return;
  
  for (const row of results) {
    try {
      const threadEvidence = JSON.parse(row.thread_evidence);
      const threadId = threadEvidence?.thread_id;
      if (!threadId) continue;
      
      // Fetch thread messages (simplified - full implementation in main file)
      // For now, just mark as pending
      await logJobActivity(env, jobId, 'thread_pending', threadId, `Thread ${threadId} queued for processing`);
    } catch (err) {
      console.error(`Error processing thread:`, err);
    }
  }
}

