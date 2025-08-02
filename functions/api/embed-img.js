export async function onRequest(context) {
    const { params, request } = context;
    const url = new URL(request.url);
    const item = url.searchParams.get("item");

    const base = 'https://emwiki.site';


    function normalize(str) {
        return (str || '').toLowerCase().replace(/\s+/g, '-');
    }

    try {
        const res = await fetch(`${base}/api/gist-version`);
        if (!res.ok) throw new Error("Failed to fetch gist data");
        const gist = await res.json();
        const data = JSON.parse(gist.files?.["auto.json"]?.content);

        let match = null;
        let category = null;
        const normalizedNames = [];

        for (const [cat, items] of Object.entries(data)) {
            const found = items.find(i => normalize(i?.name) === normalize(item));

            items.forEach(element => {
                normalizedNames.push(normalize(element?.name));
            });

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
        const text = (match.name || "EMWiki Item").replace(/-/g, ' ');
        const img = match.img ? `../${match.img}` : `${base}/imgs/trs.png`;


        // Build SVG string
        const svg = `
      <svg xmlns="http://www.w3.org/2000/svg" width="600" height="620">
      <style>
        @font-face {
            font-family: 'Bunny Flowers';
            font-style: normal;
            font-weight: normal;
            src: url("https://emwiki.site/fonts/BunnyFlowers-Regular.woff") format('woff');
        }

        @font-face {
            font-family: 'Source Sans Pro';
            font-style: normal;
            font-weight: 400;
            src: local('Source Sans Pro'), url('https://fonts.cdnfonts.com/s/12183/SourceSansPro-Regular.woff') format('woff');
        }

        text{
            font-family: 'Source Sans Pro';
            text-shadow: -2px -2px 0 #000, 0 -2px 0 #000, 2px -2px 0 #000, 2px 0 0 #000, 2px 2px 0 #000, 0 2px 0 #000, -2px 2px 0 #000, -2px 0 0 #000;
            }
            .sign {
            -webkit-text-fill-color: rgba(255, 255, 255, 0);
            color: rgb(255, 255, 255);
            left: 0px;
            opacity: 1;
            text-shadow: none;
            top: 0px;
            background: -webkit-linear-gradient(bottom, rgb(255, 255, 0), rgb(36, 255, 90)) text;
            font: 200 160px "Bunny Flowers";
            transform: rotate(7deg);
            text-shadow: -7px -7px 0 #000, 0 -7px 0 #000, 7px -7px 0 #000, 7px 0 0 #000, 7px 7px 0 #000, 0 7px 0 #000, -7px 7px 0 #000, -7px 0 0 #000;
            
            }



        </style>
        <rect x="10" y="10" width="580" rx="20" ry="20" height="600" fill="${bgColor}" stroke="white" stroke-width="10"/>
    <image href="${img}" x="100" y="80" width="400" height="400"/>
        <text xmlns="http://www.w3.org/2000/svg" class="sign" x="485" y="70" font-family="Bunny Flowers" font-weight="bold" fill="url(#textGradient)" text-anchor="middle" dominant-baseline="middle" filter="url(#shadow)">EC</text>
        <text xmlns="http://www.w3.org/2000/svg" x="300" y="535" font-family="Sans" font-size="50" font-weight="bold" fill="white" text-anchor="middle" dominant-baseline="middle">
          ${escapeXml(text)}
        </text>
        <defs xmlns="http://www.w3.org/2000/svg">
          <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="2" dy="2" stdDeviation="4" flood-color="black" flood-opacity="0.6"/>
          </filter>
      <linearGradient id="textGradient" x1="33%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%" stop-color="#ffff00"/>
        <stop offset="100%" stop-color="#24ff5a"/>
      </linearGradient>
        </defs>
      </svg>`;

      

        // At the end, instead of return new Response(svg)...

        const workerUrl = 'https://converter.xnite7.workers.dev/'; // your real Worker URL
        const pngRes = await fetch(workerUrl, {
        method: 'POST',
        body: svg,
        headers: {
            'Content-Type': 'image/svg+xml'
        },
        });

          if (!pngRes.ok) {
                return new Response('Failed to convert SVG', { status: 500 });
            }
 

        return new Response(pngRes.body, {
        headers: {
            "Content-Type": "image/png",
            "Cache-Control": "public, max-age=31536000"
        }
        });


    } catch (e) {
        return new Response(`Error: ${e.message}`, { status: 404 });
    }
}

