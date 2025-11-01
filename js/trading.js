// Lightweight Trading Hub App
class TradingHub {
    constructor() {
        this.trades = [];
        this.filters = {
            category: 'all',
            status: 'active',
            sort: 'recent'
        };
        this.apiBase = 'https://emwiki.com/api/trades';
        this.allItems = [];
        this.categories = ['gears', 'deaths', 'pets', 'effects', 'titles'];
        //wait till the Auth object is available
        //wait 5 seconds

        window.Auth.addEventListener("sessionReady", () => {
            console.log("User loaded:", window.Auth.user);
            this.currentUser = window.Auth.user;

            this.loadTheme();
            this.init();
        });



    }

    async init() {
        await this.loadItems();
        await this.loadTrades();
        this.setupFilters();
        this.renderTrades();
        this.updateStats();
        this.updateUserUI();
    }

    async loadItems() {
        try {
            const res = await fetch('https://emwiki.site/api/gist-version');
            const data = await res.json();
            const parsed = JSON.parse(data.files?.['auto.json']?.content);

            // Flatten all items with category info
            this.categories.forEach(cat => {
                if (parsed[cat]) {
                    parsed[cat].forEach(item => {
                        this.allItems.push({
                            ...item,
                            category: cat
                        });
                    });
                }
            });

            console.log('Loaded', this.allItems.length, 'items');
            return this.allItems;
        } catch (error) {
            console.error('Failed to load items:', error);
            return null;
        }
    }

    loadTheme() {
        const theme = localStorage.getItem('theme') || 'dark';
        if (theme === 'light') {
            document.body.classList.add('light-theme');
        }

        const themeToggle = document.querySelector('.theme-toggle');
        if (themeToggle) {
            themeToggle.addEventListener('click', this.toggleTheme.bind(this));
        }
    }

    toggleTheme() {
        document.body.classList.toggle('light-theme');
        const isLight = document.body.classList.contains('light-theme');
        localStorage.setItem('theme', isLight ? 'light' : 'dark');
    }

    async loadTrades() {
        try {
            const params = new URLSearchParams({
                status: this.filters.status,
                ...(this.filters.category !== 'all' && { category: this.filters.category })
            });

            const response = await fetch(`${this.apiBase}/listings?${params}`);
            if (!response.ok) throw new Error('Failed to load trades');

            const data = await response.json();

            // Transform API data to match expected format
            this.trades = data.listings.map(listing => ({
                id: listing.id,
                trader: {
                    name: listing.user.username,
                    avatar: listing.user.avatar_url || './imgs/placeholder.png',
                    rating: listing.user.average_rating || 0,
                    totalTrades: listing.user.total_trades || 0
                },
                title: listing.title,
                description: listing.description,
                offering: listing.offering_items,
                offering_robux: listing.offering_robux || 0,
                lookingFor: listing.seeking_items || [],
                seeking_robux: listing.seeking_robux || 0,
                status: listing.status,
                createdAt: new Date(listing.created_at),
                views: listing.views || 0,
            }));
        } catch (error) {
            console.error('Error loading trades:', error);
            // Fallback to mock data on error
            if (window.Utils) {
                Utils.showToast('Error', 'Failed to load trades from server', 'error');
            }
        }
    }

    setupFilters() {
        const categoryFilter = document.getElementById('filter-category');
        const statusFilter = document.getElementById('filter-status');
        const sortFilter = document.getElementById('filter-sort');

        if (categoryFilter) {
            categoryFilter.addEventListener('change', (e) => {
                this.filters.category = e.target.value;
                this.renderTrades();
            });
        }

        if (statusFilter) {
            statusFilter.addEventListener('change', (e) => {
                this.filters.status = e.target.value;
                this.renderTrades();
            });
        }

        if (sortFilter) {
            sortFilter.addEventListener('change', (e) => {
                this.filters.sort = e.target.value;
                this.renderTrades();
            });
        }
    }

