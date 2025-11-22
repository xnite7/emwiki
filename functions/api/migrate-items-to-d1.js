// Migration script to import items from Gist/JSON to D1 database
// This should be run once to migrate existing items

export async function onRequestPost(context) {
    const { request, env } = context;
    
    // CORS headers
    const corsHeaders = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    };

    if (request.method === 'OPTIONS') {
        return new Response(null, { headers: corsHeaders });
    }

    try {
        // Optional: Add authentication check for admin
        const authHeader = request.headers.get('Authorization');
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return new Response(JSON.stringify({ error: 'Unauthorized' }), {
                status: 401,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
        }

        // Fetch items from Gist API
        const gistRes = await fetch('https://emwiki.com/api/gist-version');
        if (!gistRes.ok) {
            throw new Error('Failed to fetch gist data');
        }

        const gistData = await gistRes.json();
        const rawContent = gistData.files?.['auto.json']?.content;
        
        if (!rawContent) {
            return new Response(JSON.stringify({ error: 'No items found in gist' }), {
                status: 404,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
        }

        const itemsData = JSON.parse(rawContent);
        const categories = ['gears', 'deaths', 'titles', 'pets', 'effects'];
        
        let totalItems = 0;
        let insertedItems = 0;
        let updatedItems = 0;
        let errors = [];

        // Process each category
        for (const category of categories) {
            if (!itemsData[category] || !Array.isArray(itemsData[category])) {
                continue;
            }

            const items = itemsData[category];
            const batch = [];

            for (const item of items) {
                totalItems++;

                // Prepare item data
                const itemData = {
                    name: item.name || '',
                    category: category,
                    img: item.img || null,
                    svg: item.svg || null,
                    price: item.price || null,
                    from: item.from || null,
                    price_code_rarity: item['price/code/rarity'] || null,
                    tradable: item.tradable !== false ? 1 : 0, // Default to tradable if not specified
                    new: item.new === true ? 1 : 0,
                    weekly: item.weekly === true ? 1 : 0,
                    weeklystar: item.weeklystar === true ? 1 : 0,
                    retired: item.retired === true ? 1 : 0,
                    premium: item.premium === true ? 1 : 0,
                    removed: item.removed === true ? 1 : 0,
                    price_history: item.priceHistory ? JSON.stringify(item.priceHistory.slice(-15)) : null,
                    demand: item.demand || 0
                };

                // Use INSERT OR REPLACE for upsert
                batch.push(
                    env.DBA.prepare(`
                        INSERT INTO items (
                            name, category, img, svg, price, "from", price_code_rarity,
                            tradable, "new", weekly, weeklystar, retired, premium, removed,
                            price_history, demand, created_at, updated_at
                        )
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, strftime('%s', 'now'), strftime('%s', 'now'))
                        ON CONFLICT(category, name)
                        DO UPDATE SET
                            img = excluded.img,
                            svg = excluded.svg,
                            price = excluded.price,
                            "from" = excluded."from",
                            price_code_rarity = excluded.price_code_rarity,
                            tradable = excluded.tradable,
                            "new" = excluded."new",
                            weekly = excluded.weekly,
                            weeklystar = excluded.weeklystar,
                            retired = excluded.retired,
                            premium = excluded.premium,
                            removed = excluded.removed,
                            price_history = excluded.price_history,
                            demand = excluded.demand,
                            updated_at = strftime('%s', 'now')
                    `).bind(
                        itemData.name,
                        itemData.category,
                        itemData.img,
                        itemData.svg,
                        itemData.price,
                        itemData.from,
                        itemData.price_code_rarity,
                        itemData.tradable,
                        itemData.new,
                        itemData.weekly,
                        itemData.weeklystar,
                        itemData.retired,
                        itemData.premium,
                        itemData.removed,
                        itemData.price_history,
                        itemData.demand
                    )
                );
            }

            // Execute batch for this category
            if (batch.length > 0) {
                try {
                    await env.DBA.batch(batch);
                    insertedItems += batch.length;
                } catch (error) {
                    console.error(`Error inserting batch for category ${category}:`, error);
                    errors.push({ category, error: error.message });
                }
            }
        }

        // Get counts from database
        const countsResult = await env.DBA.prepare(`
            SELECT category, COUNT(*) as count
            FROM items
            GROUP BY category
        `).all();

        const categoryCounts = {};
        if (countsResult.results) {
            countsResult.results.forEach(row => {
                categoryCounts[row.category] = row.count;
            });
        }

        return new Response(JSON.stringify({
            success: true,
            message: 'Migration completed',
            stats: {
                totalProcessed: totalItems,
                inserted: insertedItems,
                updated: updatedItems,
                categoryCounts
            },
            errors: errors.length > 0 ? errors : undefined
        }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });

    } catch (error) {
        console.error('Migration error:', error);
        return new Response(JSON.stringify({
            error: error.message,
            stack: error.stack
        }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
    }
}

