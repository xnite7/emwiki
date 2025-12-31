/**
 * ============================================================================
 * SCAMMER PERIODIC CHECKER WORKER
 * ============================================================================
 * 
 * This Worker runs periodically (every hour) to:
 * 1. Check for new messages in the Discord channel
 * 2. Check for new threads on existing messages (especially recent ones)
 * 3. Process new messages and fetch new thread evidence
 * 
 * Deploy as a separate Worker with cron trigger:
 * See emwiki/workers/scammer-periodic-checker-wrangler.toml
 * 
 * Cron: "0 * * * *" (every hour)
 * ============================================================================
 */

export default {
  async scheduled(event, env, ctx) {
    ctx.waitUntil(checkForNewContent(env));
  }
};

/**
 * Main function to check for new messages and threads
 */
async function checkForNewContent(env) {
  const startTime = Date.now();
  console.log('[PERIODIC CHECK] Starting periodic check for new messages and threads');
  
  try {
    // Check required environment variables
    if (!env.DISCORD_BOT_TOKEN) {
      throw new Error('DISCORD_BOT_TOKEN not set');
    }
    if (!env.DISCORD_CHANNEL_ID) {
      throw new Error('DISCORD_CHANNEL_ID not set');
    }
    
    const db = env.DB || env.DBA;
    if (!db) {
      throw new Error('D1 database binding (DB or DBA) not found');
    }
    
    const results = {
      newMessagesFound: 0,
      newMessagesProcessed: 0,
      newThreadsFound: 0,
      newThreadsFetched: 0,
      errors: []
    };
    
    // Step 1: Check for new messages in the channel
    console.log('[PERIODIC CHECK] Step 1: Checking for new messages');
    const newMessagesResult = await checkForNewMessages(env, db);
    results.newMessagesFound = newMessagesResult.found;
    results.newMessagesProcessed = newMessagesResult.processed;
    if (newMessagesResult.error) {
      results.errors.push(`New messages check: ${newMessagesResult.error}`);
    }
    
    // Step 2: Check for new threads on existing messages
    console.log('[PERIODIC CHECK] Step 2: Checking for new threads');
    const newThreadsResult = await checkForNewThreads(env, db);
    results.newThreadsFound = newThreadsResult.found;
    results.newThreadsFetched = newThreadsResult.fetched;
    if (newThreadsResult.error) {
      results.errors.push(`New threads check: ${newThreadsResult.error}`);
    }
    
    const duration = Date.now() - startTime;
    console.log('[PERIODIC CHECK] Completed:', {
      ...results,
      durationMs: duration,
      durationSeconds: Math.round(duration / 1000)
    });
    
    return results;
  } catch (error) {
    console.error('[PERIODIC CHECK] Error:', error);
    throw error;
  }
}

/**
 * Check for new messages in the Discord channel
 * Compares with last_message_id in database to find unprocessed messages
 */
