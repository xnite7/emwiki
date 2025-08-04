import { Canvg } from "canvg";
import { createCanvas } from "canvas"; // Must be browser-compatible or use a bundler like webpack for edge

export async function onRequest(context) {
  const { request } = context;
  const url = new URL(request.url);
  const item = url.searchParams.get("item");
  const base = "https://emwiki.site";

  function escapeXml(unsafe) {
    return unsafe.replace(/[<>&'"]/g, c => ({
      "<": "&lt;",
      ">": "&gt;",
      "&": "&amp;",
      "'": "&apos;",
      '"': "&quot;"
    })[c]);
  }

  function normalize(str) {
    return (str || "").toLowerCase().replace(/\s+/g, "-");
  }

  try {
    const res = await fetch(`${base}/api/gist-version`);
    if (!res.ok) throw new Error("Failed to fetch gist data");
    const gist = await res.json();
    const data = JSON.parse(gist.files?.["auto.json"]?.content);

    let match = null;
    let category = null;

    for (const [cat, items] of Object.entries(data)) {
      const found = items.find(i => normalize(i?.name) === normalize(item));
      if (found) {
        category = cat;
        match = found;
        break;
      }
    }

    if (!match) throw new Error("Item not found");

    const categoryColors = {
      gears: "#5BFE6A",
      deaths: "#FF7A5E",
      titles: "#C160FE",
      pets: "#377AFA",
      effects: "#FFB135"
    };

    const bgColor = categoryColors[category] || "#808080";
    const text = (match.name || "EMWiki Item").replace(/-/g, " ");
    const img = match.img ? `${base}/${match.img}` : `${base}/imgs/trs.png`;

    const svg = `
      <svg xmlns="http://www.w3.org/2000/svg" width="500" height="520">
        <style>
          text {
            font-family: sans-serif;
          }
        </style>
        <rect x="10" y="20" width="470" height="490" rx="20" ry="20" fill="${bgColor}" stroke="white" stroke-width="10"/>
        <image href="${img}" x="45" y="65" width="400" height="400"/>
        <text x="246" y="465" font-size="32" fill="white" text-anchor="middle">${escapeXml(text)}</text>
      </svg>`;

    const canvas = createCanvas(500, 520);
    const ctx = canvas.getContext("2d");
    const v = await Canvg.from(ctx, svg);
    await v.render();

    const buffer = canvas.toBuffer("image/png");

    return new Response(buffer, {
      headers: {
        "Content-Type": "image/png",
        "Cache-Control": "public, max-age=31536000"
      }
    });
  } catch (e) {
    return new Response(`Error: ${e.message}`, { status: 500 });
  }
}