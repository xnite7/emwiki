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

        //await this.loadTrades();
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
        const createBtn = document.querySelector('.create-trade-btn');
        if (createBtn && !this.currentUser) {
            createBtn.setAttribute('popovertarget', 'auth-modal');
            createBtn.setAttribute('popovertargetaction', 'show');
            createBtn.classList.add('create-account');
            createBtn.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M6.75 6.5a5.25 5.25 0 1 1 10.5 0 5.25 5.25 0 0 1-10.5 0m-2.5 12.071a5.32 5.32 0 0 1 5.321-5.321h4.858a5.32 5.32 0 0 1 5.321 5.321 4.18 4.18 0 0 1-4.179 4.179H8.43a4.18 4.18 0 0 1-4.179-4.179" clip-rule="evenodd"/></svg>Please login to create trades';
        }
    }

    async openCreateTrade() {
        if (!this.currentUser) {
            if (window.Utils) {
                Utils.showToast('Login Required', 'Please login to create a trade', 'warning');
            }
            return;
        }

        if (window.Utils) {
            Utils.showToast('Coming Soon', 'Trade creation modal coming soon! Use the API directly for now.', 'info');
        }
        // TODO: Open create trade modal with form
    }

    async viewTrade(id) {
        try {
            const response = await fetch(`${this.apiBase}/listings/${id}`);
            if (!response.ok) throw new Error('Failed to load trade details');

            const data = await response.json();

            // TODO: Open modal with full trade details
            console.log('Trade details:', data);
            if (window.Utils) {
                Utils.showToast('Trade Details', `Viewing "${data.title || 'Trade #' + id}"`, 'info');
            }

            // For now, redirect to a details page if it exists
            // window.location.href = `/trading/${id}`;
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

        if (window.Utils) {
            Utils.showToast('Coming Soon', 'Offer making interface coming soon!', 'info');
        }
        // TODO: Open make offer modal
        console.log('Making offer on listing:', listingId);
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
}

// Initialize
const tradingHub = new TradingHub();