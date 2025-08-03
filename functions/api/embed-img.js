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
        <svg xmlns="http://www.w3.org/2000/svg" width="500" height="520">
            

            <rect x="10" y="20" width="470" rx="20" ry="20" height="490" fill="${bgColor}" stroke="white" stroke-width="10"/>
            <text class="sign" x="425" y="40" font-size="160" fill="white" text-anchor="middle" dominant-baseline="middle">EC</text>
            <text x="246" y="465" font-size="160" fill="white" text-anchor="middle" dominant-baseline="middle">awda</text>
            <image href="${img}" x="45" y="65" width="400" height="400"/>

            

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

