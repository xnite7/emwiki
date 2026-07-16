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

import { uploadImageToCloudflareImages } from '../_utils/images.js';

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

    // Upload to Cloudflare Images via shared helper
    const uploaded = await uploadImageToCloudflareImages(file, file.name || 'upload.png', env);

    return new Response(JSON.stringify({
      success: true,
      id: uploaded.id,
      url: uploaded.url,
      variants: uploaded.variants
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
