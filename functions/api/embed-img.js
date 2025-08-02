import { createCanvas } from '@napi-rs/canvas'; // faster and compatible with Cloudflare Pages

const categoryColors = {
  gears: "rgb(91, 254, 106)",
  deaths: "rgb(255, 122, 94)",
  titles: "rgb(201, 96, 254)",
  pets: "rgb(55, 122, 250)",
  effects: "rgb(255, 177, 53)"
};

export async function onRequestGet({ params }) {
  const itemParam = params.item;
  const base = 'https://emwiki.site';

  const res = await fetch(`${base}/api/gist-version`);
  const gist = await res.json();
  const data = JSON.parse(gist.files?.["auto.json"]?.content);

  let matchItem, category;
  for (const [cat, items] of Object.entries(data)) {
    matchItem = items.find(i =>
      (i?.name || '').toLowerCase().replace(/\s+/g, '-') === itemParam.toLowerCase()
    );
    if (matchItem) {
      category = cat;
      break;
    }
  }

  if (!matchItem) {
    return new Response('Item not found', { status: 404 });
  }

  const width = 1200;
  const height = 630;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');

  // Background color
  ctx.fillStyle = categoryColors[category] || 'gray';
  ctx.fillRect(0, 0, width, height);

  // Title text
  ctx.font = 'bold 70px sans-serif';
  ctx.fillStyle = '#fff';
  ctx.textAlign = 'center';
  ctx.shadowColor = '#000';
  ctx.shadowBlur = 8;
  ctx.fillText(matchItem.name, width / 2, height / 2);

  const buffer = canvas.toBuffer('image/png');

  return new Response(buffer, {
    headers: {
      'Content-Type': 'image/png',
      'Cache-Control': 'public, max-age=86400'
    }
  });
}
