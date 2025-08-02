export async function onRequest(context) {
    const { params, request } = context;
    const item = params.item;
    const base = 'https://emwiki.site';


    function normalize(str) {
        return (str || '').toLowerCase().replace(/\s+/g, '-');
    }

    



    // Bot detection to redirect browsers
    function isBot(ua) {
        return /bot|crawler|spider|facebookexternalhit|twitterbot|slackbot/i.test(ua);
    }
    if (!isBot(request.headers.get('user-agent') || '')) {
        return Response.redirect(`${base}/?item=${encodeURIComponent(item)}`, 302);
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
        console.log("All normalized item names:", normalizedNames);



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

        // Build SVG string
        const svg = `
      <svg width="1200" height="630" xmlns="http://www.w3.org/2000/svg">
        <rect width="1200" height="630" fill="${bgColor}" />
        <text x="600" y="315" font-family="Arial, sans-serif" font-size="70" font-weight="bold" fill="white" text-anchor="middle" dominant-baseline="middle" filter="url(#shadow)">
          ${escapeXml(text)}
        </text>
        <defs>
          <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="2" dy="2" stdDeviation="4" flood-color="black" flood-opacity="0.6"/>
          </filter>
        </defs>
      </svg>`;

        return new Response(svg, {
            headers: {
                "Content-Type": "image/svg+xml",
                "Cache-Control": "public, max-age=31536000"
            }
        });

    } catch (e) {
        return new Response(`Error: ${e.message}`, { status: 404 });
    }
}

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
