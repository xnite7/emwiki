// Forum Posts API - Handles forum post CRUD operations
import { verifySession } from '../../_utils/auth.js';

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

// Check if user is admin or moderator
function isAdmin(user) {
  if (!user || !user.role) return false;
  try {
    const roles = JSON.parse(user.role);
    return roles.includes('admin') || roles.includes('moderator');
  } catch {
    return false;
  }
}

// Helper to get comment count for posts
async function getCommentCount(postId, env) {
  const result = await env.DBA.prepare(
    'SELECT COUNT(*) as count FROM forum_comments WHERE post_id = ? AND status = "active"'
  ).bind(postId).first();

  return result?.count || 0;
}

// Helper to get like count for posts
async function getLikeCount(postId, env) {
  const result = await env.DBA.prepare(
    'SELECT COUNT(*) as count FROM forum_likes WHERE post_id = ?'
  ).bind(postId).first();

  return result?.count || 0;
}

// Helper to check if user liked a post
async function hasUserLiked(postId, userId, env) {
  if (!userId) return false;

  const result = await env.DBA.prepare(
    'SELECT id FROM forum_likes WHERE post_id = ? AND user_id = ?'
  ).bind(postId, userId).first();

  return !!result;
}

// GET /api/forum/posts
async function handleGet({ request, env, params }) {
  const url = new URL(request.url);
  const path = params.path ? params.path.join('/') : '';

  // Get auth token (optional for GET)
  const authHeader = request.headers.get('Authorization');
  const token = authHeader?.replace('Bearer ', '');
  const user = token ? await getUserFromToken(token, env) : null;

  // GET /api/forum/posts/:id - Get single post with comments
  if (path && path !== '' && !path.includes('/')) {
    const postId = parseInt(path);

    // Get post
    const post = await env.DBA.prepare(
      `SELECT p.*, u.role, u.avatar_url,
              COALESCE(u.display_name, u.username, p.username) as username,
              CAST(p.user_id AS INTEGER) as user_id
       FROM forum_posts p
       LEFT JOIN users u ON p.user_id = u.user_id
       WHERE p.id = ? AND p.status = 'active'`
    ).bind(postId).first();

    if (!post) {
      return new Response(JSON.stringify({ error: 'Post not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Get comments for this post
    const comments = await env.DBA.prepare(
      `SELECT c.*, u.role, u.avatar_url,
              COALESCE(u.display_name, u.username, c.username) as username,
              CAST(c.user_id AS INTEGER) as user_id
       FROM forum_comments c
       LEFT JOIN users u ON c.user_id = u.user_id
       WHERE c.post_id = ? AND c.status = 'active'
       ORDER BY c.created_at ASC`
    ).bind(postId).all();

    // Add like counts and user liked status
    post.like_count = await getLikeCount(postId, env);
    post.user_has_liked = await hasUserLiked(postId, user?.user_id, env);

    // Add like counts to comments
    for (const comment of comments.results || []) {
      comment.like_count = await getLikeCount(null, env, comment.id);
      comment.user_has_liked = await hasUserLikedComment(comment.id, user?.user_id, env);
    }

    return new Response(JSON.stringify({
      post,
      comments: comments.results || []
    }), {
      headers: { 'Content-Type': 'application/json' }
    });
  }

  // GET /api/forum/posts - List all posts
  const category = url.searchParams.get('category');
  const limit = parseInt(url.searchParams.get('limit')) || 100;
  const offset = parseInt(url.searchParams.get('offset')) || 0;

  let query = `
    SELECT p.*, u.role, u.avatar_url,
           COALESCE(u.display_name, u.username, p.username) as username,
           CAST(p.user_id AS INTEGER) as user_id
    FROM forum_posts p
    LEFT JOIN users u ON p.user_id = u.user_id
    WHERE p.status = 'active'
  `;

  const params_list = [];

  if (category && category !== 'all') {
    query += ' AND p.category = ?';
    params_list.push(category);
  }

  query += ' ORDER BY p.is_pinned DESC, p.created_at DESC LIMIT ? OFFSET ?';
  params_list.push(limit, offset);

  const posts = await env.DBA.prepare(query).bind(...params_list).all();

  // Add comment counts and like counts to each post
  for (const post of posts.results || []) {
    post.comment_count = await getCommentCount(post.id, env);
    post.like_count = await getLikeCount(post.id, env);
    post.user_has_liked = await hasUserLiked(post.id, user?.user_id, env);
  }

  return new Response(JSON.stringify({ posts: posts.results || [] }), {
    headers: { 'Content-Type': 'application/json' }
  });
}

// POST /api/forum/posts
async function handlePost({ request, env, params }) {
  const path = params.path ? params.path.join('/') : '';

  // POST /api/forum/posts/:id/view - Increment view count (no auth required)
  if (path.endsWith('/view')) {
    const postId = parseInt(path.split('/')[0]);
    if (postId) {
      await env.DBA.prepare(
        'UPDATE forum_posts SET views = views + 1 WHERE id = ?'
      ).bind(postId).run();
    }
    return new Response(JSON.stringify({ success: true }), {
      headers: { 'Content-Type': 'application/json' }
    });
  }

  // Get auth token (required for all other POST endpoints)
  const authHeader = request.headers.get('Authorization');
  const token = authHeader?.replace('Bearer ', '');
  const user = await getUserFromToken(token, env);

  if (!user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  // POST /api/forum/posts/:id/like - Toggle like on post
  if (path.endsWith('/like')) {
    const postId = parseInt(path.split('/')[0]);

    // Check if already liked
    const existingLike = await env.DBA.prepare(
      'SELECT id FROM forum_likes WHERE post_id = ? AND user_id = ?'
    ).bind(postId, user.user_id).first();

    if (existingLike) {
      // Unlike
      await env.DBA.prepare(
        'DELETE FROM forum_likes WHERE post_id = ? AND user_id = ?'
      ).bind(postId, user.user_id).run();

      const likeCount = await getLikeCount(postId, env);

      return new Response(JSON.stringify({
        liked: false,
        like_count: likeCount
      }), {
        headers: { 'Content-Type': 'application/json' }
      });
    } else {
      // Like
      await env.DBA.prepare(
        'INSERT INTO forum_likes (user_id, post_id, created_at) VALUES (?, ?, ?)'
      ).bind(user.user_id, postId, Math.floor(Date.now() / 1000)).run();

      const likeCount = await getLikeCount(postId, env);

      return new Response(JSON.stringify({
        liked: true,
        like_count: likeCount
      }), {
        headers: { 'Content-Type': 'application/json' }
      });
    }
  }

  // POST /api/forum/posts/upload - Upload image for forum content
  if (path === 'upload') {
    try {
      const formData = await request.formData();
      const file = formData.get('file');

      if (!file) {
        return new Response(JSON.stringify({ error: 'No file provided' }), {
          status: 400, headers: { 'Content-Type': 'application/json' }
        });
      }

      const validTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
      if (!validTypes.includes(file.type)) {
        return new Response(JSON.stringify({ error: 'Only JPEG, PNG, GIF, and WebP images are allowed' }), {
          status: 400, headers: { 'Content-Type': 'application/json' }
        });
      }

      if (file.size > 5 * 1024 * 1024) {
        return new Response(JSON.stringify({ error: 'Image must be under 5 MB' }), {
          status: 400, headers: { 'Content-Type': 'application/json' }
        });
      }

      const accountId = env.CLOUDFLARE_ACCOUNT_ID;
      const apiToken = env.CLOUDFLARE_STREAM_TOKEN;

      if (!accountId || !apiToken) {
        return new Response(JSON.stringify({ error: 'Image hosting not configured' }), {
          status: 500, headers: { 'Content-Type': 'application/json' }
        });
      }

      const customId = `forum-${user.user_id}-${Date.now()}-${Math.random().toString(36).substring(7)}`;
      const uploadForm = new FormData();
      uploadForm.append('file', file, file.name);
      uploadForm.append('id', customId);

      const uploadRes = await fetch(
        `https://api.cloudflare.com/client/v4/accounts/${accountId}/images/v1`,
        { method: 'POST', headers: { Authorization: `Bearer ${apiToken}` }, body: uploadForm }
      );

      if (!uploadRes.ok) throw new Error('Image upload failed');

      const result = await uploadRes.json();
      if (!result.success) throw new Error(result.errors?.[0]?.message || 'Upload failed');

      return new Response(JSON.stringify({ url: result.result.variants[0] }), {
        headers: { 'Content-Type': 'application/json' }
      });
    } catch (err) {
      return new Response(JSON.stringify({ error: err.message || 'Upload failed' }), {
        status: 500, headers: { 'Content-Type': 'application/json' }
      });
    }
  }

  // POST /api/forum/posts - Create new post
  try {
    const data = await request.json();
    const { category, title, content, attached_items } = data;

    if (!category || !title || !content) {
      return new Response(JSON.stringify({
        error: 'Missing required fields: category, title, content'
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const validCategories = ['general', 'trading', 'updates', 'guides', 'feedback', 'off-topic'];
    if (!validCategories.includes(category)) {
      return new Response(JSON.stringify({
        error: 'Invalid category'
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    if (title.length > 200) {
      return new Response(JSON.stringify({
        error: 'Title too long (max 200 characters)'
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    if (content.length > 5000) {
      return new Response(JSON.stringify({
        error: 'Content too long (max 5000 characters)'
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Validate attached_items (optional, max 10 items)
    let itemsJson = null;
    if (attached_items && Array.isArray(attached_items)) {
      const sanitized = attached_items.filter(n => typeof n === 'string').slice(0, 10);
      if (sanitized.length > 0) itemsJson = JSON.stringify(sanitized);
    }

    // Insert post
    const result = await env.DBA.prepare(
      `INSERT INTO forum_posts (user_id, username, title, content, category, attached_items, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      user.user_id,
      user.display_name || user.username,
      title,
      content,
      category,
      itemsJson,
      Math.floor(Date.now() / 1000)
    ).run();

    const postId = result.meta.last_row_id;

    // Get the created post
    const post = await env.DBA.prepare(
      'SELECT * FROM forum_posts WHERE id = ?'
    ).bind(postId).first();

    return new Response(JSON.stringify({
      success: true,
      post,
      message: 'Post created successfully!'
    }), {
      status: 201,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: 'Failed to create post: ' + err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

// PUT /api/forum/posts/:id
async function handlePut({ request, env, params }) {
  const path = params.path ? params.path.join('/') : '';
  const postId = parseInt(path);

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

  // Get post to check ownership
  const post = await env.DBA.prepare(
    'SELECT * FROM forum_posts WHERE id = ?'
  ).bind(postId).first();

  if (!post) {
    return new Response(JSON.stringify({ error: 'Post not found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  // Check if user is the author or admin
  if (post.user_id !== user.user_id && !isAdmin(user)) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  try {
    const data = await request.json();

    // Admin-only: toggle pin/lock without requiring title/content
    if (isAdmin(user) && (data.is_pinned !== undefined || data.is_locked !== undefined)) {
      if (data.is_pinned !== undefined) {
        await env.DBA.prepare('UPDATE forum_posts SET is_pinned = ? WHERE id = ?')
          .bind(data.is_pinned ? 1 : 0, postId).run();
      }
      if (data.is_locked !== undefined) {
        await env.DBA.prepare('UPDATE forum_posts SET is_locked = ? WHERE id = ?')
          .bind(data.is_locked ? 1 : 0, postId).run();
      }
      if (!data.title && !data.content) {
        return new Response(JSON.stringify({
          success: true,
          message: 'Post updated successfully!'
        }), {
          headers: { 'Content-Type': 'application/json' }
        });
      }
    }

    const { title, content, attached_items } = data;

    if (!title || !content) {
      return new Response(JSON.stringify({
        error: 'Missing required fields: title, content'
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    let itemsJson = null;
    if (attached_items && Array.isArray(attached_items)) {
      const sanitized = attached_items.filter(n => typeof n === 'string').slice(0, 10);
      if (sanitized.length > 0) itemsJson = JSON.stringify(sanitized);
    }

    await env.DBA.prepare(
      `UPDATE forum_posts
       SET title = ?, content = ?, attached_items = ?, edited_at = ?
       WHERE id = ?`
    ).bind(title, content, itemsJson, Math.floor(Date.now() / 1000), postId).run();

    return new Response(JSON.stringify({
      success: true,
      message: 'Post updated successfully!'
    }), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: 'Failed to update post: ' + err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

// DELETE /api/forum/posts/:id
async function handleDelete({ request, env, params }) {
  const path = params.path ? params.path.join('/') : '';
  const postId = parseInt(path);

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

  // Get post to check ownership
  const post = await env.DBA.prepare(
    'SELECT * FROM forum_posts WHERE id = ?'
  ).bind(postId).first();

  if (!post) {
    return new Response(JSON.stringify({ error: 'Post not found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  // Check if user is the author or admin
  if (post.user_id !== user.user_id && !isAdmin(user)) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  try {
    // Soft delete by setting status to 'deleted'
    await env.DBA.prepare(
      'UPDATE forum_posts SET status = "deleted" WHERE id = ?'
    ).bind(postId).run();

    return new Response(JSON.stringify({
      success: true,
      message: 'Post deleted successfully!'
    }), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: 'Failed to delete post: ' + err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

// Helper for comment likes
async function hasUserLikedComment(commentId, userId, env) {
  if (!userId) return false;

  const result = await env.DBA.prepare(
    'SELECT id FROM forum_likes WHERE comment_id = ? AND user_id = ?'
  ).bind(commentId, userId).first();

  return !!result;
}

// Main request handler
export async function onRequest(context) {
  const { request, env, params } = context;

  // CORS headers
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };

  // Handle OPTIONS request
  if (request.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    let response;

    switch (request.method) {
      case 'GET':
        response = await handleGet({ request, env, params });
        break;
      case 'POST':
        response = await handlePost({ request, env, params });
        break;
      case 'PUT':
        response = await handlePut({ request, env, params });
        break;
      case 'DELETE':
        response = await handleDelete({ request, env, params });
        break;
      default:
        response = new Response(JSON.stringify({ error: 'Method not allowed' }), {
          status: 405,
          headers: { 'Content-Type': 'application/json' }
        });
    }

    // Add CORS headers to response
    const newHeaders = new Headers(response.headers);
    Object.entries(corsHeaders).forEach(([key, value]) => {
      newHeaders.set(key, value);
    });

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: newHeaders
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
}
