// Forum post permalink — serve forum.html for /forum/:id so client-side routing can open the thread
export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);

  // Rewrite to serve forum.html (URL stays as /forum/:id in browser)
  const assetUrl = new URL('/forum.html', url.origin);
  const assetRequest = new Request(assetUrl, {
    method: request.method,
    headers: request.headers,
  });
  return env.ASSETS.fetch(assetRequest);
}
