// Trading Hub - Redesigned
class TradingHub {
    constructor() {
        this.trades = [];
        this.myTrades = [];
        this.allItems = [];
        // Browse-feed pagination: numbered pages over the server's total count.
        this.browsePage = 1;
        this.browseTotal = 0;
        this.wishlist = [];          // item names on the signed-in user's wishlist
        this._wishlistSet = new Set(); // lowercased, for fast lookup while sorting
        this.filters = {
            status: 'active',
            sort: 'recent',
            search: ''
        };
        this.apiBase = '/api/trades';
        this.itemsApiBase = '/api/items';
        this.currentUser = null;
        this.categories = ['gears', 'deaths', 'pets', 'effects', 'titles'];

        // Create-trade metadata (items live in boardState below).
        this.createMeta = {
            description: '',
            theme: 'default'
        };

        // Offer modal state
        this.offerState = {
            listingId: null,
            listingTitle: '',
            offeredItems: [],
            submitting: false
        };
        this.offerSearchTimeout = null;

        // Trade board state powering the Create panel (and its live value calc).
        // `your` = items you give (offering), `their` = items you want (seeking).
        // Each entry: { item, qty }. Custom (Robux/other-game) items are stored as
        // a pseudo item carrying `__custom` so they render but count as "no value".
        this.calcState = { your: [], their: [] };
        this.calcSearchTimeouts = {};

        // UI state
        this.activeTab = 'browse';
        this.activeMyTab = 'listings';
        this.searchTimeouts = {};
        this.currentCustomItemsKey = null;
        this.currentCustomType = 'robux';

        // Offers / history / messages / notifications state
        this.receivedOffers = [];
        this.sentOffers = [];
        this.completedTrades = [];
        this.conversations = [];
        this.activeThread = null;      // { userId, listingId, offerId }
        this.notifications = [];
        this.unreadNotifications = 0;
        this.notifPollTimer = null;
        this.autoRefreshTimer = null;
        this.msgPollTimer = null;
        // Change fingerprints so background polls only re-render on new data.
        this._threadFingerprint = null;
        this._convFingerprint = null;
        this.reviewState = { tradeId: null, rating: 0 };
        // Last seen unread counts, for firing an OS notification only on an
        // increase. null = not polled yet (so we never notify on first load).
        this._lastUnread = { notif: null, msg: null };

        // Wait for Auth
        if (window.Auth) {
            window.Auth.addEventListener('sessionReady', () => {
                this.currentUser = window.Auth.user;
                this.init();
            });
        } else {
            setTimeout(() => {
                if (window.Auth && window.Auth.user) {
                    this.currentUser = window.Auth.user;
                }
                this.init();
            }, 500);
        }
    }

    async init() {
        this.setupEventListeners();
        this.setupItemTooltip();
        this.applyAuthState();
        this.renderSortDropdown();
        await Promise.all([
            this.loadItems(),
            this.loadTrades(),
            this.loadWishlist()
        ]);
        this.renderTrades();
        this.updateStats();

        // Authenticated-only background data
        if (this.currentUser) {
            this.refreshBadges();
            this.startNotificationPolling();
        }

        // Keep the visible tab's data fresh without manual reloads.
        this.startAutoRefresh();
    }

    // ==================== AUTO-REFRESH ====================

    // How often the visible feed re-fetches (browse / my-trades).
    static FEED_REFRESH_MS = 30000;
    // How often conversations + the open thread poll while the messages modal is open.
    static MESSAGES_POLL_MS = 10000;

