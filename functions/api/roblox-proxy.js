const CACHE_KEY = "discord-scammers";
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const PROFILE_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days for profile data

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
      "SELECT roblox_name, roblox_display_name, roblox_avatar, updated_at FROM scammer_profile_cache WHERE user_id = ?"
    ).bind(userId).first();

    if (cached && now - cached.updated_at < PROFILE_CACHE_TTL_MS && cached.roblox_name && cached.roblox_display_name && cached.roblox_avatar) {
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
      INSERT INTO scammer_profile_cache (user_id, roblox_name, roblox_display_name, roblox_avatar, updated_at)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(user_id) DO UPDATE SET
        roblox_name = excluded.roblox_name,
        roblox_display_name = excluded.roblox_display_name,
        roblox_avatar = excluded.roblox_avatar,
        updated_at = excluded.updated_at
    `).bind(userId, data.name || null, data.displayName || null, data.avatar || null, now).run();
  }

  return data;
}

// Helper function to fetch Discord profile with caching
// writeToScammerCache: if false, only reads from cache but doesn't write (for general endpoint use)
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
        "SELECT discord_display_name, discord_avatar, updated_at FROM scammer_profile_cache WHERE user_id = ?"
      ).bind(userId).first();
    }
    
    if (!cached) {
      cached = await env.DB.prepare(
        "SELECT discord_display_name, discord_avatar, updated_at FROM scammer_profile_cache WHERE discord_id = ? LIMIT 1"
      ).bind(discordId).first();
    }

    if (cached && now - cached.updated_at < PROFILE_CACHE_TTL_MS && cached.discord_display_name) {
      return {
        displayName: cached.discord_display_name,
        avatar: cached.discord_avatar || null
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
        data = { displayName: null, avatar: null };
        fetchSuccess = true;
        break;
      }

      if (response.ok) {
        const userData = await response.json();
        const displayName = userData.global_name || userData.username || null;
        let avatar = null;

        if (userData.avatar) {
          const extension = userData.avatar.startsWith('a_') ? 'gif' : 'png';
          avatar = `https://cdn.discordapp.com/avatars/${discordId}/${userData.avatar}.${extension}`;
        } else if (userData.discriminator && userData.discriminator !== '0') {
          // Default avatar for users without custom avatar
          const defaultAvatar = parseInt(userData.discriminator) % 5;
          avatar = `https://cdn.discordapp.com/embed/avatars/${defaultAvatar}.png`;
        }

        data = { displayName, avatar };
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
        SET discord_id = ?, discord_display_name = ?, discord_avatar = ?, updated_at = ?
        WHERE user_id = ?
      `).bind(discordId, data.displayName, data.avatar, now, userId).run();
    } else {
      await env.DB.prepare(`
        UPDATE scammer_profile_cache
        SET discord_display_name = ?, discord_avatar = ?, updated_at = ?
        WHERE discord_id = ?
      `).bind(data.displayName, data.avatar, now, discordId).run();
    }
  }

  return data;
}

// Helper function to fetch alt accounts in batch
async function fetchAltAccounts(altIds, env) {
  if (!altIds || altIds.length === 0) {
    return [];
  }

  const altPromises = altIds.map(async (altId) => {
    try {
      const profileData = await fetchRobloxProfile(altId, env);
      if (profileData) {
        return {
          name: profileData.name,
          profile: `https://www.roblox.com/users/${altId}/profile`,
          user_id: altId
        };
      }
    } catch (err) {
      console.warn(`Failed to fetch alt ${altId}:`, err);
    }
    return null;
  });

  const results = await Promise.all(altPromises);
  return results.filter(alt => alt !== null);
}

// Helper function to get last processed message ID from database
async function getLastProcessedMessageId(env) {
  const result = await env.DB.prepare(
    "SELECT MAX(last_message_id) as last_id FROM scammer_profile_cache WHERE last_message_id IS NOT NULL"
  ).first();
  return result?.last_id || null;
}

