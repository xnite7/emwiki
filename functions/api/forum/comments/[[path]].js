// Forum Comments API - Handles forum comment operations

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

// Helper to get like count for comments
async function getLikeCount(commentId, env) {
  const result = await env.DBA.prepare(
    'SELECT COUNT(*) as count FROM forum_likes WHERE comment_id = ?'
  ).bind(commentId).first();

  return result?.count || 0;
}

// POST /api/forum/comments
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

  // POST /api/forum/comments/:id/like - Toggle like on comment
  if (path.endsWith('/like')) {
    const commentId = parseInt(path.split('/')[0]);

    // Check if already liked
    const existingLike = await env.DBA.prepare(
      'SELECT id FROM forum_likes WHERE comment_id = ? AND user_id = ?'
    ).bind(commentId, user.user_id).first();

    if (existingLike) {
      // Unlike
      await env.DBA.prepare(
        'DELETE FROM forum_likes WHERE comment_id = ? AND user_id = ?'
      ).bind(commentId, user.user_id).run();

      const likeCount = await getLikeCount(commentId, env);

      return new Response(JSON.stringify({
        liked: false,
        like_count: likeCount
      }), {
        headers: { 'Content-Type': 'application/json' }
      });
    } else {
      // Like
      await env.DBA.prepare(
        'INSERT INTO forum_likes (user_id, comment_id, created_at) VALUES (?, ?, ?)'
      ).bind(user.user_id, commentId, Math.floor(Date.now() / 1000)).run();

      const likeCount = await getLikeCount(commentId, env);

      return new Response(JSON.stringify({
        liked: true,
        like_count: likeCount
      }), {
        headers: { 'Content-Type': 'application/json' }
      });
    }
  }

  // POST /api/forum/comments - Create new comment
  try {
    const data = await request.json();
    const { post_id, content, parent_comment_id } = data;

    if (!post_id || !content) {
      return new Response(JSON.stringify({
        error: 'Missing required fields: post_id, content'
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Check if post exists and is not locked
    const post = await env.DBA.prepare(
      'SELECT * FROM forum_posts WHERE id = ? AND status = "active"'
    ).bind(post_id).first();

    if (!post) {
      return new Response(JSON.stringify({
        error: 'Post not found or has been deleted'
      }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    if (post.is_locked) {
      return new Response(JSON.stringify({
        error: 'This post is locked and cannot accept new comments'
      }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    if (content.length > 2000) {
      return new Response(JSON.stringify({
        error: 'Comment too long (max 2000 characters)'
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Insert comment
    const result = await env.DBA.prepare(
      `INSERT INTO forum_comments (post_id, user_id, username, content, parent_comment_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).bind(
      post_id,
      user.user_id,
      user.display_name || user.username,
      content,
      parent_comment_id || null,
      Math.floor(Date.now() / 1000)
    ).run();

    const commentId = result.meta.last_row_id;

    // Get the created comment with user role
    const comment = await env.DBA.prepare(
      `SELECT c.*, u.role, u.avatar_url,
              COALESCE(u.display_name, u.username, c.username) as username,
              CAST(c.user_id AS INTEGER) as user_id
       FROM forum_comments c
       LEFT JOIN users u ON c.user_id = u.user_id
       WHERE c.id = ?`
    ).bind(commentId).first();

    // Add like count
    comment.like_count = 0;
    comment.user_has_liked = false;

    return new Response(JSON.stringify({
      success: true,
      comment,
      message: 'Comment posted successfully!'
    }), {
      status: 201,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: 'Failed to create comment: ' + err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

// PUT /api/forum/comments/:id
async function handlePut({ request, env, params }) {
  const path = params.path ? params.path.join('/') : '';
  const commentId = parseInt(path);

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

  // Get comment to check ownership
  const comment = await env.DBA.prepare(
    'SELECT * FROM forum_comments WHERE id = ?'
  ).bind(commentId).first();

  if (!comment) {
    return new Response(JSON.stringify({ error: 'Comment not found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  // Check if user is the author or admin
  if (comment.user_id !== user.user_id && !isAdmin(user)) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  try {
    const data = await request.json();
    const { content } = data;

    if (!content) {
      return new Response(JSON.stringify({
        error: 'Missing required field: content'
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Update comment
    await env.DBA.prepare(
      `UPDATE forum_comments
       SET content = ?, edited_at = ?
       WHERE id = ?`
    ).bind(content, Math.floor(Date.now() / 1000), commentId).run();

    return new Response(JSON.stringify({
      success: true,
      message: 'Comment updated successfully!'
    }), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: 'Failed to update comment: ' + err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

// DELETE /api/forum/comments/:id
async function handleDelete({ request, env, params }) {
  const path = params.path ? params.path.join('/') : '';
  const commentId = parseInt(path);

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

  // Get comment to check ownership
  const comment = await env.DBA.prepare(
    'SELECT * FROM forum_comments WHERE id = ?'
  ).bind(commentId).first();

  if (!comment) {
    return new Response(JSON.stringify({ error: 'Comment not found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  // Check if user is the author or admin
  if (comment.user_id !== user.user_id && !isAdmin(user)) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  try {
    // Soft delete by setting status to 'deleted'
    await env.DBA.prepare(
      'UPDATE forum_comments SET status = "deleted" WHERE id = ?'
    ).bind(commentId).run();

    return new Response(JSON.stringify({
      success: true,
      message: 'Comment deleted successfully!'
    }), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: 'Failed to delete comment: ' + err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
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
