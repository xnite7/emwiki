import { diffJson } from "diff"; // Use the 'diff' package via esbuild plugin if available

export async function onRequestPost(context) {
  const GITHUB_TOKEN = context.env.GITHUB_TOKEN;
  const GIST_ID = "0d0a3800287f3e7c6e5e944c8337fa91";
  const DBH = context.env.DBH;

  try {
    const body = await context.request.json();
    const username = body.username || "unknown";
    const newContent = body.content;

    // Fetch the current auto.json content
    const gistRes = await fetch(`https://api.github.com/gists/${GIST_ID}`, {
      headers: {
        Authorization: `Bearer ${GITHUB_TOKEN}`,
        Accept: "application/vnd.github+json",
        "User-Agent": "emwiki-site-worker"
      }
    });

    if (!gistRes.ok) throw new Error("Failed to fetch current gist content");

    const gistData = await gistRes.json();
    const oldContentRaw = gistData.files["auto.json"].content || "{}";
    const oldContent = JSON.parse(oldContentRaw);

    // Compute JSON diff
    const diff = diffJson(oldContent, newContent);
    const diffText = diff.map(part => {
      const prefix = part.added ? "+" : part.removed ? "-" : " ";
      return prefix + JSON.stringify(part.value);
    }).join("\n");

    // Save the diff log into D1
    await DBH.prepare(`
      INSERT INTO history (timestamp, username, diff)
      VALUES (?, ?, ?)
    `).bind(new Date().toISOString(), username, diffText).run();

    // Prepare Gist update
    const updatedGist = {
      files: {
        "auto.json": {
          content: JSON.stringify(newContent, null, 2),
        },
        "history.log": {
          content: `Updated by ${username} at ${new Date().toISOString()}`,
        },
      }
    };

    const response = await fetch(`https://api.github.com/gists/${GIST_ID}`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${GITHUB_TOKEN}`,
        Accept: "application/vnd.github+json",
        "Content-Type": "application/json",
        "User-Agent": "emwiki-site-worker"
      },
      body: JSON.stringify(updatedGist),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return new Response(errorText, {
        status: 500,
        headers: { "Content-Type": "application/json" }
      });
    }

    return new Response("Gist updated and diff logged", { status: 200 });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message, stack: err.stack }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
}