// Helper function to upload video to Cloudflare Stream
async function uploadVideoToStream(videoData, filename, env) {
  try {
    if (!env.CLOUDFLARE_ACCOUNT_ID || !env.CLOUDFLARE_STREAM_TOKEN) {
      console.warn('Cloudflare Stream credentials not configured');
      return null;
    }

    // Upload video directly to Stream using multipart form data
    // Note: In Workers, we need to create FormData differently
    const formData = new FormData();
    // Create a Blob from the ArrayBuffer
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
    // Return both the video ID and playback URL for native video player
    const videoId = streamData.result?.uid;
    if (videoId) {
      // Construct Stream playback URL using your Stream domain
      // Format: https://customer-{accountId}.cloudflarestream.com/{videoId}/manifest/video.m3u8
      const playbackUrl = streamData.result?.playback?.hls || 
                         `https://customer-wosapspiey2ql225.cloudflarestream.com/${videoId}/manifest/video.m3u8`;
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

// Helper function to download Discord video and upload to R2 (and Stream for QuickTime)
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

// Helper function to fetch Discord thread messages
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

            return {
              id: att.id,
              filename: att.filename,
              url: att.url, // Keep original URL as fallback
              r2_url: r2Url, // R2 URL for videos
              stream_id: streamId, // Cloudflare Stream ID for QuickTime videos
              stream_url: streamUrl, // Cloudflare Stream playback URL (HLS/DASH)
              proxy_url: att.proxy_url,
              size: att.size,
              content_type: att.content_type,
              width: att.width,
              height: att.height,
              is_image: att.content_type?.startsWith('image/') || false,
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
      
      // Safety limit
      if (threadMessages.length >= 500) break;
    }

    // Sort by timestamp (oldest first)
    threadMessages.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

    return threadMessages;
  } catch (err) {
    console.warn(`Failed to fetch thread ${threadId}:`, err);
    return null;
  }
}

export async function onRequestGet({ request, env }) {
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
                    
                    const r2Url = await downloadVideoToR2(
                      att.url,
                      att.id,
                      att.filename || 'video',
                      att.content_type,
                      env
                    );
                    
                    if (r2Url) {
                      att.r2_url = r2Url;
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
            SET thread_evidence = ?, updated_at = ?
            WHERE user_id = ?
          `).bind(updatedEvidenceJson, Date.now(), row.user_id).run();
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
      const now = Date.now();

      // --- CHECK NEWEST MESSAGE ID FOR EARLY REFRESH ---
      let latestMessageId = null;
      const checkUrl = `https://discord.com/api/v10/channels/${env.DISCORD_CHANNEL_ID}/messages?limit=1`;
      const checkRes = await fetch(checkUrl, {
        headers: { Authorization: `Bot ${env.DISCORD_BOT_TOKEN}` },
      });

      if (checkRes.ok) {
        const [latestMessage] = await checkRes.json();
        latestMessageId = latestMessage?.id;
      }

      // Get last processed message ID from unified table
      const lastProcessedMessageId = await getLastProcessedMessageId(env);

      // Check if we can return cached data
      // Only return early if we have a lastProcessedMessageId AND it matches the latest message
      // AND cache is fresh (updated within TTL)
      if (!forceRefresh && lastProcessedMessageId && latestMessageId === lastProcessedMessageId) {
        // Check if cache is still fresh
        const cacheCheck = await env.DB.prepare(
          "SELECT MAX(updated_at) as last_updated FROM scammer_profile_cache"
        ).first();

        if (cacheCheck && cacheCheck.last_updated && now - cacheCheck.last_updated < CACHE_TTL_MS) {
          // Return all scammers from unified table (only entries with actual scammer data)
          const { results } = await env.DB.prepare(`
            SELECT 
              user_id,
              roblox_name,
              roblox_display_name,
              roblox_avatar,
              discord_id,
              discord_display_name,
              discord_avatar,
              victims,
              items_scammed,
              roblox_alts,
              thread_evidence,
              incomplete
            FROM scammer_profile_cache
            WHERE user_id IS NOT NULL 
              AND (victims IS NOT NULL OR items_scammed IS NOT NULL OR discord_id IS NOT NULL)
            ORDER BY incomplete ASC, updated_at DESC
          `).all();

          // Separate complete and incomplete scammers
          const completeScammers = [];
          const partialScammers = [];

          for (const row of results) {
            const entry = {
              user_id: row.user_id,
              robloxUser: row.roblox_display_name || row.roblox_name || null,
              robloxProfile: row.user_id ? `https://www.roblox.com/users/${row.user_id}/profile` : null,
              avatar: row.roblox_avatar || (row.incomplete === 0 ? "https://emwiki.com/imgs/plr.jpg" : null),
              discordDisplay: row.discord_display_name || null,
              victims: row.victims || null,
              itemsScammed: row.items_scammed || null,
              incomplete: row.incomplete === 1,
              robloxAlts: row.roblox_alts ? JSON.parse(row.roblox_alts) : [],
              hasThreadEvidence: !!row.thread_evidence
            };

            if (row.incomplete === 1) {
              partialScammers.push(entry);
            } else {
              completeScammers.push(entry);
            }
          }

          return new Response(JSON.stringify({ 
            lastUpdated: cacheCheck.last_updated, 
            scammers: completeScammers, 
            partials: partialScammers 
          }), {
            headers: { 
              "Content-Type": "application/json", 
              "X-Cache": "D1-HIT-EARLY",
              "Access-Control-Allow-Origin": "*" 
            },
          });
        }
      }

      // --- LOCKING ---
      const LOCK_KEY = "discord-scammers-lock";
      const LOCK_TTL_MS = 2 * 60 * 1000;

      await env.DB.prepare(
        "DELETE FROM scammer_cache_locks WHERE key = ? AND expires_at < ?"
      ).bind(LOCK_KEY, now).run();

      let lockAcquired = false;
      try {
        await env.DB.prepare(
          "INSERT INTO scammer_cache_locks (key, expires_at) VALUES (?, ?)"
        ).bind(LOCK_KEY, now + LOCK_TTL_MS).run();
        lockAcquired = true;
      } catch {
        lockAcquired = false;
      }

      if (!lockAcquired) {
        let waited = 0;
        const waitStep = 1000;
        while (waited < 10000) {
          // Return cached data from unified table if available
          const cacheCheck = await env.DB.prepare(
            "SELECT MAX(updated_at) as last_updated FROM scammer_profile_cache"
          ).first();

          if (cacheCheck && cacheCheck.last_updated) {
            const { results } = await env.DB.prepare(`
              SELECT 
                user_id,
                roblox_name,
                roblox_display_name,
                roblox_avatar,
                discord_display_name,
                victims,
                items_scammed,
                roblox_alts,
                thread_evidence,
                incomplete
              FROM scammer_profile_cache
              WHERE user_id IS NOT NULL 
                AND incomplete = 0
                AND (victims IS NOT NULL OR items_scammed IS NOT NULL OR discord_id IS NOT NULL)
              ORDER BY updated_at DESC
            `).all();

            const scammers = results.map(row => ({
              user_id: row.user_id,
              robloxUser: row.roblox_display_name || row.roblox_name || null,
              robloxProfile: row.user_id ? `https://www.roblox.com/users/${row.user_id}/profile` : null,
              avatar: row.roblox_avatar || "https://emwiki.com/imgs/plr.jpg",
              discordDisplay: row.discord_display_name || null,
              victims: row.victims || null,
              itemsScammed: row.items_scammed || null,
              incomplete: false,
              robloxAlts: row.roblox_alts ? JSON.parse(row.roblox_alts) : [],
              hasThreadEvidence: !!row.thread_evidence
            }));

            return new Response(JSON.stringify({ 
              lastUpdated: cacheCheck.last_updated, 
              scammers, 
              partials: [] 
            }), {
              headers: { 
                "Content-Type": "application/json", 
                "X-Cache": "D1-WAIT",
                "Access-Control-Allow-Origin": "*" 
              },
            });
          }

          await new Promise(r => setTimeout(r, waitStep));
          waited += waitStep;
        }

        return new Response(JSON.stringify({ error: "Cache is being built, try again soon." }), {
          status: 503,
          headers: { "Content-Type": "application/json" },
        });
      }

      // --- DISCORD FETCHING (INCREMENTAL) ---
      const channelId = env.DISCORD_CHANNEL_ID;
      let allMessages = [];
      
      if (lastProcessedMessageId) {
        // Incremental: Only fetch new messages after the last processed one
        let after = lastProcessedMessageId;

        while (true) {
          const fetchUrl = new URL(`https://discord.com/api/v10/channels/${channelId}/messages`);
          fetchUrl.searchParams.set("limit", "100");
          fetchUrl.searchParams.set("after", after);

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

          // When using 'after', Discord returns messages in reverse chronological order (newest first)
          // Store the newest message ID before reversing (first message in array)
          const newestMessageId = messages[0].id;
          
          // Reverse to process oldest first
          const reversedMessages = messages.reverse();
          allMessages.push(...reversedMessages);
          
          // Update 'after' to the newest message ID we just fetched
          // This allows us to continue fetching newer messages in the next iteration
          after = newestMessageId;
          
          // Safety limit
          if (allMessages.length >= 5000) break;
        }
      } else {
        // Initial fetch: Fetch ALL messages from the beginning using 'before' parameter
        // Start by getting the latest message ID, then fetch backwards
        let before = null;

        while (true) {
          const fetchUrl = new URL(`https://discord.com/api/v10/channels/${channelId}/messages`);
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

          // When using 'before', Discord returns messages in reverse chronological order (newest first)
          // We want to process oldest first, so reverse them
          const reversedMessages = messages.reverse();
          allMessages.push(...reversedMessages);
          
          // Update 'before' to the oldest message ID we just fetched (last in original array)
          // This allows us to continue fetching older messages in the next iteration
          before = messages[messages.length - 1].id;
          
          // Safety limit
          if (allMessages.length >= 5000) break;
        }
      }

      // Process messages and update unified table
      const scammers = [];
      const partialScammers = [];

      for (const msg of allMessages) {
        try {
          const discordMatch = msg.content?.match(/discord user:\s*\*{0,2}\s*([^\n\r]+)/i);
          const robloxProfileMatch = msg.content?.match(/https:\/\/www\.roblox\.com\/users\/(\d+)\/profile/i);
          const robloxUserMatch = msg.content?.match(/roblox user:\s*\*{0,2}(.*)/i);

          const discordid = discordMatch ? discordMatch[1].trim().split(',')[0] : null;
          const robloxProfile = robloxProfileMatch ? `https://www.roblox.com/users/${robloxProfileMatch[1]}/profile` : null;
          const userId = robloxProfileMatch ? robloxProfileMatch[1] : null;
          const victims = msg.content?.match(/victims:\s*\*{0,2}(.*)/i)?.[1]?.trim() || null;
          const itemsScammed = msg.content?.match(/items scammed:\s*\*{0,2}(.*)/i)?.[1]?.trim() || null;

          if (!userId) {
            // Partial entry without user ID
            partialScammers.push({
              robloxUser: robloxUserMatch?.[1]?.trim() || null,
              robloxProfile: null,
              avatar: null,
              discordDisplay: null,
              victims: victims,
              itemsScammed: itemsScammed,
              incomplete: true,
              robloxAlts: []
            });
            continue;
          }

          // Fetch Roblox profile data - DO write to scammer cache (default true)
          const robloxData = await fetchRobloxProfile(userId, env, true);
          if (!robloxData) {
            // Failed to fetch - mark as incomplete
            await env.DB.prepare(`
              INSERT INTO scammer_profile_cache (
                user_id, roblox_name, roblox_display_name, roblox_avatar,
                discord_id, discord_display_name, victims, items_scammed,
                incomplete, last_message_id, updated_at
              )
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
              ON CONFLICT(user_id) DO UPDATE SET
                victims = excluded.victims,
                items_scammed = excluded.items_scammed,
                incomplete = 1,
                last_message_id = excluded.last_message_id,
                updated_at = excluded.updated_at
            `).bind(
              userId,
              robloxUserMatch?.[1]?.trim() || null,
              null,
              null,
              discordid || null,
              null,
              victims,
              itemsScammed,
              1,
              msg.id,
              now
            ).run();

            partialScammers.push({
              robloxUser: robloxUserMatch?.[1]?.trim() || null,
              robloxProfile: robloxProfile,
              avatar: null,
              discordDisplay: null,
              victims: victims,
              itemsScammed: itemsScammed,
              incomplete: true,
              robloxAlts: []
            });
            continue;
          }

          // Fetch Discord profile data if discord ID provided - DO write to scammer cache
          let discordData = null;
          if (discordid) {
            discordData = await fetchDiscordProfile(discordid, env, userId, true);
          }

          // Parse and fetch alt accounts
          let altIds = [];
          const altMatches = msg.content?.match(/roblox alts:\s*([\s\S]+)/i);
          if (altMatches) {
            const altBlock = altMatches[1].trim();
            altIds = [...altBlock.matchAll(/roblox\.com\/users\/(\d+)\//g)].map(m => m[1]);
          }

          const robloxAlts = await fetchAltAccounts(altIds, env);
          const robloxAltsJson = JSON.stringify(robloxAlts);

          // Check if message has a thread and fetch thread evidence
          let threadEvidence = null;
          if (msg.thread && msg.thread.id) {
            const threadMessages = await fetchDiscordThread(msg.thread.id, env);
            if (threadMessages && threadMessages.length > 0) {
              threadEvidence = {
                thread_id: msg.thread.id,
                thread_name: msg.thread.name,
                message_count: threadMessages.length,
                messages: threadMessages,
                created_at: msg.thread.id ? new Date(parseInt(msg.thread.id) / 4194304 + 1420070400000).toISOString() : null
              };
            }
          }

          const threadEvidenceJson = threadEvidence ? JSON.stringify(threadEvidence) : null;

          // Store/update in unified table
          await env.DB.prepare(`
            INSERT INTO scammer_profile_cache (
              user_id, roblox_name, roblox_display_name, roblox_avatar,
              discord_id, discord_display_name, discord_avatar,
              victims, items_scammed, roblox_alts,
              thread_evidence, incomplete, last_message_id, updated_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(user_id) DO UPDATE SET
              roblox_name = excluded.roblox_name,
              roblox_display_name = excluded.roblox_display_name,
              roblox_avatar = excluded.roblox_avatar,
              discord_id = COALESCE(excluded.discord_id, discord_id),
              discord_display_name = COALESCE(excluded.discord_display_name, discord_display_name),
              discord_avatar = COALESCE(excluded.discord_avatar, discord_avatar),
              victims = COALESCE(excluded.victims, victims),
              items_scammed = COALESCE(excluded.items_scammed, items_scammed),
              roblox_alts = COALESCE(excluded.roblox_alts, roblox_alts),
              thread_evidence = COALESCE(excluded.thread_evidence, thread_evidence),
              incomplete = 0,
              last_message_id = excluded.last_message_id,
              updated_at = excluded.updated_at
          `).bind(
            userId,
            robloxData.name || null,
            robloxData.displayName || null,
            robloxData.avatar || null,
            discordid || null,
            discordData?.displayName || null,
            discordData?.avatar || null,
            victims,
            itemsScammed,
            robloxAltsJson,
            threadEvidenceJson,
            0,
            msg.id,
            now
          ).run();

          // Build response entry
          scammers.push({
            robloxUser: robloxData.displayName || robloxData.name || robloxUserMatch?.[1]?.trim() || null,
            robloxProfile: robloxProfile,
            avatar: robloxData.avatar || "https://emwiki.com/imgs/plr.jpg",
            discordDisplay: discordData?.displayName || null,
            victims: victims,
            itemsScammed: itemsScammed,
            incomplete: false,
            robloxAlts: robloxAlts
          });

        } catch (err) {
          console.warn("Failed to parse message:", err);
        }
      }

      // Release lock
      await env.DB.prepare("DELETE FROM scammer_cache_locks WHERE key = ?").bind(LOCK_KEY).run();

      // Query database to get ALL scammers (not just ones processed in this batch)
      // Only return entries with actual scammer data (victims, items_scammed, or discord_id)
      const { results: allResults } = await env.DB.prepare(`
        SELECT 
          user_id,
          roblox_name,
          roblox_display_name,
          roblox_avatar,
          discord_id,
          discord_display_name,
          discord_avatar,
          victims,
          items_scammed,
          roblox_alts,
          thread_evidence,
          incomplete
        FROM scammer_profile_cache
        WHERE user_id IS NOT NULL 
          AND (victims IS NOT NULL OR items_scammed IS NOT NULL OR discord_id IS NOT NULL)
        ORDER BY incomplete ASC, updated_at DESC
      `).all();

      // Separate complete and incomplete scammers
      const allCompleteScammers = [];
      const allPartialScammers = [];

      for (const row of allResults) {
        const entry = {
          user_id: row.user_id,
          robloxUser: row.roblox_display_name || row.roblox_name || null,
          robloxProfile: row.user_id ? `https://www.roblox.com/users/${row.user_id}/profile` : null,
          avatar: row.roblox_avatar || (row.incomplete === 0 ? "https://emwiki.com/imgs/plr.jpg" : null),
          discordDisplay: row.discord_display_name || null,
          victims: row.victims || null,
          itemsScammed: row.items_scammed || null,
          incomplete: row.incomplete === 1,
          robloxAlts: row.roblox_alts ? JSON.parse(row.roblox_alts) : [],
          hasThreadEvidence: !!row.thread_evidence
        };

        if (row.incomplete === 1) {
          allPartialScammers.push(entry);
        } else {
          allCompleteScammers.push(entry);
        }
      }

      return new Response(JSON.stringify({ 
        lastUpdated: now, 
        scammers: allCompleteScammers, 
        partials: allPartialScammers 
      }), {
        headers: { 
          "Content-Type": "application/json", 
          "X-Cache": "D1-MISS",
          "Access-Control-Allow-Origin": "*" 
        },
      });

    } catch (err) {
      await env.DB.prepare("DELETE FROM scammer_cache_locks WHERE key = ?").bind("discord-scammers-lock").run();
      console.error("Scammer Cache Build Failed:", err);
      return new Response(JSON.stringify({ error: err.message, stack: err.stack }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }
  }

  // Fallback userId/discordId logic remains unchanged...
}
