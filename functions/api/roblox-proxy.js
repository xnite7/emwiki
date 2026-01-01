/**
 * ============================================================================
 * ROBLOX PROXY API - Main API endpoint for Roblox/Discord data
 * ============================================================================
 * 
 * This file handles:
 * - Roblox profile fetching (with caching)
 * - Discord profile fetching (with caching)
 * - Scammer data processing (queue-based)
 * - Thread evidence management
 * - Media proxying (Discord images/videos)
 * - CDN asset proxying
 * 
 * Queue Consumer: See emwiki/workers/scammer-queue-consumer.js
 * ============================================================================
 */

// Helper function to fetch Roblox profile with caching
// writeToScammerCache: if false, only reads from cache but doesn't write (for general endpoint use)
async function fetchRobloxProfile(userId, env, writeToScammerCache = true) {
  if (!userId || !/^\d+$/.test(userId)) {
    return null;
  }

  const now = Date.now();

  // Check cache first (only if writeToScammerCache is true, otherwise don't use scammer cache)
  let cached = null;
  if (writeToScammerCache) {
    cached = await env.DB.prepare(
      "SELECT roblox_name, roblox_display_name, roblox_avatar FROM scammer_profile_cache WHERE user_id = ?"
    ).bind(userId).first();

    if (cached && cached.roblox_name && cached.roblox_display_name && cached.roblox_avatar) {
      return {
        name: cached.roblox_name,
        displayName: cached.roblox_display_name,
        avatar: cached.roblox_avatar
      };
    }
  }

  // Fetch from API with retry logic
  let fetchSuccess = false;
  let data = null;

  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const [userData, avatarData] = await Promise.all([
        fetch(`https://users.roblox.com/v1/users/${userId}`).then(r => r.ok ? r.json() : null),
        fetch(`https://thumbnails.roblox.com/v1/users/avatar-headshot?userIds=${userId}&size=150x150&format=Png&isCircular=true`)
          .then(r => r.ok ? r.json() : null)
      ]);

      if (userData) {
        data = {
          name: userData.name,
          displayName: userData.displayName,
          avatar: avatarData?.data?.[0]?.imageUrl || null
        };
        fetchSuccess = true;
        break;
      }
    } catch (err) {
      console.warn(`Roblox fetch attempt ${attempt + 1} failed:`, err);
    }

    if (!fetchSuccess) {
      await new Promise(r => setTimeout(r, 500 * (attempt + 1)));
    }
  }

  if (!fetchSuccess || !data) {
    return null;
  }

  // Update cache ONLY if writeToScammerCache is true (for scammer processing)
  if (writeToScammerCache) {
    await env.DB.prepare(`
      INSERT INTO scammer_profile_cache (user_id, roblox_name, roblox_display_name, roblox_avatar)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(user_id) DO UPDATE SET
        roblox_name = excluded.roblox_name,
        roblox_display_name = excluded.roblox_display_name,
        roblox_avatar = excluded.roblox_avatar
    `).bind(userId, data.name || null, data.displayName || null, data.avatar || null).run();
  }

  return data;
}

/**
 * Fetch Discord profile with caching
 * @param {string} discordId - Discord user ID
 * @param {object} env - Environment variables
 * @param {string|null} userId - Optional Roblox user ID for cache lookup
 * @param {boolean} writeToScammerCache - If false, only reads from cache (for general endpoint use)
 */
async function fetchDiscordProfile(discordId, env, userId = null, writeToScammerCache = true) {
  if (!discordId || !/^\d+$/.test(discordId)) {
    return null;
  }

  const now = Date.now();

  // Check cache first - only if writeToScammerCache is true
  let cached = null;
  if (writeToScammerCache) {
    // Prefer user_id match if provided
    if (userId) {
      cached = await env.DB.prepare(
        "SELECT discord_display_name FROM scammer_profile_cache WHERE user_id = ?"
      ).bind(userId).first();
    }
    
    if (!cached) {
      cached = await env.DB.prepare(
        "SELECT discord_display_name FROM scammer_profile_cache WHERE discord_id = ? LIMIT 1"
      ).bind(discordId).first();
    }

    if (cached && cached.discord_display_name) {
      return {
        displayName: cached.discord_display_name
      };
    }
  }

  // Fetch from Discord API with retry logic
  let fetchSuccess = false;
  let data = null;

  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const response = await fetch(`https://discord.com/api/v10/users/${discordId}`, {
        headers: { Authorization: `Bot ${env.DISCORD_BOT_TOKEN}` }
      });

      if (response.status === 429) {
        const retryAfter = await response.json();
        await new Promise(r => setTimeout(r, (retryAfter.retry_after || 1) * 1000));
        continue;
      }

      if (response.status === 404) {
        // User not found - return null (don't cache for general endpoint)
        data = { displayName: null };
        fetchSuccess = true;
        break;
      }

      if (response.ok) {
        const userData = await response.json();
        const displayName = userData.global_name || userData.username || null;

        data = { displayName };
        fetchSuccess = true;
        break;
      }
    } catch (err) {
      console.warn(`Discord fetch attempt ${attempt + 1} failed:`, err);
    }

    if (!fetchSuccess) {
      await new Promise(r => setTimeout(r, 500 * (attempt + 1)));
    }
  }

  if (!fetchSuccess || !data) {
    return null;
  }

  // Update cache ONLY if writeToScammerCache is true (for scammer processing)
  if (writeToScammerCache) {
    if (userId) {
      await env.DB.prepare(`
        UPDATE scammer_profile_cache
        SET discord_id = ?, discord_display_name = ?
        WHERE user_id = ?
      `).bind(discordId, data.displayName, userId).run();
    } else {
      await env.DB.prepare(`
        UPDATE scammer_profile_cache
        SET discord_display_name = ?
        WHERE discord_id = ?
      `).bind(data.displayName, discordId).run();
    }
  }

  return data;
}


// ============================================================================
// SECTION 2: DATA EXTRACTION HELPERS
// ============================================================================

function extractDisplayName(content) {
  // Handle both :emoji: and <:emoji:id> formats, with optional ** markdown
  const patterns = [
    /<:\w+:\d+>\s*\*{0,2}\s*display:\s*\*{0,2}\s*([^\n\r]+)/i,
    /:\w+:\s*\*{0,2}\s*display:\s*\*{0,2}\s*([^\n\r]+)/i
  ];
  
  for (const pattern of patterns) {
    const match = content.match(pattern);
    if (match) {
      let value = match[1].trim();
      // Remove markdown bold and emoji
      value = value.replace(/\*\*/g, '').replace(/\*/g, '').replace(/<:\w+:\d+>/g, '').replace(/:\w+:/g, '').trim();
      if (value) return value;
    }
  }
  return null;
}

function extractRobloxUsername(content) {
  // Handle both :emoji: and <:emoji:id> formats, with optional ** markdown
  const patterns = [
    /<:\w+:\d+>\s*\*{0,2}\s*roblox\s+user:\s*\*{0,2}\s*([^\n\r]+)/i,
    /:\w+:\s*\*{0,2}\s*roblox\s+user:\s*\*{0,2}\s*([^\n\r]+)/i
  ];
  
  for (const pattern of patterns) {
    const match = content.match(pattern);
    if (match) {
      let value = match[1].trim();
      // Remove markdown bold and emoji
      value = value.replace(/\*\*/g, '').replace(/\*/g, '').replace(/<:\w+:\d+>/g, '').replace(/:\w+:/g, '').trim();
      if (value) return value;
    }
  }
  return null;
}

function extractDiscordIds(content) {
  // Handle both :emoji: and <:emoji:id> formats, with optional ** markdown
  // Also handle multi-line Discord IDs
  const patterns = [
    /<:\w+:\d+>\s*\*{0,2}\s*discord\s+user:\s*\*{0,2}\s*([\s\S]+?)(?=\n\n|\n(?::\w+:|<:\w+:\d+>|roblox|victims|items|$))/i,
    /:\w+:\s*\*{0,2}\s*discord\s+user:\s*\*{0,2}\s*([\s\S]+?)(?=\n\n|\n(?::\w+:|<:\w+:\d+>|roblox|victims|items|$))/i
  ];
  
  let match = null;
  for (const pattern of patterns) {
    match = content.match(pattern);
    if (match) break;
  }
  
  if (!match) return [];
  
  let value = match[1].trim();
  // Remove markdown bold and emoji
  value = value.replace(/\*\*/g, '').replace(/\*/g, '').replace(/<:\w+:\d+>/g, '').replace(/:\w+:/g, '').trim();
  if (!value || value.toUpperCase() === 'NA') return [];
  
  // Split by comma or newline, then filter
  const ids = value.split(/[,\n\r]+/)
    .map(id => id.trim())
    .filter(id => id && id.toUpperCase() !== 'NA' && /^\d+$/.test(id));
  
  return ids;
}