async function checkForNewMessages(env, db) {
  try {
    const channelId = env.DISCORD_CHANNEL_ID;
    
    // Get the most recent message ID we've processed
    const lastProcessed = await db.prepare(`
      SELECT MAX(last_message_id) as last_id
      FROM scammer_profile_cache
      WHERE last_message_id IS NOT NULL
    `).first();
    
    const lastMessageId = lastProcessed?.last_id || null;
    console.log(`[PERIODIC CHECK] Last processed message ID: ${lastMessageId || 'none'}`);
    
    // Fetch recent messages from Discord (last 100 messages)
    const messages = await fetchRecentMessages(channelId, env, 100);
    
    if (messages.length === 0) {
      return { found: 0, processed: 0 };
    }
    
    // Filter to only new messages (after lastMessageId)
    let newMessages = [];
    if (lastMessageId) {
      // Find the index of lastMessageId, then take all messages after it
      const lastIndex = messages.findIndex(msg => msg.id === lastMessageId);
      if (lastIndex >= 0) {
        newMessages = messages.slice(0, lastIndex); // Messages before lastMessageId are newer
      } else {
        // Last message not found in recent 100, might be older - check all
        // Compare message IDs (Discord snowflakes are chronological)
        newMessages = messages.filter(msg => {
          // If message ID is greater than lastMessageId, it's newer
          return BigInt(msg.id) > BigInt(lastMessageId);
        });
      }
    } else {
      // No last message ID - all messages are new
      newMessages = messages;
    }
    
    console.log(`[PERIODIC CHECK] Found ${newMessages.length} new messages`);
    
    if (newMessages.length === 0) {
      return { found: 0, processed: 0 };
    }
    
    // Enqueue new messages for processing
    if (!env.SCAMMER_QUEUE) {
      throw new Error('SCAMMER_QUEUE binding not found');
    }
    
    // Create a temporary job ID for tracking
    const jobId = `periodic_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    // Add job status entry
    await db.prepare(`
      INSERT INTO scammer_job_status (job_id, status, started_at, messages_processed, messages_seen, total_messages)
      VALUES (?, 'running', ?, 0, 0, ?)
    `).bind(jobId, Date.now(), newMessages.length).run();
    
    // Enqueue messages
    const queueMessages = newMessages.map(msg => ({
      body: {
        jobId,
        messageId: msg.id,
        channelId,
        message: msg
      }
    }));
    
    // Send in batches of 100
    for (let i = 0; i < queueMessages.length; i += 100) {
      const batch = queueMessages.slice(i, i + 100);
      await env.SCAMMER_QUEUE.sendBatch(batch);
    }
    
    console.log(`[PERIODIC CHECK] Enqueued ${newMessages.length} new messages`);
    
    return {
      found: newMessages.length,
      processed: newMessages.length // They'll be processed by queue consumer
    };
  } catch (error) {
    console.error('[PERIODIC CHECK] Error checking for new messages:', error);
    return { found: 0, processed: 0, error: error.message };
  }
}

/**
 * Check for new threads on existing messages
 * Focuses on recent messages (last 50) that don't have threads yet
 */
async function checkForNewThreads(env, db) {
  try {
    const channelId = env.DISCORD_CHANNEL_ID;
    
    // Get recent messages that don't have threads yet
    // Check last 50 messages that were processed but don't have thread_evidence
    const recentMessages = await db.prepare(`
      SELECT user_id, last_message_id
      FROM scammer_profile_cache
      WHERE last_message_id IS NOT NULL
        AND (thread_evidence IS NULL OR thread_evidence = '')
      ORDER BY last_message_id DESC
      LIMIT 50
    `).all();
    
    if (!recentMessages.results || recentMessages.results.length === 0) {
      return { found: 0, fetched: 0 };
    }
    
    console.log(`[PERIODIC CHECK] Checking ${recentMessages.results.length} messages for new threads`);
    
    // Fetch active threads from Discord
    const activeThreads = await fetchActiveThreads(channelId, env);
    
    if (!activeThreads || activeThreads.length === 0) {
      return { found: 0, fetched: 0 };
    }
    
    // Match threads to messages
    let newThreadsFound = 0;
    let newThreadsFetched = 0;
    
    for (const row of recentMessages.results) {
      try {
        // Find thread for this message ID
        const thread = activeThreads.find(t => t.message_id === row.last_message_id);
        
        if (thread && thread.id) {
          newThreadsFound++;
          console.log(`[PERIODIC CHECK] Found new thread ${thread.id} for message ${row.last_message_id} (user ${row.user_id})`);
          
          // Fetch thread messages
          const threadMessages = await fetchDiscordThread(thread.id, env);
          
          if (threadMessages && threadMessages.length > 0) {
            // Update database with thread evidence
            const threadEvidence = {
              thread_id: thread.id,
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
              JSON.stringify(threadEvidence),
              threadMessages[threadMessages.length - 1]?.id || null,
              row.user_id
            ).run();
            
            newThreadsFetched++;
            console.log(`[PERIODIC CHECK] Fetched ${threadMessages.length} messages from thread ${thread.id}`);
            
            // Rate limit: wait 1.5 seconds between thread fetches
            await new Promise(resolve => setTimeout(resolve, 1500));
          }
        }
      } catch (err) {
        console.error(`[PERIODIC CHECK] Error processing thread for user ${row.user_id}:`, err.message);
      }
    }
    
    return {
      found: newThreadsFound,
      fetched: newThreadsFetched
    };
  } catch (error) {
    console.error('[PERIODIC CHECK] Error checking for new threads:', error);
    return { found: 0, fetched: 0, error: error.message };
  }
}

/**
 * Fetch recent messages from Discord channel
 */
async function fetchRecentMessages(channelId, env, limit = 100) {
  const url = new URL(`https://discord.com/api/v10/channels/${channelId}/messages`);
  url.searchParams.set('limit', limit.toString());
  
  const response = await fetch(url.toString(), {
    headers: { Authorization: `Bot ${env.DISCORD_BOT_TOKEN}` }
  });
  
  if (response.status === 429) {
    const retryAfter = await response.json();
    await new Promise(r => setTimeout(r, (retryAfter.retry_after || 1) * 1000));
    return fetchRecentMessages(channelId, env, limit);
  }
  
  if (!response.ok) {
    throw new Error(`Discord API error: ${response.status}`);
  }
  
  return await response.json();
}

/**
 * Fetch active threads from Discord channel
 */
async function fetchActiveThreads(channelId, env) {
  try {
    const url = `https://discord.com/api/v10/channels/${channelId}/threads/active`;
    
    const response = await fetch(url, {
      headers: { Authorization: `Bot ${env.DISCORD_BOT_TOKEN}` }
    });
    
    if (response.status === 429) {
      const retryAfter = await response.json();
      await new Promise(r => setTimeout(r, (retryAfter.retry_after || 1) * 1000));
      return fetchActiveThreads(channelId, env);
    }
    
    if (!response.ok) {
      console.warn(`[PERIODIC CHECK] Failed to fetch active threads: ${response.status}`);
      return [];
    }
    
    const data = await response.json();
    return data.threads || [];
  } catch (error) {
    console.error('[PERIODIC CHECK] Error fetching active threads:', error);
    return [];
  }
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

      const response = await fetch(fetchUrl.toString(), {
        headers: { Authorization: `Bot ${env.DISCORD_BOT_TOKEN}` }
      });

      if (response.status === 429) {
        const retryAfter = await response.json();
        await new Promise(r => setTimeout(r, (retryAfter.retry_after || 1) * 1000));
        continue;
      }

      if (response.status === 404) {
        // Thread not found or no access
        return null;
      }

      if (!response.ok) {
        throw new Error(`Discord API error: ${response.status}`);
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
                console.warn(`[PERIODIC CHECK] Failed to download video ${att.id}:`, err.message);
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
                console.warn(`[PERIODIC CHECK] Failed to download image ${att.id}:`, err.message);
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
      
      // Safety limit
      if (threadMessages.length >= 1000) break;
    }

    // Sort by timestamp (oldest first)
    threadMessages.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

    return threadMessages;
  } catch (err) {
    console.error(`[PERIODIC CHECK] Error fetching thread ${threadId}:`, err);
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
        console.warn(`[PERIODIC CHECK] Failed to upload to Stream:`, err.message);
      }
    }

    return { 
      r2_url: r2Url, 
      stream_id: streamData?.id || null,
      stream_url: streamData?.playback_url || null
    };
  } catch (err) {
    console.error(`[PERIODIC CHECK] Error downloading video:`, err);
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
    console.error(`[PERIODIC CHECK] Error downloading image:`, err);
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
    console.error(`[PERIODIC CHECK] Error uploading to Stream:`, err);
    return null;
  }
}

