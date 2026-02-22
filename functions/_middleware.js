export async function onRequest(context) {
  const url = new URL(context.request.url);

  // Allow all /api/* through without rerouting
  if (url.pathname.startsWith("/api/")) {
    return await context.next();
  }

  // Forum post permalinks: /forum/4, /forum/123 etc — serve forum.html (URL stays as /forum/:id)
  // Use ASSETS.fetch and follow redirects so we return HTML, not a redirect to /forum
  const forumIdMatch = url.pathname.match(/^\/forum\/(\d+)$/);
  if (forumIdMatch) {
    if (context.env.ASSETS) {
      let assetUrl = new URL("/forum.html", url.origin);
      for (let i = 0; i < 5; i++) {
        const res = await context.env.ASSETS.fetch(assetUrl);
        if (res.ok) return res;
        const loc = res.headers.get("location");
        if (!loc || res.status < 301 || res.status > 308) break;
        assetUrl = new URL(loc, assetUrl);
      }
    }
    // Fallback: rewrite request (may return redirect; ASSETS preferred)
    const rewriteUrl = new URL("/forum.html", url.origin);
    return context.next(new Request(rewriteUrl, context.request));
  }

  // Redirect old profile URLs to new format
  // /profile?user=X or /profile.html?user=X -> /profile/X
  if ((url.pathname === "/profile" || url.pathname === "/profile.html") && url.searchParams.has("user")) {
    const userId = url.searchParams.get("user").replace(/\.0$/, ''); // Remove .0 suffix
    return Response.redirect(`https://emwiki.com/profile/${userId}`, 301);
  }

  const item = url.searchParams.get("item");
  const userAgent = context.request.headers.get("user-agent")?.toLowerCase() || "";
  const isBot = userAgent.includes("discordbot") || userAgent.includes("bot");

  if (item && isBot) {
    return Response.redirect(`https://emwiki.com/api/embed/${encodeURIComponent(item)}`, 302);
  }

  return await context.next();
}
