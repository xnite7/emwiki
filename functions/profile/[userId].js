// Profile Page with Dynamic Meta Tags for Discord/social media embeds
export async function onRequest(context) {
  const { params, request, env } = context;
  const userId = params.userId;
  const base = 'https://emwiki.com';

  // Helper: bot detection for Discord, Twitter, Facebook crawlers
  function isBot(ua) {
    return /bot|crawler|spider|facebookexternalhit|twitterbot|slackbot|discordbot|whatsapp/i.test(ua);
  }

  const userAgent = request.headers.get('user-agent') || '';

  try {
    // Fetch user data from database
    const user = await env.DBA.prepare(`
      SELECT
        user_id,
        username,
        display_name,
        avatar_url,
        role,
        created_at,
        last_online
      FROM users
      WHERE user_id = ?
    `).bind(userId).first();

    if (!user) {
      return new Response('User not found', { status: 404 });
    }

    // Get user trade stats
    let stats = null;
    try {
      stats = await env.DBA.prepare(`
        SELECT
          total_trades,
          successful_trades,
          average_rating,
          total_reviews
        FROM user_trade_stats
        WHERE user_id = ?
      `).bind(userId).first();
    } catch (e) {
      console.error('Failed to fetch user_trade_stats:', e);
      stats = null;
    }

    // Parse roles
    let roles;
    try {
      roles = user.role ? JSON.parse(user.role) : ['user'];
    } catch (e) {
      roles = ['user'];
    }

    // Sanitize data for HTML
    const displayName = escapeHtml(user.display_name || user.username);
    const username = escapeHtml(user.username);
    const avatarUrl = user.avatar_url || 'https://emwiki.com/imgs/placeholder.png';

    // Build description with stats
    const totalTrades = stats?.total_trades || 0;
    const rating = stats?.average_rating || 0;
    const reviews = stats?.total_reviews || 0;

    const rolesBadges = roles.filter(r => r !== 'user').map(r => r.toUpperCase()).join(', ');
    const rolesText = rolesBadges ? ` • ${rolesBadges}` : '';

    const metaDescription = `@${username}${rolesText} • ${totalTrades} trades • ${rating.toFixed(1)}⭐ rating (${reviews} reviews)`;

    // If it's a bot, serve static HTML with OpenGraph tags
    if (isBot(userAgent)) {
      return new Response(`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${displayName} - EMwiki</title>

<!-- OpenGraph tags for Discord/Facebook -->
<meta property="og:type" content="profile" />
<meta property="og:title" content="${displayName}" />
<meta property="og:description" content="${metaDescription}" />
<meta property="og:image" content="${avatarUrl}" />
<meta property="og:url" content="${base}/profile/${userId}" />
<meta property="og:site_name" content="EMwiki" />

<!-- Twitter Card tags -->
<meta name="twitter:card" content="summary" />
<meta name="twitter:title" content="${displayName}" />
<meta name="twitter:description" content="${metaDescription}" />
<meta name="twitter:image" content="${avatarUrl}" />

<!-- Profile metadata -->
<meta property="profile:username" content="${username}" />

<!-- Theme color for Discord embed -->
<meta name="theme-color" content="#667eea" />
</head>
<body>
<h1>${displayName}</h1>
<p>${metaDescription}</p>
</body>
</html>`, {
        headers: {
          'Content-Type': 'text/html',
          'Cache-Control': 'public, max-age=300' // Cache for 5 minutes
        }
      });
    }

    // For regular users, fetch and serve profile.html from assets
    // The JavaScript in profile.html will parse the URL path
    try {
      const profileAsset = await env.ASSETS.fetch(`${base}/profile.html`);
      let html = await profileAsset.text();

      // Replace meta tags with dynamic ones for better SEO and sharing
      html = html.replace(
        /<title>.*?<\/title>/,
        `<title>${displayName} - EMwiki</title>`
      );

      html = html.replace(
        /<meta name="description" content=".*?">/,
        `<meta name="description" content="${metaDescription}">`
      );

      html = html.replace(
        /<meta property="og:title" content=".*?">/,
        `<meta property="og:title" content="${displayName}">`
      );

      // Add og:description if not present, otherwise replace
      if (!html.includes('og:description')) {
        html = html.replace(
          /<meta property="og:image"/,
          `<meta property="og:description" content="${metaDescription}">\n    <meta property="og:image"`
        );
      } else {
        html = html.replace(
          /<meta property="og:description" content=".*?">/,
          `<meta property="og:description" content="${metaDescription}">`
        );
      }

      html = html.replace(
        /<meta property="og:image" content=".*?">/,
        `<meta property="og:image" content="${avatarUrl}">`
      );

      return new Response(html, {
        headers: {
          'Content-Type': 'text/html',
          'Cache-Control': 'public, max-age=60'
        }
      });
    } catch (assetError) {
      console.error('Failed to fetch profile.html from assets:', assetError);
      // Fallback: redirect to profile.html and let it handle the URL
      return Response.redirect(`${base}/profile.html`, 302);
    }

  } catch (error) {
    console.error('Profile embed error:', error);
    return new Response(`Error loading profile: ${error.message}`, {
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
