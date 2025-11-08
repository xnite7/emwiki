// Gallery API - Handles media submissions and moderation
import { verifySession } from '../_utils/auth.js';

// CORS headers helper
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Max-Age': '86400',
};

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

  // Get auth token
  const authHeader = request.headers.get('Authorization');
  const token = authHeader?.replace('Bearer ', '');
  const user = token ? await getUserFromToken(token, env) : null;

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
      `SELECT g.id, g.user_id, g.username, g.title, g.description, g.media_url, g.thumbnail_url, g.media_type,
              g.status, g.created_at, g.views, u.avatar_url, u.role
       FROM gallery_items g
       LEFT JOIN users u ON g.user_id = u.user_id
       WHERE g.status = 'pending'
       ORDER BY g.created_at DESC`
    ).all();

    return new Response(JSON.stringify({ items: items.results || [] }), {
      headers: {
        'Content-Type': 'application/json',
        ...CORS_HEADERS
      }
    });
  }

  // GET /api/gallery/my-submissions - Get user's own submissions
  if (path === 'my-submissions') {
    if (!user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json',
        ...CORS_HEADERS }
      });
    }

    let items;
    try {
      items = await env.DBA.prepare(
        `SELECT g.id, g.title, g.description, g.media_url, g.thumbnail_url, g.media_type, g.status,
                g.created_at, g.views, g.rejection_reason, u.avatar_url, u.role,
                COUNT(gl.id) as likes_count
         FROM gallery_items g
         LEFT JOIN gallery_likes gl ON g.id = gl.gallery_item_id
         LEFT JOIN users u ON g.user_id = u.user_id
         WHERE g.user_id = ?
         GROUP BY g.id
         ORDER BY g.created_at DESC`
      ).bind(user.user_id).all();
    } catch (error) {
      // Fallback without likes
      console.error('Error querying submissions with likes, falling back:', error);
      items = await env.DBA.prepare(
        `SELECT g.id, g.title, g.description, g.media_url, g.thumbnail_url, g.media_type, g.status,
                g.created_at, g.views, g.rejection_reason, u.avatar_url, u.role,
                0 as likes_count
         FROM gallery_items g
         LEFT JOIN users u ON g.user_id = u.user_id
         WHERE g.user_id = ?
         ORDER BY g.created_at DESC`
      ).bind(user.user_id).all();
    }

    return new Response(JSON.stringify({ items: items.results || [] }), {
      headers: { 'Content-Type': 'application/json',
        ...CORS_HEADERS }
    });
  }

  // GET /api/gallery/:id - Get single gallery item and increment views
  if (path && path.match(/^\d+$/)) {
    const itemId = path;

    try {
      // Increment view count
      await env.DBA.prepare(
        'UPDATE gallery_items SET views = views + 1 WHERE id = ? AND status = ?'
      ).bind(itemId, 'approved').run();

      // Get item with likes
      let item;
      try {
        item = await env.DBA.prepare(
          `SELECT g.id, g.user_id, g.username, g.title, g.description, g.media_url, g.thumbnail_url, g.media_type,
                  g.created_at, g.views, u.avatar_url, u.role,
                  COUNT(gl.id) as likes_count,
                  CASE WHEN ? IS NOT NULL AND ugl.id IS NOT NULL THEN 1 ELSE 0 END as user_liked
           FROM gallery_items g
           LEFT JOIN gallery_likes gl ON g.id = gl.gallery_item_id
           LEFT JOIN gallery_likes ugl ON g.id = ugl.gallery_item_id AND ugl.user_id = ?
           LEFT JOIN users u ON g.user_id = u.user_id
           WHERE g.id = ? AND g.status = 'approved'
           GROUP BY g.id`
        ).bind(user?.user_id || null, user?.user_id || null, itemId).first();
      } catch (error) {
        // Fallback without likes
        item = await env.DBA.prepare(
          `SELECT g.id, g.user_id, g.username, g.title, g.description, g.media_url, g.thumbnail_url, g.media_type,
                  g.created_at, g.views, u.avatar_url, u.role,
                  0 as likes_count,
                  0 as user_liked
           FROM gallery_items g
           LEFT JOIN users u ON g.user_id = u.user_id
           WHERE g.id = ? AND g.status = 'approved'`
        ).bind(itemId).first();
      }

      if (!item) {
        return new Response(JSON.stringify({ error: 'Item not found' }), {
          status: 404,
          headers: { 'Content-Type': 'application/json',
        ...CORS_HEADERS }
        });
      }

      return new Response(JSON.stringify({ item }), {
        headers: { 'Content-Type': 'application/json',
        ...CORS_HEADERS }
      });
    } catch (error) {
      console.error('Error fetching gallery item:', error);
      return new Response(JSON.stringify({ error: 'Failed to fetch item' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json',
        ...CORS_HEADERS }
      });
    }
  }

  // GET /api/gallery - Get approved items (public)
  const limit = parseInt(url.searchParams.get('limit')) || 50;
  const offset = parseInt(url.searchParams.get('offset')) || 0;
  const sortBy = url.searchParams.get('sort') || 'likes'; // 'likes' or 'newest'

  let items;
  let total = 0;

  try {
    // Get total count of approved items
    const countResult = await env.DBA.prepare(
      'SELECT COUNT(*) as total FROM gallery_items WHERE status = ?'
    ).bind('approved').first();
    total = countResult?.total || 0;

    // Try to query with likes (requires gallery_likes table to exist)
    items = await env.DBA.prepare(
      `SELECT g.id, g.user_id, g.username, g.title, g.description, g.media_url, g.thumbnail_url, g.media_type,
              g.created_at, g.views, u.avatar_url, u.role,
              COUNT(gl.id) as likes_count,
              CASE WHEN ? IS NOT NULL AND ugl.id IS NOT NULL THEN 1 ELSE 0 END as user_liked
       FROM gallery_items g
       LEFT JOIN gallery_likes gl ON g.id = gl.gallery_item_id
       LEFT JOIN gallery_likes ugl ON g.id = ugl.gallery_item_id AND ugl.user_id = ?
       LEFT JOIN users u ON g.user_id = u.user_id
       WHERE g.status = 'approved'
       GROUP BY g.id
       ORDER BY ${sortBy === 'newest' ? 'g.created_at DESC' : 'COUNT(gl.id) DESC, g.created_at DESC'}
       LIMIT ? OFFSET ?`
    ).bind(user?.user_id || null, user?.user_id || null, limit, offset).all();
  } catch (error) {
    // Fallback query without likes (for when gallery_likes table doesn't exist yet)
    console.error('Error querying with likes, falling back to simple query:', error);

    items = await env.DBA.prepare(
      `SELECT g.id, g.user_id, g.username, g.title, g.description, g.media_url, g.thumbnail_url, g.media_type,
              g.created_at, g.views, u.avatar_url, u.role,
              0 as likes_count,
              0 as user_liked
       FROM gallery_items g
       LEFT JOIN users u ON g.user_id = u.user_id
       WHERE g.status = 'approved'
       ORDER BY g.created_at DESC
       LIMIT ? OFFSET ?`
    ).bind(limit, offset).all();
  }

  return new Response(JSON.stringify({ items: items.results || [], total }), {
    headers: { 'Content-Type': 'application/json',
        ...CORS_HEADERS }
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
      headers: { 'Content-Type': 'application/json',
        ...CORS_HEADERS }
    });
  }

  // POST /api/gallery/upload - Upload media file
  if (path === 'upload') {
    try {
      const formData = await request.formData();
      const file = formData.get('file');

      if (!file) {
        return new Response(JSON.stringify({ error: 'No file uploaded' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json',
        ...CORS_HEADERS }
        });
      }

      // Validate file type
      const validImageTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
      const validVideoTypes = ['video/mp4', 'video/webm', 'video/quicktime'];
      const validTypes = [...validImageTypes, ...validVideoTypes];

      if (!validTypes.includes(file.type)) {
        return new Response(JSON.stringify({
          error: 'Invalid file type. Only images (JPEG, PNG, GIF, WebP) and videos (MP4, WebM, MOV) are allowed.'
        }), {
          status: 400,
          headers: { 'Content-Type': 'application/json',
        ...CORS_HEADERS }
        });
      }

      // Validate file size (max 100MB)
      if (file.size > 100 * 1024 * 1024) {
        return new Response(JSON.stringify({
          error: 'File too large. Maximum size is 100MB.'
        }), {
          status: 400,
          headers: { 'Content-Type': 'application/json',
        ...CORS_HEADERS }
        });
      }

      // Generate unique key for R2
      const ext = file.name.split('.').pop();
      const key = `gallery/${user.user_id}/${Date.now()}-${Math.random().toString(36).substring(7)}.${ext}`;

      // Upload to R2
      await env.MY_BUCKET.put(key, await file.arrayBuffer(), {
        httpMetadata: { contentType: file.type }
      });

      const url = `https://cdn.emwiki.com/${key}`;

      return new Response(JSON.stringify({ url, type: file.type }), {
        headers: { 'Content-Type': 'application/json',
        ...CORS_HEADERS }
      });
    } catch (err) {
      return new Response(JSON.stringify({ error: 'Upload failed: ' + err.message }), {
        status: 500,
        headers: { 'Content-Type': 'application/json',
        ...CORS_HEADERS }
      });
    }
  }

  // POST /api/gallery/submit - Submit gallery item
  if (path === 'submit') {
    try {
      const data = await request.json();
      const { title, description, media_url, media_type, thumbnail_url } = data;

      if (!title || !media_url || !media_type) {
        return new Response(JSON.stringify({
          error: 'Missing required fields: title, media_url, media_type'
        }), {
          status: 400,
          headers: { 'Content-Type': 'application/json',
        ...CORS_HEADERS }
        });
      }

      if (!['image', 'video'].includes(media_type)) {
        return new Response(JSON.stringify({
          error: 'Invalid media_type. Must be "image" or "video"'
        }), {
          status: 400,
          headers: { 'Content-Type': 'application/json',
        ...CORS_HEADERS }
        });
      }

      // Determine status based on user roles (VIP, admin, mod get auto-approved)
      const status = shouldAutoApprove(user) ? 'approved' : 'pending';
      const autoApproved = status === 'approved';

      // Insert into database with thumbnail_url
      const result = await env.DBA.prepare(
        `INSERT INTO gallery_items (user_id, username, title, description, media_url, media_type, thumbnail_url, status, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).bind(
        user.user_id,
        user.display_name || user.username,
        title,
        description || '',
        media_url,
        media_type,
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
        headers: { 'Content-Type': 'application/json',
        ...CORS_HEADERS }
      });
    } catch (err) {
      return new Response(JSON.stringify({ error: 'Submission failed: ' + err.message }), {
        status: 500,
        headers: { 'Content-Type': 'application/json',
        ...CORS_HEADERS }
      });
    }
  }

  // POST /api/gallery/backfill-thumbnails - Get videos without thumbnails (admin only)
  if (path === 'backfill-thumbnails') {
    if (!isAdmin(user)) {
      return new Response(JSON.stringify({ error: 'Unauthorized - Admin only' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json', ...CORS_HEADERS }
      });
    }

    try {
      // Get all approved videos without thumbnails
      const videos = await env.DBA.prepare(`
        SELECT id, title, media_url
        FROM gallery_items
        WHERE media_type = 'video'
          AND status = 'approved'
          AND (thumbnail_url IS NULL OR thumbnail_url = '')
        ORDER BY created_at DESC
        LIMIT 50
      `).all();

      return new Response(JSON.stringify({
        success: true,
        count: videos.results?.length || 0,
        videos: videos.results || []
      }), {
        headers: { 'Content-Type': 'application/json', ...CORS_HEADERS }
      });
    } catch (error) {
      return new Response(JSON.stringify({
        error: 'Failed to fetch videos',
        details: error.message
      }), {
        status: 500,
        headers: { 'Content-Type': 'application/json', ...CORS_HEADERS }
      });
    }
  }

  // POST /api/gallery/update-thumbnail/:id - Update thumbnail for existing video (admin only)
  if (path.startsWith('update-thumbnail/')) {
    const videoId = path.split('/')[1];

    if (!isAdmin(user)) {
      return new Response(JSON.stringify({ error: 'Unauthorized - Admin only' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json', ...CORS_HEADERS }
      });
    }

    try {
      const data = await request.json();
      const { thumbnail_url } = data;

      if (!thumbnail_url) {
        return new Response(JSON.stringify({ error: 'thumbnail_url required' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json', ...CORS_HEADERS }
        });
      }

      // Update thumbnail
      await env.DBA.prepare(
        'UPDATE gallery_items SET thumbnail_url = ? WHERE id = ? AND media_type = ?'
      ).bind(thumbnail_url, videoId, 'video').run();

      return new Response(JSON.stringify({
        success: true,
        message: 'Thumbnail updated successfully'
      }), {
        headers: { 'Content-Type': 'application/json', ...CORS_HEADERS }
      });
    } catch (error) {
      return new Response(JSON.stringify({
        error: 'Failed to update thumbnail',
        details: error.message
      }), {
        status: 500,
        headers: { 'Content-Type': 'application/json', ...CORS_HEADERS }
      });
    }
  }

  // POST /api/gallery/moderate/:id - Moderate item (admin only)
  if (path.startsWith('moderate/')) {
    if (!isAdmin(user)) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json',
        ...CORS_HEADERS }
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
        headers: { 'Content-Type': 'application/json',
        ...CORS_HEADERS }
      });
    }

    const status = action === 'approve' ? 'approved' : 'rejected';

    await env.DBA.prepare(
      `UPDATE gallery_items
       SET status = ?, moderated_by = ?, moderated_at = ?, rejection_reason = ?
       WHERE id = ?`
    ).bind(status, user.username, Date.now(), reason || null, itemId).run();

    return new Response(JSON.stringify({
      success: true,
      message: `Item ${action}d successfully`
    }), {
      headers: { 'Content-Type': 'application/json',
        ...CORS_HEADERS }
    });
  }

  // POST /api/gallery/like/:id - Toggle like on item
  if (path.startsWith('like/')) {
    const itemId = path.split('/')[1];

    try {
      // Check if item exists and is approved
      const item = await env.DBA.prepare(
        'SELECT id FROM gallery_items WHERE id = ? AND status = ?'
      ).bind(itemId, 'approved').first();

      if (!item) {
        return new Response(JSON.stringify({ error: 'Item not found or not approved' }), {
          status: 404,
          headers: { 'Content-Type': 'application/json',
        ...CORS_HEADERS }
        });
      }

      // Check if user already liked this item
      const existingLike = await env.DBA.prepare(
        'SELECT id FROM gallery_likes WHERE user_id = ? AND gallery_item_id = ?'
      ).bind(user.user_id, itemId).first();

      if (existingLike) {
        // Unlike - remove the like
        await env.DBA.prepare(
          'DELETE FROM gallery_likes WHERE user_id = ? AND gallery_item_id = ?'
        ).bind(user.user_id, itemId).run();

        return new Response(JSON.stringify({
          success: true,
          liked: false,
          message: 'Like removed'
        }), {
          headers: { 'Content-Type': 'application/json',
        ...CORS_HEADERS }
        });
      } else {
        // Like - add the like
        await env.DBA.prepare(
          'INSERT INTO gallery_likes (user_id, gallery_item_id, created_at) VALUES (?, ?, ?)'
        ).bind(user.user_id, itemId, Date.now()).run();

        return new Response(JSON.stringify({
          success: true,
          liked: true,
          message: 'Like added'
        }), {
          headers: { 'Content-Type': 'application/json',
        ...CORS_HEADERS }
        });
      }
    } catch (error) {
      console.error('Error toggling like:', error);
      return new Response(JSON.stringify({
        error: 'Likes feature not yet available. Please run the database migration first.',
        details: error.message
      }), {
        status: 503,
        headers: { 'Content-Type': 'application/json',
        ...CORS_HEADERS }
      });
    }
  }

  return new Response(JSON.stringify({ error: 'Invalid endpoint' }), {
    status: 404,
    headers: { 'Content-Type': 'application/json',
        ...CORS_HEADERS }
  });
}

// DELETE /api/gallery/:id - Delete item (owner or admin only)
async function handleDelete({ request, env, params }) {
  const path = params.path ? params.path.join('/') : '';

  if (!path) {
    return new Response(JSON.stringify({ error: 'Item ID required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json',
        ...CORS_HEADERS }
    });
  }

  // Get auth token
  const authHeader = request.headers.get('Authorization');
  const token = authHeader?.replace('Bearer ', '');
  const user = await getUserFromToken(token, env);

  if (!user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json',
        ...CORS_HEADERS }
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
      headers: { 'Content-Type': 'application/json',
        ...CORS_HEADERS }
    });
  }

  // Check if user is owner or admin
  if (item.user_id !== user.user_id && !isAdmin(user)) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json',
        ...CORS_HEADERS }
    });
  }

  // Delete from database
  await env.DBA.prepare('DELETE FROM gallery_items WHERE id = ?').bind(itemId).run();

  // Optionally delete from R2 (extract key from URL)
  try {
    const key = item.media_url.split('.r2.dev/')[1];
    if (key) {
      await env.MY_BUCKET.delete(key);
    }
  } catch (err) {
    console.error('Failed to delete R2 object:', err);
  }

  return new Response(JSON.stringify({
    success: true,
    message: 'Item deleted successfully'
  }), {
    headers: { 'Content-Type': 'application/json',
        ...CORS_HEADERS }
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