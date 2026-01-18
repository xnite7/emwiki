/**
 * Avatar Refresh Scheduler Worker
 * 
 * A Cloudflare Worker with Cron Trigger that automatically refreshes
 * stale user avatars and display names throughout the day.
 * 
 * Deploy this separately from the Pages site:
 *   cd emwiki/workers/avatar-refresh-scheduler
 *   wrangler deploy
 * 
 * The cron runs every hour and processes a batch of 20 users each time.
 * This spreads ~480 user updates across the day without overwhelming
 * Roblox's API rate limits.
 */

export default {
    // Scheduled handler - runs on cron trigger
    async scheduled(event, env, ctx) {
        console.log('Avatar refresh cron triggered at:', new Date().toISOString());
        
        await refreshAvatars(env);
    },
    
    // HTTP handler - for manual triggers and testing
    async fetch(request, env, ctx) {
        const url = new URL(request.url);
        
        if (url.pathname === '/trigger') {
            const result = await refreshAvatars(env);
            return new Response(JSON.stringify(result, null, 2), {
                headers: { 'Content-Type': 'application/json' }
            });
        }
        
        return new Response(JSON.stringify({
            name: 'Avatar Refresh Scheduler',
            endpoints: {
                '/trigger': 'Manually trigger avatar refresh'
            }
        }), {
            headers: { 'Content-Type': 'application/json' }
        });
    }
};

async function refreshAvatars(env) {
    const batchSize = 20;
    const oneDayAgo = Date.now() - (24 * 60 * 60 * 1000);
    
    // Find users with stale data (older than 24 hours)
    const { results: staleUsers } = await env.DBA.prepare(`
        SELECT user_id, username, display_name, avatar_url, avatar_cached_at
        FROM users
        WHERE avatar_cached_at IS NULL 
           OR avatar_cached_at < ?
        ORDER BY avatar_cached_at ASC NULLS FIRST
        LIMIT ?
    `).bind(oneDayAgo, batchSize).all();
    
    if (!staleUsers || staleUsers.length === 0) {
        console.log('No stale users to refresh');
        return { updated: 0, message: 'No stale users' };
    }
    
    console.log(`Found ${staleUsers.length} stale users to refresh`);
    
    const results = {
        updated: 0,
        failed: 0,
        skipped: 0
    };
    
    const userIds = staleUsers.map(u => u.user_id);
    
    // Fetch avatars in bulk from Roblox
    let avatarMap = {};
    try {
        const avatarResponse = await fetch(
            `https://thumbnails.roblox.com/v1/users/avatar-headshot?userIds=${userIds.join(',')}&size=150x150&format=Png`
        );
        if (avatarResponse.ok) {
            const avatarData = await avatarResponse.json();
            for (const item of avatarData.data || []) {
                avatarMap[item.targetId] = item.imageUrl;
            }
        }
    } catch (e) {
        console.error('Failed to fetch avatars:', e);
    }
    
    // Fetch user info in bulk from Roblox
    let userInfoMap = {};
    try {
        const userInfoResponse = await fetch('https://users.roblox.com/v1/users', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userIds: userIds.map(id => parseInt(id)) })
        });
        if (userInfoResponse.ok) {
            const userInfoData = await userInfoResponse.json();
            for (const user of userInfoData.data || []) {
                userInfoMap[user.id] = {
                    username: user.name,
                    displayName: user.displayName
                };
            }
        }
    } catch (e) {
        console.error('Failed to fetch user info:', e);
    }
    
    // Update each user
    const now = Date.now();
    for (const user of staleUsers) {
        const userId = user.user_id;
        const newAvatar = avatarMap[userId];
        const newInfo = userInfoMap[userId];
        
        if (!newAvatar && !newInfo) {
            results.skipped++;
            continue;
        }
        
        try {
            await env.DBA.prepare(`
                UPDATE users SET
                    avatar_url = COALESCE(?, avatar_url),
                    avatar_cached_at = ?,
                    username = COALESCE(?, username),
                    display_name = COALESCE(?, display_name)
                WHERE user_id = ?
            `).bind(
                newAvatar || null,
                now,
                newInfo?.username || null,
                newInfo?.displayName || null,
                userId
            ).run();
            
            results.updated++;
            console.log(`Updated user ${userId}: ${user.username} -> ${newInfo?.username || user.username}`);
        } catch (e) {
            results.failed++;
            console.error(`Failed to update user ${userId}:`, e);
        }
    }
    
    console.log(`Refresh complete: ${results.updated} updated, ${results.failed} failed, ${results.skipped} skipped`);
    return results;
}

