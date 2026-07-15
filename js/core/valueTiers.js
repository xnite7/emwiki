// valueTiers.js
// Single source of truth for wiki value tiers.
//
// Each tier label already includes the trailing "+", which means the range is a
// TYPICAL AVERAGE — an item can go higher in rare cases (e.g. "20-25K+" = "20–25K or more").
// Do not strip the "+" or treat it as a separate numeric tier.
//
// Lookup rule: min is INCLUSIVE, max is EXCLUSIVE.
// A raw value maps to a tier when: min <= value < max.
// The top tier is open-ended (max: null) — anything >= 100000 maps there.
// Values under 1000 get NO tier (display raw number, no "+").
// O/C (Owner's Choice) is a separate flag, not a numeric tier.

export const TIERS = [
    { label: "1-1.5K+", min: 1000, max: 2000 },
    { label: "2-2.5K+", min: 2000, max: 3000 },
    { label: "3-4K+", min: 3000, max: 5000 },
    { label: "5-6K+", min: 5000, max: 7000 },
    { label: "7-8K+", min: 7000, max: 9000 },
    { label: "9-10K+", min: 9000, max: 10000 },
    { label: "10-12K+", min: 10000, max: 15000 },
    { label: "15-17K+", min: 15000, max: 18000 },
    { label: "18-20K+", min: 18000, max: 20000 },
    { label: "20-25K+", min: 20000, max: 30000 },
    { label: "30-35K+", min: 30000, max: 40000 },
    { label: "40-45K+", min: 40000, max: 50000 },
    { label: "50-55K+", min: 50000, max: 70000 },
    { label: "70-100K+", min: 70000, max: 100000 },
    { label: "100-130K+", min: 100000, max: null },
];

export const OWNERS_CHOICE_LABEL = "O/C";
export const OWNERS_CHOICE_TOOLTIP = "Owner's Choice";

// Tooltip explaining what the "+" means, for numeric tiers.
export const TIER_TOOLTIP =
    "Typical average range — rare items may be worth even more.";

/**
 * Returns the tier object for a raw numeric value, or null if under 1000.
 * @param {number} value
 * @returns {{label: string, min: number, max: number|null} | null}
 */
export function getTier(value) {
    if (value == null || typeof value !== "number" || isNaN(value)) return null;
    if (value < 1000) return null;
    for (const tier of TIERS) {
        const underMax = tier.max == null || value < tier.max;
        if (value >= tier.min && underMax) return tier;
    }
    return null;
}

/**
 * Formats a value for display in the wiki.
 * - Owner's Choice items always return "O/C".
 * - Values >= 1000 return the tier label (with its "+").
 * - Values < 1000 return the raw number formatted, with no "+".
 * - Null/missing (and not O/C) returns null so the caller can use its fallback.
 * @param {number|null|undefined} value
 * @param {boolean} [isOwnersChoice=false]
 * @returns {string|null}
 */
export function formatValue(value, isOwnersChoice = false) {
    if (isOwnersChoice) return OWNERS_CHOICE_LABEL;

    const tier = getTier(value);
    if (tier) return tier.label;

    if (typeof value === "number" && !isNaN(value) && value > 0) {
        return value.toLocaleString();
    }
    return null; // caller decides the fallback (e.g. "—" or "Unknown")
}

/**
 * Returns the tooltip text for a given displayed value.
 * @param {number|null|undefined} value
 * @param {boolean} [isOwnersChoice=false]
 * @returns {string|null}
 */
export function getTooltip(value, isOwnersChoice = false) {
    if (isOwnersChoice) return OWNERS_CHOICE_TOOLTIP;
    return getTier(value) ? TIER_TOOLTIP : null;
}

/* =============================================================================
   Integration layer — bridges the tier system to the wiki's stored price data.

   Prices in the catalogue are stored as free-form strings ("20000+", "10000-12000",
   "20k", "O/C", "N/A", ""). These helpers turn a stored string into a single
   representative numeric value so it can be binned into a tier, detect the
   Owner's Choice flag from the string, and apply the active tax mode before the
   lookup so tier labels stay consistent with the tax the user is viewing.
   ========================================================================== */

// Tax divisors, matching BaseApp.applyTax:
//   'wt' (Shop Stand, 40% tax), 'gp' (Gamepass, 30% tax), anything else = flat.
const TAX_DIVISORS = { wt: 0.6, gp: 0.7 };

