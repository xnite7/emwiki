# AGENTS.md

## Cursor Cloud specific instructions

### Overview

**emwiki** is a Cloudflare Pages application (static HTML/JS frontend + serverless API functions). There is no build step — the frontend is vanilla HTML/CSS/JS served directly. The backend consists of Cloudflare Pages Functions in `functions/`.

### Running the dev server

```bash
wrangler pages dev . --port 8788 --d1 DBA=aa7d8e13-f044-46b6-a90e-1aaacd4a3980 --r2 MY_BUCKET --kv DONATIONS_KV
```

This single command starts the entire application (static assets + all API routes) at `http://localhost:8788`. Wrangler auto-provisions local D1, R2, and KV emulations. Environment variables are read from `.dev.vars`.

### Database setup (local D1)

The repository does **not** include an initial schema migration — only incremental migrations exist in `migrations/`. For a fresh environment, the local D1 SQLite database (at `.wrangler/state/v3/d1/miniflare-D1DatabaseObject/`) must be initialized with CREATE TABLE statements derived from the codebase. Key tables: `users`, `sessions`, `auth_codes`, `items`, `gallery_items`, `forum_posts`, `forum_comments`, `forum_likes`, `trade_listings`, `trade_offers`, `trade_messages`, `trade_reviews`, `trade_notifications`, `notifications`, `scammer_profile_cache`, `chests`, `item_demand`, `history`.

Wrangler may create **multiple** D1 `.sqlite` files under `.wrangler/state/v3/d1/`. The schema must be applied to **all** of them (or at least the one actively used), as wrangler chooses the database file at runtime based on binding hashes.

### Frontend API base URLs

The JavaScript files (`js/script.js`, `js/trading.js`, etc.) hardcode `https://emwiki.com/api/...` as the API base URL. In local dev, the catalog and forum pages still work because they fetch from the production API. To test local API changes, you would need to modify these URLs to `http://localhost:8788/api/...`.

### Testing

- **Playwright** is configured for E2E tests. Run with `npx playwright test --project=chromium`.
- The existing test (`tests/example.spec.js`) tests against `playwright.dev`, not the local app. It's a boilerplate example.
- No linter is configured in `package.json` scripts.

### Workers (optional)

Separate Cloudflare Workers in `workers/` (scammer queue consumer, DLQ processor, avatar refresh scheduler) are supplementary and not required for core development. Each has its own `wrangler.toml`.

### Authentication

OAuth 2.0 with Roblox requires `ROBLOX_OAUTH_CLIENT_ID`, `ROBLOX_OAUTH_CLIENT_SECRET`, and `ROBLOX_OAUTH_REDIRECT_URI` in `.dev.vars`. See `OAUTH_SETUP.md` for details.
