import { createCanvas } from '@napi-rs/canvas';
import fetch from 'node-fetch';
import fs from 'fs/promises';
import path from 'path';

// Your category colors map
const categoryColors = {
  gears: "rgb(91, 254, 106)",
  deaths: "rgb(255, 122, 94)",
  titles: "rgb(201, 96, 254)",
  pets: "rgb(55, 122, 250)",
  effects: "rgb(255, 177, 53)"
};

const BASE_URL = 'https://emwiki.site';

async function fetchItemData() {
  const res = await fetch(`${BASE_URL}/api/gist-version`);
  if (!res.ok) throw new Error("Failed to fetch gist data");

  const gist = await res.json();
  return JSON.parse(gist.files?.["auto.json"]?.content);
}

function sanitizeText(text) {
  return text.replace(/-/g, " ").replace(/_/g, " ");
}

async function generateImage(itemName, category, item) {
  const width = 1200;
  const height = 630;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');

  // Background color
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

  const overlayText = sanitizeText(item.name || itemName);
  ctx.fillText(overlayText, width / 2, height / 2);

  // Save PNG to disk
  const buffer = canvas.toBuffer('image/png');

  // Ensure output dir exists
  await fs.mkdir('./output', { recursive: true });

  // Save file by item name (safe filename)
  const fileName = `${itemName.toLowerCase().replace(/\s+/g, '-')}.png`;
  const filePath = path.join('output', fileName);
  await fs.writeFile(filePath, buffer);
  console.log(`Saved image: ${filePath}`);
}

async function main() {
  const data = await fetchItemData();

  for (const [category, items] of Object.entries(data)) {
    for (const item of items) {
      const itemNameKey = (item.name || '').toLowerCase().replace(/\s+/g, '-');
      if (!itemNameKey) continue;
      try {
        await generateImage(itemNameKey, category, item);
      } catch (err) {
        console.error(`Error generating image for ${itemNameKey}:`, err);
      }
    }
  }

  console.log("All images generated.");
}

main().catch(console.error);
