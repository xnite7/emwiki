/* =============================================================================
   item-card.js — THE item renderers.

   renderItemCard(item, ctx)  → catalog card element (grid cards on catalog,
                                home rows, profile wishlist, stats dashboard).
                                DOM-built, template-cloned buttons, no per-card
                                listeners (document-level delegation in BaseApp).
   addItemBadges(el, item)    → the badge strip (premium/removed/staff/…).
   tradeItemHTML(item)        → the compact line-item used inside trade/offer
                                cards (string, composed into template literals
                                by trading.js).
   ========================================================================== */

import { Utils } from '../core/utils.js';

// Wishlist ⭐ and heart ❤ button SVGs, parsed once and cloned per card
// (cloneNode) instead of re-parsing the same markup ~100×/batch.
const _wishlistBtnTemplate = (() => {
    const t = document.createElement('template');
    t.innerHTML = '<svg class="wishlist-button" stroke="#000" stroke-width="3" viewBox="-1 0 39 37" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="wishlistact" x1="0%" y1="0%" x2="0%" y2="100%"><stop offset="0%" stop-color="yellow"/><stop offset="50%" stop-color="gold"/><stop offset="100%" stop-color="orange"/></linearGradient></defs><path d="M19.5 2.5c.466.226.843.596 1.073 1.054l3.977 7.898 8.874 1.276c1.294.186 2.19 1.368 2 2.64a2.3 2.3 0 0 1-.688 1.327l-6.416 6.157 1.507 8.687c.22 1.267-.647 2.47-1.936 2.685a2.4 2.4 0 0 1-1.499-.233l-7.942-4.093-7.942 4.093c-1.159.597-2.59.159-3.198-.98a2.3 2.3 0 0 1-.238-1.472l1.508-8.687-6.416-6.157a2.3 2.3 0 0 1-.04-3.29 2.4 2.4 0 0 1 1.352-.677l8.874-1.276 3.977-7.898c.58-1.152 2-1.624 3.173-1.054"/></svg>';
    return t.content.firstElementChild;
})();

const _heartBtnTemplate = (() => {
    const t = document.createElement('template');
    t.innerHTML = '<svg class="heart-button" stroke="#000" paint-order="stroke" stroke-width="3" viewBox="-1 0.5 18 16" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="favred" x1="0%" y1="0%" x2="0%" y2="100%"><stop offset="0%" stop-color="red"/><stop offset="100%" stop-color="maroon"/></linearGradient></defs><path d="M12 2S9 2 8 5C7 2 4 2 4 2 1.8 2 0 3.8 0 6c0 4.1 8 9 8 9s8-5 8-9c0-2.2-1.8-4-4-4"/></svg>';
    return t.content.firstElementChild;
})();

const CATEGORY_IDS = {
    gears: 'gear',
    deaths: 'death',
    pets: 'pet',
    effects: 'effect',
    titles: 'title'
};

/**
 * Build a catalog item card.
 * @param {object} item
 * @param {object} ctx
 * @param {string[]} [ctx.wishlist]        names on the wishlist
 * @param {string[]} [ctx.favorites]       names favorited
 * @param {(price:string)=>string} [ctx.convertPrice]  tax/display conversion
 * @param {string}  [ctx.category]         item category (defaults item.category)
 */
export function renderItemCard(item, ctx = {}) {
    const { wishlist = [], favorites = [], convertPrice = (p) => p } = ctx;

    const div = document.createElement('div');
    div.className = 'item';

    const category = ctx.category ?? item.category;
    if (category) {
        div.id = CATEGORY_IDS[category] || '';
    }

    // Name
    const name = document.createElement('small');
    name.className = 'item-name';
    name.textContent = item.name;
    div.appendChild(name);

    // Image/SVG — native lazy-loaded <img> with fixed dimensions: avoids the
    // per-item canvas paint and post-load reflow; fetches near the viewport.
    if (item.img) {
        const img = document.createElement('img');
        img.loading = 'lazy';
        img.decoding = 'async';
        img.className = 'itemimg';
        img.alt = item.name || '';
        img.src = Utils.getOptimizedImage(item.img, { width: 70, height: 70, format: 'webp', fit: 'scale-down' }) || item.img;
        Utils.protectImage(img);
        div.appendChild(img);
    } else if (item.svg) {
        div.insertAdjacentHTML('beforeend', item.svg);
    }

    // Price
    const price = document.createElement('div');
    price.className = 'item-price';
    price.textContent = convertPrice(Utils.formatPrice(item.price));

    if (item.unstable) {
        price.classList.add('unstable');
        price.title = 'Unstable value — recently added or returned to Gamenight, so its price is volatile.';
        const mark = document.createElement('span');
        mark.className = 'unstable-mark';
        mark.textContent = '!';
        price.appendChild(mark);
    }

    div.appendChild(price);

    if (item.price == '0') {
        price.style.opacity = '0';
        price.style.height = '16px';
    }

    addItemBadges(div, item);

    // Wishlist + heart buttons: clone the shared templates (cheap).
    const wishlistBtn = _wishlistBtnTemplate.cloneNode(true);
    if (wishlist.includes(item.name)) wishlistBtn.classList.add('active');
    wishlistBtn.title = 'Add to Wishlist';
    div.appendChild(wishlistBtn);

    const heart = _heartBtnTemplate.cloneNode(true);
    if (favorites.includes(item.name)) heart.classList.add('red');
    heart.title = 'Add to Favorites';
    div.appendChild(heart);

    // No per-card listeners: stash the item; document-level delegation
    // (BaseApp.setupItemDelegation) handles clicks, ⭐/❤ and long-press.
    div._item = item;

    return div;
}

