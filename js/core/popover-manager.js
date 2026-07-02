/* Split out of the old js/script.js (see git history). Loaded via js/core/bridge.js. */
// ==================== POPOVER MOBILE FIX ====================
// ==================== POPOVER MOBILE FIX ====================
class PopoverManager {
    constructor() {
        this.openPopovers = new Set();
        this.init();
    }

    init() {
        // Track open popovers
        document.addEventListener('toggle', (e) => {
            if (e.target.matches('[popover]')) {
                if (e.newState === 'open') {
                    this.openPopovers.add(e.target);
                } else {
                    this.openPopovers.delete(e.target);
                }
            }
        }, true);

        // Close on outside click/touch
        this.setupOutsideClickHandler();
    }

    setupOutsideClickHandler() {
        // Use a single global handler (more efficient)
        const closeOnOutsideInteraction = (e) => {
            // Don't do anything if no popovers are open
            if (this.openPopovers.size === 0) return;

            this.openPopovers.forEach(popover => {
                // Manual popovers (e.g. the toast container) are script-controlled and
                // must never be light-dismissed by an outside click — doing so drops them
                // out of the top layer and they render behind the page.
                if (popover.getAttribute('popover') === 'manual') return;

                // Check if click/touch was outside the popover
                const isClickInside = popover.contains(e.target);

                // Check if click was on a trigger button
                const trigger = document.querySelector(`[popovertarget="${popover.id}"]`);
                const isClickOnTrigger = trigger && trigger.contains(e.target);

                // Close if clicked outside and not on trigger
                if (!isClickInside && !isClickOnTrigger) {
                    popover.hidePopover();
                }
            });
        };

        // Listen to both click and touchend (for mobile)
        document.addEventListener('click', closeOnOutsideInteraction);
        document.addEventListener('touchend', closeOnOutsideInteraction);
    }
}



export { PopoverManager };