/**
 * True when a stored price string represents an Owner's Choice item.
 * @param {*} price
 */
export function isOwnersChoice(price) {
    return String(price ?? "").trim().toLowerCase() === "o/c";
}

/**
 * Parses a stored price string into a single representative numeric value used
 * for tier lookup. Ranges resolve to their LOWER bound (inclusive-min rule, so
 * "20000-30000" lands in the tier whose min is 20000). Handles "k"/"m" suffixes
 * and a trailing "+". Returns null when there is no usable number (O/C, N/A, "",
 * "0").
 * @param {*} price
 * @returns {number|null}
 */
export function parseRawValue(price) {
    if (price == null) return null;
    if (typeof price === "number") return isNaN(price) ? null : price;

    let str = String(price).trim().toLowerCase();
    if (!str || str === "n/a" || str === "o/c") return null;

    str = str.replace("+", "").trim();
    // Ranges ("20000-30000", "20k-25k") → lower bound.
    if (/\d\s*-\s*\d/.test(str)) str = str.split("-")[0].trim();

    let mult = 1;
    if (str.endsWith("k")) { mult = 1000; str = str.slice(0, -1); }
    else if (str.endsWith("m")) { mult = 1_000_000; str = str.slice(0, -1); }

    const num = parseFloat(str);
    if (isNaN(num)) return null;
    const value = num * mult;
    return value > 0 ? value : null;
}

/**
 * Applies the active tax mode to a numeric value, matching BaseApp.applyTax.
 * @param {number} value
 * @param {string} [taxMode='nt']
 */
export function applyTax(value, taxMode = "nt") {
    const div = TAX_DIVISORS[taxMode];
    return div ? Math.round(value / div) : value;
}

/**
 * The canonical display helper: given a stored price string and the active tax
 * mode, returns the tier label (for values >= 1000), "O/C" for Owner's Choice,
 * or null when the value doesn't map to a tier (under 1000, N/A, empty) so the
 * caller can fall back to its existing exact-value rendering.
 * @param {*} price
 * @param {string} [taxMode='nt']
 * @returns {string|null}
 */
export function tierLabelForPrice(price, taxMode = "nt") {
    if (isOwnersChoice(price)) return OWNERS_CHOICE_LABEL;
    const raw = parseRawValue(price);
    if (raw == null) return null;
    return getTier(applyTax(raw, taxMode))?.label ?? null;
}

/**
 * The tooltip that accompanies a stored price's displayed value, or null when
 * the value has no tooltip (under 1000, N/A, empty).
 * @param {*} price
 * @param {string} [taxMode='nt']
 * @returns {string|null}
 */
export function tooltipForPrice(price, taxMode = "nt") {
    if (isOwnersChoice(price)) return OWNERS_CHOICE_TOOLTIP;
    const raw = parseRawValue(price);
    if (raw == null) return null;
    return getTier(applyTax(raw, taxMode)) ? TIER_TOOLTIP : null;
}

/* =============================================================================
   Legend / reference component.

   renderTierLegend() builds the full tier table plus the O/C row from the same
   TIERS constant, so the "What does the + mean?" page can never drift from the
   values the site actually uses. Returns an HTML string; styling lives in
   css/value-tiers.css and rides on the shared design tokens.
   ========================================================================== */

/**
 * Renders the tier reference table (all numeric tiers + the O/C row) as HTML.
 * @returns {string}
 */
export function renderTierLegend() {
    const fmt = (n) => (n == null ? "" : n.toLocaleString());

    const rows = TIERS.map((t) => {
        const range = t.max == null
            ? `${fmt(t.min)}+`
            : `${fmt(t.min)} – ${fmt(t.max - 1)}`;
        return `
            <tr>
                <td><span class="tier-chip">${t.label}</span></td>
                <td class="tier-range">${range}</td>
            </tr>`;
    }).join("");

    return `
        <table class="tier-legend-table">
            <thead>
                <tr>
                    <th scope="col">Tier</th>
                    <th scope="col">Typical value</th>
                </tr>
            </thead>
            <tbody>
                ${rows}
                <tr class="tier-oc-row">
                    <td><span class="tier-chip tier-chip-oc">${OWNERS_CHOICE_LABEL}</span></td>
                    <td class="tier-range">${OWNERS_CHOICE_TOOLTIP} — no fixed value, set by the owner.</td>
                </tr>
            </tbody>
        </table>`;
}
