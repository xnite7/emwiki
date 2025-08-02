export async function onRequest({ request }) {
  const url = new URL(request.url);
  const item = url.searchParams.get("item");
  const userAgent = request.headers.get("user-agent")?.toLowerCase() || "";
  const isBot = userAgent.includes("discordbot") || userAgent.includes("bot");

  if (item && isBot) {
    return Response.redirect(`https://emwiki.site/embed/${encodeURIComponent(item)}`, 302);
  }

  return await fetch(request);
}
