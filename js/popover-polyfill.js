/**
 * Popover API Polyfill for older browsers
 * Provides compatibility for browsers that don't support the native Popover API
 * Safari < 17.0, Firefox < 125, Chrome < 114
 */

(function() {
    'use strict';

    // Don't run if the browser already supports popovers
    if (typeof HTMLElement.prototype.showPopover === 'function') {
        return;
    }

    console.log('🔧 Loading Popover API polyfill for browser compatibility');

    // Store open popovers for management
    const openPopovers = new Set();
    let backdropElement = null;

    // Create backdrop element
    function createBackdrop() {
        if (!backdropElement) {
            backdropElement = document.createElement('div');
            backdropElement.className = 'popover-polyfill-backdrop';
            backdropElement.style.cssText = `
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                z-index: 999;
                display: none;
                pointer-events: auto;
                background: rgba(0, 0, 0, 0.3);
                backdrop-filter: blur(4px);
                animation: popover-backdrop-fade-in 0.2s ease-out;
            `;
            document.body.appendChild(backdropElement);
        }
        return backdropElement;
    }

    // Show backdrop
    function showBackdrop() {
        const backdrop = createBackdrop();
        backdrop.style.display = 'block';
    }

    // Hide backdrop
    function hideBackdrop() {
        if (backdropElement && openPopovers.size === 0) {
            backdropElement.style.display = 'none';
        }
    }

    // Add methods to HTMLElement prototype
    HTMLElement.prototype.showPopover = function() {
        if (this.popoverOpen) return;

        const popoverType = this.getAttribute('popover');

        // Handle auto popovers - close other auto popovers
        if (popoverType === '' || popoverType === 'auto' || popoverType === null) {
            openPopovers.forEach(p => {
                if (p !== this && (p.getAttribute('popover') === '' ||
                                   p.getAttribute('popover') === 'auto' ||
                                   p.getAttribute('popover') === null)) {
                    p.hidePopover();
                }
            });
        }

        this.popoverOpen = true;
        this.style.display = 'block';
        this.setAttribute('data-popover-open', '');

        // Add to open popovers
        openPopovers.add(this);

        // Show backdrop for non-manual popovers
        if (popoverType !== 'manual') {
            showBackdrop();
        }

        // Dispatch toggle event
        const toggleEvent = new Event('toggle', { bubbles: false, cancelable: false });
        toggleEvent.oldState = 'closed';
        toggleEvent.newState = 'open';
        this.dispatchEvent(toggleEvent);

        // Add to body if not already there
        if (!this.parentElement) {
            document.body.appendChild(this);
        }

        // Force reflow for animations
        this.offsetHeight;
    };

    HTMLElement.prototype.hidePopover = function() {
        if (!this.popoverOpen) return;

        this.popoverOpen = false;
        this.style.display = 'none';
        this.removeAttribute('data-popover-open');

        // Remove from open popovers
        openPopovers.delete(this);

        // Hide backdrop if no popovers open
        hideBackdrop();

        // Dispatch toggle event
        const toggleEvent = new Event('toggle', { bubbles: false, cancelable: false });
        toggleEvent.oldState = 'open';
        toggleEvent.newState = 'closed';
        this.dispatchEvent(toggleEvent);
    };

    HTMLElement.prototype.togglePopover = function(force) {
        if (force === true) {
            this.showPopover();
        } else if (force === false) {
            this.hidePopover();
        } else {
            if (this.popoverOpen) {
                this.hidePopover();
            } else {
                this.showPopover();
            }
        }
    };

    // Add CSS for polyfill
    const style = document.createElement('style');
    style.textContent = `
        /* Popover polyfill styles */
        [popover] {
            position: fixed;
            z-index: 1000;
            display: none;
            margin: auto;
            border: 1px solid rgba(0, 0, 0, 0.15);
            padding: 0.25rem;
            width: fit-content;
            height: fit-content;
            background-color: Canvas;
            color: CanvasText;
            overflow: auto;
            inset: 0;
        }

        [popover][data-popover-open] {
            display: block;
        }

        /* Simulate :popover-open pseudo-class */
        [popover]:not([data-popover-open]) {
            display: none !important;
        }

        @keyframes popover-backdrop-fade-in {
            from {
                opacity: 0;
                backdrop-filter: blur(0px);
            }
            to {
                opacity: 1;
                backdrop-filter: blur(4px);
            }
        }

        .popover-polyfill-backdrop {
            pointer-events: auto;
        }
    `;
    document.head.appendChild(style);

    // Handle popovertarget attribute
    function setupPopoverTargets() {
        document.addEventListener('click', function(e) {
            const trigger = e.target.closest('[popovertarget]');
            if (!trigger) return;

            const targetId = trigger.getAttribute('popovertarget');
            const action = trigger.getAttribute('popovertargetaction') || 'toggle';
            const target = document.getElementById(targetId);

            if (!target) return;

            e.preventDefault();

            switch(action) {
                case 'show':
                    target.showPopover();
                    break;
                case 'hide':
                    target.hidePopover();
                    break;
                case 'toggle':
                default:
                    target.togglePopover();
                    break;
            }
        });

        // Close popovers on backdrop click
        document.addEventListener('click', function(e) {
            if (e.target === backdropElement) {
                openPopovers.forEach(popover => {
                    const popoverType = popover.getAttribute('popover');
                    // Don't close manual popovers on backdrop click
                    if (popoverType !== 'manual') {
                        popover.hidePopover();
                    }
                });
            }
        });

        // Close popovers on Escape key
        document.addEventListener('keydown', function(e) {
            if (e.key === 'Escape' && openPopovers.size > 0) {
                // Close the most recently opened popover
                const popoversArray = Array.from(openPopovers);
                const lastPopover = popoversArray[popoversArray.length - 1];
                const popoverType = lastPopover.getAttribute('popover');

                // Manual popovers don't close on Escape
                if (popoverType !== 'manual') {
                    lastPopover.hidePopover();
                }
            }
        });
    }

    // Initialize when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', setupPopoverTargets);
    } else {
        setupPopoverTargets();
    }

    // Initialize existing popovers
    function initExistingPopovers() {
        document.querySelectorAll('[popover]').forEach(popover => {
            popover.popoverOpen = false;
            // Hide initially
            if (!popover.hasAttribute('data-popover-open')) {
                popover.style.display = 'none';
            }
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initExistingPopovers);
    } else {
        initExistingPopovers();
    }

    console.log('✅ Popover API polyfill loaded successfully');
})();
