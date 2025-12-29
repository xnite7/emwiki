/**
 * Image serving endpoint - redirects to Cloudflare Images URLs
 * 
 * This endpoint looks up image paths in the database and redirects to Cloudflare Images URLs.
 * Cloudflare Images provides automatic optimization, format conversion (WebP/AVIF), and resizing.
 * 
 * Usage:
 *   /api/images/items/gears/yY4PlAA.png
 *   /api/images/items/gears/yY4PlAA.png?width=200&height=200&fit=scale-down
 * 
 * Query parameters (passed to Cloudflare Images):
 *   - width: Target width in pixels
 *   - height: Target height in pixels  
 *   - fit: Resize fit mode (scale-down, contain, cover, crop, pad, default: scale-down)
 *   - quality: JPEG/WebP quality (1-100, default: 85)
 * 
 * Note: Format conversion (WebP/AVIF) is automatic based on browser support.
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
        // It's already a Cloudflare Images URL, redirect to it with query params
        const imageUrl = new URL(item.img);
        
        // Copy query parameters for transformations
        const width = url.searchParams.get('width');
        const height = url.searchParams.get('height');
        const fit = url.searchParams.get('fit');
        const quality = url.searchParams.get('quality');
        
        if (width) imageUrl.searchParams.set('width', width);
        if (height) imageUrl.searchParams.set('height', height);
        if (fit) imageUrl.searchParams.set('fit', fit);
        if (quality) imageUrl.searchParams.set('quality', quality);
        
        return Response.redirect(imageUrl.toString(), 302);
      }
      
      // If it's not a Cloudflare Images URL yet, try to extract image ID if it's stored
      // Otherwise, we'll need to look it up or return 404
    }

    // Fallback: Try to find in image URL mapping file (if migration script created it)
    // This is a temporary fallback during migration
    try {
      // For now, return 404 - images should be migrated to Cloudflare Images first
      return new Response('Image not found. Please ensure images are uploaded to Cloudflare Images.', { 
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

