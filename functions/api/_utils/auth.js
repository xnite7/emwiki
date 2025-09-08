export async function createSession(name, secret) {
  const issued = Date.now();
  const payload = { name, issued };
  const encoded = btoa(JSON.stringify(payload));

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const sigBuffer = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(encoded));
  const sigHex = [...new Uint8Array(sigBuffer)].map(b => b.toString(16).padStart(2, "0")).join("");

  return `${encoded}.${sigHex}`;
}

export async function verifySession(token, secret) {
  const [encoded, sigHex] = token.split(".");
  if (!encoded || !sigHex) return null;

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const sigBuffer = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(encoded));
  const expectedHex = [...new Uint8Array(sigBuffer)].map(b => b.toString(16).padStart(2, "0")).join("");

  if (expectedHex !== sigHex) return null;

  return JSON.parse(atob(encoded));
}
