function getReadableDiff(oldData, newData) {
  const output = [];

  const types = Object.keys(newData);
  for (const type of types) {
    const newItems = newData[type];
    const oldItems = (oldData[type] || []);

    // Detect additions
    for (const newItem of newItems) {
      const match = oldItems.find(i => i.name === newItem.name);
      if (!match) {
        output.push(`🆕 Added: "${newItem.name}"`);
        continue;
      }

      for (const key in newItem) {
        const newVal = newItem[key];
        const oldVal = match[key];

        if (JSON.stringify(newVal) !== JSON.stringify(oldVal)) {
          output.push(`[${newItem.name}] ${key}: ${oldVal} → ${newVal}`);
        }
      }
    }

    // Detect removals
    for (const oldItem of oldItems) {
      const match = newItems.find(i => i.name === oldItem.name);
      if (!match) {
        output.push(`❌ Removed: "${oldItem.name}"`);
      }
    }
  }

  return output.join("\n");
}

export async function onRequestPost(context) {
  const GITHUB_TOKEN = context.env.GITHUB_TOKEN;
  const GIST_ID = "0d0a3800287f3e7c6e5e944c8337fa91";
  const DBH = context.env.DBH;

  try {
    const body = await context.request.json();
    const username = body.username || "unknown";
    const newContent = body.content;
    const CURRENT_GIST_VERSION = body.version; // sent from client

    // Fetch current gist content
    const gistRes = await fetch(`https://api.github.com/gists/${GIST_ID}`, {
      headers: {
        Authorization: `Bearer ${GITHUB_TOKEN}`,
        Accept: "application/vnd.github+json",
        "User-Agent": "emwiki-site-worker"
      }
    });

    if (!gistRes.ok) throw new Error("Failed to fetch current gist content");
    const gistData = await gistRes.json();

    // Get latest gist version from GitHub API response
    const currentVersion = gistData.history?.[0]?.version;

        // Check if client's version matches the current gist version
    if (CURRENT_GIST_VERSION && CURRENT_GIST_VERSION !== currentVersion) {
      // A newer version exists on GitHub, reject update
      return new Response(
        JSON.stringify({ error: "Conflict: A newer version exists." }),
        { status: 409, headers: { "Content-Type": "application/json" } }
      );
    }

    const oldContentRaw = gistData.files["auto.json"]?.content || "{}";
    const oldContent = JSON.parse(oldContentRaw);

    const readableDiff = getReadableDiff(oldContent, newContent);
    const timestamp = new Date().toISOString();

    // Insert readable diff log into database
    await DBH.prepare(`
      INSERT INTO history (timestamp, username, diff)
      VALUES (?, ?, ?)
    `).bind(timestamp, username, readableDiff || "(No changes)").run();

    await DBH.prepare(`
      DELETE FROM history WHERE username = '__version__'
    `).run();

    await DBH.prepare(`
      INSERT INTO history (timestamp, username, diff)
      VALUES (?, '__version__', ?)
    `).bind(timestamp, currentVersion).run();

    // Combine new diff with previous log (prepend)
    const previousLog = gistData.files["history.log"]?.content || "";
    const fullHistoryLog = readableDiff.trim()
      ? `Updated by ${username} at ${timestamp}\n${readableDiff}\n\n---\n\n${previousLog}`
      : previousLog;

    // Prepare gist update payload
    const updatedGist = {
      files: {
        "auto.json": { content: JSON.stringify(newContent, null, 2) },
        "history.log": { content: fullHistoryLog }
      }
    };

    // Update the gist with new content
    const updateRes = await fetch(`https://api.github.com/gists/${GIST_ID}`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${GITHUB_TOKEN}`,
        Accept: "application/vnd.github+json",
        "Content-Type": "application/json",
        "User-Agent": "emwiki-site-worker"
      },
      body: JSON.stringify(updatedGist)
    });

    if (!updateRes.ok) {
      const errorText = await updateRes.text();
      return new Response(JSON.stringify({ error: errorText }), {
        status: 500,
        headers: { "Content-Type": "application/json" }
      });
    }

    return new Response(
      JSON.stringify({ message: "Gist updated and diff logged", readableDiff }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );

    

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message, stack: err.stack }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
}
