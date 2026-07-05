/* =============================================================================
   bridge.js — the single page entry that replaced js/script.js.

   Wires the split core modules together and exposes the pre-module globals
   that legacy classic scripts (trading.js, forum-v2.js, gallery.js…), inline
   page modules and inline onclick= handlers still resolve at runtime.

   The bridge (and each window.* assignment in it) is deleted once no page
   references that global — tracked per page phase of the frontend revamp.
   ========================================================================== */

import './vendor.js';
import { Layout } from './layout.js';
import { Utils } from './utils.js';
import { BaseApp } from './base-app.js';
import { PriceGraph, ItemModal } from '../components/item-modal.js';
import { Auth } from './auth.js';
import { CountdownManager } from './countdown.js';
import { Confetti } from './confetti.js';
import { PopoverManager } from './popover-manager.js';
import { api, ApiError } from './api.js';
import { renderItemCard, addItemBadges, tradeItemHTML, itemVisualHTML, fitItemName } from '../components/item-card.js';
import { openSurface } from '../components/surface.js';

// Globals first, so everything that runs later (inline page modules, classic
// page scripts, DOMContentLoaded handlers, onclick=) can resolve them.
window.Utils = Utils;
window.Layout = Layout;
window.BaseApp = BaseApp;
window.PriceGraph = PriceGraph;
window.ItemModal = ItemModal;
window.CountdownManager = CountdownManager;
window.api = api;
window.ApiError = ApiError;
window.ItemCard = { renderItemCard, addItemBadges, tradeItemHTML, itemVisualHTML, fitItemName };
window.openSurface = openSurface;

/* Page-agnostic global preferences (theme, price visibility, tax mode).
   These live in the shared profile-dropdown (rendered by Auth) whose buttons
   call `catalog.*`. On BaseApp pages `catalog` is that app; on pages without
   one (e.g. Trading) this object is installed as the `catalog` fallback so the
   same controls work everywhere, and it applies saved prefs on every page. */
const TAX_LABELS = { nt: 'Flat', gp: 'Gamepass', wt: 'Shop Stand' };
const appSettings = {
    applyOnLoad() {
        const theme = localStorage.getItem('theme') || 'dark';
        document.body.classList.toggle('light-theme', theme === 'light');
        document.body.classList.toggle('dark-theme', theme !== 'light');
        document.body.classList.toggle('hide-prices', !Utils.loadFromStorage('showPrices', true));
        this.reflectUI();
    },
    toggleTheme() {
        const isLight = document.body.classList.toggle('light-theme');
        document.body.classList.toggle('dark-theme', !isLight);
        localStorage.setItem('theme', isLight ? 'light' : 'dark');
    },
    togglePrice() {
        const showPrices = !Utils.loadFromStorage('showPrices', true);
        Utils.saveToStorage('showPrices', showPrices);
        document.body.classList.toggle('hide-prices', !showPrices);
        document.querySelector('.price-toggle')?.classList.toggle('active', !showPrices);
    },
    async selectTax(mode) {
        if (window.Auth?.user) await Utils.saveToAccount('taxMode', mode);
        else Utils.saveToStorage('taxMode', mode);
        document.querySelectorAll('.tax-mode-btn').forEach(b => b.classList.toggle('active', b.dataset.tax === mode));
        const label = document.getElementById('tax-label');
        if (label) label.textContent = TAX_LABELS[mode] || TAX_LABELS.nt;
        // Let a live page react (e.g. a value calculator) if it wants to.
        window.tradingHub?.onTaxChanged?.(mode);
    },
    openStats() {
        // "My Lists" is the catalog favorites/wishlist view — only meaningful there.
        Utils.showToast?.('My Lists', 'Open your favorites & wishlist from the Catalog page.', 'info');
    },
    // Sync the dropdown toggle/tax buttons to the stored prefs (call after the
    // dropdown renders — its markup defaults to Flat/prices-on).
    reflectUI() {
        document.querySelector('.price-toggle')?.classList.toggle('active', !Utils.loadFromStorage('showPrices', true));
        const mode = Utils.loadFromStorage('taxMode', 'nt');
        document.querySelectorAll('.tax-mode-btn').forEach(b => b.classList.toggle('active', b.dataset.tax === mode));
    }
};
window.appSettings = appSettings;

function initScript() {
    // Render header/footer first so Auth can find <header>
    Layout.init();

    // Apply saved theme / price prefs on every page (BaseApp pages also do this;
    // it's idempotent). Fixes prefs not persisting on non-BaseApp pages.
    appSettings.applyOnLoad();
    // Fallback so the shared settings menu (catalog.*) works on pages that don't
    // have a BaseApp `catalog` (Trading). BaseApp pages overwrite this on load.
    if (!window.catalog) window.catalog = appSettings;

    // Ensure toast container exists for Utils.showToast (used by forum, auth, etc.)
    if (!document.getElementById('toast-container')) {
        document.body.insertAdjacentHTML('beforeend', '<div class="toast-container" id="toast-container" popover="manual"></div>');
    }

    window.popoverManager = new PopoverManager();
    window.confetti = new Confetti();
    const auth = new Auth();
    window.auth = auth;
    // Legacy alias: window.Auth is the *instance* (Utils.saveToAccount and
    // page scripts call window.Auth.waitForSession()).
    window.Auth = auth;

    // Initialize caches on load
    Utils.initRobloxCache();
    Utils.initBadgeCache();
    Utils.initGroupCache();
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initScript);
} else {
    initScript();
}
