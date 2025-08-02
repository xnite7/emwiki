// Example: /functions/[item].js

export async function onRequest(context) {
  const { params, request } = context;
  const item = params.item;
  const base = 'https://emwiki.site'; // your site URL

  // Helper: simple bot detection
  function isBot(ua) {
    return /bot|crawler|spider|facebookexternalhit|twitterbot|slackbot/i.test(ua);
  }

  // Redirect normal users to your main frontend page
  if (!isBot(request.headers.get('user-agent') || '')) {
    return Response.redirect(`${base}/?item=${encodeURIComponent(item)}`, 302);
  }

  try {
    // Fetch your gist data with item info
    const res = await fetch(`${base}/api/gist-version`);
    if (!res.ok) throw new Error("Failed to fetch gist data");

    const gist = await res.json();
    const data = JSON.parse(gist.files?.["auto.json"]?.content);

    // Find the matching item and category
    let match = null;
    let category = null;
    for (const [cat, items] of Object.entries(data)) {
      const found = items.find(i =>
        (i?.name || '').toLowerCase().replace(/\s+/g, '-') === item.toLowerCase()
      );
      if (found) {
        category = cat;
        match = found;
        break;
      }
    }
    if (!match) throw new Error("Item not found");

    // Sanitize and prepare strings for HTML meta tags
    const title = escapeHtml(match.name || "EMWiki Item");
    const descriptionRaw = match.from || "";
    const descriptionText = descriptionRaw.replace(/<br\s*\/?>(\s*)?/gi, '\n');

    // Your image URL points to the Worker (deployed separately)
    const ogImageUrl = `${base}/api/embed-img/${encodeURIComponent(item)}`;

    return new Response(`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=600, initial-scale=1" />
<title>${title} - EMWiki Preview</title>

<meta property="og:title" content="${title} - Epic Catalogue" />
<meta property="og:image" content="${ogImageUrl}" />
<meta property="og:description" content="${descriptionText}" />
<meta property="og:url" content="${base}/?item=${encodeURIComponent(item)}" />
<meta name="twitter:card" content="summary_large_image" />
</head>
<body></body>
</html>`, {
      headers: { "Content-Type": "text/html" }
    });

  } catch (e) {
    return new Response(`Error: ${e.message}`, { status: 404 });
  }
}

// Simple helper to escape HTML special chars
function escapeHtml(text) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
