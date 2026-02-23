// Notifications API - Handles general notification CRUD

async function getUserFromToken(token, env) {
  if (!token) return null;
  const session = await env.DBA.prepare(
    'SELECT user_id FROM sessions WHERE token = ? AND expires_at > ?'
  ).bind(token, Date.now()).first();
  if (!session) return null;
  return await env.DBA.prepare(
    'SELECT user_id, username, display_name, role FROM users WHERE user_id = ?'
  ).bind(session.user_id).first();
}

export async function createNotification(env, userId, type, title, message, link = null) {
  await env.DBA.prepare(
    'INSERT INTO notifications (user_id, type, title, message, link, created_at) VALUES (?, ?, ?, ?, ?, ?)'
  ).bind(userId, type, title, message, link, Math.floor(Date.now() / 1000)).run();
}

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}

export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const path = url.pathname.split('/api/notifications/').filter(Boolean)[0] || '';

  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };

  if (request.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = request.headers.get('Authorization');
    const token = authHeader?.replace('Bearer ', '');
    const user = await getUserFromToken(token, env);

    if (!user) {
      const res = jsonResponse({ error: 'Unauthorized' }, 401);
      const headers = new Headers(res.headers);
      Object.entries(corsHeaders).forEach(([k, v]) => headers.set(k, v));
      return new Response(res.body, { status: res.status, headers });
    }

    let response;

    if (request.method === 'GET') {
      // GET /api/notifications/unread-count
      if (path === 'unread-count') {
        const result = await env.DBA.prepare(
          'SELECT COUNT(*) as count FROM notifications WHERE user_id = ? AND read = 0'
        ).bind(user.user_id).first();
        response = jsonResponse({ unread_count: result.count });

      // GET /api/notifications - List notifications
      } else if (!path || path === '') {
        const limit = Math.min(parseInt(url.searchParams.get('limit') || '50'), 100);
        const offset = parseInt(url.searchParams.get('offset') || '0');
        const unreadOnly = url.searchParams.get('unread_only') === 'true';

        let query = 'SELECT * FROM notifications WHERE user_id = ?';
        const bindings = [user.user_id];
        if (unreadOnly) query += ' AND read = 0';
        query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
        bindings.push(limit, offset);

        const { results: notifications } = await env.DBA.prepare(query).bind(...bindings).all();
        response = jsonResponse({ notifications, limit, offset });

      } else {
        response = jsonResponse({ error: 'Not found' }, 404);
      }

    } else if (request.method === 'POST') {
      // POST /api/notifications/read-all
      if (path === 'read-all') {
        await env.DBA.prepare(
          'UPDATE notifications SET read = 1 WHERE user_id = ? AND read = 0'
        ).bind(user.user_id).run();
        response = jsonResponse({ message: 'All notifications marked as read' });

      // POST /api/notifications/:id/read
      } else if (path.endsWith('/read')) {
        const notifId = parseInt(path.split('/')[0]);
        const notif = await env.DBA.prepare(
          'SELECT * FROM notifications WHERE id = ? AND user_id = ?'
        ).bind(notifId, user.user_id).first();
        if (!notif) {
          response = jsonResponse({ error: 'Notification not found' }, 404);
        } else {
          await env.DBA.prepare('UPDATE notifications SET read = 1 WHERE id = ?').bind(notifId).run();
          response = jsonResponse({ message: 'Notification marked as read' });
        }

      } else {
        response = jsonResponse({ error: 'Invalid request' }, 400);
      }

    } else if (request.method === 'DELETE') {
      const notifId = parseInt(path.split('/')[0]);
      if (!notifId) {
        response = jsonResponse({ error: 'Notification ID required' }, 400);
      } else {
        const notif = await env.DBA.prepare(
          'SELECT * FROM notifications WHERE id = ? AND user_id = ?'
        ).bind(notifId, user.user_id).first();
        if (!notif) {
          response = jsonResponse({ error: 'Notification not found' }, 404);
        } else {
          await env.DBA.prepare('DELETE FROM notifications WHERE id = ?').bind(notifId).run();
          response = jsonResponse({ message: 'Notification deleted' });
        }
      }

    } else {
      response = jsonResponse({ error: 'Method not allowed' }, 405);
    }

    const headers = new Headers(response.headers);
    Object.entries(corsHeaders).forEach(([k, v]) => headers.set(k, v));
    return new Response(response.body, { status: response.status, headers });

  } catch (error) {
    console.error('Notifications error:', error);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
}
