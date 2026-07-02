/* =============================================================================
   surface.js — ONE overlay system for the whole site.
   Desktop (≥768px) renders a centered modal; mobile renders a bottom sheet
   with a grabber and drag-to-dismiss. Built on <dialog> (focus trap, ESC,
   top layer for free).

     const s = openSurface({
       title: 'Make an offer',
       content: nodeOrHtmlStringOrRenderFn,   // strings are trusted markup —
                                              // escape user data BEFORE passing
       variant: 'auto' | 'modal' | 'sheet',
       size: 'sm' | 'md' | 'lg',
       actions: [{ label, kind: 'primary'|'ghost'|'danger', onClick(s) }],
       onClose() {},
     });
     s.close();  s.el (content root);  s.dialog
   ========================================================================== */

const MOBILE_QUERY = '(max-width: 767.98px)';

export function openSurface(options = {}) {
    const {
        title = '',
        content = '',
        variant = 'auto',
        size = 'md',
        actions = [],
        onClose = null,
        showClose = true,
    } = options;

    const isSheet = variant === 'sheet' ||
        (variant === 'auto' && window.matchMedia(MOBILE_QUERY).matches);

    const dialog = document.createElement('dialog');
    dialog.className = `surface surface--${isSheet ? 'sheet' : 'modal'} surface--${size}`;

    if (isSheet) {
        const grabber = document.createElement('div');
        grabber.className = 'surface-grabber';
        dialog.appendChild(grabber);
    }

    if (title || showClose) {
        const header = document.createElement('div');
        header.className = 'surface-header';

        const h = document.createElement('h2');
        h.className = 'surface-title';
        h.textContent = title;
        header.appendChild(h);

        if (showClose) {
            const btn = document.createElement('button');
            btn.className = 'modal-close-btn surface-close';
            btn.setAttribute('aria-label', 'Close');
            btn.textContent = '×';
            btn.addEventListener('click', () => close());
            header.appendChild(btn);
        }
        dialog.appendChild(header);
    }

    const body = document.createElement('div');
    body.className = 'surface-body';
    if (typeof content === 'function') {
        const result = content(body);
        if (result instanceof Node) body.appendChild(result);
        else if (typeof result === 'string') body.innerHTML = result;
    } else if (content instanceof Node) {
        body.appendChild(content);
    } else {
        body.innerHTML = content;
    }
    dialog.appendChild(body);

    if (actions.length) {
        const footer = document.createElement('div');
        footer.className = 'surface-actions';
        for (const action of actions) {
            const btn = document.createElement('button');
            btn.className = `btn btn-${action.kind || 'secondary'}`;
            btn.textContent = action.label;
            btn.addEventListener('click', () => action.onClick?.(surface));
            footer.appendChild(btn);
        }
        dialog.appendChild(footer);
    }

    let closed = false;
    function close() {
        if (closed) return;
        closed = true;
        dialog.classList.add('surface--closing');
        const done = () => {
            dialog.close();
            dialog.remove();
            onClose?.();
        };
        const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        if (reduced) done();
        else dialog.addEventListener('animationend', done, { once: true });
    }

    // Backdrop click closes (dialog itself is the click target outside content)
    dialog.addEventListener('click', (e) => {
        if (e.target === dialog) close();
    });
    // ESC → run our close (with animation) instead of the instant default
    dialog.addEventListener('cancel', (e) => {
        e.preventDefault();
        close();
    });

    if (isSheet) attachSheetDrag(dialog, close);

    document.body.appendChild(dialog);
    dialog.showModal();

    const surface = { dialog, el: body, close };
    return surface;
}

/* Drag-to-dismiss: track pointer on the sheet; dismiss past 30% travel or on
   a fast flick. Only engages when the sheet body is scrolled to the top so it
   never fights content scrolling. */
function attachSheetDrag(dialog, close) {
    let startY = 0;
    let currentY = 0;
    let dragging = false;
    let startTime = 0;
    const body = dialog.querySelector('.surface-body');

    dialog.addEventListener('pointerdown', (e) => {
        // Engage from the grabber/header anywhere; from the body only at scroll top.
        const fromBody = e.target.closest('.surface-body');
        if (fromBody && body && body.scrollTop > 0) return;
        if (e.target.closest('button, a, input, select, textarea')) return;
        dragging = true;
        startY = e.clientY;
        currentY = 0;
        startTime = performance.now();
        dialog.style.transition = 'none';
        dialog.setPointerCapture(e.pointerId);
    });

    dialog.addEventListener('pointermove', (e) => {
        if (!dragging) return;
        currentY = Math.max(0, e.clientY - startY);
        dialog.style.transform = `translateY(${currentY}px)`;
    });

    const release = (e) => {
        if (!dragging) return;
        dragging = false;
        dialog.style.transition = '';
        const elapsed = performance.now() - startTime;
        const velocity = currentY / Math.max(elapsed, 1); // px/ms
        const shouldClose = currentY > dialog.offsetHeight * 0.3 || velocity > 0.6;
        if (shouldClose) {
            close();
        } else {
            dialog.style.transform = '';
        }
    };
    dialog.addEventListener('pointerup', release);
    dialog.addEventListener('pointercancel', release);
}