function extractVictims(content) {
  // Handle both :emoji: and <:emoji:id> formats, with optional ** markdown
  const patterns = [
    /<:\w+:\d+>\s*\*{0,2}\s*victims?:\s*\*{0,2}\s*([^\n\r]+)/i,
    /:\w+:\s*\*{0,2}\s*victims?:\s*\*{0,2}\s*([^\n\r]+)/i
  ];
  
  for (const pattern of patterns) {
    const match = content.match(pattern);
    if (match) {
      let value = match[1].trim();
      // Remove markdown bold and emoji
      value = value.replace(/\*\*/g, '').replace(/\*/g, '').replace(/<:\w+:\d+>/g, '').replace(/:\w+:/g, '').trim();
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
    /:\w+:\s*\*{0,2}\s*items?\s+scammed?:\s*\*{0,2}\s*([^\n\r]+)/i
  ];
  
  for (const pattern of patterns) {
    const match = content.match(pattern);
    if (match) {
      let value = match[1].trim();
      // Remove markdown bold and emoji
      value = value.replace(/\*\*/g, '').replace(/\*/g, '').replace(/<:\w+:\d+>/g, '').replace(/:\w+:/g, '').trim();
      if (!value || value.toUpperCase() === 'NA') return null;
      return value;
    }
  }
  return null;
}

function extractAltIds(content) {
  // Match "roblox alts:" section until next section or end
  const match = content.match(/roblox\s+alts?:\s*([\s\S]+?)(?:\n\n|\n(?:roblox\s+profile|$)|$)/i);
  if (!match) return [];
  
  const altBlock = match[1].trim();
  if (!altBlock || altBlock.toUpperCase() === 'NA') return [];
  
  // Extract user IDs from profile URLs
  const userIds = [...altBlock.matchAll(/roblox\.com\/users\/(\d+)\/profile/g)].map(m => m[1]);
  
  if (userIds.length === 0) return [];
  
  // Extract usernames - can be in parentheses OR on the next line after URL
  const alts = [];
  const lines = altBlock.split('\n');
  
  for (let i = 0; i < userIds.length; i++) {
    const userId = userIds[i];
    let username = null;
    
    // Method 1: Check for username in parentheses on same line
    const urlPattern = new RegExp(`roblox\\.com/users/${userId}/profile[^\\n]*\\(([^)]+)\\)`, 'i');
    const parenMatch = altBlock.match(urlPattern);
    if (parenMatch) {
      username = parenMatch[1].trim();
    } else {
      // Method 2: Check for username on next line after URL
      // Find the line with the URL
      for (let j = 0; j < lines.length; j++) {
        if (lines[j].includes(`roblox.com/users/${userId}/profile`)) {
          // Check if there's text after the URL on the same line
          const sameLineMatch = lines[j].match(/profile\s+([^\s\n\r]+)/i);
          if (sameLineMatch) {
            username = sameLineMatch[1].trim();
          } else if (j + 1 < lines.length) {
            // Check next line for username
            const nextLine = lines[j + 1].trim();
            if (nextLine && !nextLine.match(/^https?:\/\//) && !nextLine.match(/^roblox\.com/)) {
              username = nextLine;
            }
          }
          break;
        }
      }
    }
    
    alts.push({
      userId,
      username: username || null
    });
  }
  
  return alts;
}

function extractRobloxUserId(content) {
  // Match Roblox profile URL - handle markdown formatting and various formats
  const patterns = [
    /https:\/\/www\.roblox\.com\/users\/(\d+)\/profile/i,
    /roblox\.com\/users\/(\d+)\/profile/i,
    /roblox\.com\/users\/(\d+)\//i
  ];
  
  for (const pattern of patterns) {
    const match = content.match(pattern);
    if (match && match[1]) {
      return match[1];
    }
  }
  
  return null;
}


// ============================================================================
// SECTION 3: UTILITY FUNCTIONS
// ============================================================================

/**
 * Delay helper for rate limiting
 */
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Log job activity to database
 */
async function logJobActivity(env, jobId, step, messageId = null, details = null) {
  const now = Date.now();
  try {
    // Get current logs
    const job = await env.DB.prepare(`
      SELECT logs FROM scammer_job_status WHERE job_id = ?
    `).bind(jobId).first();
    
    const logs = job?.logs ? JSON.parse(job.logs) : [];
    logs.push({
      timestamp: now,
      step,
      messageId,
      details
    });
    
    // Keep only last 100 log entries
    if (logs.length > 100) {
      logs.shift();
    }
    
    await env.DB.prepare(`
      UPDATE scammer_job_status 
      SET last_activity_at = ?, current_message_id = ?, current_step = ?, logs = ?
      WHERE job_id = ?
    `).bind(now, messageId, step, JSON.stringify(logs), jobId).run();
  } catch (err) {
    console.error(`Failed to log job activity:`, err);
  }
}

// ============================================================================
// SECTION 4: SCAMMER MESSAGE PROCESSING
// ============================================================================

/**
 * Process a single Discord message and extract scammer data
 * Called by queue consumer (scammer-queue-consumer.js)
 */

async function processScammerMessage(msg, env, channelId, jobId = null) {
  // Get content from message content AND embeds (Discord sometimes puts content in embeds)
  let content = msg.content || '';
  const originalContentLength = content.length;
  
  // Check if message references another message (replies) - the referenced message might have the content
  if (msg.referenced_message && msg.referenced_message.content) {
    content += '\n' + msg.referenced_message.content;
  }
  
  // Also check embeds for content
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
      // Also check embed footer and author
      if (embed.footer && embed.footer.text) content += '\n' + embed.footer.text;
      if (embed.author && embed.author.name) content += '\n' + embed.author.name;
    }
  }
  
  // Check if message has components (buttons/select menus) - sometimes content is there
  if (msg.components && Array.isArray(msg.components)) {
    for (const row of msg.components) {
      if (row.components && Array.isArray(row.components)) {
        for (const component of row.components) {
          if (component.label) content += '\n' + component.label;
          if (component.placeholder) content += '\n' + component.placeholder;
        }
      }
    }
  }
  
  // REQUIRED: Roblox User ID (skip if missing)
  let userId = extractRobloxUserId(content);
  
  // If no userId found and message references another message, check the referenced message
  if (!userId && msg.referenced_message && msg.referenced_message.content) {
    const referencedContent = msg.referenced_message.content;
    userId = extractRobloxUserId(referencedContent);
    if (userId) {
      // Found it in referenced message - use that content instead
      content = referencedContent + '\n' + content;
      console.log(`[${msg.id}] Found Roblox URL in referenced message ${msg.referenced_message.id}`);
      if (jobId) await logJobActivity(env, jobId, 'found_in_reference', msg.id, `Found Roblox URL in referenced message ${msg.referenced_message.id}`);
    }
  }
  
  if (!userId) {
    // Log more details for debugging - check what's actually in the message
    const hasEmbeds = msg.embeds && msg.embeds.length > 0;
    const hasReference = msg.referenced_message ? true : false;
    let embedDebug = '';
    if (hasEmbeds) {
      embedDebug = ` Embeds: ${msg.embeds.length}`;
      msg.embeds.forEach((embed, idx) => {
        embedDebug += ` [${idx}: title=${embed.title || 'none'}, desc=${embed.description ? embed.description.substring(0, 50) : 'none'}, fields=${embed.fields ? embed.fields.length : 0}]`;
      });
    }
    const refDebug = hasReference ? ` Has referenced_message (${msg.referenced_message.id})` : '';
    
    // Check if "roblox" appears anywhere in content (case-insensitive)
    const hasRobloxKeyword = /roblox/i.test(content);
    const robloxDebug = hasRobloxKeyword ? ' (contains "roblox")' : ' (NO "roblox" keyword)';
    
    // Show first 300 chars and last 300 chars to see if content is truncated
    const firstPart = content.substring(0, 300).replace(/\n/g, ' ');
    const lastPart = content.length > 300 ? content.substring(content.length - 300).replace(/\n/g, ' ') : '';
    const preview = lastPart ? `${firstPart} ... [last 300: ${lastPart}]` : firstPart;
    
    console.log(`Skipping message ${msg.id} - no Roblox profile URL found. Original content: ${originalContentLength} chars, Total: ${content.length} chars${embedDebug}${refDebug}${robloxDebug}. Preview: ${preview}`);
    if (jobId) {
      await logJobActivity(env, jobId, 'message_skipped', msg.id, 
        `No Roblox profile URL. Original: ${originalContentLength} chars, Total: ${content.length} chars${embedDebug}${refDebug}${robloxDebug}. Preview: ${preview.substring(0, 200)}`);
    }
    return;
  }
  
  if (jobId) await logJobActivity(env, jobId, 'extracting_fields', msg.id, `Extracting fields for user ${userId}`);
  
  // Extract all fields
  const displayName = extractDisplayName(content);
  const robloxUsername = extractRobloxUsername(content);
  const discordIds = extractDiscordIds(content);
  const victims = extractVictims(content);
  const itemsScammed = extractItemsScammed(content);
  const altIds = extractAltIds(content);
  
  console.log(`[PROCESSING] Message ${msg.id} - userId: ${userId}, victims: ${victims || 'none'}, itemsScammed: ${itemsScammed || 'none'}, alts: ${altIds.length}, discordIds: ${discordIds.length}`);
  
  // Fetch Roblox profile with timeout protection
  if (jobId) await logJobActivity(env, jobId, 'fetching_roblox', msg.id, `Fetching Roblox profile for ${userId}`);
  console.log(`[${msg.id}] Fetching Roblox profile for ${userId}`);
  let robloxData = null;
  try {
    const robloxPromise = fetchRobloxProfile(userId, env);
    const timeoutPromise = new Promise((_, reject) => 
      setTimeout(() => reject(new Error('Roblox profile fetch timeout')), 15000)
    );
    robloxData = await Promise.race([robloxPromise, timeoutPromise]);
    if (!robloxData) {
      console.warn(`Failed to fetch Roblox profile for ${userId}`);
      if (jobId) await logJobActivity(env, jobId, 'roblox_failed', msg.id, `Roblox profile fetch returned null`);
    } else {
      console.log(`[${msg.id}] Roblox profile fetched: ${robloxData.name}`);
      if (jobId) await logJobActivity(env, jobId, 'roblox_success', msg.id, `Roblox profile: ${robloxData.name}`);
    }
  } catch (err) {
    console.warn(`[${msg.id}] Roblox profile fetch error for ${userId}:`, err.message);
    if (jobId) await logJobActivity(env, jobId, 'roblox_error', msg.id, err.message);
    // Continue anyway with extracted username
  }
  
  // Fetch Discord profiles (for all Discord IDs) with timeout protection
  if (jobId) await logJobActivity(env, jobId, 'fetching_discord', msg.id, `Fetching ${discordIds.length} Discord profiles`);
  const discordProfiles = [];
  for (let i = 0; i < discordIds.length; i++) {
    const discordId = discordIds[i];
    try {
      console.log(`[${msg.id}] Fetching Discord profile ${i+1}/${discordIds.length} for ${discordId}`);
      if (jobId) await logJobActivity(env, jobId, 'discord_fetch', msg.id, `Discord ${i+1}/${discordIds.length}: ${discordId}`);
      
      const profilePromise = fetchDiscordProfile(discordId, env, userId);
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Discord profile fetch timeout')), 10000)
      );
      
      const profile = await Promise.race([profilePromise, timeoutPromise]);
      if (profile) {
        discordProfiles.push({ id: discordId, ...profile });
        console.log(`[${msg.id}] Discord profile fetched: ${profile.displayName}`);
        if (jobId) await logJobActivity(env, jobId, 'discord_success', msg.id, `Discord ${discordId}: ${profile.displayName}`);
      }
    } catch (err) {
      console.warn(`[${msg.id}] Failed to fetch Discord profile for ${discordId}:`, err.message);
      if (jobId) await logJobActivity(env, jobId, 'discord_error', msg.id, `Discord ${discordId}: ${err.message}`);
      // Continue without this Discord profile
    }
  }
  
  // Fetch alt account profiles with timeout protection
  if (jobId) await logJobActivity(env, jobId, 'fetching_alts', msg.id, `Fetching ${altIds.length} alt profiles`);
  const altProfiles = [];
  for (let i = 0; i < altIds.length; i++) {
    const alt = altIds[i];
    try {
      console.log(`[${msg.id}] Fetching alt profile ${i+1}/${altIds.length} for ${alt.userId}`);
      if (jobId) await logJobActivity(env, jobId, 'alt_fetch', msg.id, `Alt ${i+1}/${altIds.length}: ${alt.userId}`);
      
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
        console.log(`[${msg.id}] Alt profile fetched: ${altData.name}`);
        if (jobId) await logJobActivity(env, jobId, 'alt_success', msg.id, `Alt ${alt.userId}: ${altData.name}`);
      }
    } catch (err) {
      console.warn(`[${msg.id}] Failed to fetch alt profile for ${alt.userId}:`, err.message);
      if (jobId) await logJobActivity(env, jobId, 'alt_error', msg.id, `Alt ${alt.userId}: ${err.message}`);
      // Continue without this alt
    }
  }
  
  // Detect thread ID during message processing (but don't fetch messages yet)
  // We'll fetch all thread messages after processing all main messages
  let threadId = null;
  try {
    if (msg.thread && msg.thread.id) {
      threadId = msg.thread.id;
      console.log(`[${msg.id}] Found thread ${threadId} via msg.thread property`);
      if (jobId) await logJobActivity(env, jobId, 'thread_detected', msg.id, `Thread detected: ${threadId}`);
    }
  } catch (err) {
    console.warn(`[${msg.id}] Error detecting thread:`, err.message);
    // Continue without thread
  }
  
  // Store in D1
  if (jobId) await logJobActivity(env, jobId, 'storing_data', msg.id, `Storing data for user ${userId}`);
  console.log(`[${msg.id}] Storing data for user ${userId}`);
  try {
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
    console.log(`[${msg.id}] Data stored successfully`);
    if (jobId) await logJobActivity(env, jobId, 'store_success', msg.id, `Data stored for user ${userId}`);
  } catch (err) {
    console.error(`[${msg.id}] Error storing data:`, err.message);
    if (jobId) await logJobActivity(env, jobId, 'store_error', msg.id, err.message);
    throw err; // Re-throw to be caught by outer handler
  }
}

/**
 * Store scammer data in D1 database
 */