    startAutoRefresh() {
        if (this.autoRefreshTimer) clearInterval(this.autoRefreshTimer);
        this.autoRefreshTimer = setInterval(() => this.refreshActivePanel(), TradingHub.FEED_REFRESH_MS);

        // Catch up immediately when the user returns to the tab.
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState !== 'visible') return;
            this.refreshActivePanel();
            if (this.currentUser) this.refreshBadges();
        });
    }

    refreshActivePanel() {
        if (document.visibilityState !== 'visible') return;
        // Only re-render when the data actually changed, so a background poll
        // never yanks the feed out from under the user mid-scroll/click.
        if (this.activeTab === 'browse') {
            const before = this._browseFingerprint();
            this.loadTrades(this.browsePage).then(() => {
                if (this._browseFingerprint() !== before) this.renderTrades();
            });
        } else if (this.activeTab === 'my-trades' && this.currentUser) {
            const before = this._myTradesFingerprint();
            this.loadMyTrades().then(() => {
                if (this._myTradesFingerprint() !== before) this.renderMyTrades();
            });
        }
    }

    _browseFingerprint() {
        return this.browseTotal + ':' + this.trades.map(t => `${t.id}.${t.status}.${t.updated_at}`).join(',');
    }

    _myTradesFingerprint() {
        const ids = (arr, key = 'status') => arr.map(x => `${x.id}.${x[key]}`).join(',');
        return `${ids(this.myTrades)}|${ids(this.receivedOffers)}|${ids(this.sentOffers)}|${ids(this.completedTrades, 'reviewed_by_me')}`;
    }

    // Authorization header for authenticated requests (empty if logged out).
    authHeaders(extra = {}) {
        const token = localStorage.getItem('auth_token');
        return token ? { ...extra, 'Authorization': `Bearer ${token}` } : { ...extra };
    }

    // ==================== DATA LOADING ====================

    async loadItems() {
        try {
            this.allItems = [];
            const categoryPromises = this.categories.map(async (category) => {
                let offset = 0;
                const limit = 500;
                let hasMore = true;

                while (hasMore) {
                    const url = new URL(this.itemsApiBase, window.location.origin);
                    url.searchParams.set('category', category);
                    url.searchParams.set('limit', limit.toString());
                    url.searchParams.set('offset', offset.toString());

                    const res = await fetch(url.toString());
                    if (!res.ok) throw new Error(`Failed to fetch ${category} items`);

                    const data = await res.json();
                    const items = data.items || [];

                    items.forEach(item => {
                        this.allItems.push({ ...item, category });
                    });

                    hasMore = items.length === limit;
                    offset += limit;
                }
            });

            await Promise.all(categoryPromises);

            // Name → catalog item lookup, used to recover the SVG artwork for
            // imageless items (titles) stored in trades as just a name + null image.
            this.itemsByName = new Map(this.allItems.map(i => [i.name.toLowerCase(), i]));
        } catch (error) {
            console.error('Failed to load items:', error);
        }
    }

    // Catalog SVG for an item name (titles have no image, only SVG text art).
    svgFor(name) {
        if (!name || !this.itemsByName) return null;
        return this.itemsByName.get(String(name).toLowerCase())?.svg || null;
    }

    // Catalog category for an item name, so trade thumbnails can carry the same
    // colour coding as catalog cards.
    categoryFor(name) {
        if (!name || !this.itemsByName) return null;
        return this.itemsByName.get(String(name).toLowerCase())?.category || null;
    }

    // Catalog value for an item name, formatted for the hover tooltip. Values
    // >= 1K show their tier label and O/C shows as-is (window.ValueTiers is the
    // single source of truth). Returns null when the item has no known/priced
    // value (unrated, N/A, or 0) so the tooltip just shows the name.
    priceFor(name) {
        if (!name || !this.itemsByName) return null;
        const raw = this.itemsByName.get(String(name).toLowerCase())?.price;
        if (raw === null || raw === undefined) return null;
        const s = String(raw).trim();
        if (!s || s === '0') return null;
        if (s.toUpperCase() === 'N/A') return null;
        if (window.ValueTiers?.isOwnersChoice?.(s)) {
            return `${window.ValueTiers.OWNERS_CHOICE_LABEL} — ${window.ValueTiers.OWNERS_CHOICE_TOOLTIP}`;
        }
        if (s.toUpperCase() === 'O/C') return null; // ValueTiers missing (shouldn't happen)
        const tierLabel = window.ValueTiers?.tierLabelForPrice?.(s);
        if (tierLabel) return `${tierLabel} value`;
        const formatted = window.Utils.formatPrice(raw);
        return formatted ? `${formatted} value` : null;
    }

    // API listing row → the trade shape the UI renders.
    mapListing(listing) {
        return {
            id: listing.id,
            user_id: listing.user_id,
            title: listing.title,
            description: listing.description,
            category: listing.category,
            status: listing.status,
            theme: listing.theme || 'default',
            offering_items: listing.offering_items || [],
            seeking_items: listing.seeking_items || [],
            created_at: listing.created_at,
            updated_at: listing.updated_at,
            views: listing.views || 0,
            user: listing.user
        };
    }

    // Load one page of the browse feed (1-based page number). The server
    // returns the total row count for the current filters, which drives the
    // numbered pagination bar.
    async loadTrades(page = 1) {
        this.browsePage = Math.max(1, page);
        try {
            const params = new URLSearchParams({
                status: this.filters.status,
                limit: String(TradingHub.BROWSE_PAGE_SIZE),
                offset: String((this.browsePage - 1) * TradingHub.BROWSE_PAGE_SIZE),
                ...(this.filters.search && { search: this.filters.search })
            });

            const response = await fetch(`${this.apiBase}/listings?${params}`, { cache: 'no-store' });
            if (!response.ok) throw new Error('Failed to load trades');

            const data = await response.json();
            this.trades = (data.listings || []).map(l => this.mapListing(l));
            this.browseTotal = Number.isFinite(data.total) ? data.total : this.trades.length;
        } catch (error) {
            console.error('Error loading trades:', error);
            this.showToast('Failed to load trades', 'error');
        }
    }

    browsePageCount() {
        return Math.max(1, Math.ceil(this.browseTotal / TradingHub.BROWSE_PAGE_SIZE));
    }

    async goToPage(page) {
        const target = Math.min(Math.max(1, page), this.browsePageCount());
        await this.loadTrades(target);
        this.renderTrades();
        // Put the top of the new page in view.
        document.querySelector('.trading-tabs, #tradesFeed')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    async loadMyTrades() {
        if (!this.currentUser) return;
        const token = localStorage.getItem('auth_token');
        if (!token) return;

        await Promise.all([
            this.loadMyListings(),
            this.loadMyOffers(),
            this.loadCompletedTrades()
        ]);
        this.updateMyTradesBadge();
    }

    async loadMyListings() {
        try {
            // Show ALL of the user's listings here (active, cancelled, completed)
            // so their trades never silently vanish once they leave 'active'.
            // limit=100 (server max) — the default of 20 silently hid listings
            // for anyone with more than a page of trades.
            const response = await fetch(`${this.apiBase}/listings?user_id=${this.currentUser.userId}&status=all&limit=100`, {
                headers: this.authHeaders(),
                cache: 'no-store'
            });
            if (!response.ok) return;

            const data = await response.json();
            this.myTrades = (data.listings || []).map(listing => ({
                id: listing.id,
                user_id: listing.user_id,
                title: listing.title,
                description: listing.description,
                category: listing.category,
                status: listing.status,
                theme: listing.theme || 'default',
                offering_items: listing.offering_items || [],
                seeking_items: listing.seeking_items || [],
                created_at: listing.created_at,
                views: listing.views || 0,
                user: listing.user
            }));
        } catch (error) {
            console.error('Error loading my listings:', error);
        }
    }

    async loadMyOffers() {
        try {
            const response = await fetch(`${this.apiBase}/offers`, { headers: this.authHeaders(), cache: 'no-store' });
            if (!response.ok) return;
            const data = await response.json();
            const offers = data.offers || [];
            const me = String(this.currentUser.userId);
            this.receivedOffers = offers.filter(o => String(o.to_user_id) === me);
            this.sentOffers = offers.filter(o => String(o.from_user_id) === me);
        } catch (error) {
            console.error('Error loading offers:', error);
        }
    }

    async loadCompletedTrades() {
        try {
            const response = await fetch(`${this.apiBase}/completed`, { headers: this.authHeaders(), cache: 'no-store' });
            if (!response.ok) return;
            const data = await response.json();
            this.completedTrades = data.trades || [];
        } catch (error) {
            console.error('Error loading completed trades:', error);
        }
    }

    updateMyTradesBadge() {
        const badge = document.getElementById('myTradesBadge');
        if (!badge) return;
        // Surface actionable items: active listings + pending received offers.
        const activeListings = this.myTrades.filter(t => t.status === 'active').length;
        const pendingReceived = this.receivedOffers.filter(o => o.status === 'pending').length;
        const count = activeListings + pendingReceived;
        if (count > 0) {
            badge.textContent = count;
            badge.style.display = '';
        } else {
            badge.style.display = 'none';
        }
    }

    updateStats() {
        // With paged results the server total is the real count for the current
        // status filter; fall back to counting the page for other filters.
        const activeTrades = this.filters.status === 'active'
            ? this.browseTotal
            : this.trades.filter(t => t.status === 'active').length;
        const completed = this.trades.filter(t => t.status === 'completed').length;
        const uniqueTraders = new Set(this.trades.map(t => t.user_id)).size;

        const statActive = document.getElementById('statActiveTrades');
        const statCompleted = document.getElementById('statCompleted');
        const statTraders = document.getElementById('statTraders');

        if (statActive) statActive.textContent = activeTrades;
        if (statCompleted) statCompleted.textContent = completed;
        if (statTraders) statTraders.textContent = uniqueTraders;
    }

    // ==================== EVENT LISTENERS ====================

    setupEventListeners() {
        // Tab navigation
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                // Logged-out visitors can browse but the account-gated tabs are greyed out.
                if (btn.classList.contains('tab-disabled')) {
                    this.showToast('Please sign in to use this', 'warning');
                    return;
                }
                this.switchTab(btn.dataset.tab);
            });
        });

        // Trade value calculator
        this.setupCalculator();

        // Search
        const searchInput = document.getElementById('searchInput');
        if (searchInput) {
            searchInput.addEventListener('input', (e) => {
                clearTimeout(this.searchTimeouts.browse);
                this.searchTimeouts.browse = setTimeout(() => {
                    this.filters.search = e.target.value;
                    this.loadTrades().then(() => this.renderTrades());
                }, 300);
            });
        }

        // Browse feed pagination (numbered page buttons, rendered dynamically)
        document.getElementById('paginationContainer')?.addEventListener('click', (e) => {
            const btn = e.target.closest('button[data-page]');
            if (!btn || btn.disabled) return;
            this.goToPage(parseInt(btn.dataset.page, 10));
        });

        // Filters
        document.getElementById('filterStatus')?.addEventListener('change', (e) => {
            this.filters.status = e.target.value;
            this.loadTrades().then(() => this.renderTrades());
        });

        // Close the custom sort dropdown on any outside click.
        document.addEventListener('click', (e) => {
            const wrap = document.getElementById('sortDropdown');
            if (wrap && !wrap.contains(e.target)) {
                wrap.classList.remove('open');
                wrap.querySelector('#sortTrigger')?.setAttribute('aria-expanded', 'false');
            }
        });

        // My trades sub-tabs
        document.querySelectorAll('.my-tab').forEach(tab => {
            tab.addEventListener('click', () => {
                document.querySelectorAll('.my-tab').forEach(t => t.classList.remove('active'));
                tab.classList.add('active');
                this.activeMyTab = tab.dataset.mytab;
                this.renderMyTrades();
            });
        });

        // Publish the trade built on the board
        document.getElementById('createListingBtn')?.addEventListener('click', () => this.createListing());

        // Custom item modal (the per-side "Robux / Other" buttons are wired in setupCalculator)
        document.getElementById('closeCustomModal')?.addEventListener('click', () => this.closeCustomModal());
        document.getElementById('cancelCustomModal')?.addEventListener('click', () => this.closeCustomModal());
        document.getElementById('addCustomItemBtn')?.addEventListener('click', () => this.addCustomItem());
        document.getElementById('customTypeRobux')?.addEventListener('click', () => this.selectCustomType('robux'));
        document.getElementById('customTypeOther')?.addEventListener('click', () => this.selectCustomType('other'));

        // Modal overlay click to close
        document.getElementById('customItemModal')?.addEventListener('click', (e) => {
            if (e.target.id === 'customItemModal') this.closeCustomModal();
        });
        document.getElementById('tradeDetailModal')?.addEventListener('click', (e) => {
            if (e.target.id === 'tradeDetailModal') this.closeDetailModal();
        });
        document.getElementById('closeDetailModal')?.addEventListener('click', () => this.closeDetailModal());

        // Offer modal
        this.setupOfferModal();

        // Theme selector
        document.querySelectorAll('.theme-btn').forEach(btn => {
            btn.addEventListener('click', () => this.selectTheme(btn.dataset.theme));
        });

        // Description character count
        const descInput = document.getElementById('tradeDescription');
        if (descInput) {
            descInput.addEventListener('input', (e) => {
                this.createMeta.description = e.target.value;
                const counter = document.getElementById('charCount');
                if (counter) counter.textContent = e.target.value.length;
            });
        }

        // Messages, notifications, and reviews wiring
        this.setupTradingExtras();

        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                this.closeCustomModal();
                this.closeDetailModal();
                this.closeOfferModal();
                this.closeReviewModal();
                this.closeNotifDropdown();
                this.closeMessagesModal();
            }
        });
    }

    setupTradingExtras() {
        // Notifications bell
        document.getElementById('notifBellBtn')?.addEventListener('click', (e) => {
            e.stopPropagation();
            if (!this.currentUser) {
                this.showToast('Please login to view notifications', 'warning');
                return;
            }
            this.requestNotificationPermission();
            this.toggleNotifDropdown();
        });
        document.getElementById('notifMarkAllBtn')?.addEventListener('click', () => this.markAllNotificationsRead());

        // Close notifications dropdown on outside click. The dropdown is
        // portaled to <body> when open, so check it separately from its wrapper.
        document.addEventListener('click', (e) => {
            const wrapper = document.getElementById('notifWrapper');
            const dropdown = document.getElementById('notifDropdown');
            const inWrapper = wrapper && wrapper.contains(e.target);
            const inDropdown = dropdown && dropdown.contains(e.target);
            if (!inWrapper && !inDropdown) this.closeNotifDropdown();
        });

        // Messages button opens the messages modal (like the notifications bell).
        document.getElementById('msgBtn')?.addEventListener('click', () => {
            if (!this.currentUser) {
                this.showToast('Please sign in to view your messages', 'warning');
                return;
            }
            this.requestNotificationPermission();
            this.openMessagesModal();
        });
        document.getElementById('closeMessagesModal')?.addEventListener('click', () => this.closeMessagesModal());
        document.getElementById('messagesModal')?.addEventListener('click', (e) => {
            if (e.target.id === 'messagesModal') this.closeMessagesModal();
        });

        // Messages composer
        document.getElementById('threadComposer')?.addEventListener('submit', (e) => {
            e.preventDefault();
            this.sendThreadMessage();
        });

        // Review modal
        document.getElementById('closeReviewModal')?.addEventListener('click', () => this.closeReviewModal());
        document.getElementById('cancelReviewBtn')?.addEventListener('click', () => this.closeReviewModal());
        document.getElementById('submitReviewBtn')?.addEventListener('click', () => this.submitReview());
        document.getElementById('reviewModal')?.addEventListener('click', (e) => {
            if (e.target.id === 'reviewModal') this.closeReviewModal();
        });
        document.querySelectorAll('#starInput .star-btn').forEach(btn => {
            btn.addEventListener('click', () => this.setReviewRating(parseInt(btn.dataset.value)));
        });
    }

    // ==================== TAB NAVIGATION ====================

    switchTab(tab) {
        this.activeTab = tab;

        // Update tab buttons
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.tab === tab);
        });

        // Update panels
        document.querySelectorAll('.tab-panel').forEach(panel => {
            panel.classList.remove('active');
        });

        if (tab === 'browse') {
            document.getElementById('panelBrowse')?.classList.add('active');
            // Refetch so the feed isn't frozen at whatever loaded on page-open.
            this.loadTrades(this.browsePage).then(() => this.renderTrades());
        } else if (tab === 'my-trades') {
            document.getElementById('panelMyTrades')?.classList.add('active');
            if (!this.currentUser) {
                this.showToast('Please login to view your trades', 'warning');
                this.switchTab('browse');
                return;
            }
            this.renderMyTrades(true); // show loading state, then refresh
            this.loadMyTrades().then(() => this.renderMyTrades());
        } else if (tab === 'create') {
            document.getElementById('panelCreate')?.classList.add('active');
            if (!this.currentUser) {
                this.showToast('Please login to create a trade', 'warning');
                this.switchTab('browse');
                return;
            }
            // Board (calcState) persists in memory across tab switches.
            if (!this.allItems || this.allItems.length === 0) {
                this.loadItems().then(() => this.renderCalculator());
            } else {
                this.renderCalculator();
            }
        }
    }

    // Grey out the account-gated controls for logged-out visitors.
    // Browse stays open to everyone; My Trades, Create, Messages and
    // Notifications require signing in.
    applyAuthState() {
        const authed = !!this.currentUser;
        document.querySelectorAll('.tab-btn').forEach(btn => {
            if (btn.dataset.tab === 'browse') return;
            btn.classList.toggle('tab-disabled', !authed);
        });
        document.getElementById('msgBtn')?.classList.toggle('icon-btn-disabled', !authed);
        document.getElementById('notifBellBtn')?.classList.toggle('icon-btn-disabled', !authed);
        this.applyThemeLock();
    }

    // ==================== TRADE VALUE CALCULATOR ====================

    // Per-demand-point value adjustment around "Good" (3) as neutral.
    static CALC_DEMAND_STEP = 0.12;

    // Max item chips shown per side on a feed card before collapsing to "+N".
    static CARD_MAX_ITEMS = 8;

    // Browse feed page size (server caps a single request at 100).
    static BROWSE_PAGE_SIZE = 24;

    setupCalculator() {
        ['your', 'their'].forEach(side => {
            const input = document.querySelector(`.calc-search-input[data-side-search="${side}"]`);
            const results = document.querySelector(`.calc-search-results[data-side-results="${side}"]`);
            if (input && results) {
                input.addEventListener('input', (e) => {
                    const query = e.target.value.trim().toLowerCase();
                    clearTimeout(this.calcSearchTimeouts[side]);
                    if (query.length < 2) {
                        results.classList.remove('active');
                        results.innerHTML = '';
                        return;
                    }
                    this.calcSearchTimeouts[side] = setTimeout(() => {
                        this.performCalcSearch(side, query, results, input);
                    }, 200);
                });
                document.addEventListener('click', (e) => {
                    if (!input.contains(e.target) && !results.contains(e.target)) {
                        results.classList.remove('active');
                    }
                });
            }

            // Delegated controls for the item chips (qty steppers + remove).
            const itemsEl = document.querySelector(`.calc-items[data-side-items="${side}"]`);
            if (itemsEl) {
                itemsEl.addEventListener('click', (e) => {
                    const chip = e.target.closest('[data-idx]');
                    if (!chip) return;
                    const idx = parseInt(chip.dataset.idx, 10);
                    const entry = this.calcState[side][idx];
                    if (!entry) return;
                    if (e.target.closest('[data-remove]')) {
                        this.removeCalcItem(side, idx);
                    } else if (e.target.closest('[data-qty-inc]')) {
                        this.setCalcQty(side, idx, entry.qty + 1);
                    } else if (e.target.closest('[data-qty-dec]')) {
                        this.setCalcQty(side, idx, entry.qty - 1);
                    }
                });
            }
        });

        // Per-side "Robux / Other" buttons open the shared custom-item modal,
        // routing the result to that board side.
        document.querySelectorAll('[data-side-custom]').forEach(btn => {
            btn.addEventListener('click', () => this.openCustomModal(btn.dataset.sideCustom));
        });

        document.getElementById('calcResetBtn')?.addEventListener('click', () => this.resetCalculator());
    }

    performCalcSearch(side, query, resultsEl, inputEl) {
        const matches = (this.allItems || [])
            .filter(item => item.name.toLowerCase().includes(query))
            .slice(0, 20);

        if (matches.length === 0) {
            resultsEl.innerHTML = '<div class="search-result-empty">No items found</div>';
            resultsEl.classList.add('active');
            return;
        }

        resultsEl.innerHTML = '';
        matches.forEach(item => {
            const base = this.parsePrice(item.price);
            const valLabel = base === null
                ? 'no value'
                : this.formatValue(base * this.demandMultiplier(item.demand));
            const el = document.createElement('div');
            el.className = 'search-result';
            el.innerHTML = `
                ${window.ItemCard.itemVisualHTML(item.img, item.svg, item.name)}
                <div>
                    <div class="search-result-name">${this.esc(item.name)}</div>
                    <div class="search-result-category">${this.esc(item.category || '')} · ${valLabel}</div>
                </div>
            `;
            el.addEventListener('click', () => {
                this.addCalcItem(side, item);
                resultsEl.classList.remove('active');
                inputEl.value = '';
            });
            resultsEl.appendChild(el);
        });
        resultsEl.classList.add('active');
    }

    addCalcItem(side, item) {
        const list = this.calcState[side];
        const existing = list.find(e => e.item.name === item.name && e.item.category === item.category);
        if (existing) {
            existing.qty = Math.min(existing.qty + 1, 999);
        } else {
            list.push({ item, qty: 1 });
        }
        this.renderCalculator();
    }

    // Add a custom (Robux / other-game) item, produced by the shared modal, to a
    // board side. Wrapped in a pseudo item so it renders like any other chip; its
    // null price means the value calc treats it as "no value".
    addCalcCustomItem(side, custom) {
        const pseudo = custom.type === 'robux'
            ? { name: `${custom.amount} Robux`, img: null, category: 'Robux', price: null, demand: 0, __custom: custom }
            : { name: `${custom.game_name}: ${custom.item_name}`, img: null, category: custom.game_name, price: null, demand: 0, __custom: custom };
        this.calcState[side].push({ item: pseudo, qty: 1 });
        this.renderCalculator();
    }

    removeCalcItem(side, idx) {
        this.calcState[side].splice(idx, 1);
        this.renderCalculator();
    }

    setCalcQty(side, idx, qty) {
        if (qty < 1) {
            this.removeCalcItem(side, idx);
            return;
        }
        this.calcState[side][idx].qty = Math.min(qty, 999);
        this.renderCalculator();
    }

    resetCalculator() {
        const hasItems = this.calcState.your.length > 0 || this.calcState.their.length > 0;
        if (hasItems && !confirm('Clear this trade and start over?')) return;

        this.calcState = { your: [], their: [] };
        this.createMeta = { description: '', theme: 'default' };

        const desc = document.getElementById('tradeDescription');
        if (desc) desc.value = '';
        const counter = document.getElementById('charCount');
        if (counter) counter.textContent = '0';
        document.querySelectorAll('.theme-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.theme === 'default');
        });

        this.renderCalculator();
    }

    // --- Value math ---

    // Parse a stored price string into a numeric value, or null if unvalued.
    // Handles plain numbers, ranges ("5-20" -> midpoint), open-ended ("30000+"),
    // and sentinels (N/A, O/C, blank).
    parsePrice(price) {
        if (price === null || price === undefined) return null;
        let s = String(price).trim();
        if (!s) return null;
        const upper = s.toUpperCase();
        if (upper === 'N/A' || upper === 'O/C') return null;
        s = s.replace(/\+/g, '').replace(/,/g, '').trim();
        const range = s.match(/^(\d+(?:\.\d+)?)\s*-\s*(\d+(?:\.\d+)?)$/);
        if (range) {
            const lo = parseFloat(range[1]);
            const hi = parseFloat(range[2]);
            if (Number.isFinite(lo) && Number.isFinite(hi)) return (lo + hi) / 2;
        }
        const num = parseFloat(s);
        return Number.isFinite(num) ? num : null;
    }

    // Demand (0-5) -> value multiplier. 0 means unrated/default, so treat as
    // neutral (1.0) rather than penalizing. 1-5 scales around Good (3) = neutral.
    demandMultiplier(demand) {
        const d = Number(demand);
        if (!Number.isFinite(d) || d <= 0) return 1;
        return 1 + (Math.min(d, 5) - 3) * TradingHub.CALC_DEMAND_STEP;
    }

    // Demand-weighted value of an item line, or null if the item has no value.
    itemValue(item, qty) {
        const base = this.parsePrice(item.price);
        if (base === null) return null;
        return base * this.demandMultiplier(item.demand) * (qty || 1);
    }

    formatValue(n) {
        return Math.round(n).toLocaleString('en-US');
    }

    calcSideTotal(side) {
        let total = 0, valued = 0, unvalued = 0;
        this.calcState[side].forEach(({ item, qty }) => {
            const v = this.itemValue(item, qty);
            if (v === null) unvalued += qty;
            else { total += v; valued += qty; }
        });
        return { total, valued, unvalued };
    }

    // --- Rendering ---

    renderCalculator() {
        this.renderCalcSide('your');
        this.renderCalcSide('their');
        this.renderCalcVerdict();
    }

    renderCalcSide(side) {
        const itemsEl = document.querySelector(`.calc-items[data-side-items="${side}"]`);
        const totalEl = document.querySelector(`.calc-side-total[data-side-total="${side}"]`);
        if (!itemsEl) return;

        const list = this.calcState[side];
        if (list.length === 0) {
            itemsEl.innerHTML = '<div class="calc-empty">No items yet — search above to add.</div>';
        } else {
            itemsEl.innerHTML = list.map((entry, idx) => {
                const { item, qty } = entry;
                const v = this.itemValue(item, qty);
                const noValue = v === null;
                const valLabel = noValue ? 'no value' : this.formatValue(v);
                return `
                <div class="calc-item${noValue ? ' calc-item-novalue' : ''}" data-idx="${idx}">
                    ${window.ItemCard.itemVisualHTML(item.img, item.svg || this.svgFor(item.name), item.name)}
                    <div class="calc-item-info">
                        <div class="calc-item-name">${this.esc(item.name)}</div>
                        <div class="calc-item-val">${valLabel}</div>
                    </div>
                    <div class="calc-item-qty">
                        <button type="button" data-qty-dec aria-label="Decrease quantity">−</button>
                        <span>${qty}</span>
                        <button type="button" data-qty-inc aria-label="Increase quantity">+</button>
                    </div>
                    <button type="button" class="calc-item-remove" data-remove aria-label="Remove item">✕</button>
                </div>`;
            }).join('');
        }

        const { total } = this.calcSideTotal(side);
        if (totalEl) totalEl.textContent = this.formatValue(total);
    }

    renderCalcVerdict() {
        const you = this.calcSideTotal('your').total;
        const them = this.calcSideTotal('their').total;
        const verdictEl = document.querySelector('[data-verdict]');
        const labelEl = verdictEl?.querySelector('.calc-verdict-label');
        const gapEl = verdictEl?.querySelector('.calc-verdict-gap');
        const markerEl = document.querySelector('[data-balance-marker]');

        verdictEl?.classList.remove('win', 'fair', 'lose', 'empty');

        if (you === 0 && them === 0) {
            verdictEl?.classList.add('empty');
            if (labelEl) labelEl.textContent = '—';
            if (gapEl) gapEl.textContent = 'Add items to compare';
            if (markerEl) markerEl.style.left = '50%';
            return;
        }

        const larger = Math.max(you, them, 1);
        const diff = them - you; // positive => you receive more => win
        const pct = Math.abs(diff) / larger;
        let verdict;
        if (pct <= 0.05) verdict = 'fair';
        else if (diff > 0) verdict = 'win';
        else verdict = 'lose';

        verdictEl?.classList.add(verdict);
        if (labelEl) labelEl.textContent = verdict.toUpperCase();
        if (gapEl) {
            if (verdict === 'fair') gapEl.textContent = 'Even trade';
            else if (verdict === 'win') gapEl.textContent = `+${this.formatValue(Math.abs(diff))} in your favor`;
            else gapEl.textContent = `−${this.formatValue(Math.abs(diff))} against you`;
        }
        if (markerEl) {
            const share = them / (you + them); // 0 (lose) .. 1 (win)
            markerEl.style.left = `${Math.round(share * 100)}%`;
        }
    }

    // ==================== SORT ====================

    // Browse sort options. Each carries an inline SVG shown in the custom
    // dropdown (native <option> can't render icons).
    static SORT_OPTIONS = [
        {
            value: 'wishlist',
            label: 'Wishlisted First',
            // star
            svg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3.5l2.6 5.27 5.82.85-4.21 4.1.99 5.79L12 17.77l-5.2 2.73.99-5.79-4.21-4.1 5.82-.85z"/></svg>'
        },
        {
            value: 'recent',
            label: 'Newest First',
            // clock
            svg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/></svg>'
        },
        {
            value: 'biggest',
            label: 'Biggest Trade',
            // descending bars
            svg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M4 6h16M4 12h10M4 18h5"/></svg>'
        }
    ];

    async loadWishlist() {
        try {
            if (this.currentUser && localStorage.getItem('auth_token')) {
                const prefs = await Utils.loadAllFromAccount({ wishlist: [] });
                this.wishlist = prefs.wishlist || [];
            } else {
                this.wishlist = Utils.loadFromStorage('wishlist', []);
            }
        } catch (e) {
            this.wishlist = Utils.loadFromStorage('wishlist', []);
        }
        this._wishlistSet = new Set((this.wishlist || []).map(n => String(n).toLowerCase()));
    }

    // Total item count across both sides (respecting quantities) — the "size" of a trade.
    tradeSize(trade) {
        const count = (arr) => (arr || []).reduce((sum, i) => sum + (i.qty && i.qty > 1 ? i.qty : 1), 0);
        return count(trade.offering_items) + count(trade.seeking_items);
    }

    // Does this trade offer anything on the user's wishlist?
    tradeHasWishlistedItem(trade) {
        if (this._wishlistSet.size === 0) return false;
        return (trade.offering_items || []).some(i =>
            i.item_name && this._wishlistSet.has(String(i.item_name).toLowerCase())
        );
    }

    // Build the custom sort dropdown (icon + label per option) and wire it up.
    renderSortDropdown() {
        const wrap = document.getElementById('sortDropdown');
        if (!wrap) return;
        const opts = TradingHub.SORT_OPTIONS;
        const current = opts.find(o => o.value === this.filters.sort) || opts[0];

        wrap.innerHTML = `
            <button type="button" class="sort-trigger" id="sortTrigger" aria-haspopup="listbox" aria-expanded="false">
                <span class="sort-trigger-label">${current.svg}<span>${current.label}</span></span>
                <svg class="sort-caret" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>
            </button>
            <ul class="sort-menu" id="sortMenu" role="listbox">
                ${opts.map(o => `
                    <li class="sort-option${o.value === this.filters.sort ? ' active' : ''}" role="option" data-sort="${o.value}" aria-selected="${o.value === this.filters.sort}">
                        ${o.svg}<span>${o.label}</span>
                    </li>`).join('')}
            </ul>`;

        const trigger = wrap.querySelector('#sortTrigger');
        trigger.addEventListener('click', (e) => {
            e.stopPropagation();
            const open = wrap.classList.toggle('open');
            trigger.setAttribute('aria-expanded', String(open));
        });
        wrap.querySelectorAll('.sort-option').forEach(li => {
            li.addEventListener('click', () => {
                this.filters.sort = li.dataset.sort;
                wrap.classList.remove('open');
                this.renderSortDropdown();
                this.renderTrades();
            });
        });
    }

    // ==================== BROWSE RENDERING ====================

    renderTrades() {
        const feed = document.getElementById('tradesFeed');
        if (!feed) return;

        let filtered = [...this.trades];

        // Client-side filtering
        if (this.filters.status !== 'all') {
            filtered = filtered.filter(t => t.status === this.filters.status);
        }
        if (this.filters.search) {
            // Mirror the server's search: title, description, or any item name
            // on either side of the trade.
            const q = this.filters.search.toLowerCase();
            const itemMatch = (items) => (items || []).some(i =>
                (i.item_name || i.game_name || '').toLowerCase().includes(q)
            );
            filtered = filtered.filter(t =>
                t.title?.toLowerCase().includes(q) ||
                t.description?.toLowerCase().includes(q) ||
                itemMatch(t.offering_items) ||
                itemMatch(t.seeking_items)
            );
        }

        // Sort
        if (this.filters.sort === 'wishlist') {
            // Trades offering a wishlisted item float to the top; ties broken by newest.
            filtered.sort((a, b) =>
                (this.tradeHasWishlistedItem(b) - this.tradeHasWishlistedItem(a)) ||
                (b.created_at - a.created_at)
            );
        } else if (this.filters.sort === 'biggest') {
            // Most items first, then newest.
            filtered.sort((a, b) =>
                (this.tradeSize(b) - this.tradeSize(a)) ||
                (b.created_at - a.created_at)
            );
        } else {
            // 'recent' (default): newest first.
            filtered.sort((a, b) => b.created_at - a.created_at);
        }

        // The pagination bar stays visible even alongside the empty state —
        // other pages can still hold results.
        this.renderPagination();

        if (filtered.length === 0) {
            feed.innerHTML = `
                <div class="empty-state">
                    <div class="empty-icon">
                        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/><path d="M8 11h6"/></svg>
                    </div>
                    <h3>No trades found</h3>
                    <p>Try adjusting your filters or create a new trade!</p>
                </div>
            `;
            return;
        }

        feed.innerHTML = '';
        filtered.forEach(trade => {
            feed.appendChild(this.createTradeCard(trade));
        });

        this.updateStats();
    }

    // Numbered page buttons (‹ 1 … 4 [5] 6 … 12 ›): first/last always shown,
    // ±1 around the current page, gaps collapsed to an ellipsis.
    renderPagination() {
        const container = document.getElementById('paginationContainer');
        if (!container) return;
        const pages = this.browsePageCount();
        if (pages <= 1) {
            container.innerHTML = '';
            container.style.display = 'none';
            return;
        }
        container.style.display = '';

        const current = Math.min(this.browsePage, pages);
        const wanted = new Set([1, pages, current - 1, current, current + 1]);
        const parts = [];
        let prev = 0;
        for (let p = 1; p <= pages; p++) {
            if (!wanted.has(p)) continue;
            if (prev && p - prev > 1) parts.push('<span class="page-ellipsis">…</span>');
            parts.push(`<button type="button" class="page-btn${p === current ? ' active' : ''}" data-page="${p}"${p === current ? ' aria-current="page"' : ''}>${p}</button>`);
            prev = p;
        }

        container.innerHTML = `
            <button type="button" class="page-btn page-nav" data-page="${current - 1}"${current <= 1 ? ' disabled' : ''} aria-label="Previous page">‹</button>
            ${parts.join('')}
            <button type="button" class="page-btn page-nav" data-page="${current + 1}"${current >= pages ? ' disabled' : ''} aria-label="Next page">›</button>
        `;
    }

    createTradeCard(trade) {
        const card = document.createElement('div');
        card.className = `trade-card${trade.theme && trade.theme !== 'default' ? ' theme-' + trade.theme : ''}`;

        const timeAgo = this.getTimeAgo(trade.created_at);
        const rating = trade.user?.average_rating || 0;
        const stars = rating > 0 ? `${'★'.repeat(Math.round(rating))}${'☆'.repeat(5 - Math.round(rating))}` : '';
        const tradeCount = trade.user?.total_trades || 0;

        card.innerHTML = `
            <div class="trade-card-top">
                <img class="trader-avatar" src="${trade.user?.avatar_url || './imgs/placeholder.png'}" alt="${this.esc(trade.user?.username || 'Unknown')}" onerror="this.src='./imgs/placeholder.png'">
                <div class="trader-info">
                    <div class="trader-name">${this.esc(trade.user?.username || 'Unknown')}</div>
                    <div class="trader-meta">
                        ${stars ? `<span class="trader-rating">${stars}</span>` : ''}
                        <span>${tradeCount} trade${tradeCount !== 1 ? 's' : ''}</span>
                        <span>${timeAgo}</span>
                    </div>
                </div>
                <span class="trade-status-badge ${trade.status}">${trade.status}</span>
            </div>
            
            <div class="trade-exchange">
                <div class="trade-side offering">
                    <div class="trade-side-label">Offering</div>
                    <div class="trade-items-list">
                        ${this.renderTradeItems(trade.offering_items)}
                    </div>
                </div>
                <div class="trade-swap-divider">
                    <svg width="14" height="14" viewBox="0 0 18 18" fill="none"><path d="M0,11h11.2l-2.6,2.6L10,15l6-6H0V11z M4.8,5l2.6-2.6L6,1L0,7h16V5H4.8z"></path></svg>
                </div>
                <div class="trade-side seeking">
                    <div class="trade-side-label">Looking For</div>
                    <div class="trade-items-list">
                        ${trade.seeking_items && trade.seeking_items.length > 0
                            ? this.renderTradeItems(trade.seeking_items)
                            : '<span class="trade-open-offers">Open to offers</span>'
                        }
                    </div>
                </div>
            </div>
            ${trade.description ? `<div class="trade-card-description">${this.esc(trade.description)}</div>` : ''}
            <div class="trade-card-actions">
                <button class="btn-view-trade" data-id="${trade.id}">View Details</button>
            </div>
        `;

        // Event listeners — Make Offer lives inside the detail view now.
        card.querySelector('.btn-view-trade')?.addEventListener('click', () => this.viewTrade(trade.id));

        return card;
    }

    // A single cursor-following tooltip, shared by every trade item thumbnail,
    // that names the hovered item and shows its value underneath. Set up once and
    // driven by delegated pointer events so it works for cards rendered later.
    //
    // Pointer-only by design: touch/mobile devices have no cursor to anchor the
    // tooltip to, so on `(hover: none)`/coarse pointers we skip setup entirely and
    // the feature stays disabled — matching the requested mobile behaviour.
    setupItemTooltip() {
        if (this._itemTooltip) return;
        if (!window.matchMedia || !window.matchMedia('(hover: hover) and (pointer: fine)').matches) return;

        const tip = document.createElement('div');
        tip.className = 'trade-item-tooltip';
        tip.setAttribute('role', 'tooltip');
        tip.style.display = 'none';
        document.body.appendChild(tip);
        this._itemTooltip = tip;

        let current = null;

        const hide = () => {
            current = null;
            tip.style.display = 'none';
        };

        // Keep the tooltip beside the cursor and clamp it inside the viewport so
        // it never gets clipped at the right/bottom edges.
        const position = (e) => {
            const pad = 14;
            const rect = tip.getBoundingClientRect();
            let x = e.clientX + pad;
            let y = e.clientY + pad;
            if (x + rect.width > window.innerWidth) x = e.clientX - pad - rect.width;
            if (y + rect.height > window.innerHeight) y = e.clientY - pad - rect.height;
            tip.style.left = `${Math.max(0, x)}px`;
            tip.style.top = `${Math.max(0, y)}px`;
        };

        document.addEventListener('mouseover', (e) => {
            const el = e.target.closest?.('.trade-item[data-item-name]');
            if (!el || el === current) return;
            current = el;
            const name = el.getAttribute('data-item-name') || '';
            const price = el.getAttribute('data-item-price') || '';
            tip.innerHTML = `<span class="tooltip-name">${this.esc(name)}</span>`
                + (price ? `<span class="tooltip-price">${this.esc(price)}</span>` : '');
            tip.style.display = 'flex';
            position(e);
        });

        document.addEventListener('mousemove', (e) => {
            if (!current) return;
            if (!e.target.closest?.('.trade-item[data-item-name]')) { hide(); return; }
            position(e);
        });

        // Hide when the pointer leaves the thumbnail (or the page/scroll changes).
        document.addEventListener('mouseout', (e) => {
            if (current && !e.relatedTarget?.closest?.('.trade-item[data-item-name]')) hide();
        });
        window.addEventListener('scroll', hide, true);
    }

    // Small "×N" badge for stacked items (only shown when qty > 1).
    renderTradeItem(item) {
        return window.ItemCard.tradeItemHTML(item, {
            svg: this.svgFor(item.item_name),
            category: item.category || this.categoryFor(item.item_name),
            price: this.priceFor(item.item_name)
        });
    }

    // Item chips for a trade card side, capped so one huge trade can't stretch
    // every card in the row; the remainder collapses into a "+N" chip
    // (View Details shows the full list).
    renderTradeItems(items, max = TradingHub.CARD_MAX_ITEMS) {
        if (!items || items.length === 0) return '';
        const shown = items.slice(0, max);
        const hidden = items.length - shown.length;
        return shown.map(i => this.renderTradeItem(i)).join('')
            + (hidden > 0 ? `<div class="trade-item-more" title="${hidden} more item${hidden !== 1 ? 's' : ''}">+${hidden}</div>` : '');
    }

    // ==================== MY TRADES ====================

    renderMyTrades(loading = false) {
        const feed = document.getElementById('myTradesFeed');
        if (!feed) return;

        if (loading) {
            feed.innerHTML = `
                <div class="trade-card skeleton"><div class="skeleton-inner"></div></div>
                <div class="trade-card skeleton"><div class="skeleton-inner"></div></div>
            `;
            return;
        }

        if (this.activeMyTab === 'listings') {
            this.renderMyListingsList(feed);
        } else if (this.activeMyTab === 'received') {
            this.renderOffersList(feed, this.receivedOffers, true);
        } else if (this.activeMyTab === 'sent') {
            this.renderOffersList(feed, this.sentOffers, false);
        } else if (this.activeMyTab === 'history') {
            this.renderHistoryList(feed);
        }
    }

    emptyState(title, message) {
        return `
            <div class="empty-state">
                <div class="empty-icon">
                    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M16 16v3a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h3"/><rect x="10" y="3" width="11" height="11" rx="2"/><path d="m14 7 2 2-2 2"/></svg>
                </div>
                <h3>${this.esc(title)}</h3>
                <p>${this.esc(message)}</p>
            </div>
        `;
    }

    renderMyListingsList(feed) {
        if (this.myTrades.length === 0) {
            feed.innerHTML = this.emptyState('No listings yet', 'Create your first trade to get started!');
            return;
        }
        feed.innerHTML = '';
        this.myTrades.forEach(trade => {
            const card = this.createTradeCard(trade);
            // Owners can cancel their own active listings.
            if (trade.status === 'active') {
                const actions = card.querySelector('.trade-card-actions');
                if (actions) {
                    const cancelBtn = document.createElement('button');
                    cancelBtn.className = 'btn-danger';
                    cancelBtn.textContent = 'Cancel Listing';
                    cancelBtn.addEventListener('click', () => this.cancelListing(trade.id));
                    actions.appendChild(cancelBtn);
                }
            }
            feed.appendChild(card);
        });
    }

    renderOffersList(feed, offers, isReceived) {
        if (!offers || offers.length === 0) {
            feed.innerHTML = isReceived
                ? this.emptyState('No offers received', 'When someone makes an offer on your listings, it appears here.')
                : this.emptyState('No offers sent', 'Browse trades and make an offer to see it here.');
            return;
        }
        feed.innerHTML = '';
        offers.forEach(offer => feed.appendChild(this.createOfferCard(offer, isReceived)));
    }

    createOfferCard(offer, isReceived) {
        const card = document.createElement('div');
        card.className = 'offer-card';

        const party = isReceived ? offer.from_user : offer.to_user;
        const partyName = party?.username || 'Unknown';
        const timeAgo = this.getTimeAgo(offer.created_at);
        const items = Array.isArray(offer.offered_items) ? offer.offered_items : [];

        card.innerHTML = `
            <div class="offer-card-header">
                <div class="offer-card-info">
                    <div class="offer-card-title">${this.esc(offer.listing_title || `Listing #${offer.listing_id}`)}</div>
                    <div class="offer-card-sub">${isReceived ? 'From' : 'To'}: ${this.esc(partyName)} &middot; ${timeAgo}</div>
                </div>
                <span class="offer-status ${this.esc(offer.status)}">${this.esc(offer.status)}</span>
            </div>
            ${offer.message ? `<div class="offer-card-message">${this.esc(offer.message)}</div>` : ''}
            <div class="offer-card-items">
                <div class="offer-items-label">Offered items</div>
                <div class="trade-items-list">
                    ${items.map(i => this.renderTradeItem(i)).join('') || '<span class="trade-open-offers">No items</span>'}
                </div>
            </div>
            <div class="offer-card-actions"></div>
        `;

        const actions = card.querySelector('.offer-card-actions');

        if (isReceived && offer.status === 'pending') {
            const rejectBtn = document.createElement('button');
            rejectBtn.className = 'btn-danger';
            rejectBtn.textContent = 'Reject';
            rejectBtn.addEventListener('click', () => this.respondToOffer(offer.id, 'reject'));

            const acceptBtn = document.createElement('button');
            acceptBtn.className = 'btn-success';
            acceptBtn.textContent = 'Accept';
            acceptBtn.addEventListener('click', () => this.respondToOffer(offer.id, 'accept'));

            actions.append(rejectBtn, acceptBtn);
        } else if (!isReceived && offer.status === 'pending') {
            const cancelBtn = document.createElement('button');
            cancelBtn.className = 'btn-danger';
            cancelBtn.textContent = 'Cancel Offer';
            cancelBtn.addEventListener('click', () => this.respondToOffer(offer.id, 'cancel'));
            actions.appendChild(cancelBtn);
        }

        // Message the other party in context of this offer.
        if (party?.user_id) {
            const msgBtn = document.createElement('button');
            msgBtn.className = 'btn-secondary';
            msgBtn.textContent = 'Message';
            msgBtn.addEventListener('click', () => this.openThreadWith(party.user_id, partyName, offer.listing_id, offer.id));
            actions.appendChild(msgBtn);
        }

        if (actions.children.length === 0) actions.remove();
        return card;
    }

    renderHistoryList(feed) {
        if (!this.completedTrades || this.completedTrades.length === 0) {
            feed.innerHTML = this.emptyState('No completed trades', 'Accepted trades show up here, ready to review.');
            return;
        }
        feed.innerHTML = '';
        this.completedTrades.forEach(trade => feed.appendChild(this.createHistoryCard(trade)));
    }

    createHistoryCard(trade) {
        const card = document.createElement('div');
        card.className = 'offer-card history-card';

        const other = trade.other_user;
        const otherName = other?.username || 'Unknown';
        const timeAgo = this.getTimeAgo(trade.completed_at);
        const mine = Array.isArray(trade.my_items) ? trade.my_items : [];
        const theirs = Array.isArray(trade.their_items) ? trade.their_items : [];

        card.innerHTML = `
            <div class="offer-card-header">
                <div class="offer-card-info">
                    <div class="offer-card-title">Trade with ${this.esc(otherName)}</div>
                    <div class="offer-card-sub">You were the ${this.esc(trade.role)} &middot; ${timeAgo}</div>
                </div>
                <span class="offer-status accepted">completed</span>
            </div>
            <div class="history-exchange">
                <div class="trade-side">
                    <div class="trade-side-label">You gave</div>
                    <div class="trade-items-list">${mine.map(i => this.renderTradeItem(i)).join('') || '<span class="trade-open-offers">—</span>'}</div>
                </div>
                <div class="trade-side">
                    <div class="trade-side-label">You received</div>
                    <div class="trade-items-list">${theirs.map(i => this.renderTradeItem(i)).join('') || '<span class="trade-open-offers">—</span>'}</div>
                </div>
            </div>
            <div class="offer-card-actions"></div>
        `;

        const actions = card.querySelector('.offer-card-actions');
        if (trade.reviewed_by_me) {
            const done = document.createElement('span');
            done.className = 'review-done';
            done.textContent = '✓ Reviewed';
            actions.appendChild(done);
        } else {
            const reviewBtn = document.createElement('button');
            reviewBtn.className = 'btn-success';
            reviewBtn.textContent = 'Leave Review';
            reviewBtn.addEventListener('click', () => this.openReviewModal(trade.id, otherName));
            actions.appendChild(reviewBtn);
        }
        if (other?.user_id) {
            const msgBtn = document.createElement('button');
            msgBtn.className = 'btn-secondary';
            msgBtn.textContent = 'Message';
            msgBtn.addEventListener('click', () => this.openThreadWith(other.user_id, otherName, trade.listing_id, trade.offer_id));
            actions.appendChild(msgBtn);
        }

        return card;
    }

    // ==================== OFFER ACTIONS ====================

    async respondToOffer(offerId, action) {
        const labels = { accept: 'accept this offer? This completes the trade.', reject: 'reject this offer?', cancel: 'cancel this offer?' };
        if (!confirm(`Are you sure you want to ${labels[action]}`)) return;

        try {
            const response = await fetch(`${this.apiBase}/offers/${offerId}/${action}`, {
                method: 'POST',
                headers: this.authHeaders({ 'Content-Type': 'application/json' })
            });
            if (!response.ok) {
                const err = await response.json().catch(() => ({}));
                throw new Error(err.error || `Failed to ${action} offer (${response.status})`);
            }
            const successMsg = { accept: 'Offer accepted — trade completed!', reject: 'Offer rejected', cancel: 'Offer cancelled' };
            this.showToast(successMsg[action], 'success');
            await this.loadMyTrades();
            this.renderMyTrades();
        } catch (error) {
            console.error(`Failed to ${action} offer:`, error);
            this.showToast(error.message || `Failed to ${action} offer`, 'error');
        }
    }

    async cancelListing(listingId) {
        if (!confirm('Cancel this listing? It will no longer accept offers.')) return;
        try {
            const response = await fetch(`${this.apiBase}/listings/${listingId}`, {
                method: 'DELETE',
                headers: this.authHeaders({ 'Content-Type': 'application/json' })
            });
            if (!response.ok) {
                const err = await response.json().catch(() => ({}));
                throw new Error(err.error || `Failed to cancel listing (${response.status})`);
            }
            this.showToast('Listing cancelled', 'success');
            await this.loadMyTrades();
            this.renderMyTrades();
        } catch (error) {
            console.error('Failed to cancel listing:', error);
            this.showToast(error.message || 'Failed to cancel listing', 'error');
        }
    }

    // ==================== TRADE DETAIL MODAL ====================

    async viewTrade(id) {
        const trade = this.trades.find(t => t.id === id) || this.myTrades.find(t => t.id === id);
        if (!trade) return;

        const modal = document.getElementById('tradeDetailModal');
        const body = document.getElementById('tradeDetailBody');
        if (!modal || !body) return;

        const timeAgo = this.getTimeAgo(trade.created_at);
        const rating = trade.user?.average_rating || 0;
        const stars = rating > 0 ? `${'★'.repeat(Math.round(rating))}${'☆'.repeat(5 - Math.round(rating))} (${rating.toFixed(1)})` : 'No ratings';

        body.innerHTML = `
            <div class="detail-header">
                <a class="detail-trader-link" href="/profile/${trade.user_id}" title="View ${this.esc(trade.user?.username || 'trader')}'s profile">
                    <img class="detail-avatar" src="${trade.user?.avatar_url || './imgs/placeholder.png'}" alt="${this.esc(trade.user?.username || 'Unknown')}" onerror="this.src='./imgs/placeholder.png'">
                    <div>
                        <div class="detail-trader-name">${this.esc(trade.user?.username || 'Unknown')}</div>
                        <div class="detail-trader-stats">${stars} - ${trade.user?.total_trades || 0} trades</div>
                    </div>
                </a>
            </div>
            <div class="detail-body">
                ${trade.description ? `<div class="detail-description">${this.esc(trade.description)}</div>` : ''}
                <div class="detail-exchange">
                    <div class="detail-side offering">
                        <div class="detail-side-label">Offering</div>
                        <div class="detail-items">
                            ${trade.offering_items.map(i => this.renderDetailItem(i)).join('')}
                        </div>
                    </div>
                    <div class="detail-side seeking">
                        <div class="detail-side-label">Looking For</div>
                        <div class="detail-items">
                            ${trade.seeking_items && trade.seeking_items.length > 0
                                ? trade.seeking_items.map(i => this.renderDetailItem(i)).join('')
                                : '<span class="trade-open-offers">Open to offers</span>'
                            }
                        </div>
                    </div>
                </div>
                <div class="detail-meta">
                    <span>Posted ${timeAgo}</span>
                    <span>${trade.views || 0} views</span>
                    <span class="trade-status-badge ${trade.status}">${trade.status}</span>
                </div>
                <div class="detail-reviews" id="detailReviews"></div>
            </div>
            ${this.currentUser && trade.user_id !== this.currentUser.userId ? `
            <div class="detail-actions">
                ${trade.status === 'active' ? `<button class="btn-make-offer" style="flex:1" data-id="${trade.id}">Make Offer</button>` : ''}
                <button class="btn-secondary btn-message-trader">Message Trader</button>
            </div>` : ''}
        `;

        body.querySelector('.btn-make-offer')?.addEventListener('click', () => {
            this.closeDetailModal();
            this.makeOffer(trade.id);
        });
        body.querySelector('.btn-message-trader')?.addEventListener('click', () => {
            this.closeDetailModal();
            this.openThreadWith(trade.user_id, trade.user?.username || 'Trader', trade.id, null);
        });

        modal.classList.add('active');

        // Load trader reputation asynchronously
        this.loadTraderReviews(trade.user_id);
    }

    renderDetailItem(item) {
        return window.ItemCard.tradeItemHTML(item, {
            variant: 'detail',
            svg: this.svgFor(item.item_name),
            category: item.category || this.categoryFor(item.item_name)
        });
    }

    closeDetailModal() {
        document.getElementById('tradeDetailModal')?.classList.remove('active');
    }

    async makeOffer(id) {
        if (!this.currentUser) {
            this.showToast('Please login to make an offer', 'warning');
            return;
        }

        const listing = this.trades.find(t => t.id === id) || this.myTrades.find(t => t.id === id);
        if (!listing) {
            this.showToast('Listing not found', 'error');
            return;
        }
        if (listing.user_id === this.currentUser.userId) {
            this.showToast("You can't make an offer on your own listing", 'warning');
            return;
        }
        if (listing.status !== 'active') {
            this.showToast('This listing is no longer active', 'warning');
            return;
        }

        this.offerState = {
            listingId: id,
            listingTitle: listing.title || `Listing #${id}`,
            offeredItems: [],
            submitting: false
        };

        const header = document.querySelector('#makeOfferModal .modal-header h3');
        if (header) header.textContent = `Make an Offer — ${this.offerState.listingTitle}`;

        const messageInput = document.getElementById('offerMessage');
        if (messageInput) messageInput.value = '';
        const searchInput = document.getElementById('offerItemSearch');
        if (searchInput) searchInput.value = '';
        const results = document.getElementById('offerSearchResults');
        if (results) {
            results.innerHTML = '';
            results.classList.remove('active');
        }

        this.renderOfferItems();
        document.getElementById('makeOfferModal')?.classList.add('active');
        searchInput?.focus();
    }

    closeOfferModal() {
        document.getElementById('makeOfferModal')?.classList.remove('active');
        this.offerState.submitting = false;
    }

    setupOfferModal() {
        const modal = document.getElementById('makeOfferModal');
        if (!modal) return;

        document.getElementById('closeMakeOfferModal')?.addEventListener('click', () => this.closeOfferModal());
        document.getElementById('cancelOfferBtn')?.addEventListener('click', () => this.closeOfferModal());
        document.getElementById('submitOfferBtn')?.addEventListener('click', () => this.submitOffer());

        // Click outside content closes
        modal.addEventListener('click', (e) => {
            if (e.target === modal) this.closeOfferModal();
        });

        // Item search
        const searchInput = document.getElementById('offerItemSearch');
        const results = document.getElementById('offerSearchResults');
        if (searchInput && results) {
            searchInput.addEventListener('input', (e) => {
                const query = e.target.value.trim().toLowerCase();
                clearTimeout(this.offerSearchTimeout);
                if (query.length < 2) {
                    results.classList.remove('active');
                    results.innerHTML = '';
                    return;
                }
                this.offerSearchTimeout = setTimeout(() => {
                    this.performOfferItemSearch(query, results, searchInput);
                }, 200);
            });
            document.addEventListener('click', (e) => {
                if (!searchInput.contains(e.target) && !results.contains(e.target)) {
                    results.classList.remove('active');
                }
            });
        }

        document.getElementById('offerAddCustomBtn')?.addEventListener('click', () => this.openCustomItemForOffer());
    }

    performOfferItemSearch(query, resultsEl, inputEl) {
        const matches = (this.allItems || [])
            .filter(item => item.name.toLowerCase().includes(query))
            .slice(0, 20);

        if (matches.length === 0) {
            resultsEl.innerHTML = '<div class="search-result-empty">No items found</div>';
            resultsEl.classList.add('active');
            return;
        }

        resultsEl.innerHTML = '';
        matches.forEach(item => {
            const el = document.createElement('div');
            el.className = 'search-result';
            el.innerHTML = `
                ${window.ItemCard.itemVisualHTML(item.img, item.svg, item.name)}
                <div>
                    <div class="search-result-name">${this.esc(item.name)}</div>
                    <div class="search-result-category">${this.esc(item.category || '')}</div>
                </div>
            `;
            el.addEventListener('click', () => {
                this.addOfferItem(item);
                resultsEl.classList.remove('active');
                inputEl.value = '';
            });
            resultsEl.appendChild(el);
        });
        resultsEl.classList.add('active');
    }

    addOfferItem(item) {
        if (this.offerState.offeredItems.some(i => i.type === 'game-item' && i.item_name === item.name)) {
            this.showToast('Item already added', 'info');
            return;
        }
        this.offerState.offeredItems.push({
            type: 'game-item',
            item_name: item.name,
            item_image: item.img || null,
            category: item.category
        });
        this.renderOfferItems();
    }

    addOfferCustomItem(item) {
        this.offerState.offeredItems.push(item);
        this.renderOfferItems();
    }

    removeOfferItem(index) {
        this.offerState.offeredItems.splice(index, 1);
        this.renderOfferItems();
    }

    renderOfferItems() {
        const container = document.getElementById('offerSelectedItems');
        if (!container) return;
        const items = this.offerState.offeredItems;

        if (items.length === 0) {
            container.innerHTML = `
                <div class="empty-items">
                    <span>No items added yet — search above or add a custom item.</span>
                </div>
            `;
            return;
        }

        container.innerHTML = '';
        items.forEach((item, index) => {
            const el = document.createElement('div');
            el.className = 'selected-item';

            if (item.type === 'robux') {
                el.innerHTML = `
                    <span class="selected-item-robux">R$ ${Number(item.amount) || 0}</span>
                    <button class="selected-item-remove" type="button" title="Remove">&times;</button>
                `;
            } else if (item.type === 'other-game') {
                el.innerHTML = `
                    <span class="selected-item-other">${this.esc(item.game_name)}: ${this.esc(item.item_name)}</span>
                    <button class="selected-item-remove" type="button" title="Remove">&times;</button>
                `;
            } else {
                el.innerHTML = `
                    ${window.ItemCard.itemVisualHTML(item.item_image, this.svgFor(item.item_name), item.item_name)}
                    <span class="selected-item-name">${this.esc(item.item_name)}</span>
                    <button class="selected-item-remove" type="button" title="Remove">&times;</button>
                `;
            }

            el.querySelector('.selected-item-remove')?.addEventListener('click', () => this.removeOfferItem(index));
            container.appendChild(el);
        });
    }

    openCustomItemForOffer() {
        // Re-use the shared custom item modal; the '__offer__' sentinel routes
        // the result into the offer state (see addCustomItem). openCustomModal
        // also resets the type toggle and clears stale field values.
        this.openCustomModal('__offer__');
    }

    async submitOffer() {
        if (this.offerState.submitting) return;
        if (this.offerState.offeredItems.length === 0) {
            this.showToast('Add at least one item to your offer', 'warning');
            return;
        }
        const token = localStorage.getItem('auth_token');
        if (!token) {
            this.showToast('Please log in to make an offer', 'warning');
            return;
        }

        this.offerState.submitting = true;
        const submitBtn = document.getElementById('submitOfferBtn');
        const originalText = submitBtn?.textContent;
        if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.textContent = 'Sending...';
        }

        try {
            const message = document.getElementById('offerMessage')?.value?.trim() || null;
            const response = await fetch(`${this.apiBase}/offers`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    listing_id: this.offerState.listingId,
                    offered_items: this.offerState.offeredItems,
                    message
                })
            });

            if (!response.ok) {
                const error = await response.json().catch(() => ({}));
                throw new Error(error.error || `Failed to send offer (${response.status})`);
            }

            this.showToast('Offer sent!', 'success');
            this.closeOfferModal();
        } catch (error) {
            console.error('Submit offer failed:', error);
            this.showToast(error.message || 'Failed to send offer', 'error');
        } finally {
            this.offerState.submitting = false;
            if (submitBtn) {
                submitBtn.disabled = false;
                if (originalText) submitBtn.textContent = originalText;
            }
        }
    }

    // ==================== CUSTOM ITEMS ====================

    openCustomModal(itemsKey) {
        this.currentCustomItemsKey = itemsKey;
        const modal = document.getElementById('customItemModal');
        if (modal) {
            modal.classList.add('active');
            this.selectCustomType('robux');
            document.getElementById('robuxAmount').value = '';
            document.getElementById('gameName').value = '';
            document.getElementById('itemName').value = '';
        }
    }

    closeCustomModal() {
        document.getElementById('customItemModal')?.classList.remove('active');
    }

    selectCustomType(type) {
        this.currentCustomType = type;
        document.querySelectorAll('.type-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.type === type);
        });

        const robuxGroup = document.getElementById('robuxInputGroup');
        const otherGameGroup = document.getElementById('otherGameInputGroup');
        const otherItemGroup = document.getElementById('otherItemInputGroup');

        if (type === 'robux') {
            robuxGroup?.classList.remove('hidden');
            otherGameGroup?.classList.add('hidden');
            otherItemGroup?.classList.add('hidden');
        } else {
            robuxGroup?.classList.add('hidden');
            otherGameGroup?.classList.remove('hidden');
            otherItemGroup?.classList.remove('hidden');
        }
    }

    addCustomItem() {
        if (!this.currentCustomItemsKey) return;

        let newItem;

        if (this.currentCustomType === 'robux') {
            const amount = parseInt(document.getElementById('robuxAmount').value);
            if (!amount || amount <= 0) {
                this.showToast('Please enter a valid amount', 'error');
                return;
            }
            newItem = { type: 'robux', amount };
        } else {
            const gameName = document.getElementById('gameName').value.trim();
            const itemName = document.getElementById('itemName').value.trim();
            if (!gameName || !itemName) {
                this.showToast('Please fill in all fields', 'error');
                return;
            }
            newItem = { type: 'other-game', game_name: gameName, item_name: itemName };
        }

        if (this.currentCustomItemsKey === '__offer__') {
            this.addOfferCustomItem(newItem);
            this.closeCustomModal();
            return;
        }

        // Otherwise the key is a board side ('your' | 'their') on the Create panel.
        if (this.currentCustomItemsKey === 'your' || this.currentCustomItemsKey === 'their') {
            this.addCalcCustomItem(this.currentCustomItemsKey, newItem);
        }
        this.closeCustomModal();
    }

    // ==================== THEME ====================

    // Roles that unlock card themes. Everyone else gets 'default' only.
    static THEME_ROLES = ['donator', 'vip', 'moderator', 'mod', 'admin'];

    // Does the signed-in user have a role that unlocks card themes?
    canUseThemes() {
        const raw = this.currentUser?.role ?? this.currentUser?.roles;
        if (!raw) return false;
        let roles = raw;
        if (typeof roles === 'string') {
            try { roles = JSON.parse(roles); } catch { roles = [roles]; }
        }
        if (!Array.isArray(roles)) return false;
        return roles.some(r => TradingHub.THEME_ROLES.includes(String(r).toLowerCase()));
    }

    // Lock the non-default theme buttons for users without a donator role, and
    // show the "donator perk" hint. Called whenever auth state may have changed.
    applyThemeLock() {
        const unlocked = this.canUseThemes();
        document.querySelectorAll('#themeSelector .theme-btn').forEach(btn => {
            const locked = !unlocked && btn.dataset.theme !== 'default';
            btn.classList.toggle('locked', locked);
            btn.setAttribute('aria-disabled', locked ? 'true' : 'false');
        });
        const hint = document.getElementById('themeLockHint');
        if (hint) hint.hidden = unlocked;

        // If a locked user somehow had a non-default theme selected, reset it.
        if (!unlocked && this.createMeta.theme && this.createMeta.theme !== 'default') {
            this.selectTheme('default');
        }
    }

    selectTheme(theme) {
        // Gate non-default themes behind a donator role.
        if (theme !== 'default' && !this.canUseThemes()) {
            this.showToast('Card themes are a donator perk — unlock them by supporting the wiki.', 'warning');
            return;
        }
        this.createMeta.theme = theme;
        document.querySelectorAll('.theme-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.theme === theme);
        });
    }

    // ==================== CREATE LISTING ====================

    // Convert a board side's entries into the listing item shape the API expects.
    // Catalog items become game-items; custom entries unwrap back to robux/other-game.
    // Quantity is preserved (only emitted when > 1 to keep stored data tidy).
    calcToListingItems(side) {
        return this.calcState[side].map(({ item, qty }) => {
            const base = item.__custom
                ? { ...item.__custom }
                : { type: 'game-item', item_name: item.name, item_image: item.img || null, category: item.category };
            if (qty && qty > 1) base.qty = qty;
            return base;
        });
    }

    async createListing() {
        if (!this.currentUser) {
            this.showToast('Please login to create a trade', 'warning');
            return;
        }

        const offeringItems = this.calcToListingItems('your');
        const seekingItems = this.calcToListingItems('their');

        if (offeringItems.length === 0) {
            this.showToast('Add at least one item to "You Give"', 'error');
            return;
        }

        const btn = document.getElementById('createListingBtn');
        const originalHTML = btn.innerHTML;
        btn.disabled = true;
        btn.innerHTML = '<span>Publishing...</span>';

        try {
            const token = localStorage.getItem('auth_token');
            if (!token) throw new Error('Not authenticated');

            const response = await fetch(`${this.apiBase}/listings`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    title: this.generateAutoTitle(offeringItems, seekingItems),
                    description: this.createMeta.description || null,
                    theme: this.createMeta.theme || 'default',
                    offering_items: offeringItems,
                    seeking_items: seekingItems.length > 0 ? seekingItems : null
                })
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.error || 'Failed to create listing');
            }

            this.showToast('Trade published successfully!', 'success');

            // Clear the board (skip the reset confirm) and refresh the feed.
            this.calcState = { your: [], their: [] };
            this.createMeta = { description: '', theme: 'default' };
            const desc = document.getElementById('tradeDescription');
            if (desc) desc.value = '';
            const counter = document.getElementById('charCount');
            if (counter) counter.textContent = '0';
            document.querySelectorAll('.theme-btn').forEach(b => b.classList.toggle('active', b.dataset.theme === 'default'));

            this.switchTab('browse');
            await this.loadTrades();
            this.renderTrades();
        } catch (error) {
            console.error('Error creating listing:', error);
            this.showToast(error.message || 'Failed to create trade', 'error');
        } finally {
            btn.disabled = false;
            btn.innerHTML = originalHTML;
        }
    }

    // Build a readable title from the (listing-shape) item arrays.
    generateAutoTitle(offeringItems, seekingItems) {
        const label = (i) => i.type === 'robux' ? `${i.amount} R$`
            : i.type === 'other-game' ? `${i.game_name} ${i.item_name}`
            : i.item_name;

        if (offeringItems.length === 0) return 'Trade Offer';

        let offerText = label(offeringItems[0]);
        if (offeringItems.length > 1) offerText += ` + ${offeringItems.length - 1} more`;

        if (!seekingItems || seekingItems.length === 0) return `Trading ${offerText}`;

        let seekText = label(seekingItems[0]);
        if (seekingItems.length > 1) seekText += ` + ${seekingItems.length - 1} more`;

        return `Trading ${offerText} for ${seekText}`;
    }

    // ==================== MESSAGES ====================

    openMessagesModal() {
        document.getElementById('messagesModal')?.classList.add('active');
        this.loadConversations();
        this.startMessagesPolling();
    }

    closeMessagesModal() {
        document.getElementById('messagesModal')?.classList.remove('active');
        this.stopMessagesPolling();
    }

    // While the messages modal is open, poll for new messages so replies show
    // up without reopening the modal.
    startMessagesPolling() {
        this.stopMessagesPolling();
        this.msgPollTimer = setInterval(() => {
            if (document.visibilityState !== 'visible') return;
            this.loadConversations();
            if (this.activeThread) this.loadThread({ silent: true });
        }, TradingHub.MESSAGES_POLL_MS);
    }

    stopMessagesPolling() {
        if (this.msgPollTimer) {
            clearInterval(this.msgPollTimer);
            this.msgPollTimer = null;
        }
    }

    async loadConversations() {
        const list = document.getElementById('conversationsList');
        if (!list) return;
        try {
            const response = await fetch(`${this.apiBase}/messages/conversations`, { headers: this.authHeaders(), cache: 'no-store' });
            if (!response.ok) throw new Error('Failed to load conversations');
            const data = await response.json();
            this.conversations = data.conversations || [];
            // Skip the re-render when nothing changed so background polls don't
            // rebuild the list under the user's cursor.
            const fp = JSON.stringify(this.conversations.map(c =>
                [c.other_user?.user_id, c.listing_id, c.last_message_at, c.unread_count]
            ));
            if (fp !== this._convFingerprint) {
                this._convFingerprint = fp;
                this.renderConversations();
            }
        } catch (error) {
            console.error('Failed to load conversations:', error);
            list.innerHTML = this.emptyState('Could not load messages', 'Please try again later.');
        }
    }

    renderConversations() {
        const list = document.getElementById('conversationsList');
        if (!list) return;

        if (this.conversations.length === 0) {
            list.innerHTML = `<div class="conversations-empty">No conversations yet.<br>Message a trader from an offer to start.</div>`;
            return;
        }

        list.innerHTML = '';
        this.conversations.forEach(conv => {
            const el = document.createElement('button');
            el.className = 'conversation-item';
            const name = conv.other_user?.username || 'Unknown';
            const unread = conv.unread_count > 0 ? `<span class="conv-unread">${conv.unread_count}</span>` : '';
            el.innerHTML = `
                <img class="conv-avatar" src="${conv.other_user?.avatar_url || './imgs/placeholder.png'}" alt="${this.esc(name)}" onerror="this.src='./imgs/placeholder.png'">
                <div class="conv-info">
                    <div class="conv-name">${this.esc(name)} ${unread}</div>
                    <div class="conv-sub">${this.esc(conv.listing_title || 'Direct message')}</div>
                </div>
                <div class="conv-time">${this.getTimeAgo(conv.last_message_at)}</div>
            `;
            el.addEventListener('click', () => {
                this.activeThread = {
                    userId: String(conv.other_user?.user_id),
                    name,
                    listingId: conv.listing_id || null,
                    offerId: conv.offer_id || null
                };
                this.loadThread();
            });
            list.appendChild(el);
        });
    }

    openThreadWith(userId, name, listingId, offerId) {
        this.openMessagesModal();
        this.activeThread = {
            userId: String(userId),
            name: name || 'Trader',
            listingId: listingId || null,
            offerId: offerId || null
        };
        this.loadThread();
    }

    // Load (or silently re-poll) the active thread. `silent` skips the loading
    // placeholder and only re-renders when new messages arrived, so the poll
    // doesn't flicker the view or jump the scroll position.
    async loadThread({ silent = false } = {}) {
        if (!this.activeThread) return;
        const empty = document.getElementById('threadEmpty');
        const active = document.getElementById('threadActive');
        const header = document.getElementById('threadHeader');
        const messagesEl = document.getElementById('threadMessages');
        if (!active || !messagesEl) return;

        if (empty) empty.style.display = 'none';
        active.style.display = '';
        if (header) header.textContent = this.activeThread.name;
        if (!silent) messagesEl.innerHTML = '<div class="thread-loading">Loading…</div>';

        try {
            const params = new URLSearchParams({ with_user_id: this.activeThread.userId });
            if (this.activeThread.listingId) params.set('listing_id', this.activeThread.listingId);
            const response = await fetch(`${this.apiBase}/messages?${params}`, { headers: this.authHeaders(), cache: 'no-store' });
            if (!response.ok) throw new Error('Failed to load messages');
            const data = await response.json();
            const messages = data.messages || [];

            const last = messages[messages.length - 1];
            const fp = `${this.activeThread.userId}:${this.activeThread.listingId}:${messages.length}:${last?.id ?? 0}`;
            if (silent && fp === this._threadFingerprint) return;
            this._threadFingerprint = fp;

            this.renderThread(messages);
            // Server marks incoming messages read on fetch — refresh unread badges.
            this.refreshBadges();
        } catch (error) {
            console.error('Failed to load thread:', error);
            if (!silent) messagesEl.innerHTML = '<div class="thread-loading">Could not load messages.</div>';
        }
    }

    renderThread(messages) {
        const messagesEl = document.getElementById('threadMessages');
        if (!messagesEl) return;
        const me = String(this.currentUser?.userId);

        if (messages.length === 0) {
            messagesEl.innerHTML = '<div class="thread-loading">No messages yet. Say hello!</div>';
            return;
        }

        messagesEl.innerHTML = '';
        messages.forEach(msg => {
            const mine = String(msg.from_user_id) === me;
            const bubble = document.createElement('div');
            bubble.className = `msg-bubble ${mine ? 'mine' : 'theirs'}`;
            bubble.innerHTML = `
                <div class="msg-text">${this.esc(msg.message)}</div>
                <div class="msg-time">${this.getTimeAgo(msg.created_at)}</div>
            `;
            messagesEl.appendChild(bubble);
        });
        messagesEl.scrollTop = messagesEl.scrollHeight;
    }

    async sendThreadMessage() {
        if (!this.activeThread) return;
        const input = document.getElementById('threadInput');
        const text = input?.value.trim();
        if (!text) return;

        const sendBtn = document.getElementById('threadSendBtn');
        if (sendBtn) sendBtn.disabled = true;

        try {
            const response = await fetch(`${this.apiBase}/messages`, {
                method: 'POST',
                headers: this.authHeaders({ 'Content-Type': 'application/json' }),
                body: JSON.stringify({
                    to_user_id: this.activeThread.userId,
                    message: text,
                    listing_id: this.activeThread.listingId,
                    offer_id: this.activeThread.offerId
                })
            });
            if (!response.ok) {
                const err = await response.json().catch(() => ({}));
                throw new Error(err.error || `Failed to send (${response.status})`);
            }
            if (input) input.value = '';
            await this.loadThread();
        } catch (error) {
            console.error('Failed to send message:', error);
            this.showToast(error.message || 'Failed to send message', 'error');
        } finally {
            if (sendBtn) sendBtn.disabled = false;
        }
    }

    // ==================== NOTIFICATIONS ====================

    async loadNotifications() {
        try {
            const response = await fetch(`${this.apiBase}/notifications?limit=30`, { headers: this.authHeaders() });
            if (!response.ok) return;
            const data = await response.json();
            this.notifications = data.notifications || [];
            this.renderNotifications();
        } catch (error) {
            console.error('Failed to load notifications:', error);
        }
    }

    renderNotifications() {
        const list = document.getElementById('notifList');
        if (!list) return;

        if (this.notifications.length === 0) {
            list.innerHTML = `<div class="notif-empty">You're all caught up.</div>`;
            return;
        }

        list.innerHTML = '';
        this.notifications.forEach(notif => {
            const el = document.createElement('div');
            el.className = `notif-item${notif.read ? '' : ' unread'}`;
            el.innerHTML = `
                <div class="notif-item-body">
                    <div class="notif-item-title">${this.esc(notif.title)}</div>
                    <div class="notif-item-msg">${this.esc(notif.message)}</div>
                    <div class="notif-item-time">${this.getTimeAgo(notif.created_at)}</div>
                </div>
                <button class="notif-item-del" title="Dismiss" aria-label="Dismiss">&times;</button>
            `;
            el.querySelector('.notif-item-body').addEventListener('click', () => this.onNotificationClick(notif));
            el.querySelector('.notif-item-del').addEventListener('click', (e) => {
                e.stopPropagation();
                this.deleteNotification(notif.id);
            });
            list.appendChild(el);
        });
    }

    async onNotificationClick(notif) {
        if (!notif.read) await this.markNotificationRead(notif.id);
        this.closeNotifDropdown();

        // Route by notification type rather than navigating to non-page routes.
        if (notif.type === 'new_message') {
            this.openMessagesModal();
        } else if (['new_offer', 'offer_accepted', 'offer_rejected'].includes(notif.type)) {
            this.switchTab('my-trades');
        } else if (notif.type === 'review_received' && notif.link) {
            window.location.href = notif.link;
        }
    }

    async markNotificationRead(id) {
        try {
            await fetch(`${this.apiBase}/notifications/${id}/read`, {
                method: 'POST',
                headers: this.authHeaders({ 'Content-Type': 'application/json' })
            });
            const n = this.notifications.find(x => x.id === id);
            if (n) n.read = 1;
            this.renderNotifications();
            this.refreshBadges();
        } catch (error) {
            console.error('Failed to mark notification read:', error);
        }
    }

    async markAllNotificationsRead() {
        try {
            await fetch(`${this.apiBase}/notifications/read-all`, {
                method: 'POST',
                headers: this.authHeaders({ 'Content-Type': 'application/json' })
            });
            this.notifications.forEach(n => { n.read = 1; });
            this.renderNotifications();
            this.refreshBadges();
        } catch (error) {
            console.error('Failed to mark all read:', error);
        }
    }

    async deleteNotification(id) {
        try {
            await fetch(`${this.apiBase}/notifications/${id}`, {
                method: 'DELETE',
                headers: this.authHeaders({ 'Content-Type': 'application/json' })
            });
            this.notifications = this.notifications.filter(n => n.id !== id);
            this.renderNotifications();
            this.refreshBadges();
        } catch (error) {
            console.error('Failed to delete notification:', error);
        }
    }

    toggleNotifDropdown() {
        const dropdown = document.getElementById('notifDropdown');
        if (!dropdown) return;
        const isOpen = dropdown.classList.toggle('open');
        if (isOpen) {
            this.positionNotifDropdown();
            this.loadNotifications();
        }
    }

    // Anchor the position:fixed dropdown just below the bell, right-aligned.
    // We portal it to <body> because the tab bar both scrolls (overflow) and
    // uses backdrop-filter (which makes it a containing block for fixed
    // descendants), either of which would otherwise clip the panel out of view.
    positionNotifDropdown() {
        const dropdown = document.getElementById('notifDropdown');
        const bell = document.getElementById('notifBellBtn');
        if (!dropdown || !bell) return;
        if (dropdown.parentElement !== document.body) document.body.appendChild(dropdown);
        const r = bell.getBoundingClientRect();
        dropdown.style.top = `${r.bottom + 8}px`;
        dropdown.style.right = `${Math.max(8, window.innerWidth - r.right)}px`;
        dropdown.style.left = 'auto';
    }

    closeNotifDropdown() {
        document.getElementById('notifDropdown')?.classList.remove('open');
    }

    async refreshBadges() {
        if (!this.currentUser) return;
        try {
            const [notifRes, msgRes] = await Promise.all([
                fetch(`${this.apiBase}/notifications/unread-count`, { headers: this.authHeaders() }),
                fetch(`${this.apiBase}/messages/unread`, { headers: this.authHeaders() })
            ]);

            if (notifRes.ok) {
                const { unread_count } = await notifRes.json();
                this.setBadge('notifCount', unread_count);
                this.maybeOsNotify('notif', unread_count);
            }
            if (msgRes.ok) {
                const { unread_count } = await msgRes.json();
                this.setBadge('messagesBadge', unread_count);
                this.maybeOsNotify('msg', unread_count);
            }
        } catch (error) {
            console.error('Failed to refresh badges:', error);
        }
    }

    // ---- Desktop / mobile (OS) notifications ----
    // Foreground Web Notifications: fired when an unread count grows while the
    // tab is backgrounded. (True push while the site is closed would need a
    // service worker + Push API + VAPID backend — out of scope here.)

    // Ask for OS-notification permission. Must be called from a user gesture.
    // Silent if unsupported, already decided, or the user opted out.
    requestNotificationPermission() {
        if (!('Notification' in window)) return;
        if (localStorage.getItem('trade_os_notifs') === 'off') return;
        if (Notification.permission === 'default') {
            Notification.requestPermission().then(perm => {
                if (perm === 'granted') this.showToast('Desktop notifications enabled', 'success');
            }).catch(() => {});
        }
    }

    // Fire an OS notification when a count increased since the last poll.
    maybeOsNotify(kind, count) {
        const prev = this._lastUnread[kind];
        this._lastUnread[kind] = count;
        if (prev === null || count <= prev) return;              // first poll or not an increase
        if (localStorage.getItem('trade_os_notifs') === 'off') return;
        if (!('Notification' in window) || Notification.permission !== 'granted') return;
        // Don't nag while they're actively looking at the page.
        if (document.visibilityState === 'visible' && document.hasFocus()) return;

        const delta = count - prev;
        const cfg = kind === 'msg'
            ? { title: 'New trade message', body: delta > 1 ? `You have ${count} unread messages` : 'You have a new message on Trading Hub', open: () => this.openMessagesModal() }
            : { title: 'New trade notification', body: delta > 1 ? `You have ${count} new notifications` : 'You have a new trade notification', open: () => this.toggleNotifDropdown() };

        try {
            const n = new Notification(cfg.title, {
                body: cfg.body,
                icon: '/imgs/favicon.png',
                badge: '/imgs/favicon.png',
                tag: `emwiki-trade-${kind}`,   // collapse repeats into one
                renotify: true
            });
            n.onclick = () => { window.focus(); n.close(); cfg.open?.(); };
        } catch (e) { /* Notification constructor can throw on some mobile browsers */ }
    }

    setBadge(elementId, count) {
        const el = document.getElementById(elementId);
        if (!el) return;
        if (count > 0) {
            el.textContent = count > 99 ? '99+' : count;
            el.style.display = '';
        } else {
            el.style.display = 'none';
        }
    }

    startNotificationPolling() {
        if (this.notifPollTimer) clearInterval(this.notifPollTimer);
        this.notifPollTimer = setInterval(() => this.refreshBadges(), 60000);
    }

    // ==================== REVIEWS ====================

    openReviewModal(tradeId, otherName) {
        this.reviewState = { tradeId, rating: 0 };
        const subtitle = document.getElementById('reviewSubtitle');
        if (subtitle) subtitle.textContent = `How was your trade with ${otherName}?`;
        const comment = document.getElementById('reviewComment');
        if (comment) comment.value = '';
        this.setReviewRating(0);
        document.getElementById('reviewModal')?.classList.add('active');
    }

    closeReviewModal() {
        document.getElementById('reviewModal')?.classList.remove('active');
    }

    setReviewRating(rating) {
        this.reviewState.rating = rating;
        document.querySelectorAll('#starInput .star-btn').forEach(btn => {
            btn.classList.toggle('active', parseInt(btn.dataset.value) <= rating);
        });
    }

    async submitReview() {
        if (!this.reviewState.tradeId) return;
        if (this.reviewState.rating < 1) {
            this.showToast('Please select a star rating', 'warning');
            return;
        }

        const submitBtn = document.getElementById('submitReviewBtn');
        if (submitBtn) submitBtn.disabled = true;

        try {
            const comment = document.getElementById('reviewComment')?.value.trim() || null;
            const response = await fetch(`${this.apiBase}/reviews`, {
                method: 'POST',
                headers: this.authHeaders({ 'Content-Type': 'application/json' }),
                body: JSON.stringify({
                    trade_id: this.reviewState.tradeId,
                    rating: this.reviewState.rating,
                    comment
                })
            });
            if (!response.ok) {
                const err = await response.json().catch(() => ({}));
                throw new Error(err.error || `Failed to submit review (${response.status})`);
            }
            this.showToast('Review submitted — thanks!', 'success');
            this.closeReviewModal();
            await this.loadCompletedTrades();
            if (this.activeMyTab === 'history') this.renderMyTrades();
        } catch (error) {
            console.error('Failed to submit review:', error);
            this.showToast(error.message || 'Failed to submit review', 'error');
        } finally {
            if (submitBtn) submitBtn.disabled = false;
        }
    }

    async loadTraderReviews(userId) {
        const container = document.getElementById('detailReviews');
        if (!container || !userId) return;
        try {
            const response = await fetch(`${this.apiBase}/reviews?user_id=${encodeURIComponent(userId)}`);
            if (!response.ok) return;
            const data = await response.json();
            const reviews = data.reviews || [];
            if (reviews.length === 0) {
                container.innerHTML = `<div class="detail-reviews-label">Reviews</div><div class="no-reviews">No reviews yet.</div>`;
                return;
            }
            const items = reviews.slice(0, 5).map(r => `
                <div class="review-item">
                    <div class="review-item-head">
                        <span class="review-author">${this.esc(r.reviewer_username || 'Trader')}</span>
                        <span class="review-stars">${'★'.repeat(Math.max(0, Math.min(5, r.rating)))}${'☆'.repeat(5 - Math.max(0, Math.min(5, r.rating)))}</span>
                    </div>
                    ${r.comment ? `<div class="review-comment">${this.esc(r.comment)}</div>` : ''}
                </div>
            `).join('');
            container.innerHTML = `<div class="detail-reviews-label">Reviews</div>${items}`;
        } catch (error) {
            console.error('Failed to load reviews:', error);
        }
    }

    // ==================== UTILITIES ====================

    getTimeAgo(timestamp) {
        const seconds = Math.floor((Date.now() - timestamp) / 1000);
        if (seconds < 60) return 'Just now';
        const minutes = Math.floor(seconds / 60);
        if (minutes < 60) return `${minutes}m ago`;
        const hours = Math.floor(minutes / 60);
        if (hours < 24) return `${hours}h ago`;
        const days = Math.floor(hours / 24);
        if (days < 7) return `${days}d ago`;
        const weeks = Math.floor(days / 7);
        if (weeks < 4) return `${weeks}w ago`;
        const months = Math.floor(days / 30);
        if (months < 12) return `${months}mo ago`;
        const years = Math.floor(days / 365);
        return `${years}y ago`;
    }

    esc(text) {
        return window.Utils.escapeHtml(text);
    }

    showToast(message, type = 'info') {
        if (window.Utils && window.Utils.showToast) {
            window.Utils.showToast('Trading', message, type);
        } else {
            alert(message);
        }
    }
}

// Initialize
let tradingHub;
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        tradingHub = new TradingHub();
        window.tradingHub = tradingHub;
    });
} else {
    tradingHub = new TradingHub();
    window.tradingHub = tradingHub;
}
