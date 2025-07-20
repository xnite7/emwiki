export async function onRequestPost(context, env) {
  const GITHUB_TOKEN = env.GITHUB_TOKEN;
  const GIST_ID = "0d0a3800287f3e7c6e5e944c8337fa91";

  try {
    const body = await context.request.json();
    const username = body.username || "unknown";
    const content = body.content;

    // Optional: log entry to append to history
    const historyNote = `Updated by ${username} at ${new Date().toISOString()}`;

    // Prepare content for Gist
    const updatedGist = {
      files: {
        "auto.json": {
          content: JSON.stringify(content, null, 2),
        },
        "history.log": {
          content: `${historyNote}\n${JSON.stringify(content)}\n\n`, // append if needed
        },
      },
    };

    const response = await fetch(`https://api.github.com/gists/${GIST_ID}`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${GITHUB_TOKEN}`,
        Accept: "application/vnd.github+json",
      },
      body: JSON.stringify(updatedGist),
    });

    if (!response.ok) {
        console.error("Failed to update Gist:", await response.text());
      return new Response("Failed to update Gist", { status: 500 });
    }

    return new Response("Gist updated", { status: 200 });
  } catch (err) {
    console.error(err);
    // Return error details for debugging
  return new Response(JSON.stringify({ error: err.message, stack: err.stack }), {
    status: 500,
    headers: { "Content-Type": "application/json" }
  });
}}
