import React from "react";
import { ImageResponse } from "@vercel/og";

export const config = { runtime: "edge" };

export default async function handler(req) {
  try {
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
            backgroundColor: "#FFB135",
            borderRadius: 20,
            border: "10px solid white",
            fontFamily: "'Source Sans Pro'",
            color: "white",
            position: "relative",
          }}
        >
          <img
            src="https://emwiki.site/imgs/trs.png"
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
            Hello
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
      }
    );
  } catch (e) {
    return new Response(`Error: ${e.message}`, { status: 500 });
  }
}
