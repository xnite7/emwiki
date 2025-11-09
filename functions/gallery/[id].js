// Gallery Post Embed - Server-side rendered page for Discord/social media embeds
export async function onRequest(context) {
  const { params, request, env } = context;
  const postId = params.id;
  const base = 'https://emwiki.com';

  // Helper: bot detection for Discord, Twitter, Facebook crawlers
  function isBot(ua) {
    return /bot|crawler|spider|facebookexternalhit|twitterbot|slackbot|discordbot|whatsapp/i.test(ua);
  }

  const userAgent = request.headers.get('user-agent') || '';

  // Redirect normal users to gallery page with hash
  if (!isBot(userAgent)) {
    return Response.redirect(`${base}/gallery#post-${postId}`, 302);
  }

  try {
    // Fetch gallery post data from API
    const galleryItem = await env.DBA.prepare(`
      SELECT
        g.id,
        g.title,
        g.description,
        g.media_url,
        g.thumbnail_url,
        g.views,
        g.likes,
        g.created_at,
        u.username,
        u.display_name
      FROM gallery_items g
      LEFT JOIN users u ON g.user_id = u.user_id
      WHERE g.id = ? AND g.status = 1
    `).bind(postId).first();

    if (!galleryItem) {
      return new Response('Gallery post not found', { status: 404 });
    }

    // Helper to determine media type from URL
    const getMediaType = (url) => {
      if (!url) return 'image';
      const ext = url.split('.').pop().toLowerCase();
      const videoExts = ['mp4', 'webm', 'mov'];
      return videoExts.includes(ext) ? 'video' : 'image';
    };

    // Parse JSON fields
    const likes = JSON.parse(galleryItem.likes || '[]');
    const mediaType = getMediaType(galleryItem.media_url);
    let viewsCount = galleryItem.views || 0;

    // Sanitize data for HTML
    const title = escapeHtml(galleryItem.title || 'Gallery Post');
    const description = escapeHtml(galleryItem.description || '');
    const author = escapeHtml(galleryItem.display_name || galleryItem.username || 'Unknown');
    const likesCount = likes.length;

    // Use thumbnail for videos, direct URL for images
    const imageUrl = mediaType === 'video' && galleryItem.thumbnail_url
      ? galleryItem.thumbnail_url
      : galleryItem.media_url;

    // Format metadata description with stats
    const metaDescription = description
      ? `${description} • ${likesCount} likes • ${viewsCount} views`
      : `${likesCount} likes • ${viewsCount} views • Posted by ${author}`;

    // Generate HTML with OpenGraph tags
    return new Response(`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${title} - Epic Wiki Gallery</title>

<!-- OpenGraph tags for Discord/Facebook -->
<meta property="og:type" content="article" />
<meta property="og:title" content="${title}" />
<meta property="og:description" content="${metaDescription}" />
<meta property="og:image" content="${imageUrl}" />
<meta property="og:url" content="${base}/gallery/${postId}" />
<meta property="og:site_name" content="Epic Wiki Gallery" />

<!-- Twitter Card tags -->
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="${title}" />
<meta name="twitter:description" content="${metaDescription}" />
<meta name="twitter:image" content="${imageUrl}" />

<!-- Additional metadata -->
<meta property="article:author" content="${author}" />
<meta property="article:published_time" content="${galleryItem.created_at}" />

<!-- Theme color for Discord embed -->
<meta name="theme-color" content="#667eea" />
</head>
<body>
<script>
  // Redirect to gallery page with hash for users with JS enabled
  window.location.href = '${base}/gallery#post-${postId}';
</script>
<noscript>
  <meta http-equiv="refresh" content="0; url=${base}/gallery#post-${postId}" />
</noscript>
</body>
</html>`, {
      headers: {
        'Content-Type': 'text/html',
        'Cache-Control': 'public, max-age=300' // Cache for 5 minutes
      }
    });

  } catch (error) {
    console.error('Gallery embed error:', error);
    return new Response(`Error loading gallery post: ${error.message}`, {
      status: 500,
      headers: { 'Content-Type': 'text/plain' }
    });
  }
}

// Helper to escape HTML special chars
function escapeHtml(text) {
  if (!text) return '';
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
