export async function onRequest(context) {
    const { params, request } = context;
    const url = new URL(request.url);
    const item = url.searchParams.get("item");

    const base = 'https://emwiki.site';


    // Simple XML escape helper for safe output in SVG
    function escapeXml(unsafe) {
        return unsafe.replace(/[<>&'"]/g, c => ({
            '<': '&lt;',
            '>': '&gt;',
            '&': '&amp;',
            '\'': '&apos;',
            '"': '&quot;'
        })[c]);
    }
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
        const img = match.img ? `${base}/${match.img}` : `${base}/imgs/trs.png`;


        // Build SVG strings
        const svg = `
        <svg xmlns="http://www.w3.org/2000/svg" width="300" height="200">
  <defs>
    <style type="text/css">
      @font-face {
        font-family: 'DejaVuSans';
        src: url("data:font/ttf;base64,AAEAAAARAQAABAAgR0RFRrRCsIIAAAC8AAAAVE9TLzIa6S+aAAABHAAAAFRjbWFw7LzVJwAAAXgAAABYY3Z0IAAAAAAAAAZQAAAFOmhlYWQyGHYFAAAU3AAAADZoaGVhBuwD+gAAFGQAAAAkaG10eD5bAAAABUwAAAAMbG9jYQAAAAAAAAAUeAAAAA5tYXhwAAEAAAAABWgAAAAgbmFtZcni48YAAAVMAAABKnBvc3QAAYABAABWkAAAACBwcmVw9k0I/gAABZwAAACMZ2x5ZlFS3HAAAAbkAAAEWeJxjYGRgYOBi0GHgYWBkCGAAAGsACQ==");
      }
      text {
        font-family: 'DejaVuSans';
      }
    </style>
  </defs>

  <rect x="10" y="10" width="280" height="180" rx="20" ry="20" fill="#3498db" stroke="black" stroke-width="4"/>
  <text x="150" y="105" font-size="40" fill="white" text-anchor="middle" dominant-baseline="middle">
    Hello
  </text>
</svg>

`;

      

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

