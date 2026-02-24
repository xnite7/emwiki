// Trading Hub - Redesigned
class TradingHub {
    constructor() {
        this.trades = [];
        this.myTrades = [];
        this.allItems = [];
        this.filters = {
            category: 'all',
            status: 'active',
            sort: 'recent',
            search: ''
        };
        this.apiBase = 'https://emwiki.com/api/trades';
        this.itemsApiBase = 'https://emwiki.com/api/items';
        this.currentUser = null;
        this.categories = ['gears', 'deaths', 'pets', 'effects', 'titles'];

        // Wizard state
        this.wizardState = {
            currentStep: 1,
            seekingItems: [],
            offeringItems: [],
            description: '',
            category: '',
            theme: 'default'
        };

        // UI state
        this.activeTab = 'browse';
        this.activeMyTab = 'listings';
        this.searchTimeouts = {};
        this.currentCustomItemsKey = null;
        this.currentCustomType = 'robux';

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
        await Promise.all([
            this.loadItems(),
            this.loadTrades()
        ]);
        this.renderTrades();
        this.updateStats();
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
                    const url = new URL(this.itemsApiBase);
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
        } catch (error) {
            console.error('Failed to load items:', error);
        }
    }

    async loadTrades() {
        try {
            const params = new URLSearchParams({
                status: this.filters.status,
                ...(this.filters.category !== 'all' && { category: this.filters.category }),
                ...(this.filters.search && { search: this.filters.search })
            });

            const response = await fetch(`${this.apiBase}/listings?${params}`);
            if (!response.ok) throw new Error('Failed to load trades');

            const data = await response.json();
            this.trades = (data.listings || []).map(listing => ({
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
            }));
        } catch (error) {
            console.error('Error loading trades:', error);
            this.showToast('Failed to load trades', 'error');
        }
    }

    async loadMyTrades() {
        if (!this.currentUser) return;
        try {
            const token = localStorage.getItem('auth_token');
            if (!token) return;

            const response = await fetch(`${this.apiBase}/listings?user_id=${this.currentUser.userId}`, {
                headers: { 'Authorization': `Bearer ${token}` }
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

            const badge = document.getElementById('myTradesBadge');
            if (badge) {
                const activeCount = this.myTrades.filter(t => t.status === 'active').length;
                if (activeCount > 0) {
                    badge.textContent = activeCount;
                    badge.style.display = '';
                } else {
                    badge.style.display = 'none';
                }
            }
        } catch (error) {
            console.error('Error loading my trades:', error);
        }
    }

    updateStats() {
        const activeTrades = this.trades.filter(t => t.status === 'active').length;
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
            btn.addEventListener('click', () => this.switchTab(btn.dataset.tab));
        });

        // Category pills
        document.querySelectorAll('.pill').forEach(pill => {
            pill.addEventListener('click', () => {
                document.querySelectorAll('.pill').forEach(p => p.classList.remove('active'));
                pill.classList.add('active');
                this.filters.category = pill.dataset.category;
                this.loadTrades().then(() => this.renderTrades());
            });
        });

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

        // Filters
        document.getElementById('filterStatus')?.addEventListener('change', (e) => {
            this.filters.status = e.target.value;
            this.loadTrades().then(() => this.renderTrades());
        });

        document.getElementById('filterSort')?.addEventListener('change', (e) => {
            this.filters.sort = e.target.value;
            this.renderTrades();
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

        // Wizard navigation
        document.getElementById('cancelWizardBtn')?.addEventListener('click', () => this.cancelWizard());
        document.getElementById('nextStep1Btn')?.addEventListener('click', () => this.nextStep());
        document.getElementById('backStep2Btn')?.addEventListener('click', () => this.previousStep());
        document.getElementById('nextStep2Btn')?.addEventListener('click', () => this.nextStep());
        document.getElementById('backStep3Btn')?.addEventListener('click', () => this.previousStep());
        document.getElementById('createListingBtn')?.addEventListener('click', () => this.createListing());

        // Item search
        this.setupItemSearch('offeringSearchInput', 'offeringSearchResults', 'offeringItemsContainer', 'offeringItems');
        this.setupItemSearch('seekingSearchInput', 'seekingSearchResults', 'seekingItemsContainer', 'seekingItems');

        // Custom item modal
        document.getElementById('addOfferingCustomBtn')?.addEventListener('click', () => this.openCustomModal('offeringItems'));
        document.getElementById('addSeekingCustomBtn')?.addEventListener('click', () => this.openCustomModal('seekingItems'));
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

        // Theme selector
        document.querySelectorAll('.theme-btn').forEach(btn => {
            btn.addEventListener('click', () => this.selectTheme(btn.dataset.theme));
        });

        // Description character count
        const descInput = document.getElementById('tradeDescription');
        if (descInput) {
            descInput.addEventListener('input', (e) => {
                this.wizardState.description = e.target.value;
                const counter = document.getElementById('charCount');
                if (counter) counter.textContent = e.target.value.length;
                this.updatePreview();
            });
        }

        // Category select
        document.getElementById('tradeCategory')?.addEventListener('change', (e) => {
            this.wizardState.category = e.target.value;
            this.updatePreview();
        });

        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                this.closeCustomModal();
                this.closeDetailModal();
            }
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
        } else if (tab === 'my-trades') {
            document.getElementById('panelMyTrades')?.classList.add('active');
            if (!this.currentUser) {
                this.showToast('Please login to view your trades', 'warning');
                this.switchTab('browse');
                return;
            }
            this.loadMyTrades().then(() => this.renderMyTrades());
        } else if (tab === 'create') {
            document.getElementById('panelCreate')?.classList.add('active');
            if (!this.currentUser) {
                this.showToast('Please login to create a trade', 'warning');
                this.switchTab('browse');
                return;
            }
            this.setStep(1);
            this.loadWizardState();
        }
    }

    // ==================== BROWSE RENDERING ====================

    renderTrades() {
        const feed = document.getElementById('tradesFeed');
        if (!feed) return;

        let filtered = [...this.trades];

        // Client-side filtering
        if (this.filters.category !== 'all') {
            filtered = filtered.filter(t => t.category === this.filters.category);
        }
        if (this.filters.status !== 'all') {
            filtered = filtered.filter(t => t.status === this.filters.status);
        }
        if (this.filters.search) {
            const q = this.filters.search.toLowerCase();
            filtered = filtered.filter(t =>
                t.title?.toLowerCase().includes(q) ||
                t.description?.toLowerCase().includes(q)
            );
        }

        // Sort
        if (this.filters.sort === 'recent') {
            filtered.sort((a, b) => b.created_at - a.created_at);
        } else if (this.filters.sort === 'views') {
            filtered.sort((a, b) => (b.views || 0) - (a.views || 0));
        }

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
            ${trade.description ? `<div class="trade-card-description">${this.esc(trade.description)}</div>` : ''}
            <div class="trade-exchange">
                <div class="trade-side offering">
                    <div class="trade-side-label">Offering</div>
                    <div class="trade-items-list">
                        ${trade.offering_items.map(i => this.renderTradeItem(i)).join('')}
                    </div>
                </div>
                <div class="trade-swap-icon">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m7 16 4 4 4-4"/><path d="M11 20V4"/><path d="m17 8-4-4-4 4"/><path d="M13 4v16"/></svg>
                </div>
                <div class="trade-side seeking">
                    <div class="trade-side-label">Looking For</div>
                    <div class="trade-items-list">
                        ${trade.seeking_items && trade.seeking_items.length > 0
                            ? trade.seeking_items.map(i => this.renderTradeItem(i)).join('')
                            : '<span class="trade-open-offers">Open to offers</span>'
                        }
                    </div>
                </div>
            </div>
            <div class="trade-card-actions">
                <button class="btn-view-trade" data-id="${trade.id}">View Details</button>
                ${this.currentUser && trade.user_id !== this.currentUser.userId
                    ? `<button class="btn-make-offer" data-id="${trade.id}">Make Offer</button>`
                    : ''
                }
            </div>
        `;

        // Event listeners
        card.querySelector('.btn-view-trade')?.addEventListener('click', () => this.viewTrade(trade.id));
        card.querySelector('.btn-make-offer')?.addEventListener('click', () => this.makeOffer(trade.id));

        return card;
    }

    renderTradeItem(item) {
        if (item.type === 'robux') {
            return `<div class="trade-item-robux">R$ ${item.amount}</div>`;
        } else if (item.type === 'other-game') {
            return `<div class="trade-item-other">${this.esc(item.game_name)}: ${this.esc(item.item_name)}</div>`;
        } else {
            return `
                <div class="trade-item">
                    <img class="trade-item-img" src="${item.item_image || './imgs/placeholder.png'}" alt="${this.esc(item.item_name)}" onerror="this.src='./imgs/placeholder.png'">
                    <span class="trade-item-name">${this.esc(item.item_name)}</span>
                </div>
            `;
        }
    }

    // ==================== MY TRADES ====================

    renderMyTrades() {
        const feed = document.getElementById('myTradesFeed');
        if (!feed) return;

        const trades = this.activeMyTab === 'listings' ? this.myTrades : [];

        if (trades.length === 0) {
            feed.innerHTML = `
                <div class="empty-state">
                    <div class="empty-icon">
                        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M16 16v3a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h3"/><rect x="10" y="3" width="11" height="11" rx="2"/><path d="m14 7 2 2-2 2"/></svg>
                    </div>
                    <h3>${this.activeMyTab === 'listings' ? 'No listings yet' : 'No offers yet'}</h3>
                    <p>${this.activeMyTab === 'listings' ? 'Create your first trade to get started!' : 'Make an offer on a trade to see it here.'}</p>
                </div>
            `;
            return;
        }

        feed.innerHTML = '';
        trades.forEach(trade => {
            feed.appendChild(this.createTradeCard(trade));
        });
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
                <img class="detail-avatar" src="${trade.user?.avatar_url || './imgs/placeholder.png'}" alt="${this.esc(trade.user?.username || 'Unknown')}" onerror="this.src='./imgs/placeholder.png'">
                <div>
                    <div class="detail-trader-name">${this.esc(trade.user?.username || 'Unknown')}</div>
                    <div class="detail-trader-stats">${stars} - ${trade.user?.total_trades || 0} trades</div>
                </div>
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
            </div>
            ${this.currentUser && trade.user_id !== this.currentUser.userId && trade.status === 'active' ? `
            <div class="detail-actions">
                <button class="btn-make-offer" style="flex:1" data-id="${trade.id}">Make Offer</button>
            </div>` : ''}
        `;

        body.querySelector('.btn-make-offer')?.addEventListener('click', () => {
            this.closeDetailModal();
            this.makeOffer(trade.id);
        });

        modal.classList.add('active');
    }

    renderDetailItem(item) {
        if (item.type === 'robux') {
            return `<div class="trade-item-robux">R$ ${item.amount}</div>`;
        } else if (item.type === 'other-game') {
            return `<div class="trade-item-other">${this.esc(item.game_name)}: ${this.esc(item.item_name)}</div>`;
        }
        return `
            <div class="detail-item">
                <img src="${item.item_image || './imgs/placeholder.png'}" alt="${this.esc(item.item_name)}" onerror="this.src='./imgs/placeholder.png'">
                <span>${this.esc(item.item_name)}</span>
            </div>
        `;
    }

    closeDetailModal() {
        document.getElementById('tradeDetailModal')?.classList.remove('active');
    }

    async makeOffer(id) {
        if (!this.currentUser) {
            this.showToast('Please login to make an offer', 'warning');
            return;
        }
        // For now, show a toast; full offer flow is a future enhancement
        this.showToast('Offer system coming soon!', 'info');
    }

    // ==================== WIZARD ====================

    setStep(step) {
        this.wizardState.currentStep = step;

        // Update progress indicators
        document.querySelectorAll('.progress-step').forEach(el => {
            const s = parseInt(el.dataset.step);
            el.classList.toggle('active', s === step);
            el.classList.toggle('completed', s < step);
        });

        // Progress bar
        const fill = document.getElementById('progressFill');
        if (fill) {
            fill.style.width = `${((step - 1) / 2) * 100}%`;
        }

        // Show/hide steps
        document.querySelectorAll('.wizard-step').forEach(el => {
            const s = parseInt(el.dataset.step);
            el.classList.toggle('active', s === step);
        });

        // Render items for the current step
        if (step === 1) {
            this.renderSelectedItems('offeringItems');
        } else if (step === 2) {
            this.renderSelectedItems('seekingItems');
        } else if (step === 3) {
            this.wizardState.description = document.getElementById('tradeDescription')?.value || '';
            this.wizardState.category = document.getElementById('tradeCategory')?.value || '';
            this.updatePreview();
        }
    }

    nextStep() {
        const current = this.wizardState.currentStep;
        if (current === 1) {
            if (this.wizardState.offeringItems.length === 0) {
                this.showToast('Please add at least one item to offer', 'error');
                return;
            }
            this.setStep(2);
        } else if (current === 2) {
            this.setStep(3);
        }
    }

    previousStep() {
        if (this.wizardState.currentStep > 1) {
            this.setStep(this.wizardState.currentStep - 1);
        }
    }

    cancelWizard() {
        if (this.wizardState.offeringItems.length > 0 || this.wizardState.seekingItems.length > 0) {
            if (!confirm('Are you sure you want to cancel? Your draft will be saved.')) return;
            this.saveWizardState();
        }
        this.resetWizard();
        this.switchTab('browse');
    }

    resetWizard() {
        this.wizardState = {
            currentStep: 1,
            seekingItems: [],
            offeringItems: [],
            description: '',
            category: '',
            theme: 'default'
        };
        // Reset form fields
        const desc = document.getElementById('tradeDescription');
        if (desc) desc.value = '';
        const cat = document.getElementById('tradeCategory');
        if (cat) cat.value = '';
        const counter = document.getElementById('charCount');
        if (counter) counter.textContent = '0';
        // Reset theme
        document.querySelectorAll('.theme-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.theme === 'default');
        });
    }

    saveWizardState() {
        localStorage.setItem('trading_wizard_draft', JSON.stringify(this.wizardState));
    }

    loadWizardState() {
        const saved = localStorage.getItem('trading_wizard_draft');
        if (saved) {
            try {
                const state = JSON.parse(saved);
                this.wizardState = { ...this.wizardState, ...state };

                if (this.wizardState.description) {
                    const desc = document.getElementById('tradeDescription');
                    if (desc) desc.value = this.wizardState.description;
                    const counter = document.getElementById('charCount');
                    if (counter) counter.textContent = this.wizardState.description.length;
                }
                if (this.wizardState.category) {
                    const cat = document.getElementById('tradeCategory');
                    if (cat) cat.value = this.wizardState.category;
                }
                if (this.wizardState.theme) {
                    this.selectTheme(this.wizardState.theme);
                }

                this.renderSelectedItems('offeringItems');
                this.renderSelectedItems('seekingItems');
            } catch (error) {
                console.error('Failed to load wizard state:', error);
            }
        }
    }

    // ==================== ITEM SEARCH ====================

    setupItemSearch(inputId, resultsId, containerId, itemsKey) {
        const input = document.getElementById(inputId);
        const results = document.getElementById(resultsId);
        if (!input || !results) return;

        let timeout;
        input.addEventListener('input', (e) => {
            const query = e.target.value.trim().toLowerCase();
            clearTimeout(timeout);
            if (!query) {
                results.classList.remove('active');
                results.innerHTML = '';
                return;
            }
            timeout = setTimeout(() => {
                this.performItemSearch(query, results, itemsKey, input);
            }, 200);
        });

        // Close on outside click
        document.addEventListener('click', (e) => {
            if (!input.contains(e.target) && !results.contains(e.target)) {
                results.classList.remove('active');
            }
        });
    }

    performItemSearch(query, resultsEl, itemsKey, inputEl) {
        const matches = this.allItems
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
                <img src="${item.img || './imgs/placeholder.png'}" alt="${this.esc(item.name)}" onerror="this.src='./imgs/placeholder.png'">
                <div>
                    <div class="search-result-name">${this.esc(item.name)}</div>
                    <div class="search-result-category">${item.category}</div>
                </div>
            `;
            el.addEventListener('click', () => {
                this.addItem(item, itemsKey);
                resultsEl.classList.remove('active');
                inputEl.value = '';
            });
            resultsEl.appendChild(el);
        });
        resultsEl.classList.add('active');
    }

    // ==================== ITEM MANAGEMENT ====================

    addItem(item, itemsKey) {
        const items = this.wizardState[itemsKey];
        if (items.some(i => i.type === 'game-item' && i.item_name === item.name)) {
            this.showToast('Item already added', 'info');
            return;
        }
        items.push({
            type: 'game-item',
            item_name: item.name,
            item_image: item.img || null,
            category: item.category
        });
        this.renderSelectedItems(itemsKey);
        this.updatePreview();
    }

    removeItem(itemsKey, index) {
        this.wizardState[itemsKey].splice(index, 1);
        this.renderSelectedItems(itemsKey);
        this.updatePreview();
    }

    renderSelectedItems(itemsKey) {
        const containerId = itemsKey === 'offeringItems' ? 'offeringItemsContainer' : 'seekingItemsContainer';
        const container = document.getElementById(containerId);
        if (!container) return;

        const items = this.wizardState[itemsKey];

        if (items.length === 0) {
            const label = itemsKey === 'seekingItems' ? 'No items added yet - leave empty for open offers' : 'No items added yet';
            container.innerHTML = `
                <div class="empty-items">
                    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>
                    <span>${label}</span>
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
                    <span class="selected-item-robux">R$ ${item.amount}</span>
                    <button class="selected-item-remove" title="Remove">&times;</button>
                `;
            } else if (item.type === 'other-game') {
                el.innerHTML = `
                    <span class="selected-item-other">${this.esc(item.game_name)}: ${this.esc(item.item_name)}</span>
                    <button class="selected-item-remove" title="Remove">&times;</button>
                `;
            } else {
                el.innerHTML = `
                    <img src="${item.item_image || './imgs/placeholder.png'}" alt="${this.esc(item.item_name)}" onerror="this.src='./imgs/placeholder.png'">
                    <span class="selected-item-name">${this.esc(item.item_name)}</span>
                    <button class="selected-item-remove" title="Remove">&times;</button>
                `;
            }

            el.querySelector('.selected-item-remove').addEventListener('click', () => {
                this.removeItem(itemsKey, index);
            });
            container.appendChild(el);
        });
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

        const items = this.wizardState[this.currentCustomItemsKey];
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

        items.push(newItem);
        this.renderSelectedItems(this.currentCustomItemsKey);
        this.updatePreview();
        this.closeCustomModal();
    }

    // ==================== THEME ====================

    selectTheme(theme) {
        this.wizardState.theme = theme;
        document.querySelectorAll('.theme-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.theme === theme);
        });
        this.updatePreview();
    }

    // ==================== PREVIEW ====================

    updatePreview() {
        const previewCard = document.getElementById('tradePreviewCard');
        if (!previewCard || this.wizardState.currentStep !== 3) return;

        const { description, offeringItems, seekingItems, theme } = this.wizardState;

        // Apply theme
        previewCard.className = `preview-card${theme && theme !== 'default' ? ' theme-' + theme : ''}`;

        previewCard.innerHTML = `
            <div class="trade-card-top" style="padding:0; margin-bottom:0.75rem">
                <div style="width:32px;height:32px;border-radius:50%;background:var(--bg-item-hover);border:2px solid var(--border-color)"></div>
                <div class="trader-info">
                    <div class="trader-name">${this.esc(this.currentUser?.displayName || this.currentUser?.username || 'You')}</div>
                    <div class="trader-meta"><span>Just now</span></div>
                </div>
                <span class="trade-status-badge active">Active</span>
            </div>
            ${description ? `<div class="trade-card-description" style="padding:0; margin-bottom:0.75rem">${this.esc(description)}</div>` : ''}
            <div class="trade-exchange" style="padding:0">
                <div class="trade-side offering">
                    <div class="trade-side-label">Offering</div>
                    <div class="trade-items-list">
                        ${offeringItems.map(i => this.renderTradeItem(i)).join('')}
                        ${offeringItems.length === 0 ? '<span class="trade-open-offers">No items</span>' : ''}
                    </div>
                </div>
                <div class="trade-swap-icon">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m7 16 4 4 4-4"/><path d="M11 20V4"/><path d="m17 8-4-4-4 4"/><path d="M13 4v16"/></svg>
                </div>
                <div class="trade-side seeking">
                    <div class="trade-side-label">Looking For</div>
                    <div class="trade-items-list">
                        ${seekingItems.map(i => this.renderTradeItem(i)).join('')}
                        ${seekingItems.length === 0 ? '<span class="trade-open-offers">Open to offers</span>' : ''}
                    </div>
                </div>
            </div>
        `;
    }

    // ==================== CREATE LISTING ====================

    async createListing() {
        if (!this.currentUser) {
            this.showToast('Please login to create a trade', 'warning');
            return;
        }

        if (this.wizardState.offeringItems.length === 0) {
            this.showToast('Please add at least one item to offer', 'error');
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
                    title: this.generateAutoTitle(),
                    description: this.wizardState.description || null,
                    category: this.wizardState.category || 'other',
                    offering_items: this.wizardState.offeringItems,
                    seeking_items: this.wizardState.seekingItems.length > 0 ? this.wizardState.seekingItems : null
                })
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.error || 'Failed to create listing');
            }

            this.showToast('Trade published successfully!', 'success');

            // Clean up
            localStorage.removeItem('trading_wizard_draft');
            this.resetWizard();

            // Go to browse and reload
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

    generateAutoTitle() {
        const { offeringItems, seekingItems } = this.wizardState;

        if (offeringItems.length === 0) return 'Trade Offer';

        const first = offeringItems[0];
        let offerText = first.type === 'robux' ? `${first.amount} R$`
            : first.type === 'other-game' ? `${first.game_name} ${first.item_name}`
            : first.item_name;

        if (offeringItems.length > 1) {
            offerText += ` + ${offeringItems.length - 1} more`;
        }

        if (seekingItems.length === 0) return `Trading ${offerText}`;

        const firstSeek = seekingItems[0];
        let seekText = firstSeek.type === 'robux' ? `${firstSeek.amount} R$`
            : firstSeek.type === 'other-game' ? `${firstSeek.game_name} ${firstSeek.item_name}`
            : firstSeek.item_name;

        if (seekingItems.length > 1) {
            seekText += ` + ${seekingItems.length - 1} more`;
        }

        return `Trading ${offerText} for ${seekText}`;
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
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
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
