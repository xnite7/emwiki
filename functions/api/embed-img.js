import { createCanvas } from '@napi-rs/canvas';
import fetch from 'node-fetch';


const categoryColors = {
  gears: "rgb(91, 254, 106)",
  deaths: "rgb(255, 122, 94)",
  titles: "rgb(201, 96, 254)",
  pets: "rgb(55, 122, 250)",
  effects: "rgb(255, 177, 53)"
};

const BASE_URL = 'https://emwiki.site';

async function fetchItemData(item) {
  const res = await fetch(`${BASE_URL}/api/gist-version`);
  if (!res.ok) throw new Error("Failed to fetch gist data");

  const gist = await res.json();
  const data = JSON.parse(gist.files?.["auto.json"]?.content);

  for (const [category, items] of Object.entries(data)) {
    const found = items.find(i =>
      (i?.name || '').toLowerCase().replace(/\s+/g, '-') === item.toLowerCase()
    );
    if (found) {
      return { category, item: found };
    }
  }
  throw new Error("Item not found");
}

export async function onRequestGet({ params }) {
  const item = params.item;
  try {
    const { category, item: match } = await fetchItemData(item);

    const width = 1200;
    const height = 630;
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');

    // Background
    ctx.fillStyle = categoryColors[category] || "rgb(128,128,128)";
    ctx.fillRect(0, 0, width, height);

    // Text styling
    ctx.font = 'bold 70px sans-serif';
    ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = 'black';
    ctx.shadowBlur = 8;
    ctx.shadowOffsetX = 2;
    ctx.shadowOffsetY = 2;

    const overlayText = (match.name || "EMWiki Item").replace(/-/g, ' ');
    ctx.fillText(overlayText, width / 2, height / 2);

    const buffer = canvas.toBuffer('image/png');

    return new Response(buffer, {
      headers: {
        'Content-Type': 'image/png',
        'Cache-Control': 'public, max-age=31536000', // Cache for 1 year
      },
    });
  } catch (e) {
    return new Response(`Error: ${e.message}`, { status: 404 });
  }
}
