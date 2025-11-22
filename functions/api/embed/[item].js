export async function onRequest(context) {
  const { params, request, env } = context;
  const item = params.item;
  const base = 'https://emwiki.com'; // your site URL

  // Helper: simple bot detection
  function isBot(ua) {
    return /bot|crawler|spider|facebookexternalhit|twitterbot|slackbot/i.test(ua);
  }

  // Redirect normal users to your main frontend page
  if (!isBot(request.headers.get('user-agent') || '')) {
    return Response.redirect(`${base}/?item=${encodeURIComponent(item)}`, 302);
  }

  try {
    // Fetch item from D1 database directly
    const categories = ['gears', 'deaths', 'titles', 'pets', 'effects'];
    let match = null;
    
    // Normalize item name for lookup (convert hyphens to spaces for database lookup)
    const normalizedItemName = item.toLowerCase().replace(/-/g, ' ').trim();
    
    // Try to find the item in each category
    for (const category of categories) {
      const result = await env.DBA.prepare(`
        SELECT name, "from"
        FROM items
        WHERE category = ? AND LOWER(REPLACE(name, '-', ' ')) = ? AND removed = 0
        LIMIT 1
      `).bind(category, normalizedItemName).first();
      
      if (result) {
        match = result;
        break;
      }
    }
    
    // If not found, try fuzzy search
    if (!match) {
      for (const category of categories) {
        const results = await env.DBA.prepare(`
          SELECT name, "from"
          FROM items
          WHERE category = ? AND name LIKE ? AND removed = 0
          LIMIT 5
        `).bind(category, `%${normalizedItemName}%`).all();
        
        if (results.results && results.results.length > 0) {
          const found = results.results.find(i =>
            (i?.name || '').toLowerCase().replace(/\s+/g, '-') === item.toLowerCase()
          );
          if (found) {
            match = found;
            break;
          }
        }
      }
    }
    
    if (!match) throw new Error("Item not found");

    // Sanitize and prepare strings for HTML meta tags
    const title = escapeHtml(match.name || "EMWiki Item");
    const descriptionRaw = match.from || "";
    const descriptionText = descriptionRaw.replace(/<br\s*\/?>(\s*)?/gi, '\n');

    // Your image URL points to the Worker (deployed separately)
    const imageUrl = `https://images-eight-theta.vercel.app/api/image?item=${encodeURIComponent(item)}`;

    return new Response(`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=600, initial-scale=1" />
<title>${title} - EMWiki Preview</title>

<meta property="og:title" content="${title} - EMwiki" />
<meta property="og:image" content="${imageUrl}" />
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
