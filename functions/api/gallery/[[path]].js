// Gallery API - Handles media submissions and moderation
import { verifySession } from '../_utils/auth.js';

// CORS headers helper
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Max-Age': '86400',
};

// Helper to determine media type from URL
function getMediaType(url) {
  if (!url) return 'image';

  // Check for Cloudflare Stream URLs (videos)
  if (url.includes('cloudflarestream.com') ||
      url.includes('videodelivery.net') ||
      url.includes('.m3u8')) {
    return 'video';
  }

  // Check file extension
  const ext = url.split('.').pop().toLowerCase().split('?')[0]; // Handle query params
  const videoExts = ['mp4', 'webm', 'mov', 'avi', 'mkv'];
  return videoExts.includes(ext) ? 'video' : 'image';
}

// Helper to get user from session token
async function getUserFromToken(token, env) {
  if (!token) return null;

  const session = await env.DBA.prepare(
    'SELECT user_id FROM sessions WHERE token = ? AND expires_at > ?'
  ).bind(token, Date.now()).first();

  if (!session) return null;

  const user = await env.DBA.prepare(
    'SELECT user_id, username, display_name, role FROM users WHERE user_id = ?'
  ).bind(session.user_id).first();

  return user;
}

// Check if user is admin
function isAdmin(user) {
  if (!user || !user.role) return false;
  try {
    const roles = JSON.parse(user.role);
    return roles.includes('admin') || roles.includes('moderator');
  } catch {
    return false;
  }
}

// Check if user should have submissions auto-approved (VIP, admin, or moderator)
function shouldAutoApprove(user) {
  if (!user || !user.role) return false;
  try {
    const roles = JSON.parse(user.role);
    return roles.includes('vip') || roles.includes('admin') || roles.includes('moderator') || roles.includes('mod');
  } catch {
    return false;
  }
}

