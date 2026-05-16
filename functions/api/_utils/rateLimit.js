// Fixed-window rate limiter backed by Cloudflare KV.
//
// Re-uses env.DONATIONS_KV with an "rl:" prefix so no new namespace binding is
// required. Provision a dedicated RATE_LIMITS_KV namespace in production if you
// want isolation; just swap the binding reference here.
//
// KV does not support atomic INCR. Two concurrent requests can both read the
// same value and overwrite each other, allowing a small over-count. This is
// acceptable for the rate-limit use case (auth code generation, login attempts)
// where the goal is to stop bursts, not enforce an exact ceiling.

const FALLBACK = new Map();

function fallbackCheck(key, limit, windowMs) {
  const now = Date.now();
  const recent = (FALLBACK.get(key) || []).filter(t => now - t < windowMs);
  if (recent.length >= limit) {
    FALLBACK.set(key, recent);
    return false;
  }
  recent.push(now);
  FALLBACK.set(key, recent);
  return true;
}

export async function checkRateLimit(env, key, limit = 10, windowSeconds = 60) {
  const kv = env && env.DONATIONS_KV;
  if (!kv) {
    console.warn('[rateLimit] No KV binding available, falling back to in-memory limiter');
    return fallbackCheck(key, limit, windowSeconds * 1000);
  }

  const bucket = Math.floor(Date.now() / 1000 / windowSeconds);
  const kvKey = `rl:${key}:${bucket}`;

  const raw = await kv.get(kvKey);
  const count = raw ? parseInt(raw, 10) || 0 : 0;

  if (count >= limit) {
    return false;
  }

  await kv.put(kvKey, String(count + 1), { expirationTtl: Math.max(windowSeconds * 2, 60) });
  return true;
}
