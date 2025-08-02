export async function onRequest({ request }) {
  const userAgent = request.headers.get("user-agent") || "";

  if (userAgent.includes("Discordbot")) {
    const url = new URL(request.url);
    const item = url.searchParams.get("item");

    if (item) {
      return Response.redirect(
        `https://route-embed.xnite7.workers.dev/?item=${encodeURIComponent(item)}`,
        302
      );
    }
  }

  // Continue with the normal request if not Discordbot or no item param
  return fetch(request);
}
