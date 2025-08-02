export async function onRequest(context) {
  const url = new URL(context.request.url);

  // Allow all /api/* through without rerouting
  if (url.pathname.startsWith("/api/")) {
    return await context.next();
  }

  const item = url.searchParams.get("item");
  const userAgent = context.request.headers.get("user-agent")?.toLowerCase() || "";
  const isBot = userAgent.includes("discordbot") || userAgent.includes("bot");

  if (item && isBot) {
    return Response.redirect(`https://emwiki.site/api/embed/${encodeURIComponent(item)}`, 302);
  }

  return await context.next();
}