    renderTrades() {
        const grid = document.getElementById('trades-grid');
        if (!grid) return;

        let filteredTrades = this.filterTrades();
        filteredTrades = this.sortTrades(filteredTrades);

        grid.innerHTML = '';

        if (filteredTrades.length === 0) {
            grid.innerHTML = `
                <div class="empty-state">
                    <div class="empty-state-icon">📭</div>
                    <h2 class="empty-state-title">No Trades Found</h2>
                    <p class="empty-state-text">Try adjusting your filters or create a new trade!</p>
                    <button class="create-trade-btn" onclick="tradingHub.openCreateTrade()">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/>
                        </svg>
                        Create Your First Trade
                    </button>
                </div>
            `;
            return;
        }

        filteredTrades.forEach(trade => {
            grid.appendChild(this.createTradeCard(trade));
        });
    }

    filterTrades() {
        return this.trades.filter(trade => {
            // Category filter
            if (this.filters.category !== 'all' && trade.category !== this.filters.category) {
                return false;
            }

            // Status filter
            if (this.filters.status !== 'all' && trade.status !== this.filters.status) {
                return false;
            }

            return true;
        });
    }

    sortTrades(trades) {
        const sorted = [...trades];

        switch (this.filters.sort) {
            case 'recent':
                sorted.sort((a, b) => b.createdAt - a.createdAt);
                break;
            case 'value-high':
                sorted.sort((a, b) => b.value - a.value);
                break;
            case 'value-low':
                sorted.sort((a, b) => a.value - b.value);
                break;
        }

        return sorted;
    }

    createTradeCard(trade) {
        const card = document.createElement('div');
        card.className = 'trade-card';

        const timeAgo = this.getTimeAgo(trade.createdAt);
        const stars = '★'.repeat(Math.floor(trade.trader.rating)) + '☆'.repeat(5 - Math.floor(trade.trader.rating));

        card.innerHTML = `
            <div class="trade-header">
                <img class="trader-avatar" src="${trade.trader.avatar}" alt="${trade.trader.name}">
                <div class="trader-info">
                    <div class="trader-name">${trade.trader.name}</div>
                    <div class="trader-stats" style="font-size: 0.75rem; color: var(--text-secondary);">
                        ${stars} (${trade.trader.totalTrades} trades)
                    </div>
                    <div class="trade-time">${timeAgo} • ${trade.views || 0} views</div>
                </div>
                <span class="trade-status ${trade.status}">${trade.status}</span>
            </div>

            ${trade.title ? `<div class="trade-title" style="font-weight: 600; margin: 0.5rem 0;">${trade.title}</div>` : ''}
            ${trade.description ? `<div class="trade-description" style="font-size: 0.85rem; color: var(--text-secondary); margin-bottom: 0.5rem;">${trade.description}</div>` : ''}

            <div class="trade-items">
                <div class="trade-side">
                    <div class="trade-side-label">Offering</div>
                    ${trade.offering.map(item => `
                        <div class="trade-item-mini">
                            <img class="trade-item-img" src="${item.item_image || './imgs/placeholder.png'}" alt="${item.item_name}">
                            <span class="trade-item-name">${item.item_name}</span>
                        </div>
                    `).join('')}
                    ${trade.offering_robux > 0 ? `
                        <div class="trade-item-mini" style="background: linear-gradient(135deg, #11f54a20, #667eea20);">
                            <span style="font-size: 20px;">💰</span>
                            <span class="trade-item-name">${trade.offering_robux} R$</span>
                        </div>
                    ` : ''}
                </div>

                <div class="trade-arrow">⇄</div>

                <div class="trade-side">
                    <div class="trade-side-label">Looking For</div>
                    ${trade.lookingFor && trade.lookingFor.length > 0 ? trade.lookingFor.map(item => `
                        <div class="trade-item-mini">
                            <img class="trade-item-img" src="${item.item_image || './imgs/placeholder.png'}" alt="${item.item_name}">
                            <span class="trade-item-name">${item.item_name}</span>
                        </div>
                    `).join('') : ''}
                    ${trade.seeking_robux > 0 ? `
                        <div class="trade-item-mini" style="background: linear-gradient(135deg, #11f54a20, #667eea20);">
                            <span style="font-size: 20px;">💰</span>
                            <span class="trade-item-name">${trade.seeking_robux} R$</span>
                        </div>
                    ` : ''}
                    ${(!trade.lookingFor || trade.lookingFor.length === 0) && (!trade.seeking_robux || trade.seeking_robux === 0) ? '<div style="text-align: center; color: var(--text-secondary);">Open to offers</div>' : ''}
                </div>
            </div>

            <div class="trade-actions">
                <button class="trade-action-btn primary" onclick="tradingHub.viewTrade(${trade.id})">
                    View Details
                </button>
                ${this.currentUser && trade.trader.name !== this.currentUser.username ? `
                    <button class="trade-action-btn secondary" onclick="tradingHub.makeOffer(${trade.id})">
                        Make Offer
                    </button>
                ` : ''}
            </div>
        `;

        return card;
    }

