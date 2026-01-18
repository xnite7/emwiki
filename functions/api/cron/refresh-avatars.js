/**
 * Avatar & Profile Refresh API
 * 
 * Refreshes stale user avatars and display names from Roblox.
 * Should be called periodically by a scheduled worker or external cron.
 * 
 * - Processes users whose data is older than 24 hours
 * - Batches updates to avoid rate limiting (max 20 users per call)
 * - Staggers which users get updated to spread load throughout the day
 */

export async function onRequest(context) {
    const { request, env } = context;
    const url = new URL(request.url);
    
    // Optional secret key for security (set CRON_SECRET in env vars)
    const providedSecret = url.searchParams.get('secret') || request.headers.get('X-Cron-Secret');
    if (env.CRON_SECRET && providedSecret !== env.CRON_SECRET) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), {
            status: 401,
            headers: { 'Content-Type': 'application/json' }
        });
    }
    
    // Batch size - how many users to update per call
    const batchSize = parseInt(url.searchParams.get('batch') || '20');
    const maxBatch = Math.min(batchSize, 50); // Cap at 50 to avoid timeouts
    
    // Find users with stale data (older than 24 hours)
    const oneDayAgo = Date.now() - (24 * 60 * 60 * 1000);
    
    // Get users with oldest cached data first
    // Also include users who have never had their avatar cached
    const { results: staleUsers } = await env.DBA.prepare(`
        SELECT user_id, username, display_name, avatar_url, avatar_cached_at
        FROM users
        WHERE avatar_cached_at IS NULL 
           OR avatar_cached_at < ?
        ORDER BY avatar_cached_at ASC NULLS FIRST
        LIMIT ?
    `).bind(oneDayAgo, maxBatch).all();
    
    if (!staleUsers || staleUsers.length === 0) {
        return new Response(JSON.stringify({ 
            success: true, 
            message: 'No stale users to refresh',
            updated: 0 
        }), {
            headers: { 'Content-Type': 'application/json' }
        });
    }
    
    const results = {
        updated: 0,
        failed: 0,
        skipped: 0,
        details: []
    };
    
    // Process users in parallel but with controlled concurrency
    const userIds = staleUsers.map(u => u.user_id);
    
    // Fetch avatars in bulk from Roblox (they support up to 100 at once)
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
        console.error('Failed to fetch avatars in bulk:', e);
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
        console.error('Failed to fetch user info in bulk:', e);
    }
    
    // Update each user
    const now = Date.now();
    for (const user of staleUsers) {
        const userId = user.user_id;
        const newAvatar = avatarMap[userId];
        const newInfo = userInfoMap[userId];
        
        // Skip if we couldn't get any new data
        if (!newAvatar && !newInfo) {
            results.skipped++;
            results.details.push({ userId, status: 'skipped', reason: 'No data from Roblox' });
            continue;
        }
        
        try {
            // Update with whatever new data we have
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
            results.details.push({ 
                userId, 
                status: 'updated',
                oldUsername: user.username,
                newUsername: newInfo?.username,
                oldDisplayName: user.display_name,
                newDisplayName: newInfo?.displayName,
                avatarUpdated: !!newAvatar
            });
        } catch (e) {
            results.failed++;
            results.details.push({ userId, status: 'failed', error: e.message });
        }
    }
    
    // Count remaining stale users for reporting
    const { count } = await env.DBA.prepare(`
        SELECT COUNT(*) as count FROM users
        WHERE avatar_cached_at IS NULL OR avatar_cached_at < ?
    `).bind(oneDayAgo).first();
    
    return new Response(JSON.stringify({
        success: true,
        message: `Refreshed ${results.updated} users`,
        ...results,
        remainingStale: count
    }), {
        headers: { 'Content-Type': 'application/json' }
    });
}

