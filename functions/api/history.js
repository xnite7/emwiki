export async function onRequestGet(context) {
  const GITHUB_TOKEN = context.env.GITHUB_TOKEN;
  const GIST_ID = "0d0a3800287f3e7c6e5e944c8337fa91";

  try {
    const response = await fetch(`https://api.github.com/gists/${GIST_ID}/commits`, {
      headers: {
        Authorization: `Bearer ${GITHUB_TOKEN}`,
        Accept: "application/vnd.github+json",
      },
    });

    if (!response.ok) {
      return new Response("Failed to fetch history", { status: 500 });
    }

    const commits = await response.json();

    // Return only basic info per commit
    const simplified = commits.map(commit => ({
      version: commit.version,
      committed_at: commit.committed_at,
      user: commit.user?.login || "Unknown",
    }));

    return Response.json(simplified);
  } catch (err) {
    return new Response("Error: " + err.message, { status: 500 });
  }
}
