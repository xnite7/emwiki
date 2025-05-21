export async function onRequestGet(context) {
  const { searchParams } = new URL(context.request.url);
  const targetUrl = searchParams.get("url");

  if (!targetUrl) {
    return new Response("Missing 'url' parameter", { status: 400 });
  }

  if (request.headers.get("origin") !== "https://emwiki.site" || request.headers.get("origin") !== "https://www.emwiki.site") {
    return new Response("Unauthorized", { status: 403 });
  }

  try {
    const response = await fetch(targetUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0", // Prevents some blocks
      },
    });

    if (!response.ok) {
      return new Response("Failed to fetch image", { status: 502 });
    }

    const contentType = response.headers.get("content-type") || "image/png";

    return new Response(response.body, {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=3600", // Cache in CDN/browser
      },
    });
  } catch (err) {
    return new Response("Error: " + err.message, { status: 500 });
  }
}
