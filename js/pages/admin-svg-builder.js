// SVG Title Builder — embeddable control panel for authoring catalog title SVGs.
// Classic script (loads after admin.js). Not a standalone panel: it mounts
// inside hosts that already have an SVG textarea + preview and keeps that
// textarea as the source of truth:
//   - Item Adder modal (step 2, when category "titles" is selected)
//   - Quick editor for existing title items (setupSVGEditor)
// Generated markup matches the existing hand-made title SVGs (measured tight
// viewBox, gradient fill/stroke, paint-order:stroke — e.g. 8th Seasoneer).

const SvgTitleBuilder = {
    _fontsPromise: null,
    _instances: new WeakMap(), // host textarea -> instance state

    loadFonts() {
        if (!this._fontsPromise) {
            this._fontsPromise = (async () => {
                const families = new Set(['Arimo', 'Lobster', 'Arial', 'Verdana', 'Impact']);
                try {
                    const res = await fetch('/css/fonts.css');
                    const css = await res.text();
                    for (const m of css.matchAll(/font-family:\s*['"]?([^;'"]+)['"]?\s*;/g)) {
                        families.add(m[1].trim());
                    }
                } catch (e) {
                    console.warn('SvgTitleBuilder: could not parse fonts.css', e);
                }
                return Array.from(families).sort();
            })();
        }
        return this._fontsPromise;
    },

    // ---------- SVG generation ----------

    async buildSvg(c, idHint) {
        const fontStyle = `font:${c.weight} ${c.size}px '${c.font}'`;

        try {
            await document.fonts.load(`${c.weight} ${c.size}px '${c.font}'`);
        } catch (e) { /* unknown font — measure with fallback */ }

        // Measure the text at the canonical (500,500) anchor to get a tight
        // viewBox, same technique as the existing hand-made title SVGs.
        const ns = 'http://www.w3.org/2000/svg';
        const probe = document.createElementNS(ns, 'svg');
        probe.setAttribute('style', 'position:absolute; left:-9999px; top:-9999px;');
        probe.setAttribute('width', '1000');
        probe.setAttribute('height', '1000');
        const textEl = document.createElementNS(ns, 'text');
        textEl.setAttribute('x', '500');
        textEl.setAttribute('y', '500');
        textEl.setAttribute('text-anchor', 'middle');
        textEl.setAttribute('style', fontStyle + (c.spacing ? `;letter-spacing:${c.spacing}px` : ''));
        textEl.textContent = c.text;
        probe.appendChild(textEl);
        document.body.appendChild(probe);
        let bbox;
        try {
            bbox = textEl.getBBox();
        } finally {
            probe.remove();
        }

        const pad = c.strokeWidth / 2 + 1;
        const viewBox = [
            (bbox.x - pad).toFixed(2),
            (bbox.y - pad).toFixed(2),
            (bbox.width + pad * 2).toFixed(2),
            (bbox.height + pad * 2).toFixed(2),
        ].join(' ');

        // Per-item gradient ids: many title SVGs coexist inline on the catalog
        // page, so duplicate ids would cross-contaminate fills between items.
        const slug = String(idHint || c.text || 'x').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'x';
        const fillId = `tg-${slug}`;
        const strokeId = `sg-${slug}`;

        const defs = [];
        let fillAttr = c.fill1;
        if (c.fill1.toLowerCase() !== c.fill2.toLowerCase()) {
            defs.push(`<linearGradient id="${fillId}" x2="0%" y2="100%"><stop style="stop-color:${c.fill1}"/><stop offset="100%" style="stop-color:${c.fill2}"/></linearGradient>`);
            fillAttr = `url(#${fillId})`;
        }
        let strokeAttr = c.stroke1;
        if (c.stroke1.toLowerCase() !== c.stroke2.toLowerCase()) {
            defs.push(`<linearGradient id="${strokeId}" x2="0%" y2="100%"><stop style="stop-color:${c.stroke1}"/><stop offset="100%" style="stop-color:${c.stroke2}"/></linearGradient>`);
            strokeAttr = `url(#${strokeId})`;
        }

        const strokeAttrs = c.strokeWidth > 0
            ? ` stroke="${strokeAttr}" stroke-width="${c.strokeWidth}" paint-order="stroke"`
            : '';
        const transform = c.skew ? ` transform="skewX(${-c.skew})" transform-origin="500 500"` : '';
        const spacingStyle = c.spacing ? `;letter-spacing:${c.spacing}px` : '';

        const escDiv = document.createElement('div');
        escDiv.textContent = c.text;
        const safeText = escDiv.innerHTML;

        // Only pull in fonts.css when a non-system font is used
        const needsFontImport = !['arial', 'verdana', 'impact'].includes(c.font.toLowerCase());
        const styleTag = needsFontImport ? '<style>@import url(https://emwiki.com/css/fonts.css);</style>' : '';
        const defsTag = defs.length ? `<defs>${defs.join('')}</defs>` : '';

        return `<svg width="200" height="100" viewBox="${viewBox}" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet">${styleTag}${defsTag}<text x="500" y="500" text-anchor="middle"${strokeAttrs} fill="${fillAttr}" style="${fontStyle}${spacingStyle}"${transform}>${safeText}</text></svg>`;
    },

    // ---------- embeddable controls ----------

    /**
     * Mount the builder controls above a host SVG textarea.
     *
     * @param {object} opts
     * @param {HTMLElement} opts.container   - element the controls are inserted into (at the top)
     * @param {HTMLTextAreaElement} opts.textarea - host textarea holding the SVG markup
     * @param {function(): string} opts.getName  - returns the item name (builder text default)
     * @param {function(): string|number} [opts.getIdHint] - stable id for gradient ids (item id or name)
     * @param {boolean} [opts.generateIfEmpty] - generate immediately when the textarea has no usable SVG
     *
     * Idempotent per textarea: calling again refreshes the text default and
     * (when generateIfEmpty) regenerates stale auto-generated content.
     */
    async mount(opts) {
        const { container, textarea, getName, getIdHint, generateIfEmpty } = opts;
        if (!container || !textarea) return;

        let inst = this._instances.get(textarea);
        if (inst) {
            inst.refresh();
            return;
        }

        const fonts = await this.loadFonts();
        // Defaults reproduce the previous hardcoded new-title template
        // (grey Arimo 700 27px with dark stroke).
        const wrap = document.createElement('div');
        wrap.className = 'svgb-wrap';
        wrap.innerHTML = `
            <div class="svgb-controls">
                <label>Text
                    <input type="text" class="af-input" data-svgb="text">
                </label>
                <label>Font
                    <select class="af-input" data-svgb="font"></select>
                </label>
                <label>Weight
                    <select class="af-input" data-svgb="weight">
                        <option value="100">100 (Thin)</option>
                        <option value="300">300 (Light)</option>
                        <option value="400">400 (Normal)</option>
                        <option value="700" selected>700 (Bold)</option>
                        <option value="900">900 (Black)</option>
                    </select>
                </label>
                <label>Size <span data-svgb-label="size">27</span>px
                    <input type="range" data-svgb="size" min="12" max="40" value="27">
                </label>
                <label>Fill top
                    <input type="color" data-svgb="fill1" value="#cbcbcb">
                </label>
                <label>Fill bottom
                    <input type="color" data-svgb="fill2" value="#cbcbcb">
                </label>
                <label>Stroke top
                    <input type="color" data-svgb="stroke1" value="#545454">
                </label>
                <label>Stroke bottom
                    <input type="color" data-svgb="stroke2" value="#545454">
                </label>
                <label>Stroke width <span data-svgb-label="strokeWidth">3</span>
                    <input type="range" data-svgb="strokeWidth" min="0" max="8" value="3">
                </label>
                <label>Letter spacing <span data-svgb-label="spacing">0</span>px
                    <input type="range" data-svgb="spacing" min="-3" max="10" value="0">
                </label>
                <label>Skew <span data-svgb-label="skew">0</span>&deg;
                    <input type="range" data-svgb="skew" min="-20" max="20" value="0">
                </label>
            </div>
            <small class="svgb-hint">Adjusting a control regenerates the SVG code below. Manual edits to the code stick until a control is touched.</small>`;

        const fontSelect = wrap.querySelector('[data-svgb="font"]');
        for (const f of fonts) {
            const opt = document.createElement('option');
            opt.value = f;
            opt.textContent = f;
            opt.style.fontFamily = `'${f}'`;
            if (f === 'Arimo') opt.selected = true;
            fontSelect.appendChild(opt);
        }

        container.insertBefore(wrap, container.firstChild);

        const q = (name) => wrap.querySelector(`[data-svgb="${name}"]`);
        const read = () => ({
            text: q('text').value,
            font: q('font').value,
            weight: q('weight').value,
            size: Number(q('size').value),
            fill1: q('fill1').value,
            fill2: q('fill2').value,
            stroke1: q('stroke1').value,
            stroke2: q('stroke2').value,
            strokeWidth: Number(q('strokeWidth').value),
            spacing: Number(q('spacing').value),
            skew: Number(q('skew').value),
        });

        inst = {
            wrap,
            lastGenerated: null,
            textEdited: false,
            timer: null,
            regenerate: async () => {
                for (const label of wrap.querySelectorAll('[data-svgb-label]')) {
                    label.textContent = q(label.dataset.svgbLabel).value;
                }
                const markup = await SvgTitleBuilder.buildSvg(read(), getIdHint ? getIdHint() : getName());
                inst.lastGenerated = markup;
                textarea.value = markup;
                // Let the host update its own preview (both hosts wire
                // oninput/addEventListener on their textarea).
                textarea.dispatchEvent(new Event('input', { bubbles: true }));
                if (textarea.oninput) textarea.oninput();
            },
            scheduleRegenerate: () => {
                clearTimeout(inst.timer);
                inst.timer = setTimeout(() => inst.regenerate(), 150);
            },
            refresh: () => {
                if (!inst.textEdited) {
                    q('text').value = getName() || 'Title';
                }
                const value = textarea.value.trim();
                const isStale = !value || !value.startsWith('<svg') || value === inst.lastGenerated;
                if (generateIfEmpty && isStale) {
                    inst.scheduleRegenerate();
                }
            },
        };
        this._instances.set(textarea, inst);

        q('text').addEventListener('input', () => { inst.textEdited = true; });
        for (const el of wrap.querySelectorAll('[data-svgb]')) {
            el.addEventListener('input', () => inst.scheduleRegenerate());
        }

        q('text').value = getName() || 'Title';
        const value = textarea.value.trim();
        if (generateIfEmpty && (!value || !value.startsWith('<svg'))) {
            inst.scheduleRegenerate();
        }
    },

    // ---------- host-specific mounts ----------

    // Item Adder modal, step 2 with category "titles" (called from toggleInputMode)
    mountInItemAdder() {
        const group = document.getElementById('svg-input-group');
        const textarea = document.getElementById('item-svg-input');
        const nameInput = document.getElementById('item-name');
        if (!group || !textarea) return;

        this.mount({
            container: group,
            textarea,
            getName: () => (nameInput?.value || '').trim(),
            generateIfEmpty: true,
        }).then(() => {
            // Mirror the name into the builder text until it's manually edited
            if (nameInput && !nameInput.dataset.svgbMirror) {
                nameInput.dataset.svgbMirror = '1';
                nameInput.addEventListener('input', () => {
                    const inst = this._instances.get(textarea);
                    if (!inst || inst.textEdited) return;
                    inst.wrap.querySelector('[data-svgb="text"]').value = nameInput.value.trim() || 'Title';
                    inst.scheduleRegenerate();
                });
            }
        });
    },

    // Quick editor for an existing title item (called from setupSVGEditor).
    // Never auto-generates: the item's current svg stays until a control is touched.
    mountInQuickEditor(item) {
        const container = document.getElementById('svg-editor');
        const textarea = document.getElementById('svg-input');
        if (!container || !textarea) return;

        this.mount({
            container,
            textarea,
            getName: () => item.name,
            getIdHint: () => item.id || item.name,
            generateIfEmpty: false,
        });
    },
};

// Top-level const in a classic script is NOT a window property; admin.js
// feature-detects via window.SvgTitleBuilder, so export explicitly.
window.SvgTitleBuilder = SvgTitleBuilder;
