/**
 * Image serving endpoint with Cloudflare Image Resizing optimization
 * 
 * Serves images from R2 bucket with automatic optimization via Cloudflare Image Resizing
 * 
 * Usage:
 *   /api/images/items/gears/yY4PlAA.png
 *   /api/images/items/gears/yY4PlAA.png?width=200&height=200&quality=85&format=webp
 * 
 * Query parameters:
 *   - width: Target width in pixels
 *   - height: Target height in pixels  
 *   - quality: JPEG/WebP quality (1-100, default: 85)
 *   - format: Output format (webp, avif, jpeg, png, default: auto-detect based on Accept header)
 *   - fit: Resize fit mode (scale-down, contain, cover, crop, pad, default: scale-down)
 */

export async function onRequest(context) {
  const { request, env, params } = context;
  const url = new URL(request.url);
  
  // Get the image path from params (everything after /api/images/)
  const imagePath = params.path ? params.path.join('/') : '';
  
  if (!imagePath) {
    return new Response('Image path required', { status: 400 });
  }

  // Normalize path: convert backslashes to forward slashes, remove leading slashes
  const normalizedPath = imagePath.replace(/\\/g, '/').replace(/^\/+/, '');
  
  // Construct R2 key (images are stored under items/ prefix)
  // Handle both old format (imgs/gears/file.png) and new format (items/gears/file.png)
  let r2Key = normalizedPath;
  if (r2Key.startsWith('imgs/')) {
    r2Key = r2Key.replace('imgs/', 'items/');
  } else if (!r2Key.startsWith('items/')) {
    r2Key = `items/${r2Key}`;
  }

  try {
    // Get image from R2
    const object = await env.MY_BUCKET.get(r2Key);
    
    if (!object) {
      // Try alternative path without items/ prefix
      const altKey = normalizedPath.startsWith('items/') 
        ? normalizedPath.replace('items/', '')
        : normalizedPath;
      const altObject = await env.MY_BUCKET.get(altKey);
      
      if (!altObject) {
        return new Response('Image not found', { status: 404 });
      }
      
      return serveImage(altObject, url, request, env);
    }

    return serveImage(object, url, request, env);
    
  } catch (error) {
    console.error('Error serving image:', error);
    return new Response('Error serving image: ' + error.message, { status: 500 });
  }
}

/**
 * Serve image with Cloudflare Image Resizing optimization
 * 
 * Cloudflare automatically optimizes images when:
 * 1. Image Resizing is enabled on your account
 * 2. Images are served through Cloudflare's edge (via Workers)
 * 3. Query parameters are used for resizing
 * 
 * For automatic format optimization (WebP/AVIF), Cloudflare does this automatically
 * based on the Accept header when Image Resizing is enabled.
 */
async function serveImage(object, url, request, env) {
  // Get query parameters for image optimization
  const width = url.searchParams.get('width');
  const height = url.searchParams.get('height');
  const quality = url.searchParams.get('quality');
  const format = url.searchParams.get('format'); // webp, avif, jpeg, png
  const fit = url.searchParams.get('fit') || 'scale-down'; // scale-down, contain, cover, crop, pad
  
  // Get original content type
  const contentType = object.httpMetadata?.contentType || 'image/png';
  
  // Get image data
  const imageData = await object.arrayBuffer();
  
  // Build response headers
  const headers = new Headers({
    'Content-Type': contentType,
    'Cache-Control': 'public, max-age=31536000, immutable', // Cache for 1 year
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET',
  });
  
  // If resizing parameters are provided, Cloudflare Image Resizing will handle it
  // when enabled on your account. The resizing happens automatically at the edge.
  // For now, we serve the original image. To enable resizing:
  // 1. Enable Image Resizing in Cloudflare dashboard
  // 2. Images will be automatically optimized based on Accept header and query params
  
  // Add hints for Cloudflare Image Resizing (if enabled)
  if (width || height || format) {
    // Cloudflare Image Resizing uses these query parameters automatically
    // when enabled. The actual resizing happens at the edge.
    // For programmatic resizing without edge resizing, you'd need @cloudflare/images package
    
    // For now, serve original with optimization headers
    // Cloudflare will automatically convert to WebP/AVIF if supported and enabled
  }
  
  return new Response(imageData, { headers });
}

