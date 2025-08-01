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

    if (!match) throw new Error("Item not found");

    // Sanitize data for injection
    const title = escapeHtml(match.name || "EMWiki Item");
    const descriptionRaw = match.from || "";
    // Replace <br> tags with real line breaks in HTML
    const descriptionHtml = escapeHtml(descriptionRaw).replace(/&lt;br&gt;/g, "<br>");
    const imageUrl = match.img ? `${base}/${match.img}` : fallbackImage;

    // Return minimal HTML rendering the modal card style
    return new Response(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=600, initial-scale=1" />
  <title>${title} - EMWiki Preview</title>
  <style>
    /* Reset and basic styling */
    body {
      margin: 0; padding: 0;
      background: #1a1a1a;
      color: #eee;
      font-family: 'Arimo', sans-serif;
      display: flex;
      justify-content: center;
      align-items: center;
      height: 800px; /* fixed viewport for screenshot */
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
  <div class="modal-card">
    <div class="modal-image" role="img" aria-label="${title} image"></div>
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