    getTimeAgo(date) {
        const seconds = Math.floor((new Date() - date) / 1000);

        const intervals = {
            year: 31536000,
            month: 2592000,
            week: 604800,
            day: 86400,
            hour: 3600,
            minute: 60
        };

        for (const [unit, secondsInUnit] of Object.entries(intervals)) {
            const interval = Math.floor(seconds / secondsInUnit);
            if (interval >= 1) {
                return `${interval} ${unit}${interval > 1 ? 's' : ''} ago`;
            }
        }

        return 'Just now';
    }

    updateStats() {
        const totalTrades = document.getElementById('total-trades');
        const totalTraders = document.getElementById('total-traders');
        const tradesToday = document.getElementById('trades-today');

        if (totalTrades) totalTrades.textContent = this.trades.length;
        if (totalTraders) {
            const uniqueTraders = new Set(this.trades.map(t => t.trader.name)).size;
            totalTraders.textContent = uniqueTraders;
        }
        if (tradesToday) {
            const today = new Date().setHours(0, 0, 0, 0);
            const count = this.trades.filter(t => t.createdAt >= today).length;
            tradesToday.textContent = count;
        }
    }

    updateUserUI() {
        const createBtn = document.querySelector('.create-trade-btn');
        if (createBtn && !this.currentUser) {
            console.log(this.currentUser);
            createBtn.setAttribute('popovertarget', 'auth-modal');
            createBtn.setAttribute('popovertargetaction', 'show');
            createBtn.classList.add('create-account');
            createBtn.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M6.75 6.5a5.25 5.25 0 1 1 10.5 0 5.25 5.25 0 0 1-10.5 0m-2.5 12.071a5.32 5.32 0 0 1 5.321-5.321h4.858a5.32 5.32 0 0 1 5.321 5.321 4.18 4.18 0 0 1-4.179 4.179H8.43a4.18 4.18 0 0 1-4.179-4.179" clip-rule="evenodd"/></svg>Please login to create trades';
        }

        // Show/hide navigation links based on login status
        const myTradesLink = document.getElementById('my-trades-link');

        if (this.currentUser) {
            if (myTradesLink) myTradesLink.style.display = '';
        } else {
            if (myTradesLink) myTradesLink.style.display = 'none';
        }
    }

    setView(view) {
        const grid = document.getElementById('trades-grid');
        const buttons = document.querySelectorAll('.view-btn');

        buttons.forEach(btn => {
            btn.classList.toggle('active', btn.dataset.view === view);
        });

        if (view === 'list') {
            grid.classList.add('list-view');
        } else {
            grid.classList.remove('list-view');
        }
    }

    async openCreateTrade() {
        if (!this.currentUser) {
            if (window.Utils) {
                Utils.showToast('Login Required', 'Please login to create a trade', 'warning');
            }
            return;
        }

        this.showCreateTradeModal();
    }

