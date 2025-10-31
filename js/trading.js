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
        this.currentUser = null;

        this.loadTheme();
        this.init();
    }

    async init() {
        // Check if user is logged in (from auth system)
        const sessionToken = localStorage.getItem('sessionToken');
        if (sessionToken && window.Auth) {
            this.currentUser = await window.Auth.checkAuth();
        }

        await this.loadTrades();
        this.setupFilters();
        this.renderTrades();
        this.updateStats();
        this.updateUserUI();
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
                lookingFor: listing.seeking_items || [],
                status: listing.status,
                createdAt: new Date(listing.created_at),
                views: listing.views || 0,
                category: listing.category
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
                </div>

                <div class="trade-arrow">⇄</div>

                <div class="trade-side">
                    <div class="trade-side-label">Looking For</div>
                    ${trade.lookingFor && trade.lookingFor.length > 0 ? trade.lookingFor.map(item => `
                        <div class="trade-item-mini">
                            <img class="trade-item-img" src="${item.item_image || './imgs/placeholder.png'}" alt="${item.item_name}">
                            <span class="trade-item-name">${item.item_name}</span>
                        </div>
                    `).join('') : '<div style="text-align: center; color: var(--text-secondary);">Open to offers</div>'}
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
        console.log('Current User:', this.currentUser);
        const createBtn = document.querySelector('.create-trade-btn');
        if (createBtn && !this.currentUser) {
            createBtn.disabled = true;
            createBtn.classList.add('create-account');
            createBtn.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M6.75 6.5a5.25 5.25 0 1 1 10.5 0 5.25 5.25 0 0 1-10.5 0m-2.5 12.071a5.32 5.32 0 0 1 5.321-5.321h4.858a5.32 5.32 0 0 1 5.321 5.321 4.18 4.18 0 0 1-4.179 4.179H8.43a4.18 4.18 0 0 1-4.179-4.179" clip-rule="evenodd"/></svg>Please login to create trades';
        }

        // Show/hide navigation links based on login status
        const myTradesLink = document.getElementById('my-trades-link');
        const inventoryLink = document.getElementById('inventory-link');

        if (this.currentUser) {
            if (myTradesLink) myTradesLink.style.display = '';
            if (inventoryLink) inventoryLink.style.display = '';
        } else {
            if (myTradesLink) myTradesLink.style.display = 'none';
            if (inventoryLink) inventoryLink.style.display = 'none';
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

        // Load user's inventory
        const inventory = await this.loadUserInventory();
        this.showCreateTradeModal(inventory);
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

        // Load user's inventory and listing details
        const [inventory, listing] = await Promise.all([
            this.loadUserInventory(),
            fetch(`${this.apiBase}/listings/${listingId}`).then(r => r.json())
        ]);

        this.showMakeOfferModal(listingId, listing, inventory);
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

    async loadUserInventory() {
        if (!this.currentUser) return [];

        try {
            const headers = await this.getAuthHeaders();
            const response = await fetch(`${this.apiBase}/inventory`, { headers });
            if (!response.ok) return [];

            const data = await response.json();
            return data.inventory || [];
        } catch (error) {
            console.error('Error loading inventory:', error);
            return [];
        }
    }

    showCreateTradeModal(inventory) {
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
                    <label>Category</label>
                    <select name="category" required>
                        <option value="gears">Gears</option>
                        <option value="deaths">Deaths</option>
                        <option value="pets">Pets</option>
                        <option value="effects">Effects</option>
                        <option value="titles">Titles</option>
                    </select>
                </div>

                <div class="form-group">
                    <label>Items You're Offering</label>
                    <div id="offering-items" class="item-selector">
                        ${inventory.length > 0 ? inventory.filter(i => i.for_trade).map(item => `
                            <div class="selectable-item" data-item='${JSON.stringify({item_id: item.item_id, item_name: item.item_name, item_image: item.item_image})}'>
                                <img src="${item.item_image || './imgs/placeholder.png'}" alt="${item.item_name}">
                                <span>${item.item_name}</span>
                                <input type="checkbox" class="item-checkbox">
                            </div>
                        `).join('') : '<p style="text-align:center;color:var(--text-secondary)">No tradeable items in inventory. <a href="/inventory">Add items?</a></p>'}
                    </div>
                </div>

                <div class="form-group">
                    <label>Items You Want (Optional - leave empty for open offers)</label>
                    <div id="seeking-items-container">
                        <button type="button" class="add-seeking-item-btn" onclick="tradingHub.addSeekingItemInput()">+ Add Item</button>
                        <div id="seeking-items-list"></div>
                    </div>
                </div>

                <div class="form-actions">
                    <button type="button" class="btn-secondary" onclick="tradingHub.closeModal()">Cancel</button>
                    <button type="submit" class="btn-primary">Create Listing</button>
                </div>
            </form>
        `);

        document.body.appendChild(modal);

        const form = document.getElementById('create-trade-form');
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            await this.handleCreateTrade(form);
        });
    }

    addSeekingItemInput() {
        const container = document.getElementById('seeking-items-list');
        const itemDiv = document.createElement('div');
        itemDiv.className = 'seeking-item-input';
        itemDiv.innerHTML = `
            <input type="text" placeholder="Item name" class="seeking-item-name">
            <button type="button" class="remove-btn" onclick="this.parentElement.remove()">×</button>
        `;
        container.appendChild(itemDiv);
    }

    async handleCreateTrade(form) {
        const formData = new FormData(form);

        // Get selected offering items
        const offeringItems = Array.from(document.querySelectorAll('#offering-items .item-checkbox:checked'))
            .map(cb => JSON.parse(cb.closest('.selectable-item').dataset.item));

        if (offeringItems.length === 0) {
            if (window.Utils) Utils.showToast('Error', 'Please select at least one item to offer', 'error');
            return;
        }

        // Get seeking items
        const seekingItems = Array.from(document.querySelectorAll('.seeking-item-name'))
            .map(input => input.value.trim())
            .filter(name => name)
            .map(name => ({ item_name: name }));

        const listingData = {
            title: formData.get('title'),
            description: formData.get('description'),
            category: formData.get('category'),
            offering_items: offeringItems,
            seeking_items: seekingItems
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
                            `).join('') : '<p style="text-align:center;color:var(--text-secondary)">Open to all offers</p>'}
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

    showMakeOfferModal(listingId, listing, inventory) {
        const modal = this.createModal('Make an Offer', `
            <form id="make-offer-form" class="trade-form">
                <div class="offer-context">
                    <p><strong>${listing.listing?.user?.username || listing.user?.username || 'User'}</strong> is looking for:</p>
                    <div class="seeking-preview">
                        ${listing.listing?.seeking_items || listing.seeking_items && (listing.listing?.seeking_items || listing.seeking_items).length > 0 ?
                            (listing.listing?.seeking_items || listing.seeking_items).map(item => `<span class="tag">${item.item_name}</span>`).join('') :
                            '<span class="tag">Any items</span>'}
                    </div>
                </div>

                <div class="form-group">
                    <label>Your Offer</label>
                    <div id="offer-items" class="item-selector">
                        ${inventory.length > 0 ? inventory.filter(i => i.for_trade).map(item => `
                            <div class="selectable-item" data-item='${JSON.stringify({item_id: item.item_id, item_name: item.item_name, item_image: item.item_image})}'>
                                <img src="${item.item_image || './imgs/placeholder.png'}" alt="${item.item_name}">
                                <span>${item.item_name}</span>
                                <input type="checkbox" class="item-checkbox">
                            </div>
                        `).join('') : '<p style="text-align:center;color:var(--text-secondary)">No tradeable items. <a href="/inventory">Add items?</a></p>'}
                    </div>
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

        const form = document.getElementById('make-offer-form');
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            await this.handleMakeOffer(listingId, form);
        });
    }

    async handleMakeOffer(listingId, form) {
        const formData = new FormData(form);

        const offeredItems = Array.from(document.querySelectorAll('#offer-items .item-checkbox:checked'))
            .map(cb => JSON.parse(cb.closest('.selectable-item').dataset.item));

        if (offeredItems.length === 0) {
            if (window.Utils) Utils.showToast('Error', 'Please select at least one item to offer', 'error');
            return;
        }

        const offerData = {
            offered_items: offeredItems,
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