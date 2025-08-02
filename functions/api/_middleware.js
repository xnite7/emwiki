export async function onRequest({ request }) {
  const url = new URL(request.url);
  const pathname = url.pathname;
  const item = url.searchParams.get("item");
  const userAgent = request.headers.get("user-agent")?.toLowerCase() || "";
  const isBot = userAgent.includes("discordbot") || userAgent.includes("bot");

  // ✅ Allow all /api/* routes to pass through, not just /api/embed/
  if (pathname.startsWith("/api/")) {
    return fetch(request);
  }

  if (item && isBot) {
    return Response.redirect(`https://emwiki.site/embed/${encodeURIComponent(item)}`, 302);
  }

  return fetch(request);
}
