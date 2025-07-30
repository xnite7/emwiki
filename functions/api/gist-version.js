export async function onRequestGet({ env }) {
 const GITHUB_TOKEN = env.GITHUB_TOKEN;
  const GIST_ID = '0d0a3800287f3e7c6e5e944c8337fa91';

  const response = await fetch(`https://api.github.com/gists/${GIST_ID}`, {
    headers: {
      'Authorization': `Bearer ${GITHUB_TOKEN}`,
      'Accept': 'application/vnd.github+json',
      'User-Agent': 'emwiki-site'
    }
  });

  if (!response.ok) {
    return new Response(JSON.stringify({ error: "Failed to fetch Gist", status: response.status }), {
      status: response.status,
      headers: {
         "Content-Type": "application/json",
         "Access-Control-Allow-Origin": "*"
        }
    });
  }

  const data = await response.json();
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 's-maxage=60',
      "Access-Control-Allow-Origin": "*"
    }
  });
}
