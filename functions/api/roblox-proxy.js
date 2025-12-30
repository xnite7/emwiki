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

// Helper function to download Discord image and upload to R2
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

// Helper function to update thread evidence with edits and new messages
// Compares existing messages with fetched messages to detect edits and new messages
function updateThreadWithEdits(existingMessages, fetchedMessages) {
  const existingMap = new Map();
  existingMessages.forEach(msg => existingMap.set(msg.id, msg));
  
  const updatedMessages = [];
  const newMessages = [];
  
  for (const fetchedMsg of fetchedMessages) {
    const existingMsg = existingMap.get(fetchedMsg.id);
    
    if (existingMsg) {
      // Message exists - check if edited
      const existingEditTime = existingMsg.edited_timestamp || null;
      const fetchedEditTime = fetchedMsg.edited_timestamp || null;
      
      if (fetchedEditTime && fetchedEditTime !== existingEditTime) {
        // Message was edited - update content but preserve R2 URLs
        const updatedMsg = {
          ...fetchedMsg,
          // Preserve R2 URLs from existing message (don't re-download)
          attachments: fetchedMsg.attachments.map(fetchedAtt => {
            const existingAtt = existingMsg.attachments?.find(a => a.id === fetchedAtt.id);
            return {
              ...fetchedAtt,
              // Keep existing R2 URL if available, otherwise use new one
              r2_url: existingAtt?.r2_url || fetchedAtt.r2_url,
              stream_id: existingAtt?.stream_id || fetchedAtt.stream_id,
              stream_url: existingAtt?.stream_url || fetchedAtt.stream_url
            };
          })
        };
        updatedMessages.push(updatedMsg);
      } else {
        // No edit - keep existing message (preserves R2 URLs)
        updatedMessages.push(existingMsg);
      }
      
      // Remove from map to track which messages still exist
      existingMap.delete(fetchedMsg.id);
    } else {
      // New message
      newMessages.push(fetchedMsg);
    }
  }
  
  // Combine: existing unchanged messages + updated messages + new messages
  // Sort by timestamp to maintain chronological order
  const allMessages = [...updatedMessages, ...newMessages].sort((a, b) => 
    new Date(a.timestamp) - new Date(b.timestamp)
  );
  
  return {
    messages: allMessages,
    newCount: newMessages.length,
    editedCount: updatedMessages.filter(msg => 
      existingMessages.find(m => m.id === msg.id && 
        (m.edited_timestamp || null) !== (msg.edited_timestamp || null)
      )
    ).length
  };
}

