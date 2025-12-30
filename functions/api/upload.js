/**
 * Legacy upload endpoint - uses Cloudflare Images
 * 
 * This endpoint now uploads directly to Cloudflare Images instead of R2.
 * Maintains backwards compatibility with existing admin panel code.
 * 
 * For new code, use /api/images/upload directly.
 */
export async function onRequestPost({ request, env }) {
  try {
    const formData = await request.formData();
    const file = formData.get("file");

    if (!file) {
      return new Response(JSON.stringify({ error: "No file uploaded" }), { 
        status: 400,
        headers: { "Content-Type": "application/json" }
      });
    }

    // Get Cloudflare Images credentials
    const accountId = env.CF_ACCOUNT_ID || 'd9fecb3357660ea0fcfee5b23d5dd2f6';
    const accountHash = env.CF_ACCOUNT_HASH || 'I2Jsf9fuZwSztWJZaX0DJA';
    const apiToken = env.CF_IMAGES_API_TOKEN;

    if (!accountId || !apiToken) {
      return new Response(JSON.stringify({ 
        error: 'Cloudflare Images not configured' 
      }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Prepare form data for Cloudflare Images API
    const cfFormData = new FormData();
    cfFormData.append('file', file);

    // Upload to Cloudflare Images
    const response = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${accountId}/images/v1`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiToken}`
        },
        body: cfFormData
      }
    );

    if (!response.ok) {
      const errorData = await response.text();
      console.error('Cloudflare Images API error:', errorData);
      return new Response(JSON.stringify({ 
        error: 'Failed to upload image',
        details: errorData
      }), {
        status: response.status,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const data = await response.json();

    if (!data.success) {
      return new Response(JSON.stringify({ 
        error: 'Upload failed',
        details: data.errors
      }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Return the image URL (use account hash to construct URL)
    const imageId = data.result.id;
    const variants = data.result.variants || [];
    const publicVariant = variants.find(v => v.includes('/public')) || variants[0] || '';
    const imageUrl = publicVariant || `https://imagedelivery.net/${accountHash}/${imageId}/public`;

    return new Response(JSON.stringify({ 
      success: true,
      url: imageUrl,
      id: imageId,
      variants: variants
    }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ 
      error: "Upload failed: " + err.message 
    }), { 
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
}