// GET /api/gallery - List gallery items
async function handleGet({ request, env, params }) {
  const url = new URL(request.url);
  const path = params.path ? params.path.join('/') : '';

  // Get auth token - only fetch user if token exists (saves 2 DB queries for public requests)
  const authHeader = request.headers.get('Authorization');
  const token = authHeader?.replace('Bearer ', '').trim();
  // Defer user lookup until actually needed, cache result
  let userCache = { fetched: false, user: null };
  const getUser = async () => {
    if (!userCache.fetched && token) {
      userCache.user = await getUserFromToken(token, env);
      userCache.fetched = true;
    }
    return userCache.user;
  };

  // GET /api/gallery/pending - Get pending items (admin only)
  if (path === 'pending') {
    //if (!user || !isAdmin(user)) {
    //return new Response(JSON.stringify({ error: 'Unauthorized' }), {
    //status: 403,
    //headers: { 'Content-Type': 'application/json',
    //...CORS_HEADERS }
    //});
    //}

    const items = await env.DBA.prepare(
      `SELECT g.id, g.user_id, u.username, g.title, g.description, g.media_url, g.thumbnail_url,
              g.status, g.created_at, g.views, g.likes, u.avatar_url, u.role
       FROM gallery_items g
       LEFT JOIN users u ON g.user_id = u.user_id
       WHERE g.status = 2
       ORDER BY g.created_at DESC`
    ).all();

    // Parse JSON fields and add computed fields
    const processedItems = items.results.map(item => {
      const likes = JSON.parse(item.likes || '[]');
      const mediaType = getMediaType(item.media_url);
      return {
        ...item,
        username: item.username || 'Unknown',
        media_type: mediaType,
        views: item.views || 0,
        likes_count: likes.length,
        status: 'pending' // For backwards compatibility
      };
    });

    return new Response(JSON.stringify({ items: processedItems }), {
      headers: {
        'Content-Type': 'application/json',
        ...CORS_HEADERS
      }
    });
  }

  // GET /api/gallery/my-submissions - Get user's own submissions
  if (path === 'my-submissions') {
    const currentUser = await getUser();
    if (!currentUser) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: {
          'Content-Type': 'application/json',
          ...CORS_HEADERS
        }
      });
    }

    const items = await env.DBA.prepare(
      `SELECT g.id, g.title, g.description, g.media_url, g.thumbnail_url, g.status,
              g.created_at, g.views, g.likes, g.rejection_reason, u.avatar_url, u.role
       FROM gallery_items g
       LEFT JOIN users u ON g.user_id = u.user_id
       WHERE g.user_id = ?
       ORDER BY g.created_at DESC`
    ).bind(currentUser.user_id).all();

    // Parse JSON fields and add computed fields
    const processedItems = items.results.map(item => {
      const likes = JSON.parse(item.likes || '[]');
      const mediaType = getMediaType(item.media_url);
      const statusText = item.status === 1 ? 'approved' : item.status === 0 ? 'rejected' : 'pending';
      return {
        ...item,
        media_type: mediaType,
        views: item.views || 0,
        likes_count: likes.length,
        status: statusText // For backwards compatibility
      };
    });

    return new Response(JSON.stringify({ items: processedItems }), {
      headers: {
        'Content-Type': 'application/json',
        ...CORS_HEADERS
      }
    });
  }

  // GET /api/gallery/:id - Get single gallery item and increment views
  if (path && path.match(/^\d+$/)) {
    const itemId = parseInt(path, 10);

    try {
      // Get item first
      const item = await env.DBA.prepare(
        `SELECT g.id, g.user_id, u.username, g.title, g.description, g.media_url, g.thumbnail_url,
                g.created_at, g.views, g.likes, u.avatar_url, u.role
         FROM gallery_items g
         LEFT JOIN users u ON g.user_id = u.user_id
         WHERE g.id = ? AND g.status = 1`
      ).bind(itemId).first();

      if (!item) {
        return new Response(JSON.stringify({ error: 'Item not found' }), {
          status: 404,
          headers: {
            'Content-Type': 'application/json',
            ...CORS_HEADERS
          }
        });
      }

      // Increment views (don't await to speed up response)
      env.DBA.prepare(
        'UPDATE gallery_items SET views = views + 1 WHERE id = ?'
      ).bind(itemId).run().catch(err => console.error('View increment failed:', err));

      // Parse likes array
      let likes = [];
      try {
        likes = JSON.parse(item.likes || '[]');
      } catch {
        likes = [];
      }

      // Check if current user liked this item (only fetch user if token exists)
      const currentUser = await getUser();
      const userLiked = currentUser ? likes.includes(currentUser.user_id) : false;
      const mediaType = getMediaType(item.media_url);

      const processedItem = {
        ...item,
        username: item.username || 'Unknown',
        media_type: mediaType,
        views: (item.views || 0) + 1,
        likes_count: likes.length,
        user_liked: userLiked
      };

      return new Response(JSON.stringify({ item: processedItem }), {
        headers: {
          'Content-Type': 'application/json',
          ...CORS_HEADERS
        }
      });
    } catch (error) {
      console.error('Error fetching gallery item:', error.message, error.stack);
      return new Response(JSON.stringify({ 
        error: 'Failed to fetch item',
        details: error.message 
      }), {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
          ...CORS_HEADERS
        }
      });
    }
  }

  // GET /api/gallery - Get approved items (public)
  const limit = parseInt(url.searchParams.get('limit')) || 50;
  const offset = parseInt(url.searchParams.get('offset')) || 0;
  const sortBy = url.searchParams.get('sort') || 'likes'; // 'likes' or 'newest'

  // Get total count of approved items
  const countResult = await env.DBA.prepare(
    'SELECT COUNT(*) as total FROM gallery_items WHERE status = 1'
  ).first();
  const total = countResult?.total || 0;

  // Get user info only if token exists (skip 2 DB queries for unauthenticated requests)
  const currentUser = await getUser();

  // For likes sorting, we need to fetch all items, sort them, then paginate
  // For newest sorting, we can sort in SQL and paginate efficiently
  let processedItems;

  if (sortBy === 'likes') {
    // Use likes_count column for efficient SQL-based sorting and pagination
    const items = await env.DBA.prepare(
      `SELECT g.id, g.user_id, u.username, g.title, g.description, g.media_url, g.thumbnail_url,
              g.created_at, g.views, g.likes, g.likes_count, u.avatar_url, u.role
       FROM gallery_items g
       LEFT JOIN users u ON g.user_id = u.user_id
       WHERE g.status = 1
       ORDER BY g.likes_count DESC, g.created_at DESC
       LIMIT ? OFFSET ?`
    ).bind(limit, offset).all();

    // Process items
    processedItems = items.results.map(item => {
      const likes = JSON.parse(item.likes || '[]');
      const mediaType = getMediaType(item.media_url);
      const userLiked = currentUser ? likes.includes(currentUser.user_id) : false;

      return {
        ...item,
        username: item.username || 'Unknown',
        media_type: mediaType,
        views: item.views || 0,
        likes_count: item.likes_count || likes.length,
        user_liked: userLiked
      };
    });
  } else {
    // For newest, we can paginate in SQL efficiently
    const items = await env.DBA.prepare(
      `SELECT g.id, g.user_id, u.username, g.title, g.description, g.media_url, g.thumbnail_url,
              g.created_at, g.views, g.likes, u.avatar_url, u.role
       FROM gallery_items g
       LEFT JOIN users u ON g.user_id = u.user_id
       WHERE g.status = 1
       ORDER BY g.created_at DESC
       LIMIT ? OFFSET ?`
    ).bind(limit, offset).all();

    // Process items
    processedItems = items.results.map(item => {
      const likes = JSON.parse(item.likes || '[]');
      const mediaType = getMediaType(item.media_url);
      const userLiked = currentUser ? likes.includes(currentUser.user_id) : false;

      return {
        ...item,
        username: item.username || 'Unknown',
        media_type: mediaType,
        views: item.views || 0,
        likes_count: likes.length,
        user_liked: userLiked
      };
    });
  }

  return new Response(JSON.stringify({ items: processedItems, total }), {
    headers: {
      'Content-Type': 'application/json',
      ...CORS_HEADERS
    }
  });
}

