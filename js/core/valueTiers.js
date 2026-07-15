// valueTiers.js
// Single source of truth for the wiki's value SYMBOLS and their tooltips.
//
// Items display their ACTUAL stored value, exactly as rated:
//   "20000"        → 20k   (a FLAT value — worth exactly that)
//   "20000-25000"  → 20k-25k (a real range the raters assigned)
//   "20000+"       → 20k+  (typical average — can go higher)
// Values are NEVER snapped into fixed buckets: a 20K flat must show 20K,
// not a "20-25K+" band. (Bucketing shipped once and the community read the
// bands as real ranges — a 20K flat looked like it was worth up to 25K+.)
//
// The symbols this module explains:
//   "+"  — the stored value carries a trailing "+": typical average, the
//          item can be worth more in rare cases.
//   O/C  — Owner's Choice: no fixed value, the owner decides in a trade.
//   "!"  — unstable value: recently added, returned to Gamenight, or
//          inflated, so its price is volatile.

export const OWNERS_CHOICE_LABEL = "O/C";
export const OWNERS_CHOICE_TOOLTIP = "Owner's Choice";

// Tooltip for values whose stored price ends with "+".
export const PLUS_TOOLTIP =
    "Typical average — this item can be worth even more in rare cases.";

// Tooltip for the "!" unstable-value marker (item.unstable flag).
export const UNSTABLE_TOOLTIP =
    "Unstable value — recently added, returned to Gamenight, or inflated, so its price is volatile.";

/**
 * True when a stored price string represents an Owner's Choice item.
 * @param {*} price
 */
export function isOwnersChoice(price) {
    return String(price ?? "").trim().toLowerCase() === "o/c";
}

/**
 * True when a stored price string carries the trailing-"+" marker.
 * @param {*} price
 */
export function hasPlus(price) {
    return String(price ?? "").includes("+");
}

/**
 * The tooltip that accompanies a stored price's displayed value, or null when
 * the value needs no explanation (plain flat values, ranges, N/A, empty).
 * The taxMode argument is accepted for call-site compatibility; the tooltip
 * depends only on the stored string's symbols, which tax never changes.
 * @param {*} price
 * @param {string} [_taxMode='nt']
 * @returns {string|null}
 */
export function tooltipForPrice(price, _taxMode = "nt") {
    if (isOwnersChoice(price)) return OWNERS_CHOICE_TOOLTIP;
    if (hasPlus(price)) return PLUS_TOOLTIP;
    return null;
}

/* =============================================================================
   Legend / reference component.

   renderValueLegend() builds the symbols table from the same constants the
   site uses for tooltips, so the "What do the value symbols mean?" page can
   never drift from what items actually display. Returns an HTML string;
   styling lives in css/value-tiers.css and rides on the shared design tokens.
   ========================================================================== */

/**
 * Renders the value-symbols reference table as HTML.
 * @returns {string}
 */
export function renderValueLegend() {
    const rows = [
        {
            chip: `<span class="tier-chip">20k</span>`,
            text: "A flat value — the item is worth exactly what's shown.",
        },
        {
            chip: `<span class="tier-chip">20k-25k</span>`,
            text: "A range — the item typically trades anywhere inside it.",
        },
        {
            chip: `<span class="tier-chip">20k+</span>`,
            text: PLUS_TOOLTIP,
        },
        {
            chip: `<span class="tier-chip tier-chip-oc">${OWNERS_CHOICE_LABEL}</span>`,
            text: `${OWNERS_CHOICE_TOOLTIP} — no fixed value, set by the owner.`,
        },
        {
            chip: `<span class="tier-chip tier-chip-unstable">20k<span class="unstable-mark">!</span></span>`,
            text: UNSTABLE_TOOLTIP,
        },
    ].map(({ chip, text }) => `
            <tr>
                <td>${chip}</td>
                <td class="tier-range">${text}</td>
            </tr>`).join("");

    return `
        <table class="tier-legend-table">
            <thead>
                <tr>
                    <th scope="col">Shown as</th>
                    <th scope="col">What it means</th>
                </tr>
            </thead>
            <tbody>
                ${rows}
            </tbody>
        </table>`;
}
