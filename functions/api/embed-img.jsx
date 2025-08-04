import React from "react";
import { ImageResponse } from "@vercel/og";

export const config = {
  runtime: "edge",
};

function escapeXml(unsafe) {
  return unsafe.replace(/[<>&'"]/g, (c) =>
    ({
      "<": "&lt;",
      ">": "&gt;",
      "&": "&amp;",
      "'": "&apos;",
      '"': "&quot;",
    }[c])
  );
}

function normalize(str) {
  return (str || "").toLowerCase().replace(/\s+/g, "-");
}

export default async function handler(req) {
  try {
    const url = new URL(req.url);
    const item = url.searchParams.get("item");

    const base = "https://emwiki.site";

    // Fetch gist data
    const res = await fetch(`${base}/api/gist-version`);
    if (!res.ok) throw new Error("Failed to fetch gist data");
    const gist = await res.json();
    const data = JSON.parse(gist.files?.["auto.json"]?.content);

    let match = null;
    let category = null;

    for (const [cat, items] of Object.entries(data)) {
      const found = items.find((i) => normalize(i?.name) === normalize(item));
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
      effects: "#FFB135",
    };
    const bgColor = categoryColors[category] || "#808080";
    const text = (match.name || "EMWiki Item").replace(/-/g, " ");
    const img = match.img ? `${base}/${match.img}` : `${base}/imgs/trs.png`;

    // Load fonts as ArrayBuffers
    const bunnyFont = await fetch(
      "https://emwiki.site/fonts/BunnyFlowers-Regular.woff"
    ).then((r) => r.arrayBuffer());
    const sourceSansFont = await fetch(
      "https://fonts.cdnfonts.com/s/12183/SourceSansPro-Regular.woff"
    ).then((r) => r.arrayBuffer());

    return new ImageResponse(
      (
        <div
          style={{
            width: 500,
            height: 520,
            backgroundColor: bgColor,
            borderRadius: 20,
            border: "10px solid white",
            position: "relative",
            overflow: "hidden",
            fontFamily: '"Source Sans Pro", sans-serif',
          }}
        >
          {/* Background Rect is implicit by div */}

          {/* Embedded Image */}
          <img
            src={img}
            width={400}
            height={400}
            alt=""
            style={{
              position: "absolute",
              top: 65,
              left: 45,
              borderRadius: 10,
              objectFit: "cover",
            }}
          />

          {/* Rotated "EC" text with gradient fill and heavy shadow */}
          <svg
            width={500}
            height={520}
            style={{ position: "absolute", top: 0, left: 0, pointerEvents: "none" }}
          >
            <defs>
              <linearGradient id="textGradient" x1="33%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" stopColor="#ffff00" />
                <stop offset="100%" stopColor="#24ff5a" />
              </linearGradient>
              <filter
                id="shadow"
                x="-20%"
                y="-20%"
                width="140%"
                height="140%"
                filterUnits="userSpaceOnUse"
              >
                <feDropShadow
                  dx="2"
                  dy="2"
                  stdDeviation="4"
                  floodColor="black"
                  floodOpacity="0.6"
                />
              </filter>
            </defs>
            <text
              x={425}
              y={40}
              fontSize={160}
              fill="url(#textGradient)"
              textAnchor="middle"
              dominantBaseline="middle"
              filter="url(#shadow)"
              style={{
                fontFamily: "'Bunny Flowers'",
                fontWeight: 200,
                transformOrigin: "425px 40px",
                transform: "rotate(7deg)",
                textShadow:
                  "-7px -7px 0 #000, 0 -7px 0 #000, 7px -7px 0 #000, 7px 0 0 #000, 7px 7px 0 #000, 0 7px 0 #000, -7px 7px 0 #000, -7px 0 0 #000",
              }}
            >
              EC
            </text>
          </svg>

          {/* Main text */}
          <div
            style={{
              position: "absolute",
              bottom: 45,
              width: "100%",
              textAlign: "center",
              fontSize: 160,
              fontWeight: 400,
              color: "white",
              textShadow:
                "-2px -2px 0 #000, 0 -2px 0 #000, 2px -2px 0 #000, 2px 0 0 #000, 2px 2px 0 #000, 0 2px 0 #000, -2px 2px 0 #000, -2px 0 0 #000",
              userSelect: "none",
              fontFamily: "'Source Sans Pro'",
              whiteSpace: "nowrap",
            }}
          >
            {escapeXml(text)}
          </div>
        </div>
      ),
      {
        width: 500,
        height: 520,
        fonts: [
          {
            name: "Bunny Flowers",
            data: bunnyFont,
            style: "normal",
            weight: 200,
          },
          {
            name: "Source Sans Pro",
            data: sourceSansFont,
            style: "normal",
            weight: 400,
          },
        ],
        headers: {
          "Content-Type": "image/png"
        }
      }
    );
  } catch (e) {
    return new Response(`Error: ${e.message}`, { status: 404 });
  }
}