async function storeScammerData(data, env) {
  // Primary Discord ID (first one, or null if none)
  const primaryDiscordId = data.discordProfiles[0]?.id || null;
  const primaryDiscordDisplay = data.discordProfiles[0]?.displayName || null;
  
  // Thread evidence (just thread_id, no messages)
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
      victims = excluded.victims,
      items_scammed = excluded.items_scammed,
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
  
  console.log(`[STORED] User ${data.userId} - ${data.robloxUsername || 'unknown'}`);
}

// ============================================================================
// SECTION 5: QUEUE MANAGEMENT - THREAD-FIRST APPROACH
// ============================================================================

/**
 * NEW APPROACH: Fetch threads first, then channel messages
 * 
 * 1. Get all threads (active + archived) in the channel
 * 2. For each thread, fetch all messages and download attachments
 * 3. Build a map: threadId -> evidence[]
 * 4. Get all channel messages
 * 5. For each message:
 *    - If message.id is in thread map, attach the evidence
 *    - Process message with its evidence bundled
 * 
 * Benefits:
 * - Threads are fetched upfront, no "missing thread" bugs
 * - Thread ID = Message ID (Discord's design)
 * - Evidence is already downloaded before processing
 * - More efficient - fewer API calls
 */

async function enqueueScammerMessages(env, jobId) {
  const channelId = env.DISCORD_CHANNEL_ID;
  
  try {
    await logJobActivity(env, jobId, 'starting', null, 'Job started - fetching threads first');
    
    // Validate environment
    if (!env.DISCORD_BOT_TOKEN) {
      throw new Error('DISCORD_BOT_TOKEN not set');
    }
    if (!channelId) {
      throw new Error('DISCORD_CHANNEL_ID not set');
    }
    if (!env.SCAMMER_QUEUE) {
      throw new Error('SCAMMER_QUEUE binding not configured');
    }
    
    // =========================================================================
    // STEP 1: Fetch all threads (active + archived)
    // =========================================================================
    await logJobActivity(env, jobId, 'fetching_threads', null, 'Fetching all threads from channel');
    
    const allThreads = [];
    
    // Fetch active threads
    const activeRes = await fetch(
      `https://discord.com/api/v10/channels/${channelId}/threads/active`,
      { headers: { Authorization: `Bot ${env.DISCORD_BOT_TOKEN}` } }
    );
    if (activeRes.ok) {
      const activeData = await activeRes.json();
      if (activeData.threads) allThreads.push(...activeData.threads);
    }
    await delay(500);
    
    // Fetch archived threads (paginated)
    let hasMore = true;
    let beforeTimestamp = null;
    while (hasMore) {
      const url = new URL(`https://discord.com/api/v10/channels/${channelId}/threads/archived/public`);
      if (beforeTimestamp) url.searchParams.set('before', beforeTimestamp);
      url.searchParams.set('limit', '100');
      
      const archivedRes = await fetch(url.toString(), {
        headers: { Authorization: `Bot ${env.DISCORD_BOT_TOKEN}` }
      });
      
      if (!archivedRes.ok) break;
      
      const archivedData = await archivedRes.json();
      if (archivedData.threads?.length) {
        allThreads.push(...archivedData.threads);
        // Get the oldest thread's archive timestamp for pagination
        const oldestThread = archivedData.threads[archivedData.threads.length - 1];
        beforeTimestamp = oldestThread.thread_metadata?.archive_timestamp;
      }
      
      hasMore = archivedData.has_more === true;
      await delay(500);
    }
    
    // Build a set of known thread IDs (for quick lookup)
    const knownThreadIds = new Set(allThreads.map(t => t.id));
    await logJobActivity(env, jobId, 'threads_indexed', null, `Indexed ${knownThreadIds.size} thread IDs`);
    
    // =========================================================================
    // STEP 2: Fetch all channel messages (FAST - no thread evidence fetching)
    // =========================================================================
    await logJobActivity(env, jobId, 'fetching_messages', null, 'Fetching channel messages');
    
    let allMessages = [];
    let lastId = null;
    
    while (true) {
      const url = new URL(`https://discord.com/api/v10/channels/${channelId}/messages`);
      url.searchParams.set('limit', '100');
      if (lastId) url.searchParams.set('before', lastId);
      
      const response = await fetch(url.toString(), {
        headers: { Authorization: `Bot ${env.DISCORD_BOT_TOKEN}` }
      });
      
      if (response.status === 429) {
        const retryAfter = await response.json();
        await delay((retryAfter.retry_after || 1) * 1000);
        continue;
      }
      
      if (!response.ok) {
        throw new Error(`Discord API error: ${response.status}`);
      }
      
      const messages = await response.json();
      if (messages.length === 0) break;
      
      allMessages.push(...messages);
      lastId = messages[messages.length - 1].id;
      await delay(500); // Faster - just fetching, not processing
    }
    
    await logJobActivity(env, jobId, 'messages_fetched', null, 
      `Fetched ${allMessages.length} channel messages`);
    
    // =========================================================================
    // STEP 3: Identify which messages have threads (from msg.thread or thread list)
    // =========================================================================
    
    // Count messages with threads
    const messagesWithThread = allMessages.filter(msg => 
      msg.thread?.id || knownThreadIds.has(msg.id)
    );
    
    await logJobActivity(env, jobId, 'threads_identified', null, 
      `${messagesWithThread.length} messages have threads (will be fetched by queue consumer)`);
    
    // =========================================================================
    // STEP 4: Bundle messages with thread IDs and enqueue
    // Thread evidence will be fetched by the queue consumer for each message
    // =========================================================================
    
    // Update total
    await env.DB.prepare(`
      UPDATE scammer_job_status 
      SET total_messages = ?, last_activity_at = ?
      WHERE job_id = ?
    `).bind(allMessages.length, Date.now(), jobId).run();
    
    // Track messages in DB
    const now = Date.now();
    const insertStmt = env.DB.prepare(`
      INSERT INTO scammer_job_messages (job_id, message_id, status, enqueued_at)
      VALUES (?, ?, ?, ?)
    `);
    
    for (let i = 0; i < allMessages.length; i += 100) {
      const chunk = allMessages.slice(i, i + 100);
      const statements = chunk.map(msg => 
        insertStmt.bind(jobId, msg.id, 'queued', now)
      );
      await env.DB.batch(statements);
    }
    
    await logJobActivity(env, jobId, 'messages_tracked', null, 
      `Tracked ${allMessages.length} messages`);
    
    // Create queue messages with thread ID (evidence will be fetched by consumer)
    const queueMessages = allMessages.map(msg => {
      // Check if this message has a thread
      // Thread ID comes from: msg.thread.id (Discord includes it) OR the message ID is in our thread list
      const threadId = msg.thread?.id || (knownThreadIds.has(msg.id) ? msg.id : null);
      
      return {
        body: {
          jobId,
          messageId: msg.id,
          channelId,
          message: msg,
          threadId: threadId // Just the ID - consumer will fetch evidence
        }
      };
    });
    
    // Send to queue
    for (let i = 0; i < queueMessages.length; i += 100) {
      const batch = queueMessages.slice(i, i + 100);
      await env.SCAMMER_QUEUE.sendBatch(batch);
    }
    
    const withThreads = queueMessages.filter(m => m.body.threadId).length;
    await logJobActivity(env, jobId, 'queued', null, 
      `Queued ${allMessages.length} messages (${withThreads} have threads - evidence will be fetched by consumer)`);
    
    return {
      queued: allMessages.length,
      total: allMessages.length,
      threads: allThreads.length,
      withThreads: withThreads,
      message: `Added ${allMessages.length} messages to queue. ${withThreads} have pre-fetched thread evidence.`
    };
    
  } catch (err) {
    await logJobActivity(env, jobId, 'failed', null, `Failed: ${err.message}`);
    await env.DB.prepare(`
      UPDATE scammer_job_status 
      SET status = 'failed', error = ?, last_activity_at = ?
      WHERE job_id = ?
    `).bind(err.message, Date.now(), jobId).run();
    throw err;
  }
}

/**
 * NOTE: Queue consumer is handled by emwiki/workers/scammer-queue-consumer.js
 * Pages Functions do not support queue consumers directly.
 */

/**
 * Fetch all messages from a thread and download attachments to R2
 * Returns array of processed messages with R2 URLs
 */
async function fetchThreadEvidence(threadId, env) {
  const messages = [];
  let lastId = null;
  
  while (true) {
    const url = new URL(`https://discord.com/api/v10/channels/${threadId}/messages`);
    url.searchParams.set('limit', '100');
    if (lastId) url.searchParams.set('before', lastId);
    
    const response = await fetch(url.toString(), {
      headers: { Authorization: `Bot ${env.DISCORD_BOT_TOKEN}` }
    });
    
    if (!response.ok) break;
    
    const batch = await response.json();
    if (!batch.length) break;
    
    for (const msg of batch) {
      const processed = {
        id: msg.id,
        author: msg.author?.username || 'Unknown',
        content: msg.content || '',
        timestamp: msg.timestamp,
        edited_timestamp: msg.edited_timestamp,
        attachments: []
      };
      
      // Download attachments to R2
      if (msg.attachments?.length && env.MY_BUCKET) {
        for (const att of msg.attachments) {
          try {
            const r2Url = await downloadAttachmentToR2(att, env);
            processed.attachments.push({
              id: att.id,
              filename: att.filename,
              content_type: att.content_type,
              r2_url: r2Url,
              url: att.url // Fallback
            });
          } catch (e) {
            // Keep original URL as fallback
            processed.attachments.push({
              id: att.id,
              filename: att.filename,
              url: att.url
            });
          }
        }
      }
      
      messages.push(processed);
    }
    
    lastId = batch[batch.length - 1].id;
    await delay(300);
  }
  
  // Sort oldest first
  return messages.sort((a, b) => 
    new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  );
}

/**
 * Download a Discord attachment to R2 storage
 */
async function downloadAttachmentToR2(attachment, env) {
  const r2Key = `scammer-evidence/${attachment.id}-${attachment.filename}`;
  
  // Check if already exists
  const existing = await env.MY_BUCKET.head(r2Key);
  if (existing) {
    return `/r2-proxy/${r2Key}`;
  }
  
  // Download and upload
  const response = await fetch(attachment.url);
  if (!response.ok) throw new Error('Download failed');
  
  const data = await response.arrayBuffer();
  await env.MY_BUCKET.put(r2Key, data, {
    httpMetadata: { contentType: attachment.content_type || 'application/octet-stream' }
  });
  
  return `/r2-proxy/${r2Key}`;
}

/**
 * Fetch all thread messages for scammers after main messages are processed
 * (Legacy function - kept for periodic checker)
 */

