export async function onRequest(context) {
  const url = new URL(context.request.url);

  // Allow all /api/* through without rerouting
  if (url.pathname.startsWith("/api/")) {
    return await context.next();
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
