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
    
    console.log(`[QUEUE] Received batch of ${messages.length} messages`);
    
    // Process messages sequentially to avoid overwhelming Discord API
    for (const message of messages) {
      const { jobId, messageId, channelId, message: msg } = message.body;
      let messageSeen = false;
      let db = null;
      
      try {
        console.log(`[QUEUE] Processing message ${messageId} for job ${jobId}`);
        
        // Check database binding first
        db = env.DB || env.DBA;
        if (!db) {
          throw new Error('D1 database binding not found. Check wrangler.toml - binding should be "DB" or "DBA". Also verify database_id is set correctly.');
        }
        
        // CRITICAL: Increment messages_seen FIRST, before processing
        // This ensures every message is counted, even if processing fails
        // We use a simple approach: check if this message ID was already seen for this job
        // by checking if we can increment messages_seen atomically
        
        // Get current job status
        const jobStatus = await db.prepare(`
          SELECT messages_processed, messages_seen, total_messages, status
          FROM scammer_job_status
          WHERE job_id = ?
        `).bind(jobId).first();
        
        if (!jobStatus) {
          console.warn(`[QUEUE] Job ${jobId} not found in database`);
          message.ack(); // Ack to prevent infinite retries
          continue;
        }
        
        // Skip if job is already completed
        if (jobStatus.status !== 'running') {
          console.log(`[QUEUE] Job ${jobId} is already ${jobStatus.status}, skipping`);
          message.ack();
          continue;
        }
        
        // Increment messages_seen atomically (tracks all messages seen, including retries)
        // This ensures we count every message attempt, even if it fails
        const currentSeen = jobStatus.messages_seen || 0;
        const newSeen = currentSeen + 1;
        const totalMessages = jobStatus.total_messages || 0;
        const remaining = totalMessages - currentSeen;
        
        console.log(`[QUEUE] Job ${jobId}: Processing message ${messageId}, messages_seen ${currentSeen} -> ${newSeen}, total: ${totalMessages}, remaining: ${remaining}`);
        
        // Update messages_seen immediately (before processing)
        // This way, even if processing fails, we've counted this message
        const updateSeenResult = await db.prepare(`
          UPDATE scammer_job_status 
          SET messages_seen = ?, last_activity_at = ?, current_message_id = ?
          WHERE job_id = ? AND status = 'running'
        `).bind(newSeen, Date.now(), messageId, jobId).run();
        
        if (updateSeenResult.changes === 0) {
          console.warn(`[QUEUE] Failed to update messages_seen for job ${jobId} (current: ${currentSeen}, trying: ${newSeen}) - job may have been completed or doesn't exist`);
          // Check what the actual status is
          const actualStatus = await db.prepare(`
            SELECT status, messages_seen, total_messages FROM scammer_job_status WHERE job_id = ?
          `).bind(jobId).first();
          if (actualStatus) {
            console.warn(`[QUEUE] Job ${jobId} actual status: ${actualStatus.status}, messages_seen: ${actualStatus.messages_seen}, total: ${actualStatus.total_messages}`);
          }
          message.ack(); // Ack to prevent infinite retries
          continue;
        }
        
        messageSeen = true;
        
        // CRITICAL: Check for completion immediately after incrementing messages_seen
        // This ensures we catch completion even with concurrent processing
        // Refetch to get the actual current value (might have been updated by another worker)
        const currentStatusCheck = await db.prepare(`
          SELECT messages_seen, total_messages, status FROM scammer_job_status WHERE job_id = ?
        `).bind(jobId).first();
        
        const actualSeen = currentStatusCheck?.messages_seen || newSeen;
        const actualTotal = currentStatusCheck?.total_messages || totalMessages;
        
        if (actualSeen >= actualTotal && currentStatusCheck?.status === 'running') {
          console.log(`[QUEUE] Job ${jobId} completion check (after increment): ${actualSeen} >= ${actualTotal}`);
          const completionCheck = await db.prepare(`
            UPDATE scammer_job_status 
            SET status = 'completing', last_activity_at = ?
            WHERE job_id = ? AND status = 'running' AND messages_seen >= total_messages
          `).bind(Date.now(), jobId).run();
          
          if (completionCheck.changes > 0) {
            console.log(`[QUEUE] Job ${jobId} marked as completing - all ${actualSeen} messages seen, triggering completion`);
            // Mark job as completing, but still process this message to update messages_processed
            // The completion will be handled after processing
          }
        }
        
        // Now process the message
        const processed = await processQueuedMessage(msg, env, channelId, jobId, db);
        
        // Update messages_processed only if message was actually processed (had Roblox URL)
        if (processed) {
          // Refetch job status to get latest values (in case another worker updated it)
          const latestJobStatus = await db.prepare(`
            SELECT messages_processed, messages_seen, total_messages, status
            FROM scammer_job_status
            WHERE job_id = ?
          `).bind(jobId).first();
          
          if (!latestJobStatus || latestJobStatus.status !== 'running') {
            console.log(`[QUEUE] Job ${jobId} is no longer running, skipping completion check`);
            message.ack();
            continue;
          }
          
          const currentProcessed = latestJobStatus.messages_processed || 0;
          const newProcessed = currentProcessed + 1;
          const latestSeen = latestJobStatus.messages_seen || 0;
          const latestTotal = latestJobStatus.total_messages || 0;
          
          await db.prepare(`
            UPDATE scammer_job_status 
            SET messages_processed = ?, last_activity_at = ?, current_message_id = ?
            WHERE job_id = ? AND status IN ('running', 'completing')
          `).bind(newProcessed, Date.now(), messageId, jobId).run();
          
          console.log(`[QUEUE] Job ${jobId}: messages_processed ${currentProcessed} -> ${newProcessed}, messages_seen: ${latestSeen}, total: ${latestTotal}`);
          
          // Check if all messages are seen (processed + skipped) AND job is still running
          // Use >= to handle any race conditions where messages_seen might slightly exceed total
          if (latestSeen >= latestTotal) {
            console.log(`[QUEUE] Job ${jobId} completion check: ${latestSeen} >= ${latestTotal}`);
            
            // Use atomic update to mark as completing (handles both 'running' and 'completing' states)
            const completionCheck = await db.prepare(`
              UPDATE scammer_job_status 
              SET status = 'completing', last_activity_at = ?
              WHERE job_id = ? AND status IN ('running', 'completing') AND messages_seen >= total_messages
            `).bind(Date.now(), jobId).run();
            
            if (completionCheck.changes > 0) {
              // We successfully marked it as completing - proceed with thread fetch
              console.log(`[QUEUE] Job ${jobId} complete - all ${latestSeen} messages seen, ${newProcessed} processed`);
              await logJobActivity(env, jobId, 'messages_complete', null, `All ${latestSeen} messages seen, ${newProcessed} processed, fetching threads`, db);
              
              try {
                // Fetch threads after all messages are done
                await fetchAllThreadMessages(env, jobId, db);
                
                // Mark as completed
                await db.prepare(`
                  UPDATE scammer_job_status 
                  SET status = 'completed', completed_at = ?, last_activity_at = ?
                  WHERE job_id = ?
                `).bind(Date.now(), Date.now(), jobId).run();
                
                await logJobActivity(env, jobId, 'job_completed', null, 'Job completed successfully', db);
                console.log(`[QUEUE] Job ${jobId} marked as completed`);
              } catch (threadErr) {
                // If thread fetching fails, still mark as completed (threads can be fetched later)
                console.error(`[QUEUE] Error fetching threads for job ${jobId}:`, threadErr);
                await logJobActivity(env, jobId, 'threads_failed', null, `Thread fetching failed: ${threadErr.message}`, db);
                
                // Mark as completed anyway - threads can be fetched via periodic checker
                await db.prepare(`
                  UPDATE scammer_job_status 
                  SET status = 'completed', completed_at = ?, last_activity_at = ?, error = ?
                  WHERE job_id = ?
                `).bind(Date.now(), Date.now(), `Thread fetching failed: ${threadErr.message}`, jobId).run();
              }
            } else {
              // Another worker is already completing this job, or it's already completed
              console.log(`[QUEUE] Job ${jobId} completion already in progress or completed by another worker`);
            }
          } else {
            // Not all messages seen yet
            const remaining = latestTotal - latestSeen;
            if (remaining <= 10) {
              console.log(`[QUEUE] Job ${jobId} almost complete: ${remaining} messages remaining`);
            }
          }
        } else {
          // Message was skipped (no Roblox URL) - check completion anyway
          // Refetch job status to get latest values
          const latestJobStatus = await db.prepare(`
            SELECT messages_seen, total_messages, status
            FROM scammer_job_status
            WHERE job_id = ?
          `).bind(jobId).first();
          
          if (!latestJobStatus || latestJobStatus.status !== 'running') {
            console.log(`[QUEUE] Job ${jobId} is no longer running, skipping completion check`);
            message.ack();
            continue;
          }
          
          const latestSeen = latestJobStatus.messages_seen || 0;
          const latestTotal = latestJobStatus.total_messages || 0;
          
          console.log(`[QUEUE] Job ${jobId}: Message skipped, messages_seen: ${latestSeen}, total: ${latestTotal}`);
          
          if (latestSeen >= latestTotal) {
            console.log(`[QUEUE] Job ${jobId} completion check: ${latestSeen} >= ${latestTotal}`);
            
            // Use atomic update to prevent race conditions
            const completionCheck = await db.prepare(`
              UPDATE scammer_job_status 
              SET status = 'completing', last_activity_at = ?
              WHERE job_id = ? AND status = 'running' AND messages_seen >= total_messages
            `).bind(Date.now(), jobId).run();
            
            if (completionCheck.changes > 0) {
              console.log(`[QUEUE] Job ${jobId} complete - all ${latestSeen} messages seen (all skipped)`);
              await logJobActivity(env, jobId, 'messages_complete', null, `All ${latestSeen} messages seen (all skipped), fetching threads`, db);
              
              try {
                await fetchAllThreadMessages(env, jobId, db);
                await db.prepare(`
                  UPDATE scammer_job_status 
                  SET status = 'completed', completed_at = ?, last_activity_at = ?
                  WHERE job_id = ?
                `).bind(Date.now(), Date.now(), jobId).run();
                await logJobActivity(env, jobId, 'job_completed', null, 'Job completed successfully', db);
              } catch (threadErr) {
                console.error(`[QUEUE] Error fetching threads for job ${jobId}:`, threadErr);
                await logJobActivity(env, jobId, 'threads_failed', null, `Thread fetching failed: ${threadErr.message}`, db);
                await db.prepare(`
                  UPDATE scammer_job_status 
                  SET status = 'completed', completed_at = ?, last_activity_at = ?, error = ?
                  WHERE job_id = ?
                `).bind(Date.now(), Date.now(), `Thread fetching failed: ${threadErr.message}`, jobId).run();
              }
            } else {
              console.log(`[QUEUE] Job ${jobId} completion already in progress or completed by another worker`);
            }
          } else {
            const remaining = latestTotal - latestSeen;
            if (remaining <= 10) {
              console.log(`[QUEUE] Job ${jobId} almost complete: ${remaining} messages remaining`);
            }
          }
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
        console.error(`[QUEUE ERROR] Processing message ${messageId || 'unknown'}:`, err);
        console.error(`[QUEUE ERROR] Stack:`, err.stack);
        results.push({ success: false, error: err.message });
        
        // If we haven't marked this message as seen yet, do it now (even on error)
        // This ensures failed messages are still counted
        if (!messageSeen && db) {
          try {
            const jobStatus = await db.prepare(`
              SELECT messages_seen, total_messages, status FROM scammer_job_status WHERE job_id = ?
            `).bind(jobId).first();
            
            if (jobStatus && jobStatus.status === 'running') {
              const newSeen = (jobStatus.messages_seen || 0) + 1;
              await db.prepare(`
                UPDATE scammer_job_status 
                SET messages_seen = ?, last_activity_at = ?, current_message_id = ?
                WHERE job_id = ? AND status = 'running'
              `).bind(newSeen, Date.now(), messageId, jobId).run();
              
              // Check completion even on error
              if (newSeen >= jobStatus.total_messages) {
                const currentJobStatus = await db.prepare(`
                  SELECT status FROM scammer_job_status WHERE job_id = ?
                `).bind(jobId).first();
                
                if (currentJobStatus && currentJobStatus.status === 'running') {
                  console.log(`[QUEUE] Job ${jobId} complete - all ${newSeen} messages seen (some failed)`);
                  await logJobActivity(env, jobId, 'messages_complete', null, `All ${newSeen} messages seen (some failed), fetching threads`, db);
                  
                  try {
                    await fetchAllThreadMessages(env, jobId, db);
                    await db.prepare(`
                      UPDATE scammer_job_status 
                      SET status = 'completed', completed_at = ?, last_activity_at = ?
                      WHERE job_id = ?
                    `).bind(Date.now(), Date.now(), jobId).run();
                    await logJobActivity(env, jobId, 'job_completed', null, 'Job completed successfully', db);
                  } catch (threadErr) {
                    await logJobActivity(env, jobId, 'threads_failed', null, `Thread fetching failed: ${threadErr.message}`, db);
                    await db.prepare(`
                      UPDATE scammer_job_status 
                      SET status = 'completed', completed_at = ?, last_activity_at = ?, error = ?
                      WHERE job_id = ?
                    `).bind(Date.now(), Date.now(), `Thread fetching failed: ${threadErr.message}`, jobId).run();
                  }
                }
              }
            }
          } catch (dbErr) {
            console.error(`[QUEUE ERROR] Failed to update messages_seen on error:`, dbErr);
          }
        }
        
        // Let queue handle retries - don't ack, don't retry manually
        // The queue will retry based on max_retries and retry_delay settings
        console.log(`[QUEUE ERROR] Message ${messageId} will be retried by queue`);
        message.retry();
      }
    }
    
    const successful = results.filter(r => r.success).length;
    const failed = results.filter(r => !r.success).length;
    console.log(`[QUEUE] Batch processed: ${successful} successful, ${failed} failed out of ${messages.length} total`);
    
    // Log summary of job progress for debugging
    if (messages.length > 0) {
      const firstJobId = messages[0]?.body?.jobId;
      if (firstJobId) {
        try {
          const db = env.DB || env.DBA;
          if (db) {
            const jobStatus = await db.prepare(`
              SELECT messages_seen, messages_processed, total_messages, status
              FROM scammer_job_status
              WHERE job_id = ?
            `).bind(firstJobId).first();
            
            if (jobStatus) {
              const remaining = jobStatus.total_messages - jobStatus.messages_seen;
              console.log(`[QUEUE] Job ${firstJobId} progress: ${jobStatus.messages_seen}/${jobStatus.total_messages} seen, ${jobStatus.messages_processed} processed, ${remaining} remaining`);
            }
          }
        } catch (err) {
          // Ignore errors in diagnostic logging
        }
      }
    }
    
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

async function logJobActivity(env, jobId, step, messageId, details, db = null) {
  try {
    if (!db) {
      db = env.DB || env.DBA;
    }
    if (!db) {
      console.warn(`[QUEUE] D1 database binding not found, skipping log`);
      return;
    }
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
  
  if (!results || results.length === 0) {
    await logJobActivity(env, jobId, 'no_threads', null, 'No threads found to fetch', db);
    return;
  }
  
  await logJobActivity(env, jobId, 'threads_found', null, `Found ${results.length} scammers with threads`, db);
  console.log(`[QUEUE] Found ${results.length} scammers with threads`);
  
  let threadsProcessed = 0;
  let threadsFetched = 0;
  let totalMessagesFetched = 0;
  
  for (const row of results) {
    try {
      const threadEvidence = JSON.parse(row.thread_evidence);
      const threadId = threadEvidence?.thread_id;
      
      if (!threadId) {
        console.log(`[QUEUE] User ${row.user_id} has thread_evidence but no thread_id`);
        continue;
      }
      
      threadsProcessed++;
      await logJobActivity(env, jobId, 'fetching_thread', threadId, `Fetching thread ${threadId} for user ${row.user_id} (${threadsProcessed}/${results.length})`, db);
      console.log(`[QUEUE] Fetching thread ${threadId} for user ${row.user_id} (${threadsProcessed}/${results.length})`);
      
      // Fetch all messages from the thread
      const threadMessages = await fetchDiscordThread(threadId, env);
      
      if (!threadMessages || threadMessages.length === 0) {
        console.log(`[QUEUE] Thread ${threadId} has no messages or failed to fetch`);
        await logJobActivity(env, jobId, 'thread_empty', threadId, `Thread ${threadId} has no messages`, db);
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
      
      await db.prepare(`
        UPDATE scammer_profile_cache
        SET thread_evidence = ?,
            thread_last_message_id = ?
        WHERE user_id = ?
      `).bind(
        JSON.stringify(updatedThreadEvidence),
        threadMessages[threadMessages.length - 1]?.id || null,
        row.user_id
      ).run();
      
      await logJobActivity(env, jobId, 'thread_fetched', threadId, `Fetched ${threadMessages.length} messages from thread ${threadId}`, db);
      console.log(`[QUEUE] Fetched ${threadMessages.length} messages from thread ${threadId} for user ${row.user_id}`);
      
      // Rate limit: wait 1.5 seconds between thread fetches
      if (threadsProcessed < results.length) {
        await new Promise(resolve => setTimeout(resolve, 1500));
      }
    } catch (err) {
      console.error(`[QUEUE] Error fetching thread for user ${row.user_id}:`, err.message);
      await logJobActivity(env, jobId, 'thread_error', null, `Error fetching thread for user ${row.user_id}: ${err.message}`, db);
    }
  }
  
  await logJobActivity(env, jobId, 'threads_complete', null, `Fetched ${totalMessagesFetched} messages from ${threadsFetched}/${threadsProcessed} threads`, db);
  console.log(`[QUEUE] Thread fetching complete: ${totalMessagesFetched} messages from ${threadsFetched}/${threadsProcessed} threads`);
}

/**
 * Fetch all messages from a Discord thread
 * Downloads images/videos to R2 automatically
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

      // Process messages and download attachments to R2
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
          embeds: msg.embeds || []
        };

        // Process attachments (download to R2)
        if (msg.attachments && msg.attachments.length > 0) {
          const attachmentPromises = msg.attachments.map(async (att) => {
            const isVideo = att.content_type?.startsWith('video/') || false;
            const isImage = att.content_type?.startsWith('image/') || false;
            
            let r2Url = null;
            let streamId = null;
            let streamUrl = null;
            
            if (isVideo && att.url && env.MY_BUCKET) {
              try {
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
              } catch (err) {
                console.warn(`[QUEUE] Failed to download video ${att.id}:`, err.message);
              }
            }
            
            if (isImage && att.url && env.MY_BUCKET) {
              try {
                const result = await downloadImageToR2(
                  att.url,
                  att.id,
                  att.filename,
                  att.content_type,
                  env
                );
                r2Url = result.r2_url;
              } catch (err) {
                console.warn(`[QUEUE] Failed to download image ${att.id}:`, err.message);
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
              is_video: isVideo
            };
          });

          messageData.attachments = await Promise.all(attachmentPromises);
        }

        threadMessages.push(messageData);
      }

      before = messages[messages.length - 1].id;
      
      // Rate limit: wait 1.5 seconds between batches
      await new Promise(resolve => setTimeout(resolve, 1500));
      
      // Safety limit
      if (threadMessages.length >= 5000) break;
    }

    // Sort by timestamp (oldest first)
    threadMessages.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

    return threadMessages;
  } catch (err) {
    console.warn(`[QUEUE] Failed to fetch thread ${threadId}:`, err);
    return null;
  }
}

/**
 * Download Discord video and upload to R2 (and Stream for QuickTime)
 */
async function downloadVideoToR2(discordUrl, attachmentId, filename, contentType, env) {
  try {
    if (!env.MY_BUCKET) return { r2_url: null, stream_id: null };
    
    let ext = filename.split('.').pop();
    if (!ext || ext === filename) {
      if (contentType?.includes('mp4')) ext = 'mp4';
      else if (contentType?.includes('webm')) ext = 'webm';
      else if (contentType?.includes('quicktime')) ext = 'mov';
      else ext = 'mp4';
    }

    const isQuickTime = contentType?.includes('quicktime') || ext === 'mov';
    const key = `scammer-evidence/videos/${attachmentId}.${ext}`;

    // Check if already exists
    try {
      const existing = await env.MY_BUCKET.head(key);
      if (existing) {
        return { r2_url: `https://cdn.emwiki.com/${key}`, stream_id: null };
      }
    } catch {}

    // Download from Discord
    const videoResponse = await fetch(discordUrl, {
      headers: { Authorization: `Bot ${env.DISCORD_BOT_TOKEN}` }
    });

    if (!videoResponse.ok) {
      return { r2_url: null, stream_id: null };
    }

    const videoData = await videoResponse.arrayBuffer();

    // Upload to R2
    await env.MY_BUCKET.put(key, videoData, {
      httpMetadata: { 
        contentType: contentType || 'video/mp4',
        cacheControl: 'public, max-age=31536000'
      },
      customMetadata: {
        'original-filename': filename || 'video'
      }
    });

    const r2Url = `https://cdn.emwiki.com/${key}`;

    // For QuickTime videos, upload to Stream
    let streamData = null;
    if (isQuickTime && env.CLOUDFLARE_ACCOUNT_ID && env.CLOUDFLARE_STREAM_TOKEN) {
      try {
        streamData = await uploadVideoToStream(videoData, filename, env);
      } catch (err) {
        console.warn(`[QUEUE] Failed to upload to Stream:`, err.message);
      }
    }

    return { 
      r2_url: r2Url, 
      stream_id: streamData?.id || null,
      stream_url: streamData?.playback_url || null
    };
  } catch (err) {
    console.error(`[QUEUE] Error downloading video:`, err);
    return { r2_url: null, stream_id: null };
  }
}

/**
 * Download Discord image and upload to R2
 */
async function downloadImageToR2(discordUrl, attachmentId, filename, contentType, env) {
  try {
    if (!env.MY_BUCKET) return { r2_url: null };
    
    let ext = filename.split('.').pop();
    if (!ext || ext === filename) {
      if (contentType?.includes('png')) ext = 'png';
      else if (contentType?.includes('jpeg') || contentType?.includes('jpg')) ext = 'jpg';
      else if (contentType?.includes('gif')) ext = 'gif';
      else if (contentType?.includes('webp')) ext = 'webp';
      else ext = 'png';
    }

    const key = `scammer-evidence/images/${attachmentId}.${ext}`;

    // Check if already exists
    try {
      const existing = await env.MY_BUCKET.head(key);
      if (existing) {
        return { r2_url: `https://cdn.emwiki.com/${key}` };
      }
    } catch {}

    // Download from Discord
    const imageResponse = await fetch(discordUrl, {
      headers: { Authorization: `Bot ${env.DISCORD_BOT_TOKEN}` }
    });

    if (!imageResponse.ok) {
      return { r2_url: null };
    }

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

    return { r2_url: `https://cdn.emwiki.com/${key}` };
  } catch (err) {
    console.error(`[QUEUE] Error downloading image:`, err);
    return { r2_url: null };
  }
}

/**
 * Upload video to Cloudflare Stream
 */
async function uploadVideoToStream(videoData, filename, env) {
  try {
    if (!env.CLOUDFLARE_ACCOUNT_ID || !env.CLOUDFLARE_STREAM_TOKEN) {
      return null;
    }

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
      return null;
    }

    const streamData = await uploadResponse.json();
    const videoId = streamData.result?.uid;
    if (videoId) {
      let playbackUrl = streamData.result?.playback?.hls || streamData.result?.playback?.dash;
      if (!playbackUrl) {
        playbackUrl = `https://customer-wosapspiey2ql225.cloudflarestream.com/${videoId}/manifest/video.m3u8`;
      }
      return {
        id: videoId,
        playback_url: playbackUrl
      };
    }
    return null;
  } catch (err) {
    console.error(`[QUEUE] Error uploading to Stream:`, err);
    return null;
  }
}

