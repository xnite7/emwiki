// Bulletin API - public homepage bulletin board notes, managed by admins
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Max-Age': '86400',
};

const MAX_CONTENT_LENGTH = 300;

function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS, ...extraHeaders },
  });
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

async function requireAdmin(request, env) {
  const authHeader = request.headers.get('Authorization');
  const token = authHeader?.replace('Bearer ', '').trim();
  const user = await getUserFromToken(token, env);
  if (!user || !isAdmin(user)) return null;
  return user;
}

export async function onRequest(context) {
  const { request, env, params } = context;
  const path = params.path ? params.path.join('/') : '';

  if (request.method === 'OPTIONS') {
    return new Response(null, { headers: CORS_HEADERS });
  }

  // GET /api/bulletin - List all bulletin notes (public)
  if (request.method === 'GET' && path === '') {
    const { results } = await env.DBA.prepare(
      'SELECT id, content, author, created_at FROM bulletin_notes ORDER BY id ASC'
    ).all();
    return json({ notes: results }, 200, { 'Cache-Control': 'public, max-age=60' });
  }

  // POST /api/bulletin - Add a note (admin only)
  if (request.method === 'POST' && path === '') {
    const user = await requireAdmin(request, env);
    if (!user) return json({ error: 'Unauthorized' }, 401);

    let body;
    try {
      body = await request.json();
    } catch {
      return json({ error: 'Invalid JSON body' }, 400);
    }

    const content = (body.content || '').trim();
    if (!content) return json({ error: 'Note content is required' }, 400);
    if (content.length > MAX_CONTENT_LENGTH) {
      return json({ error: `Note content must be ${MAX_CONTENT_LENGTH} characters or less` }, 400);
    }

    const author = user.display_name || user.username || 'admin';
    const result = await env.DBA.prepare(
      'INSERT INTO bulletin_notes (content, author, created_at) VALUES (?, ?, ?) RETURNING id, content, author, created_at'
    ).bind(content, author, Date.now()).first();

    return json({ note: result }, 201);
  }

  // DELETE /api/bulletin/:id - Remove a note (admin only)
  if (request.method === 'DELETE' && /^\d+$/.test(path)) {
    const user = await requireAdmin(request, env);
    if (!user) return json({ error: 'Unauthorized' }, 401);

    const { meta } = await env.DBA.prepare(
      'DELETE FROM bulletin_notes WHERE id = ?'
    ).bind(Number(path)).run();

    if (!meta.changes) return json({ error: 'Note not found' }, 404);
    return json({ success: true });
  }

  return json({ error: 'Not found' }, 404);
}
