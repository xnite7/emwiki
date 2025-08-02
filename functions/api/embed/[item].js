function escapeHtmlExceptBr(text) {
  if (!text) return "";
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, (match, offset, str) => {
      // Allow <br> tags unescaped
      if (str.substr(offset, 4).toLowerCase() === "<br>") return "<br>";
      return "&lt;";
    })
    .replace(/>/g, (match, offset, str) => {
      if (str.substr(offset - 3, 4).toLowerCase() === "<br>") return ">";
      return "&gt;";
    })
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function isBot(userAgent) {
  if (!userAgent) return false;
  const bots = [
    'facebookexternalhit', 'twitterbot', 'linkedinbot',
    'discordbot', 'googlebot', 'bingbot', 'yandexbot',
    'slackbot', 'applebot'
  ];
  const ua = userAgent.toLowerCase();
  return bots.some(bot => ua.includes(bot));
}

export async function onRequestGet(context) {
  const { request, params } = context;
  const userAgent = request.headers.get('user-agent') || '';
  const item = params.item;
  const base = 'https://emwiki.site';
  const fallbackImage = `${base}/imgs/trs.png`;

  const redirectUrl = `${base}/?item=${encodeURIComponent(item)}`;

  if (!isBot(userAgent)) {
    // Human visitor — redirect to site
    return Response.redirect(redirectUrl, 302);
  }

  // Bot — serve embed HTML
  try {
    const res = await fetch(`${base}/api/gist-version`);
    if (!res.ok) throw new Error("Failed to fetch gist");

    const gist = await res.json();
    const data = JSON.parse(gist.files?.["auto.json"]?.content);
    const allItems = Object.values(data).flat();
    const match = allItems.find(i =>
      (i?.name || '').toLowerCase().replace(/\s+/g, '-') === item.toLowerCase()
    );

    if (!match) throw new Error("Item not found");

    const title = escapeHtmlExceptBr(match.name || "EMWiki Item");
    const descriptionRaw = match.from || "";
    const descriptionHtml = escapeHtmlExceptBr(descriptionRaw);
    const imageUrl = match.img ? `${base}/${match.img}` : fallbackImage;

    return new Response(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=600, initial-scale=1" />
  <title>${title} - EMWiki Preview</title>

  <!-- OG meta tags -->
  <meta property="og:title" content="${title} - Epic Catalogue" />

  <meta property="og:image" content="${imageUrl}" />
    <meta property="og:description" content="${descriptionRaw.replace(/<br>/g, '\n')}" />
  <meta property="og:url" content="${redirectUrl}" />
  <meta name="twitter:card" content="summary_large_image" />
</html>`, {
      headers: { 'Content-Type': 'text/html' }
    });

  } catch (e) {
    return new Response(`Item not found or error: ${e.message}`, { status: 404 });
  }
}
