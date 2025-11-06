/**
 * Popover Polyfill Loader
 * Detects browser support for Popover API and loads polyfill only if needed
 * This keeps the main bundle size small for modern browsers
 */

(function() {
    'use strict';

    // Feature detection for Popover API
    function supportsPopoverAPI() {
        return typeof HTMLElement.prototype.showPopover === 'function';
    }

    // Load polyfill if needed
    if (!supportsPopoverAPI()) {
        console.log('⚠️ Popover API not supported, loading polyfill...');

        // Create and inject the polyfill script
        const script = document.createElement('script');
        script.src = '/js/popover-polyfill.js';
        script.async = false; // Load synchronously to ensure it's ready before page interactions

        script.onerror = function() {
            console.error('❌ Failed to load Popover polyfill');
        };

        // Insert the script before the first script tag or at the end of head
        const firstScript = document.getElementsByTagName('script')[0];
        if (firstScript) {
            firstScript.parentNode.insertBefore(script, firstScript);
        } else {
            document.head.appendChild(script);
        }
    } else {
        console.log('✅ Native Popover API supported');
    }
})();