// POST /api/gallery - Submit new media
async function handlePost({ request, env, params }) {
  const path = params.path ? params.path.join('/') : '';

  // Get auth token
  const authHeader = request.headers.get('Authorization');
  const token = authHeader?.replace('Bearer ', '');
  const user = await getUserFromToken(token, env);

  if (!user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: {
        'Content-Type': 'application/json',
        ...CORS_HEADERS
      }
    });
  }

  // POST /api/gallery/upload - Upload media file to Cloudflare Images/Stream
  if (path === 'upload') {
    try {
      const formData = await request.formData();
      const file = formData.get('file');

      if (!file) {
        return new Response(JSON.stringify({ error: 'No file uploaded' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json', ...CORS_HEADERS }
        });
      }

      // Validate file type
      const validImageTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
      const validVideoTypes = ['video/mp4', 'video/webm', 'video/quicktime'];
      const isImage = validImageTypes.includes(file.type);
      const isVideo = validVideoTypes.includes(file.type);

      if (!isImage && !isVideo) {
        return new Response(JSON.stringify({
          error: 'Invalid file type. Only images (JPEG, PNG, GIF, WebP) and videos (MP4, WebM, MOV) are allowed.'
        }), {
          status: 400,
          headers: { 'Content-Type': 'application/json', ...CORS_HEADERS }
        });
      }

      // Validate file size (max 100MB for videos, 10MB for images)
      const maxSize = isVideo ? 100 * 1024 * 1024 : 10 * 1024 * 1024;
      if (file.size > maxSize) {
        return new Response(JSON.stringify({
          error: `File too large. Maximum size is ${isVideo ? '100MB' : '10MB'}.`
        }), {
          status: 400,
          headers: { 'Content-Type': 'application/json', ...CORS_HEADERS }
        });
      }

      const accountId = env.CLOUDFLARE_ACCOUNT_ID;
      const apiToken = env.CLOUDFLARE_STREAM_TOKEN;

      if (!accountId || !apiToken) {
        return new Response(JSON.stringify({
          error: 'Cloudflare credentials not configured'
        }), {
          status: 500,
          headers: { 'Content-Type': 'application/json', ...CORS_HEADERS }
        });
      }

      // Generate unique ID for the upload
      const customId = `gallery-${user.user_id}-${Date.now()}-${Math.random().toString(36).substring(7)}`;

      if (isImage) {
        // Upload to Cloudflare Images
        const uploadForm = new FormData();
        uploadForm.append('file', file, file.name);
        uploadForm.append('id', customId);
        uploadForm.append('metadata', JSON.stringify({
          user_id: user.user_id,
          username: user.username,
          uploaded_at: Date.now()
        }));

        const uploadRes = await fetch(
          `https://api.cloudflare.com/client/v4/accounts/${accountId}/images/v1`,
          {
            method: 'POST',
            headers: { Authorization: `Bearer ${apiToken}` },
            body: uploadForm
          }
        );

        if (!uploadRes.ok) {
          const error = await uploadRes.text();
          throw new Error(`Images upload failed: ${error}`);
        }

        const result = await uploadRes.json();
        if (!result.success) {
          throw new Error(result.errors?.[0]?.message || 'Upload failed');
        }

        // Return the public variant URL
        const url = result.result.variants[0];
        return new Response(JSON.stringify({ 
          url, 
          type: file.type,
          cf_id: customId,
          provider: 'cloudflare-images'
        }), {
          headers: { 'Content-Type': 'application/json', ...CORS_HEADERS }
        });

      } else {
        // Upload to Cloudflare Stream
        const streamToken = env.CLOUDFLARE_STREAM_TOKEN || apiToken;
        
        // Use TUS upload for larger files, direct upload for smaller
        const uploadForm = new FormData();
        uploadForm.append('file', file, file.name);
        uploadForm.append('meta', JSON.stringify({
          name: customId,
          user_id: user.user_id,
          username: user.username
        }));

        const uploadRes = await fetch(
          `https://api.cloudflare.com/client/v4/accounts/${accountId}/stream`,
          {
            method: 'POST',
            headers: { Authorization: `Bearer ${streamToken}` },
            body: uploadForm
          }
        );

        if (!uploadRes.ok) {
          const error = await uploadRes.text();
          throw new Error(`Stream upload failed: ${error}`);
        }

        const result = await uploadRes.json();
        if (!result.success) {
          throw new Error(result.errors?.[0]?.message || 'Upload failed');
        }

        const streamUid = result.result.uid;
        // Return the HLS manifest URL for direct video playback
        // Also store stream_uid for iframe embedding if needed
        const url = result.result.playback?.hls || `https://customer-${accountId}.cloudflarestream.com/${streamUid}/manifest/video.m3u8`;
        
        return new Response(JSON.stringify({ 
          url,  // HLS manifest for video players
          type: file.type,
          stream_uid: streamUid,
          iframe_url: `https://iframe.videodelivery.net/${streamUid}`,
          provider: 'cloudflare-stream'
        }), {
          headers: { 'Content-Type': 'application/json', ...CORS_HEADERS }
        });
      }
    } catch (err) {
      console.error('Gallery upload error:', err);
      return new Response(JSON.stringify({ error: 'Upload failed: ' + err.message }), {
        status: 500,
        headers: { 'Content-Type': 'application/json', ...CORS_HEADERS }
      });
    }
  }

  // POST /api/gallery/submit - Submit gallery item
  if (path === 'submit') {
    try {
      const data = await request.json();
      const { title, description, media_url, thumbnail_url } = data;

      if (!title || !media_url) {
        return new Response(JSON.stringify({
          error: 'Missing required fields: title, media_url'
        }), {
          status: 400,
          headers: {
            'Content-Type': 'application/json',
            ...CORS_HEADERS
          }
        });
      }

      // Determine status based on user roles (VIP, admin, mod get auto-approved)
      // 0=rejected, 1=approved, 2=pending
      const status = shouldAutoApprove(user) ? 1 : 2;
      const autoApproved = status === 1;

      // Insert into database with thumbnail_url
      const result = await env.DBA.prepare(
        `INSERT INTO gallery_items (user_id, title, description, media_url, thumbnail_url, status, created_at, views, likes)
         VALUES (?, ?, ?, ?, ?, ?, ?, '[]', '[]')`
      ).bind(
        user.user_id,
        title,
        description || '',
        media_url,
        thumbnail_url || null,
        status,
        Date.now()
      ).run();

      return new Response(JSON.stringify({
        success: true,
        id: result.meta.last_row_id,
        message: autoApproved
          ? 'Submission approved! Your art is now live in the gallery.'
          : 'Submission received! It will be reviewed by admins before appearing in the gallery.'
      }), {
        headers: {
          'Content-Type': 'application/json',
          ...CORS_HEADERS
        }
      });
    } catch (err) {
      return new Response(JSON.stringify({ error: 'Submission failed: ' + err.message }), {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
          ...CORS_HEADERS
        }
      });
    }
  }

 

  // POST /api/gallery/moderate/:id - Moderate item (admin only)
  if (path.startsWith('moderate/')) {
    if (!isAdmin(user)) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 403,
        headers: {
          'Content-Type': 'application/json',
          ...CORS_HEADERS
        }
      });
    }

    const itemId = path.split('/')[1];
    const data = await request.json();
    const { action, reason } = data; // action: 'approve' or 'reject'

    if (!action || !['approve', 'reject'].includes(action)) {
      return new Response(JSON.stringify({
        error: 'Invalid action. Must be "approve" or "reject"'
      }), {
        status: 400,
        headers: {
          'Content-Type': 'application/json',
          ...CORS_HEADERS
        }
      });
    }

    // 0=rejected, 1=approved, 2=pending
    const status = action === 'approve' ? 1 : 0;

    await env.DBA.prepare(
      `UPDATE gallery_items
       SET status = ?, moderated_by = ?, moderated_at = ?, rejection_reason = ?
       WHERE id = ?`
    ).bind(status, user.username, Date.now(), reason || null, itemId).run();

    return new Response(JSON.stringify({
      success: true,
      message: `Item ${action}d successfully`
    }), {
      headers: {
        'Content-Type': 'application/json',
        ...CORS_HEADERS
      }
    });
  }

  // POST /api/gallery/like/:id - Toggle like on item
  if (path.startsWith('like/')) {
    const itemId = path.split('/')[1];

    try {
      // Check if item exists and is approved
      const item = await env.DBA.prepare(
        'SELECT id, likes FROM gallery_items WHERE id = ? AND status = 1'
      ).bind(itemId).first();

      if (!item) {
        return new Response(JSON.stringify({ error: 'Item not found or not approved' }), {
          status: 404,
          headers: {
            'Content-Type': 'application/json',
            ...CORS_HEADERS
          }
        });
      }

      // Parse likes array
      const likes = JSON.parse(item.likes || '[]');
      const likeIndex = likes.indexOf(user.user_id);

      if (likeIndex > -1) {
        // Unlike - remove user_id from array
        likes.splice(likeIndex, 1);

        await env.DBA.prepare(
          'UPDATE gallery_items SET likes = ?, likes_count = ? WHERE id = ?'
        ).bind(JSON.stringify(likes), likes.length, itemId).run();

        return new Response(JSON.stringify({
          success: true,
          liked: false,
          message: 'Like removed',
          likes_count: likes.length
        }), {
          headers: {
            'Content-Type': 'application/json',
            ...CORS_HEADERS
          }
        });
      } else {
        // Like - add user_id to array
        likes.push(user.user_id);

        await env.DBA.prepare(
          'UPDATE gallery_items SET likes = ?, likes_count = ? WHERE id = ?'
        ).bind(JSON.stringify(likes), likes.length, itemId).run();

        return new Response(JSON.stringify({
          success: true,
          liked: true,
          message: 'Like added',
          likes_count: likes.length
        }), {
          headers: {
            'Content-Type': 'application/json',
            ...CORS_HEADERS
          }
        });
      }
    } catch (error) {
      console.error('Error toggling like:', error);
      return new Response(JSON.stringify({
        error: 'Failed to toggle like',
        details: error.message
      }), {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
          ...CORS_HEADERS
        }
      });
    }
  }

  return new Response(JSON.stringify({ error: 'Invalid endpoint' }), {
    status: 404,
    headers: {
      'Content-Type': 'application/json',
      ...CORS_HEADERS
    }
  });
}