export function addItemBadges(element, item) {
    if (item.premium) {
        const badge = document.createElement('img');
        badge.className = 'badge premium';
        badge.src = 'https://emwiki.com/imgs/prem.png';
        badge.title = 'Roblox Premium';
        element.appendChild(badge);
    }

    if (item.removed) {
        const badge = document.createElement('div');
        badge.className = 'badge removed';
        badge.innerText = 'Removed';
        element.appendChild(badge);
    }

    if (item.typicalgroup) {
        const badge = document.createElement('img');
        badge.className = 'badge typicalgroup';
        badge.src = 'https://emwiki.com/imgs/tggroup.png';
        badge.title = 'Typical Games Roblox Group';
        element.appendChild(badge);
    }

    if (item.from?.toLowerCase().includes('unreleased') ||
        item.from?.toLowerCase().includes('@zarabelle') ||
        item.from?.toLowerCase().includes('@typicaltype')) {
        const badge = document.createElement('div');
        badge.className = 'badge staff';
        badge.title = 'Staff/Unreleased';
        badge.innerHTML = '<svg viewBox="0 0 36 36" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="a" x2="0" y2="100%"><stop style="stop-color:#d5d5d5"/><stop offset=".3" style="stop-color:#6b6b6b"/><stop offset=".4" style="stop-color:#6b6b6b"/><stop offset=".5" style="stop-color:#3b3b3b"/><stop offset=".6" style="stop-color:#3b3b3b"/><stop offset=".9" style="stop-color:#0c0c0c"/></linearGradient></defs><path stroke="#000" fill="url(#a)" d="M31.25 7.4a44 44 0 0 1-6.62-2.35 45 45 0 0 1-6.08-3.21L18 1.5l-.54.35a45 45 0 0 1-6.08 3.21A44 44 0 0 1 4.75 7.4L4 7.59v8.34c0 13.39 13.53 18.4 13.66 18.45l.34.12.34-.12c.14 0 13.66-5.05 13.66-18.45V7.59Z"/></svg>';
        element.appendChild(badge);
    }

    if (!item.tradable) {
        const badge = document.createElement('img');
        badge.className = 'badge untradable';
        badge.title = 'Untradable';
        badge.src = 'data:image/svg+xml,%3Csvg%20viewBox%3D%22-1%200%2077%2077%22%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%3E%3Cpath%20fill%3D%22%23fff%22%20d%3D%22M14%2022v11h26v4l27-10-27-9v4zm47%2032V43H35v-4L8%2049l27%209v-4z%22%2F%3E%3Cpath%20fill%3D%22red%22%20d%3D%22M37.5%208.5c6.7%200%2012.85%202.25%2017.85%206L13.6%2056.25c-3.75-5-6-11.15-6-17.85C7.6%2021.95%2021%208.55%2037.5%208.5m0%2059.75c-6.7%200-12.85-2.25-17.85-6L61.4%2020.5c3.75%205%206%2011.15%206%2017.85C67.4%2054.8%2054%2068.2%2037.55%2068.2m38.4-29.85c0-21.2-17.2-38.4-38.4-38.4s-38.4%2017.2-38.4%2038.4%2017.2%2038.4%2038.4%2038.4%2038.4-17.2%2038.4-38.4%22%2F%3E%3C%2Fsvg%3E';
        element.appendChild(badge);
    }

    if (item.new) {
        const badge = document.createElement('img');
        badge.src = 'https://emwiki.com/imgs/new.png';
        badge.className = 'badge new';
        element.appendChild(badge);
    }

    if (item.retired) {
        const badge = document.createElement('small');
        badge.className = 'badge retired';
        badge.textContent = 'RETIRED';
        element.appendChild(badge);
    }
}

/**
 * Compact line-item markup for trade/offer cards (returns an HTML string —
 * trading.js composes cards from template literals). Handles the three trade
 * item shapes: catalog item, Robux amount, other-game item.
 * variant 'card' (default) → .trade-item in card lists;
 * variant 'detail'         → .detail-item in the trade detail modal.
 */
export function tradeItemHTML(item, { variant = 'card' } = {}) {
    const esc = Utils.escapeHtml;
    const qty = item.qty && item.qty > 1 ? `<span class="item-qty-badge">×${item.qty}</span>` : '';

    if (item.type === 'robux') {
        return `<div class="trade-item-robux">R$ ${item.amount}${qty}</div>`;
    }
    if (item.type === 'other-game') {
        return `<div class="trade-item-other">${esc(item.game_name)}: ${esc(item.item_name)}${qty}</div>`;
    }
    const img = item.item_image || './imgs/placeholder.png';
    if (variant === 'detail') {
        return `
            <div class="detail-item">
                <img src="${img}" alt="${esc(item.item_name)}" onerror="this.src='./imgs/placeholder.png'">
                <span>${esc(item.item_name)}${qty}</span>
            </div>
        `;
    }
    return `
        <div class="trade-item">
            <img class="trade-item-img" src="${img}" alt="${esc(item.item_name)}" onerror="this.src='./imgs/placeholder.png'">
            <span class="trade-item-name">${esc(item.item_name)}${qty}</span>
        </div>
    `;
}
