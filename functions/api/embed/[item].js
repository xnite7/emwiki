function escapeHtml(text) {
  return text?.replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;") || "";
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

    const title = escapeHtml(match.name || "EMWiki Item");
    const descriptionRaw = match.from || "";
    const descriptionHtml = escapeHtml(descriptionRaw).replace(/&lt;br&gt;/g, "<br>");
    const imageUrl = match.img ? `${base}/${match.img}` : fallbackImage;

    return new Response(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=600, initial-scale=1" />
  <title>${title} - EMWiki Preview</title>

  <!-- OG meta tags -->
  <meta property="og:title" content="${title} - EMWiki Catalog" />
  <meta property="og:description" content="${descriptionRaw.replace(/<br>/g, ' ')}" />
  <meta property="og:image" content="${imageUrl}" />
  <meta property="og:url" content="${redirectUrl}" />
  <meta name="twitter:card" content="summary_large_image" />

  <style>
    body {
      margin: 0; padding: 0;
      background: #1a1a1a;
      color: #eee;
      font-family: 'Arimo', sans-serif;
      display: flex;
      justify-content: center;
      align-items: center;
      height: 800px;
    }
    .modal-card {
      background: #222;
      border-radius: 12px;
      box-shadow: 0 0 20px rgba(180, 127, 255, 0.7);
      width: 600px;
      padding: 20px;
      box-sizing: border-box;
      display: flex;
      gap: 20px;
      color: #eee;
    }
    .modal-image {
      flex-shrink: 0;
      width: 220px;
      height: 220px;
      border-radius: 10px;
      background: #333;
      background-image: url('${imageUrl}');
      background-size: contain;
      background-repeat: no-repeat;
      background-position: center;
      box-shadow: 0 0 8px #b07fff88;
    }
    .modal-info {
      flex-grow: 1;
      display: flex;
      flex-direction: column;
      justify-content: center;
    }
    .modal-title {
      font-weight: 700;
      font-size: 2.2rem;
      margin-bottom: 12px;
      text-shadow: 0 0 10px #b07fff88;
    }
    .modal-description {
      font-size: 1.1rem;
      line-height: 1.4;
      white-space: pre-wrap;
      color: #ccc;
    }
  </style>
</head>
<body>
  <div class="modal-card" role="main" aria-label="${title} preview">
    <div class="modal-image" aria-hidden="true"></div>
    <div class="modal-info">
      <div class="modal-title">${title}</div>
      <div class="modal-description">${descriptionHtml}</div>
    </div>
  </div>
</body>
</html>`, {
      headers: { 'Content-Type': 'text/html' }
    });

  } catch (e) {
    return new Response(`Item not found or error: ${e.message}`, { status: 404 });
  }
}
