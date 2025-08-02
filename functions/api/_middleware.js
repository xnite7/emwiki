export async function onRequest({ request }) {
  const url = new URL(request.url);
  const item = url.searchParams.get("item");
  const pathname = url.pathname;
  const userAgent = request.headers.get("user-agent")?.toLowerCase() || "";
  const isBot = userAgent.includes("discordbot") || userAgent.includes("bot");

  // ✅ Only redirect if it's a bot AND not an API route
  const isApiRequest = pathname.startsWith("/api/");

  if (item && isBot && !isApiRequest) {
    return Response.redirect(`https://emwiki.site/embed/${encodeURIComponent(item)}`, 302);
  }

  return await fetch(request);
}
