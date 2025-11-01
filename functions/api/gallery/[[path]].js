// Gallery API - Handles media submissions and moderation
import { verifySession } from '../_utils/auth.js';

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
    if (!user || !isAdmin(user)) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const items = await env.DBA.prepare(
      `SELECT id, user_id, username, title, description, media_url, media_type,
              status, created_at, views
       FROM gallery_items
       WHERE status = 'pending'
       ORDER BY created_at DESC`
    ).all();

    return new Response(JSON.stringify({ items: items.results || [] }), {
      headers: { 'Content-Type': 'application/json' }
    });
  }

  // GET /api/gallery/my-submissions - Get user's own submissions
  if (path === 'my-submissions') {
    if (!user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const items = await env.DBA.prepare(
      `SELECT id, title, description, media_url, media_type, status,
              created_at, views, rejection_reason
       FROM gallery_items
       WHERE user_id = ?
       ORDER BY created_at DESC`
    ).bind(user.user_id).all();

    return new Response(JSON.stringify({ items: items.results || [] }), {
      headers: { 'Content-Type': 'application/json' }
    });
  }

  // GET /api/gallery - Get approved items (public)
  const limit = parseInt(url.searchParams.get('limit')) || 50;
  const offset = parseInt(url.searchParams.get('offset')) || 0;

  const items = await env.DBA.prepare(
    `SELECT id, user_id, username, title, description, media_url, media_type,
            created_at, views
     FROM gallery_items
     WHERE status = 'approved'
     ORDER BY created_at DESC
     LIMIT ? OFFSET ?`
  ).bind(limit, offset).all();

  return new Response(JSON.stringify({ items: items.results || [] }), {
    headers: { 'Content-Type': 'application/json' }
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
      headers: { 'Content-Type': 'application/json' }
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
          headers: { 'Content-Type': 'application/json' }
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
          headers: { 'Content-Type': 'application/json' }
        });
      }

      // Validate file size (max 100MB)
      if (file.size > 100 * 1024 * 1024) {
        return new Response(JSON.stringify({
          error: 'File too large. Maximum size is 100MB.'
        }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
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
        headers: { 'Content-Type': 'application/json' }
      });
    } catch (err) {
      return new Response(JSON.stringify({ error: 'Upload failed: ' + err.message }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  }

  // POST /api/gallery/submit - Submit gallery item
  if (path === 'submit') {
    try {
      const data = await request.json();
      const { title, description, media_url, media_type } = data;

      if (!title || !media_url || !media_type) {
        return new Response(JSON.stringify({
          error: 'Missing required fields: title, media_url, media_type'
        }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      if (!['image', 'video'].includes(media_type)) {
        return new Response(JSON.stringify({
          error: 'Invalid media_type. Must be "image" or "video"'
        }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      // Insert into database
      const result = await env.DBA.prepare(
        `INSERT INTO gallery_items (user_id, username, title, description, media_url, media_type, status, created_at)
         VALUES (?, ?, ?, ?, ?, ?, 'pending', ?)`
      ).bind(
        user.user_id,
        user.display_name || user.username,
        title,
        description || '',
        media_url,
        media_type,
        Date.now()
      ).run();

      return new Response(JSON.stringify({
        success: true,
        id: result.meta.last_row_id,
        message: 'Submission received! It will be reviewed by admins before appearing in the gallery.'
      }), {
        headers: { 'Content-Type': 'application/json' }
      });
    } catch (err) {
      return new Response(JSON.stringify({ error: 'Submission failed: ' + err.message }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  }

  // POST /api/gallery/moderate/:id - Moderate item (admin only)
  if (path.startsWith('moderate/')) {
    if (!isAdmin(user)) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' }
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
        headers: { 'Content-Type': 'application/json' }
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
      headers: { 'Content-Type': 'application/json' }
    });
  }

  return new Response(JSON.stringify({ error: 'Invalid endpoint' }), {
    status: 404,
    headers: { 'Content-Type': 'application/json' }
  });
}

// DELETE /api/gallery/:id - Delete item (owner or admin only)
async function handleDelete({ request, env, params }) {
  const path = params.path ? params.path.join('/') : '';

  if (!path) {
    return new Response(JSON.stringify({ error: 'Item ID required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  // Get auth token
  const authHeader = request.headers.get('Authorization');
  const token = authHeader?.replace('Bearer ', '');
  const user = await getUserFromToken(token, env);

  if (!user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' }
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
      headers: { 'Content-Type': 'application/json' }
    });
  }

  // Check if user is owner or admin
  if (item.user_id !== user.user_id && !isAdmin(user)) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' }
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
    headers: { 'Content-Type': 'application/json' }
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
