/**
 * Cloudflare Images upload endpoint
 *
 * Uploads images to Cloudflare Images and returns the optimized URL
 *
 * POST /api/images/upload
 * Body: FormData with 'file' field
 * Requires: Admin session cookie
 *
 * Returns: { url: string, id: string, variants: string[] }
 */

import { verifySession } from '../_utils/auth.js';

export async function onRequestPost({ request, env }) {
  try {
    // Verify admin session from cookie
    const cookieHeader = request.headers.get('Cookie') || '';
    const sessionToken = cookieHeader
      .split('; ')
      .find(c => c.startsWith('session='))
      ?.split('=')[1];

    if (!sessionToken) {
      return new Response(JSON.stringify({ error: 'Unauthorized - No session' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const session = await verifySession(sessionToken, env.SECRET_KEY);
    if (!session) {
      return new Response(JSON.stringify({ error: 'Unauthorized - Invalid session' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Check if user is admin
    const admin = await env.DBH.prepare('SELECT name FROM admins WHERE name = ?')
      .bind(session.name)
      .first();

    if (!admin) {
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
        'Access-Control-Allow-Methods': 'POST',
        'Access-Control-Allow-Headers': 'Content-Type'
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

