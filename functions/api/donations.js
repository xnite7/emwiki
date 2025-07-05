export async function onRequestGet(context) {
  const prefix = "purchase:";
  const { keys } = await context.env.KV_PURCHASE_LOGS.list({ prefix, limit: 1000 });

  const userMap = {};

  await Promise.all(
    keys.map(async (entry) => {
      const value = await context.env.KV_PURCHASE_LOGS.get(entry.name);
      try {
        const parsed = JSON.parse(value);
        const userId = parsed.userId;

        if (!userMap[userId]) {
          const res = await fetch(`https://emwiki.site/api/roblox-proxy?userId=${userId}&mode=lite`);
          const profile = res.ok ? await res.json() : {};

          userMap[userId] = {
            userId,
            name: profile.name || null,
            displayName: profile.displayName || null,
            avatar: profile.avatar || null,
            totalSpent: 0,
          };
        }

        userMap[userId].totalSpent += parsed.price || 0;
      } catch {
        // ignore parse errors
      }
    })
  );

  const result = Object.values(userMap).sort((a, b) => b.totalSpent - a.totalSpent);

  return new Response(JSON.stringify(result), {
    headers: { "Content-Type": "application/json" },
  });
}
