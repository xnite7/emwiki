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
    // threadId is passed - we fetch evidence here (not upfront to avoid timeouts)
    const { jobId, messageId, channelId, message: discordMsg, threadId } = message.body;

    try {
        console.log(`[QUEUE] Processing ${messageId} for job ${jobId}${threadId ? ` (thread: ${threadId})` : ''}`);

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

        // 3. Fetch thread evidence if this message has a thread
        let threadEvidence = null;
        if (threadId && env.DISCORD_BOT_TOKEN) {
            try {
                threadEvidence = await fetchThreadEvidence(threadId, env);
                console.log(`[QUEUE] Fetched ${threadEvidence.length} thread messages for ${threadId}`);
            } catch (err) {
                console.warn(`[QUEUE] Failed to fetch thread ${threadId}: ${err.message}`);
            }
        }

        // 4. Extract and store scammer data
        const result = await extractAndStoreScammer(discordMsg, env, db, jobId, threadEvidence);

        // 5. Mark message with final status
        if (result.processed) {
            await markMessageDone(db, jobId, messageId, 'completed');
            await incrementProcessed(db, jobId);
            const evidenceNote = threadEvidence ? ` + ${threadEvidence.length} evidence msgs` : '';
            console.log(`[QUEUE] ✓ Processed ${messageId} - user ${result.userId}${evidenceNote}`);
        } else {
            await markMessageDone(db, jobId, messageId, 'skipped', result.reason);
            console.log(`[QUEUE] - Skipped ${messageId}: ${result.reason}`);
        }

        // 6. Check if job is complete
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
    user_id, roblox_name, roblox_display_name, roblox_avatar,
    discord_id, discord_display_name, victims, items_scammed,
    roblox_alts, thread_id, thread_evidence, message_id
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT(user_id) DO UPDATE SET
    roblox_name = COALESCE(excluded.roblox_name, roblox_name),
    roblox_display_name = COALESCE(excluded.roblox_display_name, roblox_display_name),
    roblox_avatar = COALESCE(excluded.roblox_avatar, roblox_avatar),
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
// THREAD EVIDENCE FETCHING
// ============================================================================

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
      
      // Upload attachments to Cloudflare Images/Stream
      if (msg.attachments?.length) {
        for (const att of msg.attachments) {
          try {
            const uploaded = await uploadToCloudflareMedia(att, env);
            processed.attachments.push(uploaded);
          } catch (e) {
            console.warn(`[UPLOAD] Failed to upload ${att.filename}: ${e.message}`);
            // Keep original URL as fallback
            processed.attachments.push({
              id: att.id,
              filename: att.filename,
              content_type: att.content_type,
              url: att.url
            });
          }
        }
      }
      
      messages.push(processed);
    }
    
    lastId = batch[batch.length - 1].id;
    await delay(300); // Rate limit
  }
  
  // Sort oldest first
  return messages.sort((a, b) => 
    new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  );
}

// ============================================================================
// CLOUDFLARE IMAGES & STREAM UPLOAD
// ============================================================================

async function uploadToCloudflareMedia(attachment, env) {
  const contentType = attachment.content_type || '';
  const isImage = contentType.startsWith('image/');
  const isVideo = contentType.startsWith('video/') || contentType === 'video/quicktime';
  
  if (isImage) {
    return await uploadToCloudflareImages(attachment, env);
  } else if (isVideo) {
    return await uploadToCloudflareStream(attachment, env);
  } else {
    // Other file types - just return original URL
    return {
      id: attachment.id,
      filename: attachment.filename,
      content_type: attachment.content_type,
      url: attachment.url
    };
  }
}

