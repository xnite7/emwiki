export async function onRequestPost({ request, env }) {
  try {
    const formData = await request.formData();
    const file = formData.get("file");

    if (!file) {
      return new Response("No file uploaded", { status: 400 });
    }

    // Unique key: timestamp + original filename
    const key = `uploads/${Date.now()}-${file.name}`;

    // Save to R2
    await env.MY_BUCKET.put(key, await file.arrayBuffer(), {
      httpMetadata: { contentType: file.type }, // preserve MIME type
    });

    // Public access via R2 public bucket domain (or serve via Worker)
    const url = `https://cdn.emwiki.com/${key}`;

    return new Response(JSON.stringify({ url }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response("Upload failed: " + err.message, { status: 500 });
  }
}
