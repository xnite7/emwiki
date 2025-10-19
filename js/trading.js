// Lightweight Trading Hub App
class TradingHub {
    constructor() {
        this.trades = [];
        this.filters = {
            category: 'all',
            status: 'all',
            sort: 'recent'
        };
        
        this.loadTheme();
        this.init();
    }

    async init() {
        await this.loadTrades();
        this.setupFilters();
        this.renderTrades();
        this.updateStats();
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
        // TODO: Replace with actual API call
        // For now, mock data
        this.trades = this.generateMockTrades();
    }

    generateMockTrades() {
        const mockTrades = [
            {
                id: 1,
                trader: {
                    name: 'CoolTrader123',
                    avatar: 'https://www.roblox.com/headshot-thumbnail/image?userId=1&width=150&height=150&format=png'
                },
                offering: [
                    { name: 'Epic Sword', img: './imgs/placeholder.png', category: 'gears' }
                ],
                lookingFor: [
                    { name: 'Cool Pet', img: './imgs/placeholder.png', category: 'pets' }
                ],
                status: 'open',
                createdAt: new Date(Date.now() - 1000 * 60 * 30), // 30 mins ago
                value: 50000
            },
            {
                id: 2,
                trader: {
                    name: 'ProGamer456',
                    avatar: 'https://www.roblox.com/headshot-thumbnail/image?userId=2&width=150&height=150&format=png'
                },
                offering: [
                    { name: 'Rare Death', img: './imgs/placeholder.png', category: 'deaths' }
                ],
                lookingFor: [
                    { name: 'Epic Effect', img: './imgs/placeholder.png', category: 'effects' }
                ],
                status: 'open',
                createdAt: new Date(Date.now() - 1000 * 60 * 60 * 2), // 2 hours ago
                value: 75000
            }
        ];

        return mockTrades;
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
            if (this.filters.category !== 'all') {
                const hasCategory = [...trade.offering, ...trade.lookingFor]
                    .some(item => item.category === this.filters.category);
                if (!hasCategory) return false;
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

        card.innerHTML = `
            <div class="trade-header">
                <img class="trader-avatar" src="${trade.trader.avatar}" alt="${trade.trader.name}">
                <div class="trader-info">
                    <div class="trader-name">${trade.trader.name}</div>
                    <div class="trade-time">${timeAgo}</div>
                </div>
                <span class="trade-status ${trade.status}">${trade.status}</span>
            </div>

            <div class="trade-items">
                <div class="trade-side">
                    <div class="trade-side-label">Offering</div>
                    ${trade.offering.map(item => `
                        <div class="trade-item-mini">
                            <img class="trade-item-img" src="${item.img}" alt="${item.name}">
                            <span class="trade-item-name">${item.name}</span>
                        </div>
                    `).join('')}
                </div>

                <div class="trade-arrow">⇄</div>

                <div class="trade-side">
                    <div class="trade-side-label">Looking For</div>
                    ${trade.lookingFor.map(item => `
                        <div class="trade-item-mini">
                            <img class="trade-item-img" src="${item.img}" alt="${item.name}">
                            <span class="trade-item-name">${item.name}</span>
                        </div>
                    `).join('')}
                </div>
            </div>

            <div class="trade-actions">
                <button class="trade-action-btn primary" onclick="tradingHub.viewTrade(${trade.id})">
                    View Details
                </button>
                <button class="trade-action-btn secondary" onclick="tradingHub.contactTrader(${trade.id})">
                    Contact
                </button>
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

    openCreateTrade() {
        Utils.showToast('Coming Soon', 'Trade creation will be available soon!', 'info');
        // TODO: Open create trade modal
    }

    viewTrade(id) {
        Utils.showToast('Trade Details', `Viewing trade #${id}`, 'info');
        // TODO: Open trade details modal
    }

    contactTrader(id) {
        const trade = this.trades.find(t => t.id === id);
        if (trade) {
            Utils.showToast('Contact', `Opening chat with ${trade.trader.name}...`, 'info');
        }
        // TODO: Open contact modal or redirect to messaging
    }
}

// Initialize
const tradingHub = new TradingHub();