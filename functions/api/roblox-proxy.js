const CACHE_KEY = "discord-scammers";
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const mode = url.searchParams.get("mode");
  const userId = url.searchParams.get("userId");
  const discordId = url.searchParams.get("discordId");
  const forceRefresh = url.searchParams.get("refresh") === "true";


  if (url.pathname.endsWith("/api/roblox-proxy") && userId) {
  try {
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
    }), { headers: { "Content-Type": "application/json" } });

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
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

      const existing = await env.DB.prepare(
        "SELECT value, updated_at FROM scammer_cache WHERE key = ?"
      ).bind(CACHE_KEY).first();

      if (existing && !forceRefresh) {
        const cachedData = JSON.parse(existing.value);
        const cachedLastMessageId = cachedData.lastMessageId;

        // Retry even if message ID unchanged, if any incomplete scammers
        

        if (now - existing.updated_at < CACHE_TTL_MS && latestMessageId === cachedLastMessageId) {
          return new Response(JSON.stringify({ lastUpdated: existing.updated_at, scammers: cachedData.scammers, partials: cachedData.partials }), {
            headers: { "Content-Type": "application/json", "X-Cache": "D1-HIT-EARLY" },
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
          const { results } = await env.DB.prepare(
            "SELECT value, updated_at FROM scammer_cache WHERE key = ?"
          ).bind(CACHE_KEY).all();
          if (results.length > 0) {
            const enriched = JSON.parse(results[0].value);
            return new Response(JSON.stringify({ lastUpdated: results[0].updated_at, scammers: enriched.scammers, partials: enriched.partials }), {
              headers: { "Content-Type": "application/json", "X-Cache": "D1-WAIT" },
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

      // --- DISCORD FETCHING ---
      const channelId = env.DISCORD_CHANNEL_ID;
      let allMessages = [];
      let before = null;

      while (true) {
        const fetchUrl = new URL(`https://discord.com/api/v10/channels/${channelId}/messages`);
        fetchUrl.searchParams.set("limit", "100");
        if (before) fetchUrl.searchParams.set("before", before);

        let response;
        for (let attempt = 0; attempt < 3; attempt++) {
          response = await fetch(fetchUrl.toString(), {
            headers: { Authorization: `Bot ${env.DISCORD_BOT_TOKEN}` },
          });

          if (response.status === 429) {
            const retryAfter = await response.json();
            await new Promise(r => setTimeout(r, retryAfter.retry_after * 1000));
          } else {
            break;
          }
        }

        if (!response.ok) {
          throw new Error("Failed to fetch messages from Discord");
        }

        const messages = await response.json();
        if (messages.length === 0) break;
        allMessages.push(...messages);
        before = messages[messages.length - 1].id;
        if (allMessages.length >= 5000) break;
      }

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
          const victims = msg.content?.match(/victims:\s*\*{0,2}(.*)/i)?.[1]?.trim();
          const itemsScammed = msg.content?.match(/items scammed:\s*\*{0,2}(.*)/i)?.[1]?.trim();

          let entry = {
            robloxUser: robloxUserMatch?.[1]?.trim() || null,
            robloxProfile,
            avatar: null,
            discordDisplay: null,
            victims: victims || null,
            itemsScammed: itemsScammed || null,
            incomplete: false
          };

          if (!userId) {
            partialScammers.push(entry);
            continue;
          }

          let data = {};
          const now = Date.now();

          const cached = await env.DB.prepare("SELECT * FROM scammer_profile_cache WHERE user_id = ?")
            .bind(userId).first();

          if (cached && now - cached.updated_at < 7 * 24 * 60 * 60 * 1000 && cached.roblox_name && cached.roblox_display_name && cached.avatar) {
            data = {
              name: cached.roblox_name,
              displayName: cached.roblox_display_name,
              avatar: cached.avatar,
              discordDisplayName: cached.discord_display_name
            };
          } else {
            let fetchSuccess = false;
            for (let attempt = 0; attempt < 5; attempt++) {
              try {
                const res = await fetch(`https://emwiki.site/api/roblox-proxy?userId=${userId}&discordId=${discordid}`);
                if (res.ok) {
                  data = await res.json();
                  await env.DB.prepare(`
                    INSERT INTO scammer_profile_cache (user_id, roblox_name, roblox_display_name, avatar, discord_id, discord_display_name, updated_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?)
                    ON CONFLICT(user_id) DO UPDATE SET
                      roblox_name = excluded.roblox_name,
                      roblox_display_name = excluded.roblox_display_name,
                      avatar = excluded.avatar,
                      discord_id = excluded.discord_id,
                      discord_display_name = excluded.discord_display_name,
                      updated_at = excluded.updated_at
                  `).bind(
                    userId,
                    data.name || null,
                    data.displayName || null,
                    data.avatar || null,
                    discordid || null,
                    data.discordDisplayName || null,
                    now
                  ).run();
                  fetchSuccess = true;
                  break;
                }
              } catch {}
              await new Promise(r => setTimeout(r, 500 * (attempt + 1)));
            }
              if (!fetchSuccess || !data.avatar) {
                entry.incomplete = true;
                partialScammers.push(entry);
                continue; // Don't push to scammers
              }
          }

          entry.robloxUser = data.displayName || data.name || entry.robloxUser;
          entry.avatar = data.avatar || null;
          entry.discordDisplay = data.discordDisplayName || entry.discordDisplay;
          entry.robloxAlts = [];
          let anyAltFetchSucceeded = false;  // <-- Track success

          // --- HANDLE ROBLOX ALTS ---
          const altMatches = msg.content?.match(/roblox alts:\s*([\s\S]+)/i);
          if (altMatches) {
            const altBlock = altMatches[1].trim();
            const altIds = [...altBlock.matchAll(/roblox\.com\/users\/(\d+)\//g)].map(m => m[1]);

            for (const altId of altIds) {
              try {
                const altRes = await fetch(`https://users.roblox.com/v1/users/${altId}`);
                if (altRes.ok) {
                  const altUser = await altRes.json();
                  entry.robloxAlts.push(altUser.name);
                  anyAltFetchSucceeded = true; // Mark success
                }
              } catch {
                // ignore error, just continue
              }
            }
          }


          // After loop, check if all failed
          if (altIds.length > 0 && !anyAltFetchSucceeded) {
            console.warn(`All alt fetches failed for user with alts: ${altIds.join(", ")}`);
            // You could also set a flag here, or mark entry incomplete if needed
          }
        } catch (err) {
          console.warn("Failed to parse message:", err);
        }
      }

      const payload = JSON.stringify({ lastMessageId: latestMessageId, scammers, partials: partialScammers });

      await env.DB.prepare(`
        INSERT INTO scammer_cache (key, value, updated_at)
        VALUES (?, ?, ?)
        ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
      `).bind(CACHE_KEY, payload, now).run();

      await env.DB.prepare("DELETE FROM scammer_cache_locks WHERE key = ?").bind(LOCK_KEY).run();

      return new Response(JSON.stringify({ lastUpdated: now, scammers, partials: partialScammers }), {
        headers: { "Content-Type": "application/json", "X-Cache": "D1-MISS" },
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
