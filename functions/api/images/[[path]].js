/**
 * Image serving endpoint - redirects to Cloudflare Images URLs with optimizations
 * 
 * This endpoint looks up image paths in the database and redirects to Cloudflare Images URLs.
 * Cloudflare Images provides automatic optimization, format conversion (WebP/AVIF), and resizing.
 * 
 * Usage Examples:
 *   /api/images/items/gears/yY4PlAA.png                          # Original size
 *   /api/images/items/gears/yY4PlAA.png?width=200                # Resize to 200px width
 *   /api/images/items/gears/yY4PlAA.png?width=200&height=200     # Resize to 200x200
 *   /api/images/items/gears/yY4PlAA.png?width=200&fit=cover      # Cover fit mode
 *   /api/images/items/gears/yY4PlAA.png?width=200&quality=90     # Higher quality
 *   /api/images/items/gears/yY4PlAA.png?width=200&format=webp     # Force WebP
 * 
 * Query Parameters (passed to Cloudflare Images):
 *   - width: Target width in pixels (maintains aspect ratio if height not specified)
 *   - height: Target height in pixels (maintains aspect ratio if width not specified)
 *   - fit: Resize fit mode:
 *     * scale-down: Only resize if image is larger (default)
 *     * contain: Fit entire image within dimensions
 *     * cover: Fill dimensions, may crop
 *     * crop: Crop to exact dimensions
 *     * pad: Add padding to fit dimensions
 *   - quality: JPEG/WebP quality (1-100, default: 85)
 *   - format: Output format (webp, avif, jpeg, png). If not specified, browser-optimal format is chosen automatically.
 * 
 * Note: Format conversion (WebP/AVIF) is automatic based on browser support if format is not specified.
 */

export async function onRequest(context) {
  const { request, env, params } = context;
  const url = new URL(request.url);
  
  // Cloudflare Images account hash
  const CF_ACCOUNT_HASH = env.CF_ACCOUNT_HASH || 'I2Jsf9fuZwSztWJZaX0DJA';
  
  // Get the image path from params (everything after /api/images/)
  const imagePath = params.path ? params.path.join('/') : '';
  
  if (!imagePath) {
    return new Response('Image path required', { status: 400 });
  }

  // Normalize path: convert backslashes to forward slashes, remove leading slashes
  const normalizedPath = imagePath.replace(/\\/g, '/').replace(/^\/+/, '');
  
  // Handle both old format (imgs/gears/file.png) and new format (items/gears/file.png)
  let lookupPath = normalizedPath;
  if (lookupPath.startsWith('imgs/')) {
    lookupPath = lookupPath.replace('imgs/', 'items/');
  } else if (!lookupPath.startsWith('items/')) {
    lookupPath = `items/${lookupPath}`;
  }

  try {
    // Look up image URL in database
    // First, try to find an item with this image path
    const item = await env.DBA.prepare(`
      SELECT img FROM items 
      WHERE img LIKE ? OR img LIKE ?
      LIMIT 1
    `).bind(
      `%${normalizedPath}%`,
      `%${lookupPath}%`
    ).first();

    if (item && item.img) {
      // Check if it's already a Cloudflare Images URL
      if (item.img.includes('imagedelivery.net') || item.img.includes('cloudflare-images.com')) {
        // It's already a Cloudflare Images URL, add transformations via query params
        const imageUrl = new URL(item.img);
        
        // Extract transformation parameters
        const width = url.searchParams.get('width');
        const height = url.searchParams.get('height');
        const fit = url.searchParams.get('fit') || 'scale-down'; // Default fit mode
        const quality = url.searchParams.get('quality');
        const format = url.searchParams.get('format');
        
        // Cloudflare Images supports transformations via query parameters
        // These are applied automatically by Cloudflare's edge
        if (width) imageUrl.searchParams.set('width', width);
        if (height) imageUrl.searchParams.set('height', height);
        if (fit) imageUrl.searchParams.set('fit', fit);
        if (quality) imageUrl.searchParams.set('quality', quality);
        if (format) imageUrl.searchParams.set('format', format);
        
        return Response.redirect(imageUrl.toString(), 302);
      }
      
      // If it's not a Cloudflare Images URL yet, try to extract image ID if it's stored
      // Otherwise, we'll need to look it up or return 404
    }

    // Fallback: Try to serve from R2 if image not found in database
    // This handles the case where database hasn't been updated yet
    try {
      // Try to get image from R2 as fallback
      const r2Key = normalizedPath.startsWith('items/') ? normalizedPath : `items/${normalizedPath}`;
      
      // Handle uploads differently
      let finalR2Key = r2Key;
      if (r2Key.startsWith('items/uploads/')) {
        finalR2Key = r2Key.replace('items/uploads/', 'uploads/');
      }
      
      const object = await env.MY_BUCKET?.get(finalR2Key);
      
      if (object) {
        // Serve from R2
        const imageData = await object.arrayBuffer();
        const contentType = object.httpMetadata?.contentType || 'image/png';
        
        return new Response(imageData, {
          headers: {
            'Content-Type': contentType,
            'Cache-Control': 'public, max-age=31536000, immutable',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET',
          }
        });
      }
      
      // Not found in R2 either
      return new Response('Image not found', { 
        status: 404,
        headers: {
          'Content-Type': 'text/plain',
          'Access-Control-Allow-Origin': '*'
        }
      });
    } catch (error) {
      return new Response('Image not found', { 
        status: 404,
        headers: {
          'Content-Type': 'text/plain',
          'Access-Control-Allow-Origin': '*'
        }
      });
    }
    
  } catch (error) {
    console.error('Error serving image:', error);
    return new Response('Error serving image: ' + error.message, { 
      status: 500,
      headers: {
        'Content-Type': 'text/plain',
        'Access-Control-Allow-Origin': '*'
      }
    });
  }
}

