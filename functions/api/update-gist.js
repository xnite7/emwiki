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

    // Fetch current gist content (before update)
    const gistRes = await fetch(`https://api.github.com/gists/${GIST_ID}`, {
      headers: {
        Authorization: `Bearer ${GITHUB_TOKEN}`,
        Accept: "application/vnd.github+json",
        "User-Agent": "emwiki-site-worker",
          "Access-Control-Allow-Origin": "*"
      }
    });

    if (!gistRes.ok) throw new Error("Failed to fetch current gist content");
    const gistData = await gistRes.json();

    // Fetch the latest recorded version from your D1 history
    const latestRes = await fetch('https://emwiki.site/api/latest-version');
    if (!latestRes.ok) {
      return new Response("Failed to fetch latest version", { status: 500 });
    }
    const latestText = await latestRes.text(); // format: "timestamp:version"
    const [latestTimestamp, latestVersion] = latestText.split("|");

    const oldContentRaw = gistData.files["auto.json"]?.content || "{}";
    const oldContent = JSON.parse(oldContentRaw);

    const latestDiff = getReadableDiff(oldContent, newContent); // reuse diff function

    // Check version conflict from client
    if (!body.force && CURRENT_GIST_VERSION && CURRENT_GIST_VERSION !== latestVersion) {
      return new Response(
        JSON.stringify({ 
          error: "Conflict: A newer version exists.",
          latestVersion,
          latestTimestamp,
          latestDiff
        }),
        { status: 409, headers: { "Content-Type": "application/json" } }
      );
    }

    const readableDiff = getReadableDiff(oldContent, newContent);
    const timestamp = new Date().toISOString();

    // Combine new diff with previous log (prepend)

    // Prepare gist update payload
    const updatedGist = {
      files: {
        "auto.json": { content: JSON.stringify(newContent, null, 2) }
      }
    };

    // Update the gist with new content
    const updateRes = await fetch(`https://api.github.com/gists/${GIST_ID}`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${GITHUB_TOKEN}`,
        Accept: "application/vnd.github+json",
        "Content-Type": "application/json",
        "User-Agent": "emwiki-site-worker",
         "Access-Control-Allow-Origin": "*"
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

    // Get updated gist data to retrieve the new version hash
    const updatedGistData = await updateRes.json();
    const newVersion = updatedGistData.history?.[0]?.version;

    // Insert readable diff log into database, including the new actual version from GitHub
    await DBH.prepare(`
      INSERT INTO history (timestamp, username, diff, version)
      VALUES (?, ?, ?, ?)
    `).bind(timestamp, username, readableDiff || "(No changes)", newVersion).run();

    return new Response(
      JSON.stringify({ message: "Gist updated and diff logged", readableDiff, newVersion }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message, stack: err.stack }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
}
