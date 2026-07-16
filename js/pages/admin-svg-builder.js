// SVG Title Builder — admin tool for authoring catalog title SVGs.
// Classic script (loads after admin.js, uses its globals: DOM, Utils, Auth).
// Replaces raster-URL stopgaps in items.svg with proper inline <svg> markup
// matching the existing hand-made ones (e.g. 8th Seasoneer).

const SvgTitleBuilder = {
    items: [],
    fonts: [],
    current: null,      // selected item (full record incl. updated_at)
    manualMode: false,  // markup textarea hand-edited; controls stop regenerating
    initialized: false,
    _previewTimer: null,

    async init() {
        if (this.initialized) return;
        this.initialized = true;

        this.bindControls();
        await Promise.all([this.loadItems(), this.loadFonts()]);
        this.renderProblemReport();
        this.renderSearchResults();
    },

    // ---------- data loading ----------

    async loadItems() {
        try {
            const res = await fetch('/api/items?limit=2500');
            const data = await res.json();
            this.items = data.items || [];
        } catch (e) {
            console.error('SvgTitleBuilder: failed to load items', e);
            this.items = [];
        }
    },

    async loadFonts() {
        // Fallbacks always offered even if fonts.css can't be parsed
        const families = new Set(['Lobster', 'Arial', 'Verdana', 'Impact']);
        try {
            const res = await fetch('/css/fonts.css');
            const css = await res.text();
            for (const m of css.matchAll(/font-family:\s*['"]?([^;'"]+)['"]?\s*;/g)) {
                families.add(m[1].trim());
            }
        } catch (e) {
            console.warn('SvgTitleBuilder: could not parse fonts.css', e);
        }
        this.fonts = Array.from(families).sort();

        const select = document.getElementById('svgb-font');
        select.innerHTML = '';
        for (const f of this.fonts) {
            const opt = document.createElement('option');
            opt.value = f;
            opt.textContent = f;
            opt.style.fontFamily = `'${f}'`;
            if (f === 'Lobster') opt.selected = true;
            select.appendChild(opt);
        }
    },

    // ---------- problem report + picker ----------

    isBrokenTitle(item) {
        return item.category === 'titles' && item.svg && !item.svg.trim().startsWith('<svg');
    },

    renderProblemReport() {
        const container = document.getElementById('svgb-problem-report');
        const brokenTitles = this.items.filter(i => this.isBrokenTitle(i));
        const noArt = this.items.filter(i => !i.img && !i.svg);

        const esc = (s) => {
            const d = document.createElement('div');
            d.textContent = s;
            return d.innerHTML;
        };

        const titleRows = brokenTitles.map(i =>
            `<div class="svgb-problem-row" data-item-id="${i.id}" title="Click to load into the builder">
                <span>${esc(i.name)}</span><span class="svgb-problem-detail">${esc((i.svg || '').slice(0, 60))}</span>
            </div>`
        ).join('') || '<div class="svgb-problem-empty">None 🎉</div>';

        const noArtRows = noArt.map(i =>
            `<div class="svgb-problem-row svgb-problem-row-static">
                <span>${esc(i.name)}</span><span class="svgb-problem-detail">${esc(i.category || '')}</span>
            </div>`
        ).join('') || '<div class="svgb-problem-empty">None 🎉</div>';

        container.innerHTML = `
            <details open>
                <summary style="cursor: pointer;">🏷️ Titles with raster graphics instead of SVG — <b>${brokenTitles.length}</b></summary>
                <div class="svgb-problem-list">${titleRows}</div>
            </details>
            <details>
                <summary style="cursor: pointer;">🖼️ Items with no icon or title graphic — <b>${noArt.length}</b> (fixed by the in-game icon sync)</summary>
                <div class="svgb-problem-list">${noArtRows}</div>
            </details>`;

        container.querySelectorAll('.svgb-problem-row[data-item-id]').forEach(row => {
            row.addEventListener('click', () => {
                const item = this.items.find(i => i.id === Number(row.dataset.itemId));
                if (item) this.selectItem(item);
            });
        });
    },

    renderSearchResults() {
        const query = (document.getElementById('svgb-search-input').value || '').toLowerCase();
        const problemOnly = document.getElementById('svgb-problem-only').checked;
        const container = document.getElementById('svgb-search-results');

        let matches = this.items.filter(i => i.name.toLowerCase().includes(query));
        if (problemOnly) matches = matches.filter(i => this.isBrokenTitle(i));
        matches = matches.slice(0, 50);

        container.innerHTML = '';
        for (const item of matches) {
            const row = document.createElement('div');
            row.className = 'svgb-problem-row';
            row.innerHTML = `<span></span><span class="svgb-problem-detail"></span>`;
            row.firstChild.textContent = item.name;
            row.lastChild.textContent = item.category || '';
            row.addEventListener('click', () => this.selectItem(item));
            container.appendChild(row);
        }
        if (!matches.length) {
            container.innerHTML = '<div class="svgb-problem-empty">No matches</div>';
        }
    },

    // ---------- editor ----------

    bindControls() {
        document.getElementById('svgb-search-input').addEventListener('input', () => this.renderSearchResults());
        document.getElementById('svgb-problem-only').addEventListener('change', () => this.renderSearchResults());

        const controlIds = ['svgb-text', 'svgb-font', 'svgb-weight', 'svgb-size', 'svgb-fill1', 'svgb-fill2',
            'svgb-stroke1', 'svgb-stroke2', 'svgb-strokew', 'svgb-spacing', 'svgb-skew'];
        for (const id of controlIds) {
            document.getElementById(id).addEventListener('input', () => {
                for (const [rangeId, labelId] of [['svgb-size', 'svgb-size-value'], ['svgb-strokew', 'svgb-strokew-value'],
                    ['svgb-spacing', 'svgb-spacing-value'], ['svgb-skew', 'svgb-skew-value']]) {
                    document.getElementById(labelId).textContent = document.getElementById(rangeId).value;
                }
                if (this.manualMode) return; // hand-edited markup wins until reset
                this.schedulePreview();
            });
        }

        document.getElementById('svgb-markup').addEventListener('input', () => {
            this.manualMode = true;
            document.getElementById('svgb-manual-flag').style.display = '';
            this.renderPreview(document.getElementById('svgb-markup').value);
        });

        document.getElementById('svgb-reset').addEventListener('click', () => {
            if (this.manualMode && !confirm('Discard manual markup edits and regenerate from the controls?')) return;
            this.manualMode = false;
            document.getElementById('svgb-manual-flag').style.display = 'none';
            this.schedulePreview();
        });

        document.getElementById('svgb-save').addEventListener('click', () => this.save());
    },

    selectItem(item) {
        this.current = item;
        this.manualMode = false;
        document.getElementById('svgb-manual-flag').style.display = 'none';
        document.getElementById('svgb-editor').style.display = '';
        document.getElementById('svgb-editing-name').textContent = `Editing: ${item.name} (${item.category || '?'}, id ${item.id})`;
        document.getElementById('svgb-text').value = item.name;
        this.setStatus('');

        // If the item already has inline SVG, start in manual mode with it loaded
        if (item.svg && item.svg.trim().startsWith('<svg')) {
            this.manualMode = true;
            document.getElementById('svgb-manual-flag').style.display = '';
            document.getElementById('svgb-markup').value = item.svg;
            this.renderPreview(item.svg);
        } else {
            this.schedulePreview();
        }

        document.getElementById('svgb-editor').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    },

    readControls() {
        const v = (id) => document.getElementById(id).value;
        return {
            text: v('svgb-text'),
            font: v('svgb-font'),
            weight: v('svgb-weight'),
            size: Number(v('svgb-size')),
            fill1: v('svgb-fill1'),
            fill2: v('svgb-fill2'),
            stroke1: v('svgb-stroke1'),
            stroke2: v('svgb-stroke2'),
            strokeWidth: Number(v('svgb-strokew')),
            spacing: Number(v('svgb-spacing')),
            skew: Number(v('svgb-skew')),
        };
    },

    schedulePreview() {
        clearTimeout(this._previewTimer);
        this._previewTimer = setTimeout(async () => {
            const markup = await this.buildSvg();
            document.getElementById('svgb-markup').value = markup;
            this.renderPreview(markup);
        }, 150);
    },

    renderPreview(markup) {
        // Replicates renderItemCard: svg injected via insertAdjacentHTML into the card
        for (const id of ['svgb-preview', 'svgb-preview-small']) {
            const box = document.getElementById(id);
            box.innerHTML = '';
            box.insertAdjacentHTML('beforeend', markup);
        }
    },

    async buildSvg() {
        const c = this.readControls();
        const item = this.current || { id: 'x' };
        const fontStyle = `font:${c.weight} ${c.size}px '${c.font}'`;

        try {
            await document.fonts.load(`${c.weight} ${c.size}px '${c.font}'`);
        } catch (e) { /* unknown font — measure with fallback */ }

        // Measure the text at the canonical (500,500) anchor to get a tight viewBox,
        // same technique as the existing hand-made title SVGs.
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
        const fillId = `tg-${item.id}`;
        const strokeId = `sg-${item.id}`;

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

        // Escape the text content
        const escDiv = document.createElement('div');
        escDiv.textContent = c.text;
        const safeText = escDiv.innerHTML;

        // Only pull in fonts.css when a non-system font is used
        const needsFontImport = !['arial', 'verdana', 'impact'].includes(c.font.toLowerCase());
        const styleTag = needsFontImport ? '<style>@import url(https://emwiki.com/css/fonts.css);</style>' : '';
        const defsTag = defs.length ? `<defs>${defs.join('')}</defs>` : '';

        return `<svg width="200" height="100" viewBox="${viewBox}" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet">${styleTag}${defsTag}<text x="500" y="500" text-anchor="middle"${strokeAttrs} fill="${fillAttr}" style="${fontStyle}${spacingStyle}"${transform}>${safeText}</text></svg>`;
    },

    // ---------- saving ----------

    setStatus(msg, color) {
        const el = document.getElementById('svgb-status');
        el.textContent = msg;
        el.style.color = color || '#999';
    },

    buildFullPayload(item, newSvg) {
        // PUT /api/items/:id writes img/svg/price/from/price_code_rarity/credits/
        // lore/alias/quantity/color WITHOUT COALESCE — a partial payload nulls
        // them, so every field must be sent.
        return {
            name: item.name,
            category: item.category,
            img: item.img || null,
            svg: newSvg,
            price: item.price || null,
            from: item.from || null,
            price_code_rarity: item['price/code/rarity'] ?? item.price_code_rarity ?? null,
            tradable: item.tradable !== false,
            new: item.new === true,
            weekly: item.weekly === true,
            weeklystar: item.weeklystar === true,
            retired: item.retired === true,
            premium: item.premium === true,
            removed: item.removed === true,
            typicalgroup: item.typicalgroup === true,
            unstable: item.unstable === true,
            price_history: item.priceHistory || null,
            demand: item.demand || 0,
            credits: item.credits || null,
            lore: item.lore || null,
            alias: item.alias || null,
            quantity: item.quantity || null,
            color: item.color || null,
            updated_at: item.updated_at ?? null,
        };
    },

    async save() {
        if (!this.current) return;
        const item = this.current;
        const markup = document.getElementById('svgb-markup').value.trim();

        if (!markup.startsWith('<svg')) {
            this.setStatus('Markup must start with <svg', '#e05555');
            return;
        }
        if (item.svg && item.svg.trim().startsWith('<svg') && markup !== item.svg &&
            !confirm(`"${item.name}" already has an inline SVG title. Overwrite it?`)) {
            return;
        }

        const authToken = (typeof Auth !== 'undefined' && Auth.authToken) || localStorage.getItem('auth_token');
        this.setStatus('Saving...');

        try {
            const res = await fetch(`/api/items/${item.id}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${authToken}`,
                },
                body: JSON.stringify(this.buildFullPayload(item, markup)),
            });

            if (res.status === 409) {
                // Conflict: refresh our copy from the server's current state but
                // keep the authored markup in the editor so nothing is lost.
                const conflict = await res.json();
                if (conflict.currentItem) {
                    Object.assign(item, conflict.currentItem, { updated_at: conflict.serverUpdatedAt });
                }
                this.setStatus('⚠️ Item was modified by another admin — reloaded it. Check values, then Save again.', '#e0a030');
                return;
            }
            if (!res.ok) {
                const body = await res.text();
                this.setStatus(`❌ Save failed (${res.status}): ${body.slice(0, 120)}`, '#e05555');
                return;
            }

            // Server bumped updated_at; refetch so the next save doesn't 409
            item.svg = markup;
            await this.refreshItem(item);
            this.setStatus('✅ Saved', '#4caf50');
            this.renderProblemReport();
            this.renderSearchResults();
        } catch (e) {
            this.setStatus('❌ Save failed: ' + e.message, '#e05555');
        }
    },

    async refreshItem(item) {
        try {
            const res = await fetch(`/api/items/${encodeURIComponent(item.category)}/${encodeURIComponent(item.name)}`);
            if (res.ok) {
                const { item: fresh } = await res.json();
                if (fresh && fresh.id === item.id) Object.assign(item, fresh);
            }
        } catch (e) { /* non-fatal: next save may 409 and self-heal */ }
    },
};

// Self-initialize when the section becomes visible (same pattern as DemandReview)
(function initializeSvgTitleBuilder() {
    const setup = () => {
        const section = document.getElementById('svg-builder-section');
        if (!section) return;

        const observer = new MutationObserver(() => {
            if (section.style.display !== 'none') SvgTitleBuilder.init();
        });
        observer.observe(section, { attributes: true, attributeFilter: ['style'] });

        setTimeout(() => {
            if (section.style.display !== 'none') SvgTitleBuilder.init();
        }, 2000);
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', setup);
    } else {
        setup();
    }
})();