async function fetchAllThreadMessages(env, jobId) {
  try {
    // Get all scammer entries that have thread_evidence with a thread_id
    const { results } = await env.DB.prepare(`
      SELECT user_id, thread_evidence, last_message_id
      FROM scammer_profile_cache
      WHERE thread_evidence IS NOT NULL
    `).all();
    
    if (!results || results.length === 0) {
      await logJobActivity(env, jobId, 'no_threads', null, 'No threads found to fetch');
      console.log(`[JOB ${jobId}] No threads found to fetch`);
      return;
    }
    
    await logJobActivity(env, jobId, 'threads_found', null, `Found ${results.length} scammers with threads`);
    console.log(`[JOB ${jobId}] Found ${results.length} scammers with threads`);
    
    let threadsProcessed = 0;
    let threadsFetched = 0;
    let totalMessagesFetched = 0;
    
    for (const row of results) {
      try {
        const threadEvidence = JSON.parse(row.thread_evidence);
        const threadId = threadEvidence?.thread_id;
        
        if (!threadId) {
          console.log(`[JOB ${jobId}] User ${row.user_id} has thread_evidence but no thread_id`);
          continue;
        }
        
        threadsProcessed++;
        await logJobActivity(env, jobId, 'fetching_thread', threadId, `Fetching thread ${threadId} for user ${row.user_id} (${threadsProcessed}/${results.length})`);
        console.log(`[JOB ${jobId}] Fetching thread ${threadId} for user ${row.user_id} (${threadsProcessed}/${results.length})`);
        
        // Fetch all messages from the thread
        const threadMessages = await fetchDiscordThread(threadId, env);
        
        if (!threadMessages || threadMessages.length === 0) {
          console.log(`[JOB ${jobId}] Thread ${threadId} has no messages or failed to fetch`);
          await logJobActivity(env, jobId, 'thread_empty', threadId, `Thread ${threadId} has no messages`);
          continue;
        }
        
        threadsFetched++;
        totalMessagesFetched += threadMessages.length;
        
        // Update thread evidence with all messages
        const updatedThreadEvidence = {
          thread_id: threadId,
          messages: threadMessages,
          message_count: threadMessages.length,
          last_fetched: Date.now()
        };
        
        await env.DB.prepare(`
          UPDATE scammer_profile_cache
          SET thread_evidence = ?,
              thread_last_message_id = ?
          WHERE user_id = ?
        `).bind(
          JSON.stringify(updatedThreadEvidence),
          threadMessages[threadMessages.length - 1]?.id || null, // Last message ID
          row.user_id
        ).run();
        
        await logJobActivity(env, jobId, 'thread_fetched', threadId, `Fetched ${threadMessages.length} messages from thread ${threadId}`);
        console.log(`[JOB ${jobId}] Fetched ${threadMessages.length} messages from thread ${threadId} for user ${row.user_id}`);
        
        // Rate limit: wait 1.5 seconds between thread fetches
        if (threadsProcessed < results.length) {
          await delay(1500);
        }
        
      } catch (err) {
        console.error(`[JOB ${jobId}] Error fetching thread for user ${row.user_id}:`, err.message);
        await logJobActivity(env, jobId, 'thread_error', null, `Error fetching thread for user ${row.user_id}: ${err.message}`);
        // Continue with next thread
      }
    }
    
    await logJobActivity(env, jobId, 'threads_complete', null, `Fetched ${totalMessagesFetched} messages from ${threadsFetched}/${threadsProcessed} threads`);
    console.log(`[JOB ${jobId}] Thread fetching complete: ${totalMessagesFetched} messages from ${threadsFetched}/${threadsProcessed} threads`);
  } catch (err) {
    console.error(`[JOB ${jobId}] Error in fetchAllThreadMessages:`, err);
    await logJobActivity(env, jobId, 'threads_error', null, `Error: ${err.message}`);
    throw err;
  }
}

// ============================================================================
// SECTION 6: MEDIA HANDLING (R2 & Stream)
// ============================================================================

/**
 * Upload video to Cloudflare Stream for transcoding
 */
async function uploadVideoToStream(videoData, filename, env) {
  try {
    if (!env.CLOUDFLARE_ACCOUNT_ID || !env.CLOUDFLARE_STREAM_TOKEN) {
      console.warn('Cloudflare Stream credentials not configured');
      return null;
    }

    // Upload video directly to Stream using multipart form data
    const formData = new FormData();
    const blob = new Blob([videoData], { type: 'video/quicktime' });
    formData.append('file', blob, filename);

    const uploadResponse = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${env.CLOUDFLARE_ACCOUNT_ID}/stream`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${env.CLOUDFLARE_STREAM_TOKEN}`
        },
        body: formData
      }
    );

    if (!uploadResponse.ok) {
      const errorText = await uploadResponse.text();
      console.warn(`Failed to upload to Stream: ${uploadResponse.status}`, errorText);
      return null;
    }

    const streamData = await uploadResponse.json();
    const videoId = streamData.result?.uid;
    if (videoId) {
      // Use playback URL from API response if available, otherwise construct using customer subdomain
      let playbackUrl = streamData.result?.playback?.hls || streamData.result?.playback?.dash;
      
      if (!playbackUrl) {
        // Fallback: construct URL using customer subdomain
        // Format: https://customer-wosapspiey2ql225.cloudflarestream.com/{videoId}/manifest/video.m3u8
        playbackUrl = `https://customer-wosapspiey2ql225.cloudflarestream.com/${videoId}/manifest/video.m3u8`;
      }
      
      return {
        id: videoId,
        playback_url: playbackUrl
      };
    }
    return null;
  } catch (err) {
    console.error(`Error uploading video to Stream:`, err);
    return null;
  }
}

/**
 * Download Discord video and upload to R2 (and Stream for QuickTime videos)
 */
async function downloadVideoToR2(discordUrl, attachmentId, filename, contentType, env) {
  try {
    // Get file extension from filename or content type
    let ext = filename.split('.').pop();
    if (!ext || ext === filename) {
      // Try to determine from content type
      if (contentType && contentType.includes('mp4')) ext = 'mp4';
      else if (contentType && contentType.includes('webm')) ext = 'webm';
      else if (contentType && contentType.includes('quicktime')) ext = 'mov';
      else ext = 'mp4'; // default
    }

    const isQuickTime = contentType?.includes('quicktime') || ext === 'mov';

    // Generate R2 key with extension
    const key = `scammer-evidence/videos/${attachmentId}.${ext}`;

    // Check if video already exists in R2
    let r2Url = null;
    try {
      const existing = await env.MY_BUCKET.head(key);
      if (existing) {
        // Video already exists, return existing URL
        r2Url = `https://cdn.emwiki.com/${key}`;
      }
    } catch {
      // Doesn't exist, continue to download
    }

    // Download video from Discord with auth
    const videoResponse = await fetch(discordUrl, {
      headers: { Authorization: `Bot ${env.DISCORD_BOT_TOKEN}` }
    });

    if (!videoResponse.ok) {
      console.warn(`Failed to download video ${attachmentId}: ${videoResponse.status}`);
      return { r2_url: r2Url, stream_id: null };
    }

    // Get video data
    const videoData = await videoResponse.arrayBuffer();

    // Upload to R2
    if (!r2Url) {
      await env.MY_BUCKET.put(key, videoData, {
        httpMetadata: { 
          contentType: contentType || 'video/mp4',
          cacheControl: 'public, max-age=31536000'
        },
        customMetadata: {
          'original-filename': filename || 'video'
        }
      });
      r2Url = `https://cdn.emwiki.com/${key}`;
    }

    // For QuickTime videos, also upload to Cloudflare Stream for transcoding
    let streamData = null;
    if (isQuickTime) {
      streamData = await uploadVideoToStream(videoData, filename, env);
    }

    return { 
      r2_url: r2Url, 
      stream_id: streamData?.id || null,
      stream_url: streamData?.playback_url || null
    };
  } catch (err) {
    console.error(`Error downloading video ${attachmentId} to R2:`, err);
    return { r2_url: null, stream_id: null };
  }
}

/**
 * Download Discord image and upload to R2
 */
async function downloadImageToR2(discordUrl, attachmentId, filename, contentType, env) {
  try {
    // Get file extension from filename or content type
    let ext = filename.split('.').pop();
    if (!ext || ext === filename) {
      // Try to determine from content type
      if (contentType && contentType.includes('png')) ext = 'png';
      else if (contentType && contentType.includes('jpeg') || contentType && contentType.includes('jpg')) ext = 'jpg';
      else if (contentType && contentType.includes('gif')) ext = 'gif';
      else if (contentType && contentType.includes('webp')) ext = 'webp';
      else ext = 'png'; // default
    }

    // Generate R2 key with extension
    const key = `scammer-evidence/images/${attachmentId}.${ext}`;

    // Check if image already exists in R2
    let r2Url = null;
    try {
      const existing = await env.MY_BUCKET.head(key);
      if (existing) {
        // Image already exists, return existing URL
        r2Url = `https://cdn.emwiki.com/${key}`;
        return { r2_url: r2Url };
      }
    } catch {
      // Doesn't exist, continue to download
    }

    // Download image from Discord with auth
    const imageResponse = await fetch(discordUrl, {
      headers: { Authorization: `Bot ${env.DISCORD_BOT_TOKEN}` }
    });

    if (!imageResponse.ok) {
      console.warn(`Failed to download image ${attachmentId}: ${imageResponse.status}`);
      return { r2_url: null };
    }

    // Get image data
    const imageData = await imageResponse.arrayBuffer();

    // Upload to R2
    await env.MY_BUCKET.put(key, imageData, {
      httpMetadata: { 
        contentType: contentType || 'image/png',
        cacheControl: 'public, max-age=31536000'
      },
      customMetadata: {
        'original-filename': filename || 'image'
      }
    });
    r2Url = `https://cdn.emwiki.com/${key}`;

    return { r2_url: r2Url };
  } catch (err) {
    console.error(`Error downloading image ${attachmentId} to R2:`, err);
    return { r2_url: null };
  }
}

/**
 * Fetch all messages from a Discord thread
 */
async function fetchDiscordThread(threadId, env) {
  if (!threadId) return null;

  try {
    const threadMessages = [];
    let before = null;

    // Fetch all messages from the thread
    while (true) {
      const fetchUrl = new URL(`https://discord.com/api/v10/channels/${threadId}/messages`);
      fetchUrl.searchParams.set("limit", "100");
      if (before) {
        fetchUrl.searchParams.set("before", before);
      }

      let response;
      let retryCount = 0;
      while (retryCount < 3) {
        try {
          response = await fetch(fetchUrl.toString(), {
            headers: { Authorization: `Bot ${env.DISCORD_BOT_TOKEN}` },
          });

          if (response.status === 429) {
            const retryAfter = await response.json();
            await new Promise(r => setTimeout(r, (retryAfter.retry_after || 1) * 1000));
            retryCount++;
            continue;
          }

          if (response.status === 404) {
            // Thread not found or no access
            return null;
          }

          if (!response.ok) {
            throw new Error(`Discord API error: ${response.status}`);
          }

          break;
        } catch (err) {
          retryCount++;
          if (retryCount >= 3) {
            throw err;
          }
          await new Promise(r => setTimeout(r, 1000 * retryCount));
        }
      }

      const messages = await response.json();
      if (messages.length === 0) break;

      // Process messages and extract relevant data
      for (const msg of messages) {
        const messageData = {
          id: msg.id,
          author: {
            id: msg.author?.id,
            username: msg.author?.username,
            global_name: msg.author?.global_name,
            avatar: msg.author?.avatar,
            discriminator: msg.author?.discriminator
          },
          content: msg.content,
          timestamp: msg.timestamp,
          edited_timestamp: msg.edited_timestamp,
          attachments: [],
          embeds: []
        };

        // Extract attachments (images, videos, files)
        if (msg.attachments && msg.attachments.length > 0) {
          // Process attachments in parallel
          const attachmentPromises = msg.attachments.map(async (att) => {
            const isVideo = att.content_type?.startsWith('video/') || false;
            const isImage = att.content_type?.startsWith('image/') || false;
            
            // Download videos to R2 (and Stream for QuickTime)
            let r2Url = null;
            let streamId = null;
            let streamUrl = null;
            if (isVideo && att.url) {
              const result = await downloadVideoToR2(
                att.url,
                att.id,
                att.filename,
                att.content_type,
                env
              );
              r2Url = result.r2_url;
              streamId = result.stream_id;
              streamUrl = result.stream_url;
            }
            
            // Download images to R2
            if (isImage && att.url) {
              const result = await downloadImageToR2(
                att.url,
                att.id,
                att.filename,
                att.content_type,
                env
              );
              if (result.r2_url) {
                r2Url = result.r2_url;
              }
            }

            return {
              id: att.id,
              filename: att.filename,
              url: att.url, // Keep original URL as fallback
              r2_url: r2Url, // R2 URL for images and videos
              stream_id: streamId, // Cloudflare Stream ID for QuickTime videos
              stream_url: streamUrl, // Cloudflare Stream playback URL (HLS/DASH)
              proxy_url: att.proxy_url,
              size: att.size,
              content_type: att.content_type,
              width: att.width,
              height: att.height,
              is_image: isImage,
              is_video: isVideo
            };
          });

          messageData.attachments = await Promise.all(attachmentPromises);
        }

        // Extract embeds
        if (msg.embeds && msg.embeds.length > 0) {
          messageData.embeds = msg.embeds.map(embed => ({
            title: embed.title,
            description: embed.description,
            url: embed.url,
            image: embed.image,
            video: embed.video,
            thumbnail: embed.thumbnail,
            type: embed.type
          }));
        }

        threadMessages.push(messageData);
      }

      // Update before to fetch older messages
      before = messages[messages.length - 1].id;
      
      // Rate limit: wait 1.5 seconds between batches to respect Discord API limits
      await delay(1500);
      
      // Safety limit - remove or increase if needed (currently 5000 messages max per thread)
      if (threadMessages.length >= 5000) break;
    }

    // Sort by timestamp (oldest first)
    threadMessages.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

    return threadMessages;
  } catch (err) {
    console.warn(`Failed to fetch thread ${threadId}:`, err);
    return null;
  }
}

