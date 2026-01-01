/**
 * Cloudflare Images upload endpoint
 *
 * Uploads images to Cloudflare Images and returns the optimized URL
 *
 * POST /api/images/upload
 * Body: FormData with 'file' field
 * Requires: Bearer token with admin/moderator role
 *
 * Returns: { url: string, id: string, variants: string[] }
 */

export async function onRequestPost({ request, env }) {
  try {
    // Verify admin/moderator session from Bearer token
    const authHeader = request.headers.get('Authorization');
    const token = authHeader?.replace('Bearer ', '');

    if (!token) {
      return new Response(JSON.stringify({ error: 'Unauthorized - No token provided' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Verify session against database
    const session = await env.DBA.prepare(`
      SELECT s.*, u.role FROM sessions s
      JOIN users u ON s.user_id = u.user_id
      WHERE s.token = ? AND s.expires_at > ?
    `).bind(token, Date.now()).first();

    if (!session) {
      return new Response(JSON.stringify({ error: 'Unauthorized - Invalid session' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Check if user has admin or moderator role
    let userRoles;
    try {
      userRoles = session.role ? JSON.parse(session.role) : ['user'];
    } catch (e) {
      userRoles = ['user'];
    }

    if (!userRoles.includes('admin') && !userRoles.includes('moderator')) {
      return new Response(JSON.stringify({ error: 'Insufficient permissions' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const formData = await request.formData();
    const file = formData.get('file');

    if (!file) {
      return new Response(JSON.stringify({ error: 'No file provided' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Check file type
    if (!file.type.startsWith('image/')) {
      return new Response(JSON.stringify({ error: 'File must be an image' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Check file size (Cloudflare Images limit is 10MB)
    if (file.size > 10 * 1024 * 1024) {
      return new Response(JSON.stringify({ error: 'File size must be less than 10MB' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Get Cloudflare Images credentials from environment
    const accountId = env.CF_ACCOUNT_ID || 'd9fecb3357660ea0fcfee5b23d5dd2f6';
    const accountHash = env.CF_ACCOUNT_HASH || 'I2Jsf9fuZwSztWJZaX0DJA';
    const apiToken = env.CF_IMAGES_API_TOKEN;

    if (!accountId || !apiToken) {
      return new Response(JSON.stringify({
        error: 'Cloudflare Images not configured. Please set CF_ACCOUNT_ID and CF_IMAGES_API_TOKEN environment variables.'
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
        error: 'Failed to upload image to Cloudflare Images',
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

    // Construct URL using account hash
    const imageUrl = publicVariant || `https://imagedelivery.net/${accountHash}/${imageId}/public`;

    return new Response(JSON.stringify({
      success: true,
      id: imageId,
      url: imageUrl,
      variants: variants
    }), {
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization'
      }
    });

  } catch (error) {
    console.error('Image upload error:', error);
    return new Response(JSON.stringify({
      error: 'Upload failed: ' + error.message
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

// Handle CORS preflight
export async function onRequestOptions() {
  return new Response(null, {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization'
    }
  });
}