    async viewTrade(id) {
        try {
            const response = await fetch(`${this.apiBase}/listings/${id}`);
            if (!response.ok) throw new Error('Failed to load trade details');

            const data = await response.json();
            this.showTradeDetailsModal(data);
        } catch (error) {
            console.error('Error viewing trade:', error);
            if (window.Utils) {
                Utils.showToast('Error', 'Failed to load trade details', 'error');
            }
        }
    }

    async makeOffer(listingId) {
        if (!this.currentUser) {
            if (window.Utils) {
                Utils.showToast('Login Required', 'Please login to make an offer', 'warning');
            }
            return;
        }

        // Load listing details
        const listing = await fetch(`${this.apiBase}/listings/${listingId}`).then(r => r.json());

        this.showMakeOfferModal(listingId, listing);
    }

    async createListing(listingData) {
        if (!this.currentUser) {
            throw new Error('Must be logged in to create a listing');
        }

        const sessionToken = localStorage.getItem('sessionToken');
        const response = await fetch(`${this.apiBase}/listings`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${sessionToken}`
            },
            body: JSON.stringify(listingData)
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Failed to create listing');
        }

        return await response.json();
    }

    async submitOffer(listingId, offerData) {
        if (!this.currentUser) {
            throw new Error('Must be logged in to make an offer');
        }

        const sessionToken = localStorage.getItem('sessionToken');
        const response = await fetch(`${this.apiBase}/offers`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${sessionToken}`
            },
            body: JSON.stringify({
                listing_id: listingId,
                ...offerData
            })
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Failed to submit offer');
        }

