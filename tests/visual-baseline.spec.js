// @ts-check
import { test, expect } from '@playwright/test';

// Visual regression baselines for the frontend revamp.
// Baselines are local-only (gitignored) and CI-skipped: they exist so that
// phase-by-phase changes can be diffed against the last known-good render.
// Re-baseline intentional changes with:
//   npx playwright test tests/visual-baseline.spec.js --project=chromium --update-snapshots
test.skip(!!process.env.CI, 'visual baselines are local-only');

const BASE = 'http://localhost:8788';

// admin.html (auth-gated) and cat/burrito (canvas games) are excluded.
const PAGES = [
    'index',
    'catalog',
    'trading',
    'gallery',
    'forum',
    'profile',
    'scammers',
    'gamenights',
    '404',
    'terms-of-service',
    'privacy-policy',
    'yarn',
];

const VIEWPORTS = [
    { name: 'desktop', width: 1280, height: 800 },
    { name: 'mobile', width: 375, height: 812 },
];

for (const vp of VIEWPORTS) {
    test.describe(`${vp.name} (${vp.width}x${vp.height})`, () => {
        test.use({ viewport: { width: vp.width, height: vp.height } });

        for (const name of PAGES) {
            test(name, async ({ page }) => {
                await page.goto(`${BASE}/${name}.html`, { waitUntil: 'domcontentloaded' });
                // Let injected chrome, fonts and first data render settle.
                await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
                await page.waitForTimeout(500);
                await expect(page).toHaveScreenshot(`${name}-${vp.name}.png`, {
                    animations: 'disabled',
                    caret: 'hide',
                    maxDiffPixelRatio: 0.02,
                    fullPage: false,
                });
            });
        }
    });
}
