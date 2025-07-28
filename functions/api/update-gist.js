export default {
  async fetch(request, env, ctx) {
    if (request.method !== "POST") {
      return new Response("Method Not Allowed", { status: 405 });
    }

    const GIST_ID = "0d0a3800287f3e7c6e5e944c8337fa91";
    const GITHUB_TOKEN = env.GITHUB_TOKEN;

    let data;
    try {
      data = await request.json();
    } catch {
      return new Response("Invalid JSON", { status: 400 });
    }

    const { content, username, version: incomingVersion } = data;
    if (!content || !username || !incomingVersion) {
      return new Response("Missing content, username, or version", { status: 400 });
    }

    // Fetch latest Gist to check version
    const latestRes = await fetch(`https://api.github.com/gists/${GIST_ID}`, {
      headers: {
        "Authorization": `Bearer ${GITHUB_TOKEN}`,
        "User-Agent": "emwiki-admin-version-check"
      }
    });

    if (!latestRes.ok) {
      return new Response("Failed to fetch Gist metadata", { status: 500 });
    }

    const latestGist = await latestRes.json();
    const latestVersion = latestGist.history?.[0]?.version;

    if (incomingVersion !== latestVersion) {
      return new Response(
        JSON.stringify({
          error: "Conflict: another admin has updated the Gist. Please reload first."
        }),
        { status: 409, headers: { "Content-Type": "application/json" } }
      );
    }

    // Prepare updated content
    const now = new Date().toLocaleString("en-GB", { timeZone: "Europe/Paris" });
    const logLine = `Updated by ${username} at ${now}`;

    const updateRes = await fetch(`https://api.github.com/gists/${GIST_ID}`, {
      method: "PATCH",
      headers: {
        "Authorization": `Bearer ${GITHUB_TOKEN}`,
        "Content-Type": "application/json",
        "User-Agent": "emwiki-admin-save"
      },
      body: JSON.stringify({
        files: {
          "auto.json": {
            content: JSON.stringify(content, null, 2)
          },
          "history.log": {
            content: `${logLine}\n${latestGist.files["history.log"]?.content || ""}`
          }
        }
      })
    });

    if (!updateRes.ok) {
      return new Response("Failed to update Gist", { status: 500 });
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  }
};
