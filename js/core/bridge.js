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

function initScript() {
    // Render header/footer first so Auth can find <header>
    Layout.init();

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
