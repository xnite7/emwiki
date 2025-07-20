export async function onRequestPost(context) {
  const GITHUB_TOKEN = context.env.GITHUB_TOKEN;
  const GIST_ID = "0d0a3800287f3e7c6e5e944c8337fa91";

  console.log("GITHUB_TOKEN is", GITHUB_TOKEN ? "set" : "NOT SET");

  try {
    const body = await context.request.json();
    const username = body.username || "unknown";
    const content = body.content;

    console.log("Content to update:", JSON.stringify(content, null, 2));

    const updatedGist = {
      files: {
        "auto.json": {
          content: JSON.stringify(content, null, 2),
        }
      }
    };

    const response = await fetch(`https://api.github.com/gists/${GIST_ID}`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${GITHUB_TOKEN}`,
        Accept: "application/vnd.github+json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(updatedGist),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Failed to update Gist:", errorText);
      return new Response(errorText, {
        status: 500,
        headers: { "Content-Type": "application/json" }
      });
    }

    return new Response("Gist updated", { status: 200 });
  } catch (err) {
    console.error(err);
    return new Response(JSON.stringify({ error: err.message, stack: err.stack }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
}