        return await response.json();
    }

    async getAuthHeaders() {
        const sessionToken = localStorage.getItem('sessionToken');
        return {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${sessionToken}`
        };
    }

    showCreateTradeModal() {
        const modal = this.createModal('Create Trade Listing', `
            <form id="create-trade-form" class="trade-form">
                <div class="form-group">
                    <label>Title</label>
                    <input type="text" name="title" placeholder="e.g., Trading Omega Sword for Pets" required maxlength="100">
                </div>

                <div class="form-group">
                    <label>Description</label>
                    <textarea name="description" placeholder="Describe what you're looking for..." rows="3" maxlength="500"></textarea>
                </div>


                <div class="form-group">
                    <label>Items You're Offering</label>
                    <div class="item-search-container">
                        <input type="text" id="offering-search" placeholder="Search items..." class="item-search-input">
                        <div id="offering-search-results" class="item-search-results"></div>
                    </div>
                    <div id="offering-items-selected" class="selected-items-grid"></div>
                </div>

                <div class="form-group">
                    <label>Robux You're Offering (Optional)</label>
                    <input type="number" name="offering_robux" placeholder="0" min="0" step="1" class="robux-input">
                </div>

                <div class="form-group">
                    <label>Items You Want (Optional - leave empty for open offers)</label>
                    <div class="item-search-container">
                        <input type="text" id="seeking-search" placeholder="Search items..." class="item-search-input">
                        <div id="seeking-search-results" class="item-search-results"></div>
                    </div>
                    <div id="seeking-items-selected" class="selected-items-grid"></div>
                </div>

                <div class="form-group">
                    <label>Robux You Want (Optional)</label>
                    <input type="number" name="seeking_robux" placeholder="0" min="0" step="1" class="robux-input">
                </div>

                <div class="form-actions">
                    <button type="button" class="btn-secondary" onclick="tradingHub.closeModal()">Cancel</button>
                    <button type="submit" class="btn-primary">Create Listing</button>
                </div>
            </form>
        `);

        document.body.appendChild(modal);

        // Setup item search for offering
        this.setupItemSearch('offering-search', 'offering-search-results', 'offering-items-selected', 'offering');

        // Setup item search for seeking
        this.setupItemSearch('seeking-search', 'seeking-search-results', 'seeking-items-selected', 'seeking');

        const form = document.getElementById('create-trade-form');
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            await this.handleCreateTrade(form);
        });
    }

    setupItemSearch(searchInputId, resultsContainerId, selectedContainerId, type) {
        const searchInput = document.getElementById(searchInputId);
        const resultsContainer = document.getElementById(resultsContainerId);
        const selectedContainer = document.getElementById(selectedContainerId);

        if (!searchInput || !resultsContainer || !selectedContainer) return;

        const selectedItems = new Set();

        searchInput.addEventListener('input', (e) => {
            const query = e.target.value.trim().toLowerCase();

            if (!query) {
                resultsContainer.innerHTML = '';
                resultsContainer.style.display = 'none';
                return;
            }

            // Filter items based on search
            const matches = this.allItems.filter(item =>
                item.name.toLowerCase().includes(query)
            ).slice(0, 20); // Limit to 20 results

            if (matches.length === 0) {
                resultsContainer.innerHTML = '<div class="no-results">No items found</div>';
                resultsContainer.style.display = 'block';
                return;
            }

            resultsContainer.innerHTML = '';
            resultsContainer.style.display = 'grid';

            matches.forEach(item => {
                const itemCard = document.createElement('div');
                itemCard.className = 'search-result-item';
                itemCard.innerHTML = `
                    <img src="${item.img || './imgs/placeholder.png'}" alt="${item.name}">
                    <span class="item-name-small">${item.name}</span>
                `;

                itemCard.addEventListener('click', () => {
                    if (selectedItems.has(item.name)) return; // Already selected

                    selectedItems.add(item.name);
                    this.addSelectedItem(selectedContainer, item, () => {
                        selectedItems.delete(item.name);
                    });

                    searchInput.value = '';
                    resultsContainer.innerHTML = '';
                    resultsContainer.style.display = 'none';
                });

                resultsContainer.appendChild(itemCard);
            });
        });

        // Close results when clicking outside
        document.addEventListener('click', (e) => {
            if (!searchInput.contains(e.target) && !resultsContainer.contains(e.target)) {
                resultsContainer.style.display = 'none';
            }
        });
    }

    addSelectedItem(container, item, onRemove) {
        const itemCard = document.createElement('div');
        itemCard.className = 'selected-item-card';
        itemCard.dataset.itemName = item.name;
        itemCard.innerHTML = `
            <img src="${item.img || './imgs/placeholder.png'}" alt="${item.name}">
            <span class="selected-item-name">${item.name}</span>
            <button type="button" class="remove-selected-item">×</button>
        `;

        const removeBtn = itemCard.querySelector('.remove-selected-item');
        removeBtn.addEventListener('click', () => {
            itemCard.remove();
            if (onRemove) onRemove();
        });

        container.appendChild(itemCard);
    }

    async handleCreateTrade(form) {
        const formData = new FormData(form);

        // Get offering items from selected cards
        const offeringContainer = document.getElementById('offering-items-selected');
        const offeringItems = Array.from(offeringContainer.querySelectorAll('.selected-item-card'))
            .map(card => {
                const itemName = card.dataset.itemName;
                const item = this.allItems.find(i => i.name === itemName);
                return {
                    item_name: itemName,
                    item_image: item?.img || null
                };
            });

        const offeringRobux = parseInt(formData.get('offering_robux')) || 0;

        if (offeringItems.length === 0 && offeringRobux === 0) {
            if (window.Utils) Utils.showToast('Error', 'Please add at least one item or robux to offer', 'error');
            return;
        }

        // Get seeking items from selected cards
        const seekingContainer = document.getElementById('seeking-items-selected');
        const seekingItems = Array.from(seekingContainer.querySelectorAll('.selected-item-card'))
            .map(card => {
                const itemName = card.dataset.itemName;
                const item = this.allItems.find(i => i.name === itemName);
                return {
                    item_name: itemName,
                    item_image: item?.img || null
                };
            });

        const seekingRobux = parseInt(formData.get('seeking_robux')) || 0;

        const listingData = {
            title: formData.get('title'),
            description: formData.get('description'),
            offering_items: offeringItems,
            offering_robux: offeringRobux,
            seeking_items: seekingItems,
            seeking_robux: seekingRobux
        };

        try {
            const result = await this.createListing(listingData);
            if (window.Utils) Utils.showToast('Success', 'Trade listing created!', 'success');
            this.closeModal();
            await this.loadTrades();
            this.renderTrades();
            this.updateStats();
        } catch (error) {
            if (window.Utils) Utils.showToast('Error', error.message, 'error');
        }
    }

    showTradeDetailsModal(data) {
        const listing = data.listing || data;
        const timeAgo = this.getTimeAgo(new Date(listing.created_at));
        const stars = '★'.repeat(Math.floor(listing.user.average_rating || 0)) + '☆'.repeat(5 - Math.floor(listing.user.average_rating || 0));

        const modal = this.createModal(listing.title || `Trade #${listing.id}`, `
            <div class="trade-details">
                <div class="trade-detail-header">
                    <img class="trader-avatar-large" src="${listing.user.avatar_url || './imgs/placeholder.png'}" alt="${listing.user.username}">
                    <div class="trader-info-large">
                        <h3>${listing.user.username}</h3>
                        <div class="trader-rating">${stars} (${listing.user.total_trades || 0} trades)</div>
                        <div class="trade-meta">Posted ${timeAgo} • ${listing.views || 0} views</div>
                    </div>
                    <span class="trade-status-large ${listing.status}">${listing.status}</span>
                </div>

                ${listing.description ? `<div class="trade-detail-description">${listing.description}</div>` : ''}

                <div class="trade-detail-items">
                    <div class="trade-detail-side">
                        <h4>Offering</h4>
                        <div class="item-list">
                            ${listing.offering_items.map(item => `
                                <div class="detail-item">
                                    <img src="${item.item_image || './imgs/placeholder.png'}" alt="${item.item_name}">
                                    <span>${item.item_name}</span>
                                </div>
                            `).join('')}
                            ${(listing.offering_robux || 0) > 0 ? `
                                <div class="detail-item" style="background: linear-gradient(135deg, #11f54a15, #667eea15);">
                                    <span style="font-size: 32px;">💰</span>
                                    <span style="font-weight: 700; color: #11f54a;">${listing.offering_robux} Robux</span>
                                </div>
                            ` : ''}
                        </div>
                    </div>

                    <div class="trade-detail-arrow">⇄</div>

                    <div class="trade-detail-side">
                        <h4>Looking For</h4>
                        <div class="item-list">
                            ${listing.seeking_items && listing.seeking_items.length > 0 ? listing.seeking_items.map(item => `
                                <div class="detail-item">
                                    <img src="${item.item_image || './imgs/placeholder.png'}" alt="${item.item_name}">
                                    <span>${item.item_name}</span>
                                </div>
                            `).join('') : ''}
                            ${(listing.seeking_robux || 0) > 0 ? `
                                <div class="detail-item" style="background: linear-gradient(135deg, #11f54a15, #667eea15);">
                                    <span style="font-size: 32px;">💰</span>
                                    <span style="font-weight: 700; color: #11f54a;">${listing.seeking_robux} Robux</span>
                                </div>
                            ` : ''}
                            ${(!listing.seeking_items || listing.seeking_items.length === 0) && (!listing.seeking_robux || listing.seeking_robux === 0) ? '<p style="text-align:center;color:var(--text-secondary)">Open to all offers</p>' : ''}
                        </div>
                    </div>
                </div>

                ${this.currentUser && listing.user.username !== this.currentUser.username && listing.status === 'active' ? `
                    <div class="trade-detail-actions">
                        <button class="btn-primary" onclick="tradingHub.makeOffer(${listing.id})">Make an Offer</button>
                    </div>
                ` : ''}
            </div>
        `);

        document.body.appendChild(modal);
    }

    showMakeOfferModal(listingId, listing) {
        const modal = this.createModal('Make an Offer', `
            <form id="make-offer-form" class="trade-form">
                <div class="offer-context">
                    <p><strong>${listing.listing?.user?.username || listing.user?.username || 'User'}</strong> is looking for:</p>
                    <div class="seeking-preview">
                        ${listing.listing?.seeking_items || listing.seeking_items && (listing.listing?.seeking_items || listing.seeking_items).length > 0 ?
                (listing.listing?.seeking_items || listing.seeking_items).map(item => `<span class="tag">${item.item_name}</span>`).join('') :
                '<span class="tag">Any items</span>'}
                    </div>
                    ${(listing.listing?.seeking_robux || listing.seeking_robux) > 0 ? `
                        <p style="margin-top: 10px;"><strong>Robux wanted:</strong> ${listing.listing?.seeking_robux || listing.seeking_robux} R$</p>
                    ` : ''}
                </div>

                <div class="form-group">
                    <label>Your Item Offer</label>
                    <div class="item-search-container">
                        <input type="text" id="offer-search" placeholder="Search items..." class="item-search-input">
                        <div id="offer-search-results" class="item-search-results"></div>
                    </div>
                    <div id="offer-items-selected" class="selected-items-grid"></div>
                </div>

                <div class="form-group">
                    <label>Robux You're Offering (Optional)</label>
                    <input type="number" name="offering_robux" placeholder="0" min="0" step="1" class="robux-input">
                </div>

                <div class="form-group">
                    <label>Message (Optional)</label>
                    <textarea name="message" placeholder="Add a message to your offer..." rows="3" maxlength="500"></textarea>
                </div>

                <div class="form-actions">
                    <button type="button" class="btn-secondary" onclick="tradingHub.closeModal()">Cancel</button>
                    <button type="submit" class="btn-primary">Submit Offer</button>
                </div>
            </form>
        `);

        document.body.appendChild(modal);

        // Setup item search for offer
        this.setupItemSearch('offer-search', 'offer-search-results', 'offer-items-selected', 'offer');

        const form = document.getElementById('make-offer-form');
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            await this.handleMakeOffer(listingId, form);
        });
    }

    async handleMakeOffer(listingId, form) {
        const formData = new FormData(form);

        // Get offered items from selected cards
        const offerContainer = document.getElementById('offer-items-selected');
        const offeredItems = Array.from(offerContainer.querySelectorAll('.selected-item-card'))
            .map(card => {
                const itemName = card.dataset.itemName;
                const item = this.allItems.find(i => i.name === itemName);
                return {
                    item_name: itemName,
                    item_image: item?.img || null
                };
            });

        const offeringRobux = parseInt(formData.get('offering_robux')) || 0;

        if (offeredItems.length === 0 && offeringRobux === 0) {
            if (window.Utils) Utils.showToast('Error', 'Please add at least one item or robux to offer', 'error');
            return;
        }

        const offerData = {
            offered_items: offeredItems,
            offering_robux: offeringRobux,
            message: formData.get('message') || ''
        };

        try {
            await this.submitOffer(listingId, offerData);
            if (window.Utils) Utils.showToast('Success', 'Offer submitted!', 'success');
            this.closeModal();
        } catch (error) {
            if (window.Utils) Utils.showToast('Error', error.message, 'error');
        }
    }

    createModal(title, content) {
        const modal = document.createElement('div');
        modal.className = 'modal-overlay';
        modal.innerHTML = `
            <div class="modal-content">
                <div class="modal-header">
                    <h2>${title}</h2>
                    <button class="modal-close" onclick="tradingHub.closeModal()">×</button>
                </div>
                <div class="modal-body">
                    ${content}
                </div>
            </div>
        `;

        // Close on overlay click
        modal.addEventListener('click', (e) => {
            if (e.target === modal) this.closeModal();
        });

        return modal;
    }

    closeModal() {
        const modal = document.querySelector('.modal-overlay');
        if (modal) modal.remove();
    }
}

// Initialize
const tradingHub = new TradingHub();