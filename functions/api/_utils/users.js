export async function getUserFromToken(token, env) {
  if (!token) return null;

  const session = await env.DBA.prepare(
    'SELECT user_id FROM sessions WHERE token = ? AND expires_at > ?'
  ).bind(token, Date.now()).first();

  if (!session) return null;

  return env.DBA.prepare(
    'SELECT user_id, username, display_name, role FROM users WHERE user_id = ?'
  ).bind(session.user_id).first();
}

export function getBearerToken(request) {
  const header = request.headers.get('Authorization') || '';
  return header.startsWith('Bearer ') ? header.slice(7) : null;
}

export async function getRequestUser(request, env) {
  return getUserFromToken(getBearerToken(request), env);
}

export function hasRole(user, ...roles) {
  if (!user || !user.role) return false;
  try {
    const parsed = JSON.parse(user.role);
    if (!Array.isArray(parsed)) return false;
    return roles.some(r => parsed.includes(r));
  } catch {
    return false;
  }
}

export function isAdmin(user) {
  return hasRole(user, 'admin', 'moderator');
}
