export async function onRequest({ request }) {
  const url = new URL(request.url);
  const item = url.searchParams.get("item");
  const pathname = url.pathname;
  const userAgent = request.headers.get("user-agent")?.toLowerCase() || "";
  const isBot = userAgent.includes("discordbot") || userAgent.includes("bot");

  // ✅ Let API embed routes always pass through, even for bots
  const isApiEmbed = pathname.startsWith("/api/embed/");
  if (isApiEmbed) {
    return fetch(request); // allow access, skip redirect
  }

  // ✅ Redirect bots only if ?item exists and it's not an API route
  if (item && isBot) {
    return Response.redirect(`https://emwiki.site/embed/${encodeURIComponent(item)}`, 302);
  }

  return fetch(request); // default: just serve the original request
}