async function uploadToCloudflareImages(attachment, env) {
  const accountId = env.CLOUDFLARE_ACCOUNT_ID;
    const apiToken = env.CLOUDFLARE_STREAM_TOKEN;
  
  if (!accountId || !apiToken) {
    console.warn('[IMAGES] Missing CLOUDFLARE_ACCOUNT_ID or CLOUDFLARE_STREAM_TOKEN');
    return {
      id: attachment.id,
      filename: attachment.filename,
      content_type: attachment.content_type,
      url: attachment.url
    };
  }
  
  // Use attachment ID as custom ID to check for duplicates
  const customId = `scammer-evidence-${attachment.id}`;
  
  // Check if image already exists
  const checkUrl = `https://api.cloudflare.com/client/v4/accounts/${accountId}/images/v1/${customId}`;
  const checkRes = await fetch(checkUrl, {
    headers: { Authorization: `Bearer ${apiToken}` }
  });
  
  if (checkRes.ok) {
    const existing = await checkRes.json();
    if (existing.success && existing.result?.variants?.[0]) {
      console.log(`[IMAGES] Already exists: ${customId}`);
      return {
        id: attachment.id,
        filename: attachment.filename,
        content_type: attachment.content_type,
        cf_url: existing.result.variants[0],
        url: attachment.url
      };
    }
  }
  
  // Download from Discord
  const downloadRes = await fetch(attachment.url);
  if (!downloadRes.ok) throw new Error('Failed to download from Discord');
  
  const imageBlob = await downloadRes.blob();
  
  // Upload to Cloudflare Images
  const formData = new FormData();
  formData.append('file', imageBlob, attachment.filename);
  formData.append('id', customId);
  formData.append('metadata', JSON.stringify({
    source: 'discord',
    attachment_id: attachment.id,
    filename: attachment.filename
  }));
  
  const uploadUrl = `https://api.cloudflare.com/client/v4/accounts/${accountId}/images/v1`;
  const uploadRes = await fetch(uploadUrl, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiToken}` },
    body: formData
  });
  
  if (!uploadRes.ok) {
    const error = await uploadRes.text();
    throw new Error(`Upload failed: ${error}`);
  }
  
  const result = await uploadRes.json();
  if (!result.success) {
    throw new Error(result.errors?.[0]?.message || 'Upload failed');
  }
  
  console.log(`[IMAGES] Uploaded: ${customId}`);
  
  return {
    id: attachment.id,
    filename: attachment.filename,
    content_type: attachment.content_type,
    cf_url: result.result.variants[0], // Public URL
    url: attachment.url
  };
}

async function uploadToCloudflareStream(attachment, env) {
  const accountId = env.CLOUDFLARE_ACCOUNT_ID;
  const apiToken = env.CLOUDFLARE_STREAM_TOKEN;
  
  if (!accountId || !apiToken) {
    console.warn('[STREAM] Missing CLOUDFLARE_ACCOUNT_ID or CLOUDFLARE_STREAM_TOKEN');
    return {
      id: attachment.id,
      filename: attachment.filename,
      content_type: attachment.content_type,
      url: attachment.url
    };
  }
  
  // Use attachment ID as UID to check for duplicates
  const customUid = `scammer-evidence-${attachment.id}`;
  
  // Check if video already exists by searching
  const searchUrl = `https://api.cloudflare.com/client/v4/accounts/${accountId}/stream?search=${customUid}`;
  const searchRes = await fetch(searchUrl, {
    headers: { Authorization: `Bearer ${apiToken}` }
  });
  
  if (searchRes.ok) {
    const existing = await searchRes.json();
    if (existing.success && existing.result?.length > 0) {
      const video = existing.result[0];
      console.log(`[STREAM] Already exists: ${customUid}`);
      return {
        id: attachment.id,
        filename: attachment.filename,
        content_type: attachment.content_type,
        stream_url: `https://customer-${accountId}.cloudflarestream.com/${video.uid}/manifest/video.m3u8`,
        stream_uid: video.uid,
        url: attachment.url
      };
    }
  }
  
  // Upload via URL (Stream can fetch from Discord directly)
  const uploadUrl = `https://api.cloudflare.com/client/v4/accounts/${accountId}/stream/copy`;
  const uploadRes = await fetch(uploadUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      url: attachment.url,
      meta: {
        name: customUid,
        source: 'discord',
        attachment_id: attachment.id,
        filename: attachment.filename
      }
    })
  });
  
  if (!uploadRes.ok) {
    const error = await uploadRes.text();
    throw new Error(`Stream upload failed: ${error}`);
  }
  
  const result = await uploadRes.json();
  if (!result.success) {
    throw new Error(result.errors?.[0]?.message || 'Stream upload failed');
  }
  
  console.log(`[STREAM] Uploaded: ${customUid} -> ${result.result.uid}`);
  
  return {
    id: attachment.id,
    filename: attachment.filename,
    content_type: attachment.content_type,
    stream_url: `https://customer-${accountId}.cloudflarestream.com/${result.result.uid}/manifest/video.m3u8`,
    stream_uid: result.result.uid,
    url: attachment.url
  };
}

// ============================================================================
// UTILITIES
// ============================================================================

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
