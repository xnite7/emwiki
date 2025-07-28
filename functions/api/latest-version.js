export default {
  async fetch(request, env, ctx) {
    if (request.method !== "GET") {
      return new Response("Method Not Allowed", { status: 405 });
    }

    const GIST_ID = "0d0a3800287f3e7c6e5e944c8337fa91";
    const GITHUB_TOKEN = env.GITHUB_TOKEN;

    const latestRes = await fetch(`https://api.github.com/gists/${GIST_ID}`, {
      headers: {
        "Authorization": `Bearer ${GITHUB_TOKEN}`,
        "User-Agent": "emwiki-admin-version-check"
      }
    });

    if (!latestRes.ok) {
      return new Response("Failed to fetch", { status: 500 });
    }

    const gist = await latestRes.json();
    const text = gist.files["lastupdate.txt"]?.content || "";

    return new Response(text, {
      headers: {
        "Content-Type": "text/plain",
        "Cache-Control": "no-cache"
      }
    });
  }
};
