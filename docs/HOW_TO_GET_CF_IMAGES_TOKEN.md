# How to Get Cloudflare Images API Token

## Step-by-Step Guide

### Step 1: Go to Cloudflare Dashboard

1. Open your browser and go to: **https://dash.cloudflare.com**
2. Log in to your Cloudflare account

### Step 2: Navigate to API Tokens

1. Click on your **profile icon** (top right corner)
2. Select **"My Profile"** from the dropdown menu
3. In the left sidebar, click **"API Tokens"**

   **OR** go directly to: **https://dash.cloudflare.com/profile/api-tokens**

### Step 3: Create a New Token

1. Click the **"Create Token"** button
2. You have two options:

#### Option A: Use Template (Easiest)
1. Scroll down to find **"Edit Cloudflare Images"** template
2. Click **"Use template"** button
3. Review permissions (should include `Account` → `Cloudflare Images` → `Edit`)
4. Under **"Account Resources"**, ensure your account is selected
5. Click **"Continue to summary"**
6. Click **"Create Token"**

#### Option B: Create Custom Token
1. Click **"Create Custom Token"**
2. Give it a name: `EMWiki Images Upload`
3. Set permissions:
   - **Account** → **Cloudflare Images** → **Edit**
4. Under **"Account Resources"**, select:
   - **Include** → **All accounts** (or select your specific account)
5. Click **"Continue to summary"**
6. Review and click **"Create Token"**

### Step 4: Copy Your Token

⚠️ **IMPORTANT**: You'll only see the token **once**!

1. After creating, you'll see a screen with your token
2. **Copy the token immediately** (it looks like a long string of random characters)
3. Example format: `abc123def456ghi789jkl012mno345pqr678stu901vwx234yz`
4. Click **"Copy"** button or manually copy it

### Step 5: Add Token to Your Project

1. Open `emwiki/.dev.vars`
2. Replace `epiclog` with your actual token:

```env
CF_IMAGES_API_TOKEN = your_actual_token_here
```

**Example:**
```env
CF_IMAGES_API_TOKEN = abc123def456ghi789jkl012mno345pqr678stu901vwx234yz
```

### Step 6: Set Token in Production (Cloudflare Dashboard)

For production, you also need to set it in Cloudflare Pages:

1. Go to **Cloudflare Dashboard** → **Pages**
2. Select your **emwiki** project
3. Go to **Settings** → **Environment Variables**
4. Click **"Add variable"**
5. Set:
   - **Variable name**: `CF_IMAGES_API_TOKEN`
   - **Value**: Paste your token
   - **Mark as Secret**: ✅ (check this box!)
6. Click **"Save"**

## Token Format

A valid Cloudflare API token:
- ✅ Is a long alphanumeric string (usually 40+ characters)
- ✅ Contains letters and numbers
- ✅ Looks random (e.g., `abc123def456...`)
- ❌ Is NOT a simple word like "epiclog"
- ❌ Is NOT your account password
- ❌ Is NOT your account email

## Troubleshooting

### "Invalid API Token" Error

- Make sure you copied the **entire token** (no spaces, no line breaks)
- Verify the token hasn't expired (tokens don't expire, but check if it was deleted)
- Ensure you're using the token from the correct account

### "Permission Denied" Error

- Verify the token has **Cloudflare Images** → **Edit** permission
- Check that the token is for the correct account
- Make sure the account has Cloudflare Images enabled

### Can't Find "Cloudflare Images" Template

- Your account might not have Cloudflare Images enabled
- Go to **Cloudflare Dashboard** → **Images** to enable it first
- Or use the custom token option instead

### Lost Your Token

If you lost your token:
1. Go back to **API Tokens** page
2. Find your token in the list
3. Click the **"..."** menu → **"Roll"** to regenerate it
4. Copy the new token immediately

## Security Best Practices

- ✅ **Never commit** `.dev.vars` to git (it's already in `.gitignore`)
- ✅ **Mark as Secret** in Cloudflare Dashboard
- ✅ **Use different tokens** for different projects if needed
- ✅ **Rotate tokens** periodically for security
- ❌ **Don't share** tokens publicly
- ❌ **Don't use** the same token for multiple accounts

## Quick Links

- **API Tokens Page**: https://dash.cloudflare.com/profile/api-tokens
- **Cloudflare Images Dashboard**: https://dash.cloudflare.com/images
- **Cloudflare Images API Docs**: https://developers.cloudflare.com/images/

## Verify Token Works

After adding your token, test it:

```bash
cd emwiki
node scripts/upload-images-to-cloudflare-images.js --dry-run
```

If you see "Account ID: d9fecb3357660ea0fcfee5b23d5dd2f6" without errors, your token is working! ✅