// ============================================================================
// SECTION 7: API ENDPOINT HANDLER
// ============================================================================

/**
 * Main API endpoint handler
 * Handles all GET requests to /api/roblox-proxy
 */
export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const mode = url.searchParams.get("mode");
  const userId = url.searchParams.get("userId");
  const isLiteMode = url.searchParams.get("mode") === "lite";
  const discordId = url.searchParams.get("discordId");
  const forceRefresh = url.searchParams.get("refresh") === "true";

  // Helper function to get CDN URL from hash
  function getCdnUrl(hash) {
    let i = 31;
    for (let t = 0; t < 38; t++) {
      i ^= hash.charCodeAt(t);
    }
    return `https://t${(i % 8).toString()}.rbxcdn.com/${hash}`;
  }

  // Handle Discord video/media proxy (for videos and other media that require auth)
  if (mode === "discord-media") {
    const mediaUrl = url.searchParams.get("url");
    if (!mediaUrl) {
      return new Response(JSON.stringify({ error: 'Media URL required' }), {
        status: 400,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
      });
    }

    // Validate that it's a Discord CDN URL
    if (!mediaUrl.startsWith('https://cdn.discordapp.com/') && !mediaUrl.startsWith('https://media.discordapp.net/')) {
      return new Response(JSON.stringify({ error: 'Invalid Discord media URL' }), {
        status: 400,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
      });
    }

    try {
      // Fetch the media with Discord bot authentication
      const mediaResponse = await fetch(mediaUrl, {
        headers: { Authorization: `Bot ${env.DISCORD_BOT_TOKEN}` }
      });

      if (!mediaResponse.ok) {
        return new Response(JSON.stringify({
          error: 'Media not found',
          status: mediaResponse.status
        }), {
          status: mediaResponse.status,
          headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
        });
      }

      // Get the content type from the original response
      const contentType = mediaResponse.headers.get('content-type') || 'application/octet-stream';
      const contentLength = mediaResponse.headers.get('content-length');
      
      // Stream the response directly (better for large videos)
      // Cloudflare Workers will handle streaming automatically
      const headers = {
        "Content-Type": contentType,
        "Access-Control-Allow-Origin": "*",
        "Cache-Control": "public, max-age=86400", // Cache for 24 hours
        "Accept-Ranges": "bytes" // Support range requests for video seeking
      };
      
      if (contentLength) {
        headers["Content-Length"] = contentLength;
      }

      // Return the response body directly - Cloudflare Workers streams it automatically
      return new Response(mediaResponse.body, { headers });
    } catch (err) {
      return new Response(JSON.stringify({ error: err.message }), {
        status: 500,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
      });
    }
  }

  // Handle CDN asset proxy (for OBJ, MTL, textures)
  if (mode === "cdn-asset") {
    const hash = url.searchParams.get("hash");
    if (!hash) {
      return new Response(JSON.stringify({ error: 'Hash required' }), {
        status: 400,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
      });
    }

    try {
      const cdnUrl = getCdnUrl(hash);
      console.log('Fetching CDN URL:', cdnUrl);
      const assetResponse = await fetch(cdnUrl);

      if (!assetResponse.ok) {
        console.error('CDN fetch failed:', assetResponse.status, cdnUrl);
        return new Response(JSON.stringify({
          error: 'Asset not found',
          cdnUrl: cdnUrl,
          status: assetResponse.status
        }), {
          status: 404,
          headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
        });
      }

      // Get the content type from the original response
      const contentType = assetResponse.headers.get('content-type') || 'application/octet-stream';
      const assetData = await assetResponse.arrayBuffer();

      return new Response(assetData, {
        headers: {
          "Content-Type": contentType,
          "Access-Control-Allow-Origin": "*",
          "Cache-Control": "public, max-age=86400" // Cache for 24 hours
        }
      });
    } catch (err) {
      return new Response(JSON.stringify({ error: err.message }), {
        status: 500,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
      });
    }
  }


  // Handle 3D avatar mode
  if (mode === "avatar-3d" && userId) {
    try {
      // Fetch 3D avatar data
      const avatar3dResponse = await fetch(`https://thumbnails.roblox.com/v1/users/avatar-3d?userId=${userId}`);
      const avatar3dData = await avatar3dResponse.json();

      if (avatar3dData.state !== 'Completed' || !avatar3dData.imageUrl) {
        return new Response(JSON.stringify({
          error: 'Avatar not ready',
          state: avatar3dData.state
        }), {
          status: 404,
          headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
        });
      }

      // Fetch the metadata
      const metadataResponse = await fetch(avatar3dData.imageUrl);
      const metadata = await metadataResponse.json();

      return new Response(JSON.stringify(metadata), {
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
      });
    } catch (err) {
      return new Response(JSON.stringify({ error: err.message }), {
        status: 500,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
      });
    }
  }

  if (isLiteMode) {
    // Just fetch live and return directly without writing to DB
    const [userData, avatarData] = await Promise.all([
      fetch(`https://users.roblox.com/v1/users/${userId}`).then(r => r.ok ? r.json() : null),
      fetch(`https://thumbnails.roblox.com/v1/users/avatar-headshot?userIds=${userId}&size=150x150&format=Png&isCircular=true`)
        .then(r => r.ok ? r.json() : null)
    ]);

    if (!userData) throw new Error("Failed to fetch Roblox user data");

    return new Response(JSON.stringify({
      name: userData.name,
      displayName: userData.displayName,
      avatar: avatarData?.data?.[0]?.imageUrl || null
    }), { headers: { "Content-Type": "application/json","Access-Control-Allow-Origin": "*" } });
  }





  // Handle Stream migration endpoint - Upload existing QuickTime videos to Stream
  if (mode === "migrate-videos-to-stream") {
    try {
      if (!env.CLOUDFLARE_ACCOUNT_ID || !env.CLOUDFLARE_STREAM_TOKEN) {
        return new Response(JSON.stringify({ 
          error: "Cloudflare Stream credentials not configured"
        }), {
          status: 500,
          headers: { 
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*" 
          },
        });
      }

      if (!env.MY_BUCKET) {
        return new Response(JSON.stringify({ 
          error: "R2 bucket (MY_BUCKET) not configured"
        }), {
          status: 500,
          headers: { 
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*" 
          },
        });
      }

      // Process ONE entry at a time to avoid timeout
      const targetUserId = url.searchParams.get("userId");
      const limit = parseInt(url.searchParams.get("limit")) || 1;
      const offset = parseInt(url.searchParams.get("offset")) || 0;
      
      let query, bindParams;
      if (targetUserId) {
        query = `
          SELECT user_id, thread_evidence 
          FROM scammer_profile_cache 
          WHERE user_id = ? AND thread_evidence IS NOT NULL
        `;
        bindParams = [targetUserId];
      } else {
        query = `
          SELECT user_id, thread_evidence 
          FROM scammer_profile_cache 
          WHERE thread_evidence IS NOT NULL
          LIMIT ? OFFSET ?
        `;
        bindParams = [limit, offset];
      }
      
      const { results } = await env.DB.prepare(query).bind(...bindParams).all();

      if (!results || results.length === 0) {
        const totalResult = await env.DB.prepare(`
          SELECT COUNT(*) as total FROM scammer_profile_cache WHERE thread_evidence IS NOT NULL
        `).first();
        return new Response(JSON.stringify({ 
          message: "No thread evidence found to migrate",
          total_entries: totalResult?.total || 0,
          processed: 0,
          videos_uploaded: 0
        }), {
          headers: { 
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*" 
          },
        });
      }

      let processed = 0;
      let videosUploaded = 0;
      let videosSkipped = 0;
      let errors = [];

      const row = results[0];
      try {
        if (!row.thread_evidence) {
          return new Response(JSON.stringify({ 
            message: "Entry has no thread evidence",
            user_id: row.user_id
          }), {
            headers: { 
              "Content-Type": "application/json",
              "Access-Control-Allow-Origin": "*" 
            },
          });
        }
        
        const threadEvidence = JSON.parse(row.thread_evidence);
        let updated = false;
        let videoCount = 0;

        if (threadEvidence.messages && Array.isArray(threadEvidence.messages)) {
          for (const msg of threadEvidence.messages) {
            if (msg.attachments && Array.isArray(msg.attachments)) {
              for (const att of msg.attachments) {
                // Only process QuickTime videos that don't already have stream_url
                const isQuickTime = att.content_type?.includes('quicktime') || 
                                   att.filename?.toLowerCase().endsWith('.mov') ||
                                   att.url?.includes('.mov');
                
                if (isQuickTime && att.url && !att.stream_url) {
                  videoCount++;
                  try {
                    // Add delay between uploads to avoid rate limits
                    if (videoCount > 1) {
                      await new Promise(r => setTimeout(r, 1000)); // 1 second delay
                    }
                    
                    // Try to get video from R2 first (if it exists)
                    let videoData = null;
                    if (att.r2_url) {
                      try {
                        const r2Key = att.r2_url.replace('https://cdn.emwiki.com/', '');
                        const r2Object = await env.MY_BUCKET.get(r2Key);
                        if (r2Object) {
                          videoData = await r2Object.arrayBuffer();
                        }
                      } catch (r2Err) {
                        console.warn(`Failed to get video from R2: ${r2Err.message}`);
                      }
                    }
                    
                    // If not in R2, download from Discord
                    if (!videoData && att.url) {
                      const videoResponse = await fetch(att.url, {
                        headers: { Authorization: `Bot ${env.DISCORD_BOT_TOKEN}` }
                      });
                      if (videoResponse.ok) {
                        videoData = await videoResponse.arrayBuffer();
                      }
                    }
                    
                    if (videoData) {
                      const streamData = await uploadVideoToStream(
                        videoData,
                        att.filename || 'video.mov',
                        env
                      );
                      
                      if (streamData && streamData.playback_url) {
                        att.stream_url = streamData.playback_url;
                        att.stream_id = streamData.id;
                        videosUploaded++;
                        updated = true;
                      } else {
                        videosSkipped++;
                        errors.push(`Failed to upload video ${att.id} to Stream`);
                      }
                    } else {
                      videosSkipped++;
                      errors.push(`Could not retrieve video ${att.id} for upload`);
                    }
                  } catch (videoErr) {
                    videosSkipped++;
                    errors.push(`Error uploading video ${att.id}: ${videoErr.message}`);
                  }
                }
              }
            }
          }
        }

        if (updated) {
          const updatedEvidenceJson = JSON.stringify(threadEvidence);
          await env.DB.prepare(`
            UPDATE scammer_profile_cache 
            SET thread_evidence = ?
            WHERE user_id = ?
          `).bind(updatedEvidenceJson, row.user_id).run();
          processed++;
        }
      } catch (err) {
        console.error(`Error processing user ${row.user_id}:`, err);
        errors.push(`Error processing user ${row.user_id}: ${err.message}`);
      }

      const totalResult = await env.DB.prepare(`
        SELECT COUNT(*) as total FROM scammer_profile_cache WHERE thread_evidence IS NOT NULL
      `).first();
      const totalCount = totalResult?.total || 0;

      return new Response(JSON.stringify({ 
        message: "Migration batch completed",
        user_id: row.user_id,
        processed_this_batch: 1,
        total_entries: totalCount,
        processed,
        videos_uploaded: videosUploaded,
        videos_skipped: videosSkipped,
        offset,
        next_offset: offset + 1,
        has_more: offset + 1 < totalCount,
        errors: errors.length > 0 ? errors.slice(0, 10) : []
      }), {
        headers: { 
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*" 
        },
      });
    } catch (err) {
      console.error("Stream migration error:", err);
      return new Response(JSON.stringify({ 
        error: err.message,
        debug: err.stack
      }), {
        status: 500,
        headers: { 
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*" 
        },
      });
    }
  }

  // Handle video migration endpoint - Migrate existing videos to R2
  if (mode === "migrate-videos-to-r2") {
    try {
      // Check if R2 bucket is available
      if (!env.MY_BUCKET) {
        return new Response(JSON.stringify({ 
          error: "R2 bucket (MY_BUCKET) not configured"
        }), {
          status: 500,
          headers: { 
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*" 
          },
        });
      }

      // Process ONE entry at a time to avoid timeout
      const targetUserId = url.searchParams.get("userId");
      const limit = parseInt(url.searchParams.get("limit")) || 1; // Process 1 entry at a time by default
      const offset = parseInt(url.searchParams.get("offset")) || 0;
      
      let query, bindParams;
      if (targetUserId) {
        // Process specific user
        query = `
          SELECT user_id, thread_evidence 
          FROM scammer_profile_cache 
          WHERE user_id = ? AND thread_evidence IS NOT NULL
        `;
        bindParams = [targetUserId];
      } else {
        // Process next entry in queue
        query = `
          SELECT user_id, thread_evidence 
          FROM scammer_profile_cache 
          WHERE thread_evidence IS NOT NULL
          LIMIT ? OFFSET ?
        `;
        bindParams = [limit, offset];
      }
      
      const { results } = await env.DB.prepare(query).bind(...bindParams).all();

      if (!results || results.length === 0) {
        return new Response(JSON.stringify({ 
          message: "No thread evidence found to migrate",
          processed: 0,
          videos_downloaded: 0
        }), {
          headers: { 
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*" 
          },
        });
      }

      let processed = 0;
      let videosDownloaded = 0;
      let videosSkipped = 0;
      let errors = [];

      // Process only the first entry to avoid timeout
      const row = results[0];
      try {
        if (!row.thread_evidence) {
          return new Response(JSON.stringify({ 
            message: "Entry has no thread evidence",
            user_id: row.user_id
          }), {
            headers: { 
              "Content-Type": "application/json",
              "Access-Control-Allow-Origin": "*" 
            },
          });
        }
        
        const threadEvidence = JSON.parse(row.thread_evidence);
        let updated = false;
        let videoCount = 0;

        // Process all messages in the thread
        if (threadEvidence.messages && Array.isArray(threadEvidence.messages)) {
          for (const msg of threadEvidence.messages) {
            if (msg.attachments && Array.isArray(msg.attachments)) {
              // Process attachments sequentially to avoid memory issues with large videos
              for (const att of msg.attachments) {
                // Only process videos that don't already have r2_url
                if (att.is_video && att.url && !att.r2_url) {
                  videoCount++;
                  try {
                    // Add small delay between downloads to avoid rate limiting
                    if (videoCount > 1) {
                      await new Promise(r => setTimeout(r, 500)); // 500ms delay
                    }
                    
                    const result = await downloadVideoToR2(
                      att.url,
                      att.id,
                      att.filename || 'video',
                      att.content_type,
                      env
                    );
                    
                    if (result && result.r2_url) {
                      att.r2_url = result.r2_url;
                      // Also store stream data if available
                      if (result.stream_id) {
                        att.stream_id = result.stream_id;
                      }
                      if (result.stream_url) {
                        att.stream_url = result.stream_url;
                      }
                      videosDownloaded++;
                      updated = true;
                    } else {
                      videosSkipped++;
                      errors.push(`Failed to download video ${att.id} for user ${row.user_id}`);
                    }
                  } catch (videoErr) {
                    videosSkipped++;
                    errors.push(`Error downloading video ${att.id} for user ${row.user_id}: ${videoErr.message}`);
                  }
                }
              }
            }
          }
        }

        // Update database if any videos were downloaded
        if (updated) {
          const updatedEvidenceJson = JSON.stringify(threadEvidence);
          await env.DB.prepare(`
            UPDATE scammer_profile_cache 
            SET thread_evidence = ?
            WHERE user_id = ?
          `).bind(updatedEvidenceJson, row.user_id).run();
          processed++;
        }
      } catch (err) {
        console.error(`Error processing user ${row.user_id}:`, err);
        errors.push(`Error processing user ${row.user_id}: ${err.message}`);
      }

      // Get total count for progress tracking
      const totalCountResult = await env.DB.prepare(`
        SELECT COUNT(*) as total 
        FROM scammer_profile_cache 
        WHERE thread_evidence IS NOT NULL
      `).first();
      const totalCount = totalCountResult?.total || 0;

      return new Response(JSON.stringify({ 
        message: "Migration batch completed",
        user_id: row.user_id,
        processed_this_batch: 1,
        total_entries: totalCount,
        processed,
        videos_downloaded,
        videos_skipped,
        offset,
        next_offset: offset + 1,
        has_more: offset + 1 < totalCount,
        errors: errors.length > 0 ? errors.slice(0, 10) : [] // Limit errors to first 10
      }), {
        headers: { 
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*" 
        },
      });
    } catch (err) {
      console.error("Migration error:", err);
      return new Response(JSON.stringify({ 
        error: err.message,
        debug: err.stack,
        type: err.constructor.name
      }), {
        status: 500,
        headers: { 
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*" 
        },
      });
    }
  }

  // Handle periodic thread evidence update endpoint
  if (mode === "update-thread-evidence") {
    try {
      if (!env.MY_BUCKET) {
        return new Response(JSON.stringify({ 
          error: "R2 bucket (MY_BUCKET) not configured"
        }), {
          status: 500,
          headers: { 
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*" 
          },
        });
      }

      // Process entries in batches to avoid timeout
      // Default: process 1 entry at a time, check only last 10 entries
      const limit = parseInt(url.searchParams.get("limit")) || 1;
      const offset = parseInt(url.searchParams.get("offset")) || 0;
      const targetUserId = url.searchParams.get("userId");
      
      let query, bindParams;
      if (targetUserId) {
        // Process specific user
        query = `
          SELECT user_id, thread_evidence, thread_last_message_id, thread_last_checked_at
          FROM scammer_profile_cache 
          WHERE user_id = ? AND thread_evidence IS NOT NULL
        `;
        bindParams = [targetUserId];
      } else {
        // Process entries that need updates or haven't been checked recently (older than 5 hours)
        // Only check last 10 entries (most recently updated), then process 1 at a time
        const fiveHoursAgo = Date.now() - (5 * 60 * 60 * 1000);
        query = `
          SELECT user_id, thread_evidence, thread_last_message_id, thread_last_checked_at
          FROM scammer_profile_cache 
          WHERE thread_evidence IS NOT NULL
            AND (thread_needs_update = 1 OR thread_last_checked_at IS NULL OR thread_last_checked_at < ?)
          ORDER BY thread_last_checked_at DESC
          LIMIT 10
        `;
        bindParams = [fiveHoursAgo];
      }
      
      const { results } = await env.DB.prepare(query).bind(...bindParams).all();

      if (!results || results.length === 0) {
        return new Response(JSON.stringify({ 
          message: "No threads need updating",
          processed: 0,
          updated: 0,
          errors: []
        }), {
          headers: { 
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*" 
          },
        });
      }

      let processed = 0;
      let updated = 0;
      let imagesDownloaded = 0;
      let errors = [];

      // Process only the first entry (limit=1 by default)
      const rowsToProcess = results.slice(0, limit);
      for (const row of rowsToProcess) {
        try {
          if (!row.thread_evidence) continue;

          const threadEvidence = JSON.parse(row.thread_evidence);
          if (!threadEvidence.thread_id) {
            errors.push(`User ${row.user_id} has thread_evidence but no thread_id`);
            continue;
          }

          const threadId = threadEvidence.thread_id;
          const lastMessageId = row.thread_last_message_id || null;
          
          // Fetch new messages from thread (after lastMessageId)
          let newMessages = [];
          let after = lastMessageId; // Use 'after' to fetch messages newer than lastMessageId
          let foundLastMessage = !lastMessageId; // If no lastMessageId, fetch all

          while (true) {
            const fetchUrl = new URL(`https://discord.com/api/v10/channels/${threadId}/messages`);
            fetchUrl.searchParams.set("limit", "100");
            if (after) {
              fetchUrl.searchParams.set("after", after);
            }

            let response;
            let retryCount = 0;
            while (retryCount < 3) {
              try {
                response = await fetch(fetchUrl.toString(), {
                  headers: { Authorization: `Bot ${env.DISCORD_BOT_TOKEN}` },
                });

                if (response.status === 429) {
                  const retryAfter = await response.json();
                  await new Promise(r => setTimeout(r, (retryAfter.retry_after || 1) * 1000));
                  retryCount++;
                  continue;
                }

                if (response.status === 404) {
                  // Thread not found or no access
                  throw new Error(`Thread ${threadId} not found or no access`);
                }

                if (!response.ok) {
                  throw new Error(`Discord API error: ${response.status}`);
                }

                break;
              } catch (err) {
                retryCount++;
                if (retryCount >= 3) {
                  throw err;
                }
                await new Promise(r => setTimeout(r, 1000 * retryCount));
              }
            }

            const messages = await response.json();
            if (messages.length === 0) break;

            // Process messages (they come in reverse chronological order when using 'after')
            // When using 'after', messages are returned newest first
            for (const msg of messages) {
              // If we found the last message we processed, stop
              if (lastMessageId && msg.id === lastMessageId) {
                foundLastMessage = true;
                break;
              }

              // Only add messages newer than lastMessageId
              // Discord message IDs are numeric strings (snowflakes), can compare directly
              if (!lastMessageId || msg.id !== lastMessageId) {
                const messageData = {
                  id: msg.id,
                  author: {
                    id: msg.author?.id,
                    username: msg.author?.username,
                    global_name: msg.author?.global_name,
                    avatar: msg.author?.avatar,
                    discriminator: msg.author?.discriminator
                  },
                  content: msg.content,
                  timestamp: msg.timestamp,
                  edited_timestamp: msg.edited_timestamp,
                  attachments: [],
                  embeds: []
                };

                // Process attachments (images, videos)
                if (msg.attachments && msg.attachments.length > 0) {
                  const attachmentPromises = msg.attachments.map(async (att) => {
                    const isVideo = att.content_type?.startsWith('video/') || false;
                    const isImage = att.content_type?.startsWith('image/') || false;
                    
                    let r2Url = null;
                    let streamId = null;
                    let streamUrl = null;
                    let imageDownloaded = false;
                    
                    if (isVideo && att.url) {
                      const result = await downloadVideoToR2(
                        att.url,
                        att.id,
                        att.filename,
                        att.content_type,
                        env
                      );
                      r2Url = result.r2_url;
                      streamId = result.stream_id;
                      streamUrl = result.stream_url;
                    }
                    
                    if (isImage && att.url) {
                      const result = await downloadImageToR2(
                        att.url,
                        att.id,
                        att.filename,
                        att.content_type,
                        env
                      );
                      if (result.r2_url) {
                        r2Url = result.r2_url;
                        imageDownloaded = true;
                      }
                    }

                    return {
                      id: att.id,
                      filename: att.filename,
                      url: att.url,
                      r2_url: r2Url,
                      stream_id: streamId,
                      stream_url: streamUrl,
                      proxy_url: att.proxy_url,
                      size: att.size,
                      content_type: att.content_type,
                      width: att.width,
                      height: att.height,
                      is_image: isImage,
                      is_video: isVideo,
                      _image_downloaded: imageDownloaded
                    };
                  });

                  const processedAttachments = await Promise.all(attachmentPromises);
                  // Count images that were downloaded
                  imagesDownloaded += processedAttachments.filter(att => att._image_downloaded).length;
                  // Remove the tracking flag before storing
                  messageData.attachments = processedAttachments.map(({ _image_downloaded, ...att }) => att);
                }

                // Process embeds
                if (msg.embeds && msg.embeds.length > 0) {
                  messageData.embeds = msg.embeds.map(embed => ({
                    title: embed.title,
                    description: embed.description,
                    url: embed.url,
                    image: embed.image,
                    video: embed.video,
                    thumbnail: embed.thumbnail,
                    type: embed.type
                  }));
                }

                newMessages.push(messageData);
              }
            }

            if (foundLastMessage) break;

            // Update after to the newest message ID we just fetched (first in array)
            // This allows us to continue fetching newer messages in the next iteration
            after = messages[0].id;
            
            // Safety limit
            if (newMessages.length >= 500) break;
          }

          // Sort new messages by timestamp (oldest first)
          newMessages.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

          if (newMessages.length > 0) {
            // Merge new messages with existing messages
            const existingMessages = threadEvidence.messages || [];
            const allMessages = [...existingMessages, ...newMessages];
            
            // Update thread evidence
            threadEvidence.messages = allMessages;
            threadEvidence.message_count = allMessages.length;
            
            // Get the newest message ID
            const newestMessageId = newMessages.length > 0 
              ? newMessages[newMessages.length - 1].id 
              : (existingMessages.length > 0 ? existingMessages[existingMessages.length - 1].id : null);

            // Update database
            const updatedEvidenceJson = JSON.stringify(threadEvidence);
            await env.DB.prepare(`
              UPDATE scammer_profile_cache 
              SET thread_evidence = ?,
                  thread_last_message_id = ?,
                  thread_last_checked_at = ?,
                  thread_needs_update = 0
              WHERE user_id = ?
            `).bind(
              updatedEvidenceJson,
              newestMessageId || row.thread_last_message_id,
              Date.now(),
              row.user_id
            ).run();

            updated++;
          } else {
            // No new messages, just update last checked time
            await env.DB.prepare(`
              UPDATE scammer_profile_cache 
              SET thread_last_checked_at = ?,
                  thread_needs_update = 0
              WHERE user_id = ?
            `).bind(Date.now(), row.user_id).run();
          }

          processed++;
        } catch (err) {
          console.error(`Error updating thread for user ${row.user_id}:`, err);
          errors.push(`User ${row.user_id}: ${err.message}`);
          
          // Mark as needing update for retry
          await env.DB.prepare(`
            UPDATE scammer_profile_cache 
            SET thread_needs_update = 1
            WHERE user_id = ?
          `).bind(row.user_id).run();
        }
      }

      const totalCountResult = await env.DB.prepare(`
        SELECT COUNT(*) as total 
        FROM scammer_profile_cache 
        WHERE thread_evidence IS NOT NULL
      `).first();
      const totalCount = totalCountResult?.total || 0;

      return new Response(JSON.stringify({ 
        message: "Thread evidence update completed",
        processed,
        updated,
        images_downloaded: imagesDownloaded,
        total_entries: totalCount,
        entries_checked: results.length,
        entries_processed: rowsToProcess.length,
        has_more: rowsToProcess.length < results.length,
        errors: errors.length > 0 ? errors.slice(0, 10) : []
      }), {
        headers: { 
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*" 
        },
      });
    } catch (err) {
      console.error("Thread evidence update error:", err);
      return new Response(JSON.stringify({ 
        error: err.message,
        debug: err.stack
      }), {
        status: 500,
        headers: { 
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*" 
        },
      });
    }
  }

  // Handle image migration endpoint - Migrate existing images to R2
  if (mode === "migrate-images-to-r2") {
    try {
      // Check if R2 bucket is available
      if (!env.MY_BUCKET) {
        return new Response(JSON.stringify({ 
          error: "R2 bucket (MY_BUCKET) not configured"
        }), {
          status: 500,
          headers: { 
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*" 
          },
        });
      }

      // Process ONE entry at a time to avoid timeout
      const targetUserId = url.searchParams.get("userId");
      const limit = parseInt(url.searchParams.get("limit")) || 1; // Process 1 entry at a time by default
      const offset = parseInt(url.searchParams.get("offset")) || 0;
      
      let query, bindParams;
      if (targetUserId) {
        // Process specific user
        query = `
          SELECT user_id, thread_evidence 
          FROM scammer_profile_cache 
          WHERE user_id = ? AND thread_evidence IS NOT NULL
        `;
        bindParams = [targetUserId];
      } else {
        // Process next entry in queue
        query = `
          SELECT user_id, thread_evidence 
          FROM scammer_profile_cache 
          WHERE thread_evidence IS NOT NULL
          LIMIT ? OFFSET ?
        `;
        bindParams = [limit, offset];
      }
      
      const { results } = await env.DB.prepare(query).bind(...bindParams).all();

      if (!results || results.length === 0) {
        return new Response(JSON.stringify({ 
          message: "No thread evidence found to migrate",
          processed: 0,
          images_downloaded: 0
        }), {
          headers: { 
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*" 
          },
        });
      }

      let processed = 0;
      let imagesDownloaded = 0;
      let imagesSkipped = 0;
      let errors = [];

      // Process only the first entry to avoid timeout
      const row = results[0];
      try {
        if (!row.thread_evidence) {
          return new Response(JSON.stringify({ 
            message: "Entry has no thread evidence",
            user_id: row.user_id
          }), {
            headers: { 
              "Content-Type": "application/json",
              "Access-Control-Allow-Origin": "*" 
            },
          });
        }
        
        const threadEvidence = JSON.parse(row.thread_evidence);
        let updated = false;
        let imageCount = 0;

        // Process all messages in the thread
        if (threadEvidence.messages && Array.isArray(threadEvidence.messages)) {
          for (const msg of threadEvidence.messages) {
            if (msg.attachments && Array.isArray(msg.attachments)) {
              // Process attachments sequentially to avoid memory issues
              for (const att of msg.attachments) {
                // Only process images that don't already have r2_url
                if (att.is_image && att.url && !att.r2_url) {
                  imageCount++;
                  try {
                    // Add small delay between downloads to avoid rate limiting
                    if (imageCount > 1) {
                      await new Promise(r => setTimeout(r, 500)); // 500ms delay
                    }
                    
                    const result = await downloadImageToR2(
                      att.url,
                      att.id,
                      att.filename || 'image',
                      att.content_type,
                      env
                    );
                    
                    if (result && result.r2_url) {
                      att.r2_url = result.r2_url;
                      imagesDownloaded++;
                      updated = true;
                    } else {
                      imagesSkipped++;
                      errors.push(`Failed to download image ${att.id} for user ${row.user_id}`);
                    }
                  } catch (imageErr) {
                    imagesSkipped++;
                    errors.push(`Error downloading image ${att.id} for user ${row.user_id}: ${imageErr.message}`);
                  }
                }
              }
            }
          }
        }

        // Update database if any images were downloaded
        if (updated) {
          const updatedEvidenceJson = JSON.stringify(threadEvidence);
          await env.DB.prepare(`
            UPDATE scammer_profile_cache 
            SET thread_evidence = ?
            WHERE user_id = ?
          `).bind(updatedEvidenceJson, row.user_id).run();
          processed++;
        }
      } catch (err) {
        console.error(`Error processing user ${row.user_id}:`, err);
        errors.push(`Error processing user ${row.user_id}: ${err.message}`);
      }

      // Get total count for progress tracking
      const totalCountResult = await env.DB.prepare(`
        SELECT COUNT(*) as total 
        FROM scammer_profile_cache 
        WHERE thread_evidence IS NOT NULL
      `).first();
      const totalCount = totalCountResult?.total || 0;

      return new Response(JSON.stringify({ 
        message: "Migration batch completed",
        user_id: row.user_id,
        processed_this_batch: 1,
        total_entries: totalCount,
        processed,
        images_downloaded,
        images_skipped,
        offset,
        next_offset: offset + 1,
        has_more: offset + 1 < totalCount,
        errors: errors.length > 0 ? errors.slice(0, 10) : [] // Limit errors to first 10
      }), {
        headers: { 
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*" 
        },
      });
    } catch (err) {
      console.error("Migration error:", err);
      return new Response(JSON.stringify({ 
        error: err.message,
        debug: err.stack,
        type: err.constructor.name
      }), {
        status: 500,
        headers: { 
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*" 
        },
      });
    }
  }

  // Handle thread evidence endpoint - MUST come before general endpoint check
  if (mode === "thread-evidence" && userId) {
    try {
      const result = await env.DB.prepare(
        "SELECT thread_evidence FROM scammer_profile_cache WHERE user_id = ?"
      ).bind(userId).first();

      if (!result) {
        return new Response(JSON.stringify({ 
          error: "No thread evidence found for this user",
          thread_evidence: null,
          user_id: userId,
          debug: "User not found in database"
        }), {
          status: 404,
          headers: { 
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*" 
          },
        });
      }

      if (!result.thread_evidence) {
        return new Response(JSON.stringify({ 
          error: "No thread evidence found for this user",
          thread_evidence: null,
          user_id: userId,
          debug: "User found but thread_evidence is null"
        }), {
          status: 404,
          headers: { 
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*" 
          },
        });
      }

      const threadEvidence = JSON.parse(result.thread_evidence);
      return new Response(JSON.stringify({ 
        user_id: userId,
        thread_evidence: threadEvidence 
      }), {
        headers: { 
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*" 
        },
      });
    } catch (err) {
      console.error("Thread evidence fetch error:", err);
      return new Response(JSON.stringify({ 
        error: err.message,
        user_id: userId,
        debug: err.stack
      }), {
        status: 500,
        headers: { 
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*" 
        },
      });
    }
  }

  // General roblox-proxy endpoint (for credits, item makers, etc.)
  // Must come AFTER thread-evidence check to avoid conflicts
  if (url.pathname.endsWith("/api/roblox-proxy") && userId && mode !== "thread-evidence") {
    try {
      // Fetch Roblox data - DON'T write to scammer cache (writeToScammerCache = false)
      const robloxData = await fetchRobloxProfile(userId, env, false);
      
      if (!robloxData) {
        throw new Error("Failed to fetch Roblox user data");
      }

      // Fetch Discord data if discordId provided - DON'T write to scammer cache
      let discordData = null;
      if (discordId) {
        discordData = await fetchDiscordProfile(discordId, env, null, false);
      }

      return new Response(JSON.stringify({
        name: robloxData.name,
        displayName: robloxData.displayName,
        avatar: robloxData.avatar || null,
        discordDisplayName: discordData?.displayName || null,
        discordAvatar: discordData?.avatar || null
      }), { 
        headers: { 
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*" 
        } 
      });

    } catch (err) {
      return new Response(JSON.stringify({ error: err.message }), { 
        status: 500,
        headers: { "Content-Type": "application/json" }
      });
    }
  }

  if (mode === "discord-scammers") {
    try {
      const urlParams = new URL(request.url).searchParams;
      const action = urlParams.get('action');
      const jobId = urlParams.get('jobId');
      
      // Action: start - Start a new processing job
      if (action === 'start') {
        // Check if there's already a running job
        const runningJob = await env.DB.prepare(`
          SELECT job_id, started_at, messages_processed, total_messages
          FROM scammer_job_status
          WHERE status = 'running'
          ORDER BY started_at DESC
          LIMIT 1
        `).first();
        
        if (runningJob) {
          const runningTime = Date.now() - runningJob.started_at;
          const tenMinutes = 10 * 60 * 1000;
          
          // If job is stuck (running > 10 minutes), cancel it
          if (runningTime > tenMinutes) {
            await env.DB.prepare(`
              UPDATE scammer_job_status 
              SET status = 'failed', error = 'Cancelled - stuck for too long'
              WHERE job_id = ?
            `).bind(runningJob.job_id).run();
            } else {
            // Job is still running and not stuck
          return new Response(JSON.stringify({ 
              error: 'A job is already running',
              runningJob: {
                jobId: runningJob.job_id,
                startedAt: runningJob.started_at,
                messagesProcessed: runningJob.messages_processed,
                totalMessages: runningJob.total_messages,
                runningTimeMinutes: Math.round(runningTime / 1000 / 60)
              },
              message: 'Use ?action=status&jobId=' + runningJob.job_id + ' to check progress, or ?action=cancel&jobId=' + runningJob.job_id + ' to cancel it.'
            }), {
              status: 409, // Conflict
            headers: { 
              "Content-Type": "application/json", 
              "Access-Control-Allow-Origin": "*" 
            },
          });
        }
      }

        // Cancel any other stuck jobs (running > 10 minutes)
        const tenMinutesAgo = Date.now() - (10 * 60 * 1000);
        await env.DB.prepare(`
          UPDATE scammer_job_status 
          SET status = 'failed', error = 'Cancelled - stuck for too long'
          WHERE status = 'running' AND started_at < ?
        `).bind(tenMinutesAgo).run();
        
        const newJobId = `job_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const now = Date.now();
        
        // Create job status entry
        await env.DB.prepare(`
          INSERT INTO scammer_job_status (job_id, status, started_at, messages_processed, messages_seen, total_messages)
          VALUES (?, 'running', ?, 0, 0, 0)
        `).bind(newJobId, now).run();
        
        // Enqueue all messages - they'll be processed automatically by queue consumer
        const queueResult = await enqueueScammerMessages(env, newJobId);
        
        return new Response(JSON.stringify({ 
          jobId: newJobId,
          status: 'queued',
          queued: queueResult.queued,
          total: queueResult.total,
          message: `Added ${queueResult.queued} messages to queue. They will be processed automatically. Use ?action=status&jobId=${newJobId} to check progress.`
        }), {
          headers: { 
            "Content-Type": "application/json", 
            "Access-Control-Allow-Origin": "*" 
          },
        });
      }

      // Action: status - Check job status
      if (action === 'status') {
        // If jobId provided, check specific job
        if (jobId) {
          const jobStatus = await env.DB.prepare(`
            SELECT job_id, status, messages_processed, total_messages, started_at, completed_at, 
                   last_activity_at, current_message_id, current_step, error, logs
            FROM scammer_job_status
            WHERE job_id = ?
          `).bind(jobId).first();
          
          if (!jobStatus) {
            return new Response(JSON.stringify({ error: 'Job not found' }), {
              status: 404,
          headers: { "Content-Type": "application/json" },
        });
      }

          // Parse logs
          if (jobStatus.logs) {
            try {
              jobStatus.logs = JSON.parse(jobStatus.logs);
            } catch (e) {
              jobStatus.logs = [];
        }
      } else {
            jobStatus.logs = [];
          }
          
          // Add summary information
          const messagesSkipped = (jobStatus.total_messages || 0) - (jobStatus.messages_processed || 0);
          jobStatus.summary = {
            total_messages: jobStatus.total_messages || 0,
            messages_processed: jobStatus.messages_processed || 0,
            messages_skipped: messagesSkipped,
            note: messagesSkipped > 0 ? `${messagesSkipped} messages were skipped (no Roblox profile URL found). This is normal - not all Discord messages contain scammer reports.` : 'All messages processed successfully.'
          };
          
          // Check if job is stuck (running for more than 10 minutes)
          if (jobStatus.status === 'running') {
            const now = Date.now();
            const runningTime = now - jobStatus.started_at;
            const timeSinceLastActivity = jobStatus.last_activity_at ? now - jobStatus.last_activity_at : runningTime;
            const tenMinutes = 10 * 60 * 1000;
            
            if (runningTime > tenMinutes) {
              // Mark as failed if stuck
              const stuckReason = `Job stuck - running for ${Math.round(runningTime / 1000 / 60)} minutes, last activity ${Math.round(timeSinceLastActivity / 1000 / 60)} minutes ago. Current step: ${jobStatus.current_step || 'unknown'}, Current message: ${jobStatus.current_message_id || 'none'}`;
              await env.DB.prepare(`
                UPDATE scammer_job_status 
                SET status = 'failed', error = ?
                WHERE job_id = ?
              `).bind(stuckReason, jobId).run();
              
              jobStatus.status = 'failed';
              jobStatus.error = stuckReason;
            }
          }
          
          return new Response(JSON.stringify(jobStatus), {
            headers: { 
              "Content-Type": "application/json",
              "Access-Control-Allow-Origin": "*" 
            },
          });
        } else {
          // No jobId - return all jobs
          const allJobs = await env.DB.prepare(`
            SELECT job_id, status, messages_processed, total_messages, started_at, completed_at, error
            FROM scammer_job_status
            ORDER BY started_at DESC
            LIMIT 20
          `).all();
          
          return new Response(JSON.stringify({ jobs: allJobs.results || [] }), {
            headers: { 
              "Content-Type": "application/json",
              "Access-Control-Allow-Origin": "*" 
            },
          });
        }
      }
      
      // Action: cancel - Cancel a running job
      if (action === 'cancel' && jobId) {
        const result = await env.DB.prepare(`
          UPDATE scammer_job_status 
          SET status = 'failed', error = 'Cancelled by user'
          WHERE job_id = ? AND status = 'running'
        `).bind(jobId).run();
        
        return new Response(JSON.stringify({ 
          success: result.changes > 0,
          message: result.changes > 0 ? 'Job cancelled' : 'Job not found or not running'
        }), {
          headers: { 
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*" 
          },
        });
      }
      
      // Action: force-complete - Force complete a stuck job
      if (action === 'force-complete' && jobId) {
        const result = await env.DB.prepare(`
          UPDATE scammer_job_status 
          SET status = 'completed', completed_at = ?, error = 'Force completed by user'
          WHERE job_id = ? AND status IN ('running', 'completing')
        `).bind(Date.now(), jobId).run();
        
        // Get scammer count for confirmation
        const scammerCount = await env.DB.prepare(`
          SELECT COUNT(*) as count FROM scammer_profile_cache
        `).first();
        
        return new Response(JSON.stringify({ 
          success: result.changes > 0,
          message: result.changes > 0 
            ? `Job force-completed. You have ${scammerCount?.count || 0} scammers in the database.` 
            : 'Job not found or already completed',
          scammers_in_db: scammerCount?.count || 0
        }), {
          headers: { 
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*" 
          },
        });
      }
      
      // Action: cleanup - Mark all stuck jobs as failed
      if (action === 'cleanup') {
        const tenMinutesAgo = Date.now() - (10 * 60 * 1000);
        const result = await env.DB.prepare(`
          UPDATE scammer_job_status 
          SET status = 'failed', error = 'Cleaned up - stuck job'
          WHERE status IN ('running', 'completing') AND last_activity_at < ?
        `).bind(tenMinutesAgo).run();
        
        return new Response(JSON.stringify({ 
          cleaned: result.changes,
          message: `Cleaned up ${result.changes} stuck jobs`
        }), {
          headers: { 
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*" 
          },
        });
      }
      
      // Action: debug - Check message tracking table status
      if (action === 'debug' && jobId) {
        // Check job status
        const jobStatus = await env.DB.prepare(`
          SELECT * FROM scammer_job_status WHERE job_id = ?
        `).bind(jobId).first();
        
        // Check message tracking counts
        const messageCounts = await env.DB.prepare(`
          SELECT status, COUNT(*) as count 
          FROM scammer_job_messages 
          WHERE job_id = ?
          GROUP BY status
        `).bind(jobId).all();
        
        // Check scammer count
        const scammerCount = await env.DB.prepare(`
          SELECT COUNT(*) as count FROM scammer_profile_cache
        `).first();
        
        // Sample of messages
        const sampleMessages = await env.DB.prepare(`
          SELECT message_id, status, error, processed_at
          FROM scammer_job_messages 
          WHERE job_id = ?
          ORDER BY processed_at DESC
          LIMIT 10
        `).bind(jobId).all();
        
        return new Response(JSON.stringify({ 
          job: jobStatus,
          messagesByStatus: messageCounts.results || [],
          scammersInDb: scammerCount?.count || 0,
          sampleMessages: sampleMessages.results || [],
          tip: 'If all messages are still "queued", the queue consumer is not processing them. Check: 1) Consumer is deployed, 2) Consumer logs in Cloudflare dashboard'
        }, null, 2), {
          headers: { 
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*" 
          },
        });
      }
      
      // No action or default: Return results from D1
      const { results } = await env.DB.prepare(`
        SELECT 
          user_id,
          roblox_name,
          roblox_display_name,
          roblox_avatar,
          discord_id,
          discord_display_name,
          victims,
          items_scammed,
          roblox_alts,
          thread_evidence
        FROM scammer_profile_cache
        WHERE user_id IS NOT NULL
        ORDER BY updated_at DESC
      `).all();

      const scammers = results.map(row => ({
          user_id: row.user_id,
        robloxDisplay: row.roblox_display_name || null,
        robloxUser: row.roblox_name || null,
        avatar: row.roblox_avatar || "https://emwiki.com/imgs/plr.jpg",
          discordDisplay: row.discord_display_name || null,
        discordId: row.discord_id || null,
          victims: row.victims || null,
          itemsScammed: row.items_scammed || null,
          robloxAlts: row.roblox_alts ? JSON.parse(row.roblox_alts) : [],
          hasThreadEvidence: !!row.thread_evidence
      }));

      return new Response(JSON.stringify({ 
        scammers
      }), {
        headers: { 
          "Content-Type": "application/json", 
          "Access-Control-Allow-Origin": "*" 
        },
      });

    } catch (err) {
      console.error("Discord Scammers Error:", err);
      return new Response(JSON.stringify({ error: err.message, stack: err.stack }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }
  }

  // Fallback userId/discordId logic remains unchanged...
}
