export async function onRequestGet(context) {
  const GITHUB_TOKEN = context.env.GITHUB_TOKEN;
  const GIST_ID = "0d0a3800287f3e7c6e5e944c8337fa91";

  const headers = {
    "User-Agent": "emwiki-admin-version-check",
  };
  if (GITHUB_TOKEN) {
    headers["Authorization"] = `Bearer ${GITHUB_TOKEN}`;
  }

  try {
    const res = await fetch(`https://api.github.com/gists/${GIST_ID}`, { headers });

    if (!res.ok) {
      return new Response(`Failed to fetch: ${res.statusText}`, { status: res.status });
    }

    const gist = await res.json();
    const text = gist.files["lastupdate.txt"]?.content || "0:"; // fallback

    return new Response(text, {
      headers: { "Content-Type": "text/plain", "Cache-Control": "no-cache" }
    });
  } catch (err) {
    return new Response(`Error: ${err.message}`, { status: 500 });
  }
}
