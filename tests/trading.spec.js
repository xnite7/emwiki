// @ts-check
import { test, expect } from '@playwright/test';

// Playwright runs from the emwiki/ project root. Build a file:// URL without
// node builtins so this works regardless of the project's module mode.
const tradingUrl = 'file:///' + process.cwd().replace(/\\/g, '/').replace(/^\//, '') + '/trading.html';

// These are smoke tests that run without a backend. The Auth layer always
// dispatches `sessionReady` (even when /api/auth/session fails), so the page
// initialises in a logged-out state and client-side behaviour can be asserted.
// Deeper authenticated end-to-end coverage (create → offer → accept → review)
// requires a seeded D1 database and is tracked as a follow-up.
test.describe('Trading Hub page', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto(tradingUrl);
        // The hub is constructed on DOMContentLoaded; its event-driven init can
        // race the (instantly-failing) offline auth fetch, so drive it explicitly
        // to get a deterministic logged-out, initialised page.
        await page.waitForFunction(() => !!window.tradingHub);
        await page.evaluate(() => window.tradingHub.init());
        await expect(page.locator('#tradesFeed .skeleton')).toHaveCount(0, { timeout: 15000 });
    });

    test('renders the page and all primary tabs', async ({ page }) => {
        await expect(page).toHaveTitle(/Trading Hub/);
        await expect(page.locator('.tab-btn[data-tab="browse"]')).toBeVisible();
        await expect(page.locator('.tab-btn[data-tab="my-trades"]')).toBeVisible();
        await expect(page.locator('.tab-btn[data-tab="create"]')).toBeVisible();
        // Messages is a modal opened from a button beside the notifications bell.
        await expect(page.locator('#msgBtn')).toBeVisible();
        await expect(page.locator('#notifBellBtn')).toBeVisible();
        // Browse is the default active panel.
        await expect(page.locator('#panelBrowse')).toHaveClass(/active/);
    });

    test('has the messages modal and review modal in the DOM', async ({ page }) => {
        await expect(page.locator('#messagesModal')).toHaveCount(1);
        await expect(page.locator('#reviewModal')).toHaveCount(1);
        await expect(page.locator('#starInput .star-btn')).toHaveCount(5);
    });

    test('greys out the account-gated tabs when logged out', async ({ page }) => {
        await expect(page.locator('.tab-btn[data-tab="browse"]')).not.toHaveClass(/tab-disabled/);
        await expect(page.locator('.tab-btn[data-tab="my-trades"]')).toHaveClass(/tab-disabled/);
        await expect(page.locator('.tab-btn[data-tab="create"]')).toHaveClass(/tab-disabled/);
    });

    test('gates My Trades behind login when logged out', async ({ page }) => {
        await page.locator('.tab-btn[data-tab="my-trades"]').click();
        // The tab is greyed out, so Browse stays active.
        await expect(page.locator('#panelBrowse')).toHaveClass(/active/);
        await expect(page.locator('#panelMyTrades')).not.toHaveClass(/active/);
    });

    test('gates Messages behind login when logged out', async ({ page }) => {
        await page.locator('#msgBtn').click();
        // Logged-out users get a prompt instead of the messages modal opening.
        await expect(page.locator('#messagesModal')).not.toHaveClass(/active/);
    });

    test('gates Create Trade behind login when logged out', async ({ page }) => {
        await page.locator('.tab-btn[data-tab="create"]').click();
        await expect(page.locator('#panelBrowse')).toHaveClass(/active/);
        await expect(page.locator('#panelCreate')).not.toHaveClass(/active/);
    });
});
