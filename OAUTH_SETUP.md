# OAuth 2.0 Setup Guide

This guide will help you configure OAuth 2.0 authentication for your EMWIKI application.

## Overview

OAuth 2.0 has been added as the **preferred default authentication method** alongside the existing in-game code verification. OAuth provides:

- ✅ **Faster authentication** - No need to join the game
- ✅ **Better user experience** - One-click sign-in with Roblox
- ✅ **More secure** - Industry-standard OAuth 2.0 protocol
- ✅ **Automatic user info** - Gets username, display name, and avatar directly from Roblox

## Prerequisites

- You must be **ID Verified** on Roblox to create OAuth 2.0 applications
- Access to [Roblox Creator Dashboard](https://create.roblox.com/credentials)

## Step 1: Create OAuth 2.0 Application

1. Go to [Roblox Creator Dashboard - Credentials](https://create.roblox.com/credentials)
2. Click **"Create OAuth2 App"**
3. Fill in the application details:
   - **App Name**: `EMWIKI` (or your preferred name)
   - **Description**: `Epic Minigames Wiki Authentication`
   - **Redirect URLs**:
     - For local development: `http://localhost:8788/api/auth/oauth/callback`
     - For production: `https://yourdomain.com/api/auth/oauth/callback`
   - **Permissions (Scopes)**:
     - ✅ `openid` - Required for user ID
     - ✅ `profile` - Required for username, display name, and avatar

4. Click **"Create"**
5. **Save your credentials**:
   - Client ID
   - Client Secret (keep this private!)

## Step 2: Configure Environment Variables

### Local Development (.dev.vars)

Update your `.dev.vars` file with your OAuth credentials:

```env
KV_PURCHASE_LOGS = PurchaseLogs

# OAuth 2.0 Configuration
ROBLOX_OAUTH_CLIENT_ID = your_client_id_here
ROBLOX_OAUTH_CLIENT_SECRET = your_client_secret_here
ROBLOX_OAUTH_REDIRECT_URI = http://localhost:8788/api/auth/oauth/callback
```

### Production (Cloudflare Dashboard)

1. Go to your Cloudflare Pages project
2. Navigate to **Settings** → **Environment Variables**
3. Add the following variables:
   - `ROBLOX_OAUTH_CLIENT_ID` → Your Client ID
   - `ROBLOX_OAUTH_CLIENT_SECRET` → Your Client Secret
   - `ROBLOX_OAUTH_REDIRECT_URI` → `https://yourdomain.com/api/auth/oauth/callback`

## Step 3: App Review & Publishing

### Private Mode (Default)
- Your app starts in **Private mode**
- Limited to **10 authorized users**
- Perfect for testing with your team

### Public Mode (After Review)
1. When ready for public use, click **"Publish"** in the Creator Dashboard
2. Roblox moderators will review your app (takes a few days)
3. Once approved, your app will have **unlimited users**

**Note**: Any changes to your OAuth app in public mode require re-approval.

## Step 4: Testing

### Test OAuth Flow

1. Start your local development server:
   ```bash
   npm run dev
   # or
   wrangler pages dev
   ```

2. Open your application in a browser
3. Click **"Link Account"**
4. You should see two options:
   - **"Sign in with Roblox (Recommended)"** - OAuth flow
   - **"Use In-Game Code"** - Legacy method

5. Click **"Sign in with Roblox"**
6. You'll be redirected to Roblox's authorization page
7. Approve the permissions
8. You'll be redirected back to your app, logged in!

### Verify It Works

- Check that you're logged in (your avatar should appear in the header)
- Check browser console for any errors
- Verify the OAuth callback URL is correct

## Architecture

### Authentication Flow

```
User clicks "Sign in with Roblox"
    ↓
Redirect to /api/auth/oauth/authorize
    ↓
Backend redirects to Roblox OAuth
    ↓
User approves on Roblox
    ↓
Roblox redirects to /api/auth/oauth/callback
    ↓
Backend exchanges code for access token
    ↓
Backend fetches user info from Roblox
    ↓
Create user & session in database
    ↓
Redirect to homepage with session token
    ↓
Frontend stores token in localStorage
    ↓
User is logged in! 🎉
```

### API Endpoints

- `GET /api/auth/oauth/authorize` - Initiates OAuth flow
- `GET /api/auth/oauth/callback` - Handles OAuth callback

### User Info Retrieved

From Roblox OAuth (`/oauth/v1/userinfo`):
- `sub` - Roblox User ID
- `preferred_username` - Username
- `nickname` - Display Name
- `picture` - Avatar URL

## Troubleshooting

### "OAuth not configured" error
- Ensure all environment variables are set correctly
- Check that variable names match exactly
- Restart your dev server after changing .dev.vars

### Redirect URI mismatch
- Ensure the redirect URI in your OAuth app matches exactly
- Check for trailing slashes
- Verify http vs https

### "Access Denied" after login
- User may not have required permissions (admin/moderator)
- Check role assignments in the database

### Token exchange failed
- Verify your Client Secret is correct
- Check that your OAuth app is active
- Ensure you're using the correct API endpoints

## Security Notes

- ✅ Client Secret is stored server-side only (Cloudflare Workers)
- ✅ CSRF protection via state parameter
- ✅ Tokens are not exposed to frontend
- ✅ Session tokens use UUID format
- ✅ Same session management as in-game code method

## Fallback Method

The in-game code method remains available as a fallback:
- Users who prefer the traditional method can still use it
- Useful if OAuth has issues
- Maintains backward compatibility

## Support

For issues or questions:
- Check [Roblox OAuth 2.0 Documentation](https://create.roblox.com/docs/cloud/open-cloud/oauth2-overview)
- Review the implementation in `functions/api/auth/[[path]].js`
- Check frontend code in `js/script.js` (Auth class)

---

**Last Updated**: 2025-11-02