// Helper function to fetch Discord thread messages
async function fetchDiscordThread(threadId, env, afterMessageId = null) {
  if (!threadId) return null;

  try {
    const threadMessages = [];
    let before = null;
    let after = afterMessageId;

    // Fetch messages from the thread
    // If afterMessageId is provided, only fetch messages after it (incremental)
    // Otherwise, fetch all messages (initial fetch)
    while (true) {
      const fetchUrl = new URL(`https://discord.com/api/v10/channels/${threadId}/messages`);
      fetchUrl.searchParams.set("limit", "100");
      if (after) {
        // Incremental fetch: get messages after this ID
        fetchUrl.searchParams.set("after", after);
      } else if (before) {
        // Initial fetch: get messages before this ID (going backwards)
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
        // ALWAYS download images/videos to R2 immediately (no checking if r2_url exists)
        if (msg.attachments && msg.attachments.length > 0) {
          // Process attachments in parallel
          const attachmentPromises = msg.attachments.map(async (att) => {
            const isVideo = att.content_type?.startsWith('video/') || false;
            const isImage = att.content_type?.startsWith('image/') || false;
            
            // Always download videos to R2 (and Stream for QuickTime)
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
            
            // Always download images to R2
            if (isImage && att.url) {
              const result = await downloadImageToR2(
                att.url,
                att.id,
                att.filename,
                att.content_type,
                env
              );
              r2Url = result.r2_url || null;
            }

            return {
              id: att.id,
              filename: att.filename,
              url: att.url, // Keep original URL as fallback
              r2_url: r2Url, // R2 URL for images and videos (always attempted)
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

      if (after) {
        // Incremental fetch: update 'after' to the newest message ID (first in original array)
        // This allows us to continue fetching newer messages
        after = messages[0].id;
        // Safety limit for incremental fetch
        if (threadMessages.length >= 500) break;
      } else {
        // Initial fetch: update 'before' to fetch older messages
        before = messages[messages.length - 1].id;
        // Safety limit for initial fetch
        if (threadMessages.length >= 500) break;
      }
    }

    // Sort by timestamp (oldest first) - needed for initial fetch
    // For incremental fetch, messages are already in correct order
    if (!afterMessageId) {
      threadMessages.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
    }

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
            SET thread_evidence = ?, updated_at = ?
            WHERE user_id = ?
          `).bind(updatedEvidenceJson, Date.now(), row.user_id).run();
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

  // REMOVED: migrate-videos-to-r2 mode - no longer needed, videos are automatically downloaded to R2

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
          ORDER BY updated_at DESC
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
          const existingMessages = threadEvidence.messages || [];
          
          // Fetch ALL messages from thread to check for edits and new messages
          // This ensures we catch both new messages and edits to existing messages
          const allFetchedMessages = await fetchDiscordThread(threadId, env, null);
          
          if (!allFetchedMessages || allFetchedMessages.length === 0) {
            // Thread has no messages, just update last checked time
            await env.DB.prepare(`
              UPDATE scammer_profile_cache 
              SET thread_last_checked_at = ?,
                  thread_needs_update = 0
              WHERE user_id = ?
            `).bind(Date.now(), row.user_id).run();
            processed++;
            continue;
          }

          // Use edit detection function to merge and detect edits
          let updatedMessages;
          if (existingMessages.length > 0) {
            // Check for edits and merge new messages
            const result = updateThreadWithEdits(existingMessages, allFetchedMessages);
            updatedMessages = result.messages;
            // Count images in new messages only
            const existingMessageIds = new Set(existingMessages.map(m => m.id));
            const newMessages = allFetchedMessages.filter(m => !existingMessageIds.has(m.id));
            imagesDownloaded += newMessages.reduce((count, msg) => 
              count + (msg.attachments?.filter(att => att.is_image && att.r2_url).length || 0), 0
            );
          } else {
            // No existing messages, use fetched messages directly
            updatedMessages = allFetchedMessages;
            imagesDownloaded += allFetchedMessages.reduce((count, msg) => 
              count + (msg.attachments?.filter(att => att.is_image && att.r2_url).length || 0), 0
            );
          }
          
          // Update thread evidence
          threadEvidence.messages = updatedMessages;
          threadEvidence.message_count = updatedMessages.length;
          
          // Get the newest message ID
          const newestMessageId = updatedMessages.length > 0 
            ? updatedMessages[updatedMessages.length - 1].id 
            : (row.thread_last_message_id || null);

          // Update database
          const updatedEvidenceJson = JSON.stringify(threadEvidence);
          await env.DB.prepare(`
            UPDATE scammer_profile_cache 
            SET thread_evidence = ?,
                thread_last_message_id = ?,
                thread_last_checked_at = ?,
                thread_needs_update = 0,
                updated_at = ?
            WHERE user_id = ?
          `).bind(
            updatedEvidenceJson,
            newestMessageId,
            Date.now(),
            Date.now(),
            row.user_id
          ).run();

          updated++;

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

  // REMOVED: migrate-images-to-r2 mode - no longer needed
  // Images are automatically downloaded to R2 when threads are fetched via fetchDiscordThread()

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
      const urlParams = new URL(request.url).searchParams; // Declare early for use in locking
      const forceRefresh = urlParams.get('refresh') === 'true';

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
              robloxDisplay: row.roblox_display_name || null,
              robloxUser: row.roblox_name || null,
              avatar: row.roblox_avatar || (row.incomplete === 0 ? "https://emwiki.com/imgs/plr.jpg" : null),
              discordDisplay: row.discord_display_name || null,
              discordId: row.discord_id || null,
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
      const LOCK_TTL_MS = 10 * 60 * 1000; // 10 minutes for full refresh
      const isRecursiveCall = urlParams.has('startAfter'); // urlParams already declared above

      await env.DB.prepare(
        "DELETE FROM scammer_cache_locks WHERE key = ? AND expires_at < ?"
      ).bind(LOCK_KEY, now).run();

      let lockAcquired = false;
      if (!isRecursiveCall) {
        // Only check lock on initial call, recursive calls bypass lock
        try {
          await env.DB.prepare(
            "INSERT INTO scammer_cache_locks (key, expires_at) VALUES (?, ?)"
          ).bind(LOCK_KEY, now + LOCK_TTL_MS).run();
          lockAcquired = true;
        } catch {
          lockAcquired = false;
        }
      } else {
        // Recursive call - extend lock but don't fail if already exists
        try {
          await env.DB.prepare(
            "INSERT INTO scammer_cache_locks (key, expires_at) VALUES (?, ?)"
          ).bind(LOCK_KEY, now + LOCK_TTL_MS).run();
        } catch {
          // Update existing lock
          await env.DB.prepare(
            "UPDATE scammer_cache_locks SET expires_at = ? WHERE key = ?"
          ).bind(now + LOCK_TTL_MS, LOCK_KEY).run();
        }
        lockAcquired = true;
      }

      if (!lockAcquired && !isRecursiveCall) {
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
              robloxDisplay: row.roblox_display_name || null,
              robloxUser: row.roblox_name || null,
              avatar: row.roblox_avatar || "https://emwiki.com/imgs/plr.jpg",
              discordDisplay: row.discord_display_name || null,
              discordId: row.discord_id || null,
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

      // --- DISCORD FETCHING (BATCH PROCESSING) ---
      const channelId = env.DISCORD_CHANNEL_ID;
      const BATCH_SIZE = 10; // Reduced to 10 messages per call to avoid timeouts (thread fetching + image downloads are expensive)
      // urlParams already declared above
      const batchSize = Math.min(parseInt(urlParams.get('batchSize') || BATCH_SIZE.toString()), 20); // Cap at 20 max
      const startAfter = urlParams.get('startAfter'); // Optional: resume from specific message ID
      
      // Fetch ALL threads from the channel to match with messages
      // Discord API: GET /channels/{channel.id}/threads/active
      // This is the reliable way to get threads since msg.thread isn't always present
      const threadsMap = new Map(); // Maps message ID -> thread info
      
      try {
        // Fetch active threads
        const activeThreadsUrl = `https://discord.com/api/v10/channels/${channelId}/threads/active`;
        const activeThreadsRes = await fetch(activeThreadsUrl, {
          headers: { Authorization: `Bot ${env.DISCORD_BOT_TOKEN}` },
        });
        
        if (activeThreadsRes.ok) {
          const activeData = await activeThreadsRes.json();
          if (activeData.threads && Array.isArray(activeData.threads)) {
            for (const thread of activeData.threads) {
              // Match thread to parent message ID (threads have a message_id property)
              if (thread.id && thread.parent_id === channelId) {
                // Store by thread ID for lookup
                threadsMap.set(thread.id, {
                  id: thread.id,
                  name: thread.name || 'Untitled Thread',
                  message_id: thread.message_id || null
                });
                // Also store by message_id if available (for direct lookup)
                if (thread.message_id) {
                  threadsMap.set(thread.message_id, {
                    id: thread.id,
                    name: thread.name || 'Untitled Thread',
                    message_id: thread.message_id
                  });
                }
              }
            }
          }
        }
        
        // Also fetch archived/public threads
        const archivedThreadsUrl = `https://discord.com/api/v10/channels/${channelId}/threads/archived/public?limit=100`;
        const archivedRes = await fetch(archivedThreadsUrl, {
          headers: { Authorization: `Bot ${env.DISCORD_BOT_TOKEN}` },
        });
        
        if (archivedRes.ok) {
          const archivedData = await archivedRes.json();
          if (archivedData.threads && Array.isArray(archivedData.threads)) {
            for (const thread of archivedData.threads) {
              if (thread.id && thread.parent_id === channelId) {
                threadsMap.set(thread.id, {
                  id: thread.id,
                  name: thread.name || 'Untitled Thread',
                  message_id: thread.message_id || null
                });
                if (thread.message_id) {
                  threadsMap.set(thread.message_id, {
                    id: thread.id,
                    name: thread.name || 'Untitled Thread',
                    message_id: thread.message_id
                  });
                }
              }
            }
          }
        }
        
        console.log(`[THREADS] Found ${threadsMap.size / 2} threads in channel (stored by thread ID and message ID)`);
      } catch (err) {
        console.warn('[THREADS] Failed to fetch threads:', err);
      }
      
      // Helper function to find thread for a message
      async function findThreadForMessage(messageId, env) {
        // First check threads map (most reliable)
        const threadFromMap = threadsMap.get(messageId);
        if (threadFromMap) {
          return {
            id: threadFromMap.id,
            name: threadFromMap.name
          };
        }
        
        // Fallback: Try fetching thread info using message ID
        try {
          const threadInfoUrl = `https://discord.com/api/v10/channels/${messageId}`;
          const threadInfoRes = await fetch(threadInfoUrl, {
            headers: { Authorization: `Bot ${env.DISCORD_BOT_TOKEN}` },
          });
          
          if (threadInfoRes.ok) {
            const threadInfo = await threadInfoRes.json();
            // Check if it's actually a thread (type 11 = public thread, type 12 = private thread)
            if (threadInfo.type === 11 || threadInfo.type === 12) {
              if (threadInfo.parent_id === channelId) {
                return {
                  id: threadInfo.id,
                  name: threadInfo.name || 'Untitled Thread'
                };
              }
            }
          }
        } catch (err) {
          // Not a thread or no access - that's okay
        }
        
        return null;
      }
      
      let allMessages = [];
      let processedCount = 0;
      const resumeFromMessageId = startAfter || lastProcessedMessageId;
      
      if (resumeFromMessageId && !forceRefresh) {
        // Incremental: Only fetch new messages after the last processed one
        let after = resumeFromMessageId;

        while (allMessages.length < batchSize) {
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
        // Initial fetch or force refresh: Fetch messages in batches
        // Start by getting the latest message ID, then fetch backwards
        let before = resumeFromMessageId || null;

        while (allMessages.length < batchSize) {
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
      
      // Limit to batch size to avoid timeout
      allMessages = allMessages.slice(0, batchSize);

      // Process messages and update unified table
      const scammers = [];
      const partialScammers = [];
      let currentLastMessageId = null;

      for (const msg of allMessages) {
        currentLastMessageId = msg.id; // Track the last message we process
        try {
          // Combine content from message body and embeds for parsing
          let fullContent = msg.content || '';
          
          // Also check embeds for content (Discord sometimes puts formatted data in embeds)
          if (msg.embeds && Array.isArray(msg.embeds)) {
            for (const embed of msg.embeds) {
              if (embed.description) fullContent += '\n' + embed.description;
              if (embed.fields && Array.isArray(embed.fields)) {
                for (const field of embed.fields) {
                  if (field.name) fullContent += '\n' + field.name + ': ' + (field.value || '');
                }
              }
            }
          }
          
          // Debug: Log message content to see what we're working with
          if (fullContent && (fullContent.toLowerCase().includes('victim') || fullContent.toLowerCase().includes('scam'))) {
            console.log(`Processing message ${msg.id} with content preview:`, fullContent.substring(0, 300));
          }
          
          // Handle emoji prefixes like :pinkdot: and various formats
          // Pattern: :pinkdot: field: value or field: value
          const discordMatch = fullContent.match(/(?::\w+:\s*)?discord\s+user:\s*\*{0,2}\s*([^\n\r]+)/i);
          const robloxProfileMatch = fullContent.match(/https:\/\/www\.roblox\.com\/users\/(\d+)\/profile/i);
          const robloxUserMatch = fullContent.match(/(?::\w+:\s*)?roblox\s+user:\s*\*{0,2}(.*)/i);
          const displayMatch = fullContent.match(/(?::\w+:\s*)?display:\s*\*{0,2}\s*([^\n\r]+)/i);

          const discordid = discordMatch ? discordMatch[1].trim().split(',')[0] : null;
          // Handle "NA" as null
          const discordidClean = discordid && discordid.toUpperCase() !== 'NA' ? discordid : null;
          const robloxProfile = robloxProfileMatch ? `https://www.roblox.com/users/${robloxProfileMatch[1]}/profile` : null;
          const userId = robloxProfileMatch ? robloxProfileMatch[1] : null;
          
          // More flexible regex patterns to handle various formats:
          // - Handle emoji prefixes like :pinkdot:
          // - "Victims:" or "victims:" (case insensitive)
          // - Optional asterisks or markdown formatting
          // - Match until end of line or next section
          let victims = null;
          const victimsPatterns = [
            /:\w+:\s*victims?:\s*([^\n\r]+)/i,  // Handle :pinkdot: victims: value (emoji required)
            /victims?:\s*([^\n\r]+)/i,  // Standard format victims: value (no emoji)
            /victim[:\s]+([^\n\r]+)/i   // More flexible victim: value
          ];
          
          for (const pattern of victimsPatterns) {
            const match = fullContent.match(pattern);
            if (match && match[1]) {
              let extracted = match[1].trim();
              // Remove markdown formatting and emoji
              extracted = extracted.replace(/\*\*/g, '').replace(/\*/g, '').replace(/`/g, '').replace(/:\w+:/g, '').trim();
              // Handle "NA" as null, but keep empty strings as empty (might be valid)
              if (extracted && extracted.toUpperCase() !== 'NA' && extracted.length > 0) {
                victims = extracted;
                console.log(`[EXTRACTION] Matched victims pattern: "${victims}"`);
                break;
              }
            }
          }
          // If no match found, victims stays null
          if (!victims) {
            console.log(`[EXTRACTION] No victims pattern matched for message ${msg.id}`);
          }
          
          // Items scammed - try multiple patterns
          let itemsScammed = null;
          const itemsPatterns = [
            /:\w+:\s*items?\s+scammed?:\s*([^\n\r]+)/i,  // Handle :pinkdot: items scammed: value (emoji required)
            /items?\s+scammed?:\s*([^\n\r]+)/i,  // Standard format items scammed: value (no emoji)
            /scammed?:\s*([^\n\r]+)/i   // More flexible scammed: value
          ];
          
          for (const pattern of itemsPatterns) {
            const match = fullContent.match(pattern);
            if (match && match[1]) {
              let extracted = match[1].trim();
              // Remove markdown formatting and emoji
              extracted = extracted.replace(/\*\*/g, '').replace(/\*/g, '').replace(/`/g, '').replace(/:\w+:/g, '').trim();
              // Handle "NA" as null, but keep empty strings as empty (might be valid)
              if (extracted && extracted.toUpperCase() !== 'NA' && extracted.length > 0) {
                itemsScammed = extracted;
                console.log(`[EXTRACTION] Matched items scammed pattern: "${itemsScammed}"`);
                break;
              }
            }
          }
          // If no match found, itemsScammed stays null
          if (!itemsScammed) {
            console.log(`[EXTRACTION] No items scammed pattern matched for message ${msg.id}`);
          }
          
          // Debug logging - always log extraction results
          if (userId) {
            console.log(`[EXTRACTION] Message ${msg.id} - userId: ${userId}`);
            console.log(`[EXTRACTION]   victims: "${victims}" (type: ${typeof victims})`);
            console.log(`[EXTRACTION]   itemsScammed: "${itemsScammed}" (type: ${typeof itemsScammed})`);
            console.log(`[EXTRACTION]   altIds: [${altIds.join(', ')}]`);
            console.log(`[EXTRACTION]   Full content preview: ${fullContent.substring(0, 500)}`);
          }

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
            discordidClean || null,
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
          if (discordidClean) {
            discordData = await fetchDiscordProfile(discordidClean, env, userId, true);
          }

          // Parse and fetch alt accounts
          // More flexible regex to handle various formats including emoji prefixes
          let altIds = [];
          const altPatterns = [
            /(?::\w+:\s*)?(?:roblox\s+)?alts?:\s*([^\n\r]+)/i,  // Handle :pinkdot: roblox alts: value
            /(?:roblox\s+)?alts?:\s*([^\n\r]+)/i,  // Standard format
            /alt[:\s]+([^\n\r]+)/i   // More flexible
          ];
          
          let altBlock = null;
          for (const pattern of altPatterns) {
            const match = fullContent.match(pattern);
            if (match && match[1]) {
              altBlock = match[1].trim();
              // Remove markdown formatting and emoji
              altBlock = altBlock.replace(/\*\*/g, '').replace(/\*/g, '').replace(/`/g, '').replace(/:\w+:/g, '').trim();
              // Handle "NA" as empty
              if (altBlock && altBlock.toUpperCase() !== 'NA') {
                break;
              } else {
                altBlock = null;
              }
            }
          }
          
          if (altBlock) {
            // Extract user IDs from Roblox profile URLs
            altIds = [...altBlock.matchAll(/roblox\.com\/users\/(\d+)\//g)].map(m => m[1]);
            // Also try to extract plain user IDs if they're listed
            const plainIds = altBlock.match(/\b(\d{7,})\b/g);
            if (plainIds) {
              altIds.push(...plainIds.filter(id => id.length >= 7 && id.length <= 10));
            }
            // Remove duplicates
            altIds = [...new Set(altIds)];
            if (altIds.length > 0) {
              console.log(`Found ${altIds.length} alt accounts for message ${msg.id}:`, altIds);
            }
          }

          const robloxAlts = await fetchAltAccounts(altIds, env);
          const robloxAltsJson = JSON.stringify(robloxAlts);

          // Check if message has a thread and fetch thread evidence
          // fetchDiscordThread now always downloads images/videos to R2 automatically
          let threadEvidence = null;
          let threadLastMessageId = null;
          
          // Discord API: Check for thread using multiple methods
          // 1. Check msg.thread property (if Discord includes it)
          // 2. Check threads map (fetched separately - most reliable)
          // 3. Try fetching thread info directly
          let threadId = null;
          let threadName = null;
          
          // Method 1: Check message object's thread property
          if (msg.thread && msg.thread.id) {
            threadId = msg.thread.id;
            threadName = msg.thread.name;
            console.log(`✅ Found thread ${threadId} in message object for message ${msg.id}`);
          } 
          // Method 2: Check threads map (most reliable - fetched separately)
          else {
            const threadFromMap = threadsMap.get(msg.id);
            if (threadFromMap) {
              threadId = threadFromMap.id;
              threadName = threadFromMap.name;
              console.log(`✅ Found thread ${threadId} from threads map for message ${msg.id}`);
            }
            // Method 3: Fallback - try fetching thread info
            else {
              const foundThread = await findThreadForMessage(msg.id, env);
              if (foundThread) {
                threadId = foundThread.id;
                threadName = foundThread.name;
                console.log(`✅ Found thread ${threadId} via direct lookup for message ${msg.id}`);
              } else {
                console.log(`⚠️ No thread found for message ${msg.id} (checked all methods)`);
              }
            }
          }
          
          // If we found a thread, fetch its messages
          // Use a timeout to prevent hanging on large threads
          if (threadId) {
            console.log(`Fetching thread ${threadId} for message ${msg.id}`);
            try {
              // Set a timeout for thread fetching (20 seconds max per thread)
              const threadFetchPromise = fetchDiscordThread(threadId, env, null);
              const timeoutPromise = new Promise((_, reject) => 
                setTimeout(() => reject(new Error('Thread fetch timeout')), 20000)
              );
              
              const threadMessages = await Promise.race([threadFetchPromise, timeoutPromise]);
              
              if (threadMessages && threadMessages.length > 0) {
                // Get the newest message ID from thread (last in array after sorting)
                threadLastMessageId = threadMessages[threadMessages.length - 1].id;
                threadEvidence = {
                  thread_id: threadId,
                  thread_name: threadName || 'Untitled Thread',
                  message_count: threadMessages.length,
                  messages: threadMessages,
                  created_at: threadId ? new Date(parseInt(threadId) / 4194304 + 1420070400000).toISOString() : null
                };
                console.log(`Successfully fetched ${threadMessages.length} messages from thread ${threadId}`);
              } else {
                console.warn(`Thread ${threadId} found but no messages retrieved (might be empty or access denied)`);
              }
            } catch (err) {
              console.warn(`Failed to fetch thread ${threadId} (timeout or error):`, err.message);
              // Continue without thread evidence - it can be fetched later via update-thread-evidence
            }
          }

          const threadEvidenceJson = threadEvidence ? JSON.stringify(threadEvidence) : null;

          // Check if this user already exists and has no thread_evidence but now we have one
          const existingUser = await env.DB.prepare(
            "SELECT thread_evidence FROM scammer_profile_cache WHERE user_id = ?"
          ).bind(userId).first();

          // Store/update in unified table
          await env.DB.prepare(`
            INSERT INTO scammer_profile_cache (
              user_id, roblox_name, roblox_display_name, roblox_avatar,
            discord_id, discord_display_name, discord_avatar,
            victims, items_scammed, roblox_alts,
            thread_evidence, thread_last_message_id, thread_last_checked_at, incomplete, last_message_id, updated_at
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(user_id) DO UPDATE SET
            roblox_name = excluded.roblox_name,
            roblox_display_name = excluded.roblox_display_name,
            roblox_avatar = excluded.roblox_avatar,
            discord_id = COALESCE(excluded.discord_id, discord_id),
            discord_display_name = COALESCE(excluded.discord_display_name, discord_display_name),
            discord_avatar = COALESCE(excluded.discord_avatar, discord_avatar),
            victims = CASE WHEN excluded.victims IS NOT NULL AND excluded.victims != '' THEN excluded.victims ELSE victims END,
            items_scammed = CASE WHEN excluded.items_scammed IS NOT NULL AND excluded.items_scammed != '' THEN excluded.items_scammed ELSE items_scammed END,
            roblox_alts = CASE WHEN excluded.roblox_alts IS NOT NULL AND excluded.roblox_alts != '' THEN excluded.roblox_alts ELSE roblox_alts END,
            thread_evidence = COALESCE(excluded.thread_evidence, thread_evidence),
            thread_last_message_id = COALESCE(excluded.thread_last_message_id, thread_last_message_id),
            thread_last_checked_at = COALESCE(excluded.thread_last_checked_at, ?),
            incomplete = 0,
            last_message_id = excluded.last_message_id,
            updated_at = excluded.updated_at
        `).bind(
          userId,
          robloxData.name || null,
          robloxData.displayName || null,
          robloxData.avatar || null,
          discordidClean || null,
            discordData?.displayName || null,
            discordData?.avatar || null,
            victims || null,  // Explicit null if empty
            itemsScammed || null,  // Explicit null if empty
            robloxAltsJson || null,  // Explicit null if empty
            threadEvidenceJson,
            threadLastMessageId || null,
            threadEvidence ? now : null,
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

      // Check for messages that now have threads but didn't before
      // This handles cases where threads are created after the initial report
      for (const msg of allMessages) {
        try {
          const robloxProfileMatch = msg.content?.match(/https:\/\/www\.roblox\.com\/users\/(\d+)\/profile/i);
          const userId = robloxProfileMatch ? robloxProfileMatch[1] : null;
          
          if (!userId) continue;
          
          // Check if message has a thread
          if (msg.thread && msg.thread.id) {
            // Check if this user exists but has no thread_evidence
            const existingEntry = await env.DB.prepare(
              "SELECT thread_evidence FROM scammer_profile_cache WHERE user_id = ?"
            ).bind(userId).first();
            
            // If user exists but has no thread evidence, fetch it now
            if (existingEntry && !existingEntry.thread_evidence) {
              try {
                const threadMessages = await fetchDiscordThread(msg.thread.id, env);
                if (threadMessages && threadMessages.length > 0) {
                  const threadLastMessageId = threadMessages[threadMessages.length - 1].id;
                  const threadEvidence = {
                    thread_id: msg.thread.id,
                    thread_name: msg.thread.name,
                    message_count: threadMessages.length,
                    messages: threadMessages,
                    created_at: msg.thread.id ? new Date(parseInt(msg.thread.id) / 4194304 + 1420070400000).toISOString() : null
                  };
                  
                  const threadEvidenceJson = JSON.stringify(threadEvidence);
                  
                  // Update with thread evidence
                  await env.DB.prepare(`
                    UPDATE scammer_profile_cache 
                    SET thread_evidence = ?,
                        thread_last_message_id = ?,
                        thread_last_checked_at = ?,
                        thread_needs_update = 0,
                        updated_at = ?
                    WHERE user_id = ?
                  `).bind(
                    threadEvidenceJson,
                    threadLastMessageId,
                    now,
                    now,
                    userId
                  ).run();
                }
              } catch (err) {
                console.warn(`Failed to fetch thread ${msg.thread.id} for user ${userId}:`, err);
              }
            }
          }
        } catch (err) {
          console.warn("Failed to check for new threads:", err);
        }
      }

      // Update last processed message ID if we processed messages
      // This is tracked via the MAX(last_message_id) in scammer_profile_cache
      // No need to update separately - it's already stored per entry

      // Check if there are more messages to process
      let hasMore = false;
      if (allMessages.length === batchSize && currentLastMessageId) {
        // Check if there are more messages by fetching one more
        const checkUrl = new URL(`https://discord.com/api/v10/channels/${channelId}/messages`);
        checkUrl.searchParams.set("limit", "1");
        checkUrl.searchParams.set("before", currentLastMessageId);
        
        try {
          const checkRes = await fetch(checkUrl.toString(), {
            headers: { Authorization: `Bot ${env.DISCORD_BOT_TOKEN}` },
          });
          if (checkRes.ok) {
            const checkMessages = await checkRes.json();
            hasMore = checkMessages.length > 0;
          }
        } catch (err) {
          // Ignore errors when checking for more messages
        }
      }

      // If there are more messages, continue processing recursively
      if (hasMore && currentLastMessageId) {
        // Make recursive call to continue processing (lock stays active)
        const baseUrl = new URL(request.url);
        baseUrl.searchParams.set('startAfter', currentLastMessageId);
        baseUrl.searchParams.set('batchSize', batchSize.toString());
        // Keep refresh flag if present
        if (urlParams.has('refresh')) {
          baseUrl.searchParams.set('refresh', 'true');
        }
        
        try {
          // Make internal fetch to continue processing
          const recursiveResponse = await fetch(baseUrl.toString(), {
            method: 'GET',
            headers: {
              'Authorization': request.headers.get('Authorization') || '',
            },
          });
          
          if (recursiveResponse.ok) {
            // Return the recursive response (which will have all scammers)
            // The recursive call will release the lock at the end
            return recursiveResponse;
          } else {
            // If recursive call failed, continue with current batch results
            const errorText = await recursiveResponse.text();
            console.warn('Recursive call failed:', recursiveResponse.status, errorText);
          }
        } catch (err) {
          console.warn('Recursive call error:', err);
          // Continue with current batch results
        }
      }

      // Release lock only if this is the final batch (no more messages)
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
        partials: allPartialScammers,
        batchProgress: {
          processed: allMessages.length,
          hasMore: hasMore,
          nextStartAfter: currentLastMessageId || null,
          message: hasMore ? `Processed ${allMessages.length} messages. Call again with ?startAfter=${currentLastMessageId} to continue.` : null
        }
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
