const CACHE_KEY = "discord-scammers";
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const PROFILE_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days for profile data

// Helper function to fetch Roblox profile with caching
async function fetchRobloxProfile(userId, env) {
  if (!userId || !/^\d+$/.test(userId)) {
    return null;
  }

  const now = Date.now();

  // Check cache first
  const cached = await env.DB.prepare(
    "SELECT roblox_name, roblox_display_name, roblox_avatar, updated_at FROM scammer_profile_cache WHERE user_id = ?"
  ).bind(userId).first();

  if (cached && now - cached.updated_at < PROFILE_CACHE_TTL_MS && cached.roblox_name && cached.roblox_display_name && cached.roblox_avatar) {
    return {
      name: cached.roblox_name,
      displayName: cached.roblox_display_name,
      avatar: cached.roblox_avatar
    };
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

  // Update cache (partial update - only Roblox fields)
  await env.DB.prepare(`
    INSERT INTO scammer_profile_cache (user_id, roblox_name, roblox_display_name, roblox_avatar, updated_at)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(user_id) DO UPDATE SET
      roblox_name = excluded.roblox_name,
      roblox_display_name = excluded.roblox_display_name,
      roblox_avatar = excluded.roblox_avatar,
      updated_at = excluded.updated_at
  `).bind(userId, data.name || null, data.displayName || null, data.avatar || null, now).run();

  return data;
}

// Helper function to fetch Discord profile with caching
async function fetchDiscordProfile(discordId, env, userId = null) {
  if (!discordId || !/^\d+$/.test(discordId)) {
    return null;
  }

  const now = Date.now();

  // Check cache first - prefer user_id match if provided
  let cached = null;
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
        // User not found - cache null to avoid repeated lookups
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

  // Update cache - prefer user_id if provided, otherwise update by discord_id
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





  if (url.pathname.endsWith("/api/roblox-proxy") && userId) {
    try {
      // Fetch Roblox data
      const robloxData = await fetchRobloxProfile(userId, env);
      
      if (!robloxData) {
        throw new Error("Failed to fetch Roblox user data");
      }

      // Fetch Discord data if discordId provided
      let discordData = null;
      if (discordId) {
        discordData = await fetchDiscordProfile(discordId, env);
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
          // Return all scammers from unified table (including incomplete ones)
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
              incomplete
            FROM scammer_profile_cache
            WHERE user_id IS NOT NULL
            ORDER BY incomplete ASC, updated_at DESC
          `).all();

          // Separate complete and incomplete scammers
          const completeScammers = [];
          const partialScammers = [];

          for (const row of results) {
            const entry = {
              robloxUser: row.roblox_display_name || row.roblox_name || null,
              robloxProfile: row.user_id ? `https://www.roblox.com/users/${row.user_id}/profile` : null,
              avatar: row.roblox_avatar || (row.incomplete === 0 ? "https://emwiki.com/imgs/plr.jpg" : null),
              discordDisplay: row.discord_display_name || null,
              victims: row.victims || null,
              itemsScammed: row.items_scammed || null,
              incomplete: row.incomplete === 1,
              robloxAlts: row.roblox_alts ? JSON.parse(row.roblox_alts) : []
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
                incomplete
              FROM scammer_profile_cache
              WHERE user_id IS NOT NULL AND incomplete = 0
              ORDER BY updated_at DESC
            `).all();

            const scammers = results.map(row => ({
              robloxUser: row.roblox_display_name || row.roblox_name || null,
              robloxProfile: row.user_id ? `https://www.roblox.com/users/${row.user_id}/profile` : null,
              avatar: row.roblox_avatar || "https://emwiki.com/imgs/plr.jpg",
              discordDisplay: row.discord_display_name || null,
              victims: row.victims || null,
              itemsScammed: row.items_scammed || null,
              incomplete: false,
              robloxAlts: row.roblox_alts ? JSON.parse(row.roblox_alts) : []
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

          // Fetch Roblox profile data
          const robloxData = await fetchRobloxProfile(userId, env);
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

          // Fetch Discord profile data if discord ID provided
          let discordData = null;
          if (discordid) {
            discordData = await fetchDiscordProfile(discordid, env, userId);
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

          // Store/update in unified table
          await env.DB.prepare(`
            INSERT INTO scammer_profile_cache (
              user_id, roblox_name, roblox_display_name, roblox_avatar,
              discord_id, discord_display_name, discord_avatar,
              victims, items_scammed, roblox_alts,
              incomplete, last_message_id, updated_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
      // This ensures we return everything that's been stored, including from previous runs
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
          incomplete
        FROM scammer_profile_cache
        WHERE user_id IS NOT NULL
        ORDER BY incomplete ASC, updated_at DESC
      `).all();

      // Separate complete and incomplete scammers
      const allCompleteScammers = [];
      const allPartialScammers = [];

      for (const row of allResults) {
        const entry = {
          robloxUser: row.roblox_display_name || row.roblox_name || null,
          robloxProfile: row.user_id ? `https://www.roblox.com/users/${row.user_id}/profile` : null,
          avatar: row.roblox_avatar || (row.incomplete === 0 ? "https://emwiki.com/imgs/plr.jpg" : null),
          discordDisplay: row.discord_display_name || null,
          victims: row.victims || null,
          itemsScammed: row.items_scammed || null,
          incomplete: row.incomplete === 1,
          robloxAlts: row.roblox_alts ? JSON.parse(row.roblox_alts) : []
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
