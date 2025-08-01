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
    const desc = escapeHtml(match?.from ? match.from.replace(/<br>/g, ' • ') : "View item info on EMWiki");
    const img = match?.img ? `${base}/${match.img}` : fallbackImage;
    const url = `${base}/?item=${encodeURIComponent(match?.name || item)}`;

    return new Response(`<!DOCTYPE html>
<html>
<head>
  <title>${title}</title>
  <meta property="og:title" content="${title}" />
  <meta property="og:description" content="${desc}" />
  <meta property="og:image" content="${img}" />
  <meta property="og:url" content="${url}" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="theme-color" content="#b07fff" />
  <script>location.href = "${url}"</script>
</head>
<body>
  Redirecting to <a href="${url}">${title}</a>...
</body>
</html>`, { headers: { 'Content-Type': 'text/html' } });
  } catch (e) {
    return new Response(`Item not found.`, { status: 404 });
  }
}
