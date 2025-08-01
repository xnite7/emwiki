function escapeHtml(text) {
  return text?.replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;") || "";
}

export async function onRequestGet(context) {
  const { item } = context.params;
  const base = 'https://emwiki.site';
  const fallbackImage = `${base}/imgs/trs.png`;

  try {
    const res = await fetch(`${base}/api/gist-version`);
    if (!res.ok) throw new Error("Failed to fetch gist");
    const gist = await res.json();
    const data = JSON.parse(gist.files?.["auto.json"]?.content);
    const allItems = Object.values(data).flat();
    const match = allItems.find(i =>
      (i?.name || '').toLowerCase().replace(/\s+/g, '-') === item.toLowerCase()
    );

    const title = escapeHtml(match?.name || "EMWiki Item");
    const fullTitle = `${title} - EMWiki Catalog`;

    let desc = match?.from ? match.from.replace(/<br>/g, ' • ') : "View item info on EMWiki";
    if (desc.length > 160) desc = desc.slice(0, 157) + '…';
    desc = `📘 Info: ${desc}`;

    const img = match?.img ? `${base}/${match.img}` : fallbackImage;
    const imgResized = img + "?w=600&h=315&fit=cover"; // example if your CDN supports resizing

    const url = `${base}/?item=${encodeURIComponent(match?.name || item)}`;

    return new Response(`<!DOCTYPE html>
<html>
<head>
  <title>${fullTitle}</title>
  <meta property="og:title" content="${fullTitle}" />
  <meta property="og:description" content="${desc}" />
  <meta property="og:image" content="${imgResized}" />
  <meta property="og:url" content="${url}" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:site" content="@YourTwitterHandle" />
  <meta name="twitter:creator" content="@YourTwitterHandle" />
  <meta name="theme-color" content="#b07fff" />
  <script>location.href = "${url}"</script>
</head>
<body>
  Redirecting to <a href="${url}">${fullTitle}</a>...
</body>
</html>`, { headers: { 'Content-Type': 'text/html' } });
  } catch (e) {
    return new Response(`Item not found.`, { status: 404 });
  }
}