// DELETE /api/gallery/:id - Delete item (owner or admin only)
async function handleDelete({ request, env, params }) {
  const path = params.path ? params.path.join('/') : '';

  if (!path) {
    return new Response(JSON.stringify({ error: 'Item ID required' }), {
      status: 400,
      headers: {
        'Content-Type': 'application/json',
        ...CORS_HEADERS
      }
    });
  }

  // Get auth token
  const authHeader = request.headers.get('Authorization');
  const token = authHeader?.replace('Bearer ', '');
  const user = await getUserFromToken(token, env);

  if (!user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: {
        'Content-Type': 'application/json',
        ...CORS_HEADERS
      }
    });
  }

  const itemId = path;

  // Get item to check ownership
  const item = await env.DBA.prepare(
    'SELECT user_id, media_url FROM gallery_items WHERE id = ?'
  ).bind(itemId).first();

  if (!item) {
    return new Response(JSON.stringify({ error: 'Item not found' }), {
      status: 404,
      headers: {
        'Content-Type': 'application/json',
        ...CORS_HEADERS
      }
    });
  }

  // Check if user is owner or admin
  if (item.user_id !== user.user_id && !isAdmin(user)) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 403,
      headers: {
        'Content-Type': 'application/json',
        ...CORS_HEADERS
      }
    });
  }

  // Delete from database
  await env.DBA.prepare('DELETE FROM gallery_items WHERE id = ?').bind(itemId).run();

  // Delete from Cloudflare Images or Stream
  const accountId = env.CLOUDFLARE_ACCOUNT_ID;
  const apiToken = env.CLOUDFLARE_STREAM_TOKEN;
  
  if (accountId && apiToken && item.media_url) {
    try {
      // Check if it's a Cloudflare Images URL
      if (item.media_url.includes('imagedelivery.net')) {
        // Extract image ID from URL (format: .../imagedelivery.net/{account_hash}/{image_id}/...)
        const parts = item.media_url.split('/');
        const imageId = parts[parts.length - 2]; // Second to last segment
        if (imageId && imageId.startsWith('gallery-')) {
          await fetch(
            `https://api.cloudflare.com/client/v4/accounts/${accountId}/images/v1/${imageId}`,
            {
              method: 'DELETE',
              headers: { Authorization: `Bearer ${apiToken}` }
            }
          );
          console.log(`Deleted image: ${imageId}`);
        }
      }
      // Check if it's a Cloudflare Stream URL
      else if (item.media_url.includes('videodelivery.net') || item.media_url.includes('cloudflarestream.com')) {
        // Extract stream UID from URL
        const streamToken = env.CLOUDFLARE_STREAM_TOKEN || apiToken;
        const parts = item.media_url.split('/');
        // Try to find the UID (usually after videodelivery.net/)
        const uidIndex = parts.findIndex(p => p.includes('videodelivery.net') || p.includes('cloudflarestream.com'));
        const streamUid = uidIndex >= 0 ? parts[uidIndex + 1] : null;
        if (streamUid) {
          await fetch(
            `https://api.cloudflare.com/client/v4/accounts/${accountId}/stream/${streamUid}`,
            {
              method: 'DELETE',
              headers: { Authorization: `Bearer ${streamToken}` }
            }
          );
          console.log(`Deleted video: ${streamUid}`);
        }
      }
    } catch (err) {
      console.error('Failed to delete from Cloudflare:', err);
    }
  }

  return new Response(JSON.stringify({
    success: true,
    message: 'Item deleted successfully'
  }), {
    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS }
  });
}

export async function onRequestGet(context) {
  return handleGet(context);
}

export async function onRequestPost(context) {
  return handlePost(context);
}

export async function onRequestDelete(context) {
  return handleDelete(context);
}

export async function onRequestOptions(context) {
  return new Response(null, {
    status: 204,
    headers: CORS_HEADERS
  });
}