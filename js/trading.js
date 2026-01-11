// Trading Hub - Mobile-First Multi-Step Wizard
class TradingHub {
    constructor() {
        this.trades = [];
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
        
        // Search state
        this.searchTimeouts = {};
        this.selectedTheme = 'default';
        
        // Wait for Auth to be ready
        if (window.Auth) {
            window.Auth.addEventListener('sessionReady', () => {
                this.currentUser = window.Auth.user;
                this.init();
            });
        } else {
            // Fallback: init after a delay
            setTimeout(() => {
                if (window.Auth && window.Auth.user) {
                    this.currentUser = window.Auth.user;
                }
                this.init();
            }, 500);
        }
    }

    async init() {
        await this.loadItems();
        await this.loadTrades();
        this.setupEventListeners();
        this.renderTrades();
    }

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
                        this.allItems.push({
                            ...item,
                            category: category
                        });
                    });
                    
                    hasMore = items.length === limit;
                    offset += limit;
                }
            });
            
            await Promise.all(categoryPromises);
            console.log('Loaded', this.allItems.length, 'items');
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
                offering_items: listing.offering_items || [],
                seeking_items: listing.seeking_items || [],
                created_at: listing.created_at,
                updated_at: listing.updated_at,
                views: listing.views || 0,
                user: listing.user
            }));
        } catch (error) {
            console.error('Error loading trades:', error);
            if (window.Utils && window.Utils.showToast) {
                window.Utils.showToast('Error', 'Failed to load trades', 'error');
            }
        }
    }

    setupEventListeners() {
        // Browse/Create toggle
        const createTradeBtn = document.getElementById('createTradeBtn');
        if (createTradeBtn) {
            createTradeBtn.addEventListener('click', () => this.showCreateWizard());
        }

        // Wizard navigation
        document.getElementById('cancelWizardBtn')?.addEventListener('click', () => this.cancelWizard());
        document.getElementById('nextStep1Btn')?.addEventListener('click', () => this.nextStep());
        document.getElementById('backStep2Btn')?.addEventListener('click', () => this.previousStep());
        document.getElementById('nextStep2Btn')?.addEventListener('click', () => this.nextStep());
        document.getElementById('backStep3Btn')?.addEventListener('click', () => this.previousStep());
        document.getElementById('createListingBtn')?.addEventListener('click', () => this.createListing());

        // Item search
        this.setupItemSearch('seekingSearchInput', 'seekingSearchResults', 'seekingItemsContainer', 'seekingItems');
        this.setupItemSearch('offeringSearchInput', 'offeringSearchResults', 'offeringItemsContainer', 'offeringItems');

        // Custom items modal
        document.getElementById('addSeekingCustomBtn')?.addEventListener('click', () => this.openCustomModal('seekingItems'));
        document.getElementById('addOfferingCustomBtn')?.addEventListener('click', () => this.openCustomModal('offeringItems'));
        document.getElementById('closeCustomModal')?.addEventListener('click', () => this.closeCustomModal());
        document.getElementById('cancelCustomModal')?.addEventListener('click', () => this.closeCustomModal());
        document.getElementById('addCustomItemBtn')?.addEventListener('click', () => this.addCustomItem());
        document.getElementById('customTypeRobux')?.addEventListener('click', () => this.selectCustomType('robux'));
        document.getElementById('customTypeOther')?.addEventListener('click', () => this.selectCustomType('other'));

        // Theme selector
        document.querySelectorAll('.theme-option').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const theme = e.currentTarget.dataset.theme;
                this.selectTheme(theme);
            });
        });

        // Browse filters
        document.getElementById('browseSearchInput')?.addEventListener('input', (e) => {
            clearTimeout(this.searchTimeouts.browse);
            this.searchTimeouts.browse = setTimeout(() => {
                this.filters.search = e.target.value;
                this.loadTrades().then(() => this.renderTrades());
            }, 300);
        });

        document.getElementById('filterCategory')?.addEventListener('change', (e) => {
            this.filters.category = e.target.value;
            this.loadTrades().then(() => this.renderTrades());
        });

        document.getElementById('filterStatus')?.addEventListener('change', (e) => {
            this.filters.status = e.target.value;
            this.loadTrades().then(() => this.renderTrades());
        });

        document.getElementById('filterSort')?.addEventListener('change', (e) => {
            this.filters.sort = e.target.value;
            this.renderTrades();
        });

        // Modal overlay click
        document.getElementById('customItemModal')?.addEventListener('click', (e) => {
            if (e.target.id === 'customItemModal') {
                this.closeCustomModal();
            }
        });

        // Description and category
        document.getElementById('tradeDescription')?.addEventListener('input', (e) => {
            this.wizardState.description = e.target.value;
            this.updatePreview();
        });

        document.getElementById('tradeCategory')?.addEventListener('change', (e) => {
            this.wizardState.category = e.target.value;
            this.updatePreview();
        });
    }

    setupItemSearch(inputId, resultsId, containerId, itemsKey) {
        const input = document.getElementById(inputId);
        const results = document.getElementById(resultsId);
        const container = document.getElementById(containerId);
        
        if (!input || !results || !container) return;

        let searchTimeout;
        input.addEventListener('input', (e) => {
            const query = e.target.value.trim().toLowerCase();
            
            clearTimeout(searchTimeout);
            if (!query) {
                results.classList.remove('active');
                results.innerHTML = '';
                return;
            }

            searchTimeout = setTimeout(() => {
                this.performItemSearch(query, results, container, itemsKey);
            }, 200);
        });

        // Close results on outside click
        document.addEventListener('click', (e) => {
            if (!input.contains(e.target) && !results.contains(e.target)) {
                results.classList.remove('active');
            }
        });
    }

    performItemSearch(query, resultsEl, containerEl, itemsKey) {
        const matches = this.allItems
            .filter(item => item.name.toLowerCase().includes(query))
            .slice(0, 20);

        if (matches.length === 0) {
            resultsEl.innerHTML = '<div class="search-result-item">No items found</div>';
            resultsEl.classList.add('active');
            return;
        }

        resultsEl.innerHTML = '';
        matches.forEach(item => {
            const itemEl = document.createElement('div');
            itemEl.className = 'search-result-item';
            itemEl.innerHTML = `
                <img src="${item.img || './imgs/placeholder.png'}" alt="${item.name}" onerror="this.src='./imgs/placeholder.png'">
                <span class="search-result-item-name">${this.escapeHtml(item.name)}</span>
            `;
            itemEl.addEventListener('click', () => {
                this.addItem(item, itemsKey);
                resultsEl.classList.remove('active');
                document.getElementById(resultsEl.id.replace('Results', 'Input')).value = '';
            });
            resultsEl.appendChild(itemEl);
        });

        resultsEl.classList.add('active');
    }

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

        this.renderItems(itemsKey);
        this.updatePreview();
    }

    removeItem(itemsKey, index) {
        this.wizardState[itemsKey].splice(index, 1);
        this.renderItems(itemsKey);
        this.updatePreview();
    }

    renderItems(itemsKey) {
        const container = document.getElementById(itemsKey.replace('Items', 'ItemsContainer'));
        if (!container) return;

        const items = this.wizardState[itemsKey];
        
        if (items.length === 0) {
            container.innerHTML = '<div class="empty-state"><span>No items selected</span></div>';
            return;
        }

        container.innerHTML = '';
        items.forEach((item, index) => {
            const itemEl = document.createElement('div');
            itemEl.className = 'selected-item';
            
            if (item.type === 'robux') {
                itemEl.innerHTML = `
                    <span class="selected-item-robux">💰 ${item.amount} R$</span>
                    <button class="selected-item-remove" onclick="tradingHub.removeItem('${itemsKey}', ${index})">×</button>
                `;
            } else if (item.type === 'other-game') {
                itemEl.innerHTML = `
                    <span class="selected-item-other">🎮 ${this.escapeHtml(item.game_name)}: ${this.escapeHtml(item.item_name)}</span>
                    <button class="selected-item-remove" onclick="tradingHub.removeItem('${itemsKey}', ${index})">×</button>
                `;
            } else {
                itemEl.innerHTML = `
                    <img src="${item.item_image || './imgs/placeholder.png'}" alt="${this.escapeHtml(item.item_name)}" onerror="this.src='./imgs/placeholder.png'">
                    <span class="selected-item-name">${this.escapeHtml(item.item_name)}</span>
                    <button class="selected-item-remove" onclick="tradingHub.removeItem('${itemsKey}', ${index})">×</button>
                `;
            }
            
            container.appendChild(itemEl);
        });
    }

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
        const modal = document.getElementById('customItemModal');
        if (modal) {
            modal.classList.remove('active');
        }
    }

    selectCustomType(type) {
        this.currentCustomType = type;
        document.querySelectorAll('.option-btn').forEach(btn => {
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
        this.renderItems(this.currentCustomItemsKey);
        this.updatePreview();
        this.closeCustomModal();
    }

    selectTheme(theme) {
        this.selectedTheme = theme;
        this.wizardState.theme = theme;
        document.querySelectorAll('.theme-option').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.theme === theme);
        });
        this.updatePreview();
    }

    showCreateWizard() {
        if (!this.currentUser) {
            if (window.Utils && window.Utils.showToast) {
                window.Utils.showToast('Login Required', 'Please login to create a trade', 'warning');
            }
            return;
        }

        document.getElementById('browseView').classList.remove('active');
        document.getElementById('createView').classList.add('active');
        this.setStep(1);
        this.loadWizardState();
    }

    cancelWizard() {
        if (confirm('Are you sure you want to cancel? Your progress will be saved.')) {
            this.saveWizardState();
            document.getElementById('browseView').classList.add('active');
            document.getElementById('createView').classList.remove('active');
            this.wizardState = {
                currentStep: 1,
                title: '',
                seekingItems: [],
                offeringItems: [],
                description: '',
                category: '',
                theme: 'default'
            };
        }
    }

    setStep(step) {
        this.wizardState.currentStep = step;
        
        // Update progress indicators
        document.querySelectorAll('.progress-step').forEach((el, index) => {
            const stepNum = index + 1;
            el.classList.toggle('active', stepNum === step);
            el.classList.toggle('completed', stepNum < step);
        });

        // Update progress bar
        const progressFill = document.getElementById('progressFill');
        if (progressFill) {
            progressFill.style.width = `${((step - 1) / 2) * 100}%`;
        }

        // Show/hide steps
        document.querySelectorAll('.wizard-step').forEach((el, index) => {
            el.classList.toggle('active', index + 1 === step);
        });

        // Update wizard state
        if (step === 2) {
            this.renderItems('offeringItems');
        } else if (step === 3) {
            this.wizardState.description = document.getElementById('tradeDescription')?.value || '';
            this.wizardState.category = document.getElementById('tradeCategory')?.value || '';
            this.renderItems('seekingItems');
            this.renderItems('offeringItems');
            this.updatePreview();
        }
    }

    nextStep() {
        if (this.wizardState.currentStep === 1) {
            this.setStep(2);
        } else if (this.wizardState.currentStep === 2) {
            if (this.wizardState.offeringItems.length === 0) {
                this.showToast('Please add at least one item to offer', 'error');
                return;
            }
            this.setStep(3);
        }
    }

    previousStep() {
        if (this.wizardState.currentStep > 1) {
            this.setStep(this.wizardState.currentStep - 1);
        }
    }

    updatePreview() {
        const previewCard = document.getElementById('tradePreviewCard');
        if (!previewCard || this.wizardState.currentStep !== 3) return;

        const description = this.wizardState.description;
        const offeringItems = this.wizardState.offeringItems;
        const seekingItems = this.wizardState.seekingItems;

        // Apply theme
        const themeClass = `theme-${this.selectedTheme}`;
        previewCard.className = `trade-preview-card ${themeClass}`;

        previewCard.innerHTML = `
            <div class="trade-card-header">
                <div class="trader-avatar" style="background: var(--bg-item);"></div>
                <div class="trader-info">
                    <div class="trader-name">${this.escapeHtml(this.currentUser?.displayName || this.currentUser?.username || 'You')}</div>
                    <div class="trade-meta">Preview</div>
                </div>
                <span class="trade-status active">Active</span>
            </div>
            ${description ? `<div class="trade-description">${this.escapeHtml(description)}</div>` : ''}
            <div class="trade-items-container">
                <div class="trade-side">
                    <div class="trade-side-label">Offering</div>
                    <div class="trade-items-list">
                        ${offeringItems.map(item => this.renderPreviewItem(item)).join('')}
                        ${offeringItems.length === 0 ? '<div style="color: var(--text-secondary);">No items</div>' : ''}
                    </div>
                </div>
                <div class="trade-side">
                    <div class="trade-side-label">Looking For</div>
                    <div class="trade-items-list">
                        ${seekingItems.map(item => this.renderPreviewItem(item)).join('')}
                        ${seekingItems.length === 0 ? '<div style="color: var(--text-secondary);">Open to offers</div>' : ''}
                    </div>
                </div>
            </div>
        `;
    }

    renderPreviewItem(item) {
        if (item.type === 'robux') {
            return `<div class="trade-item-robux">💰 ${item.amount} R$</div>`;
        } else if (item.type === 'other-game') {
            return `<div class="trade-item-other">🎮 ${this.escapeHtml(item.game_name)}: ${this.escapeHtml(item.item_name)}</div>`;
        } else {
            return `
                <div class="trade-item">
                    <img class="trade-item-img" src="${item.item_image || './imgs/placeholder.png'}" alt="${this.escapeHtml(item.item_name)}" onerror="this.src='./imgs/placeholder.png'">
                    <span class="trade-item-name">${this.escapeHtml(item.item_name)}</span>
                </div>
            `;
        }
    }

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
        const originalText = btn.textContent;
        btn.disabled = true;
        btn.textContent = 'Creating...';

        try {
            const token = localStorage.getItem('auth_token');
            if (!token) {
                throw new Error('Not authenticated');
            }

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

            this.showToast('Trade listing created successfully!', 'success');
            
            // Reset wizard
            this.wizardState = {
                currentStep: 1,
                seekingItems: [],
                offeringItems: [],
                description: '',
                category: '',
                theme: 'default'
            };
            localStorage.removeItem('trading_wizard_draft');
            
            // Switch to browse view
            document.getElementById('browseView').classList.add('active');
            document.getElementById('createView').classList.remove('active');
            
            // Reload trades
            await this.loadTrades();
            this.renderTrades();
        } catch (error) {
            console.error('Error creating listing:', error);
            this.showToast(error.message || 'Failed to create trade', 'error');
        } finally {
            btn.disabled = false;
            btn.textContent = originalText;
        }
    }

    saveWizardState() {
        localStorage.setItem('trading_wizard_draft', JSON.stringify(this.wizardState));
    }

    generateAutoTitle() {
        const offeringCount = this.wizardState.offeringItems.length;
        const seekingCount = this.wizardState.seekingItems.length;
        
        if (offeringCount === 0) {
            return 'Trade Offer';
        }
        
        const firstOffering = this.wizardState.offeringItems[0];
        let offeringText = '';
        if (firstOffering.type === 'robux') {
            offeringText = `${firstOffering.amount} R$`;
        } else if (firstOffering.type === 'other-game') {
            offeringText = `${firstOffering.game_name} ${firstOffering.item_name}`;
        } else {
            offeringText = firstOffering.item_name;
        }
        
        if (offeringCount > 1) {
            offeringText += ` + ${offeringCount - 1} more`;
        }
        
        if (seekingCount === 0) {
            return `Trading ${offeringText}`;
        }
        
        const firstSeeking = this.wizardState.seekingItems[0];
        let seekingText = '';
        if (firstSeeking.type === 'robux') {
            seekingText = `${firstSeeking.amount} R$`;
        } else if (firstSeeking.type === 'other-game') {
            seekingText = `${firstSeeking.game_name} ${firstSeeking.item_name}`;
        } else {
            seekingText = firstSeeking.item_name;
        }
        
        if (seekingCount > 1) {
            seekingText += ` + ${seekingCount - 1} more`;
        }
        
        return `Trading ${offeringText} for ${seekingText}`;
    }

    loadWizardState() {
        const saved = localStorage.getItem('trading_wizard_draft');
        if (saved) {
            try {
                const state = JSON.parse(saved);
                this.wizardState = { ...this.wizardState, ...state };
                
                // Restore form fields
                if (this.wizardState.description) {
                    document.getElementById('tradeDescription').value = this.wizardState.description;
                }
                if (this.wizardState.category) {
                    document.getElementById('tradeCategory').value = this.wizardState.category;
                }
                
                // Restore items
                this.renderItems('seekingItems');
                this.renderItems('offeringItems');
                
                // Restore theme
                if (this.wizardState.theme) {
                    this.selectTheme(this.wizardState.theme);
                }
            } catch (error) {
                console.error('Failed to load wizard state:', error);
            }
        }
    }

    renderTrades() {
        const grid = document.getElementById('tradesGrid');
        if (!grid) return;

        let filteredTrades = this.trades.filter(trade => {
            if (this.filters.status !== 'all' && trade.status !== this.filters.status) {
                return false;
            }
            if (this.filters.category !== 'all' && trade.category !== this.filters.category) {
                return false;
            }
            if (this.filters.search) {
                const searchTerm = this.filters.search.toLowerCase();
                const matchesTitle = trade.title?.toLowerCase().includes(searchTerm);
                const matchesDescription = trade.description?.toLowerCase().includes(searchTerm);
                if (!matchesTitle && !matchesDescription) {
                    return false;
                }
            }
            return true;
        });

        // Sort
        if (this.filters.sort === 'recent') {
            filteredTrades.sort((a, b) => b.created_at - a.created_at);
        } else if (this.filters.sort === 'views') {
            filteredTrades.sort((a, b) => (b.views || 0) - (a.views || 0));
        }

        if (filteredTrades.length === 0) {
            grid.innerHTML = `
                <div class="empty-state" style="grid-column: 1/-1;">
                    <div class="empty-state-icon">📭</div>
                    <div class="empty-state-title">No Trades Found</div>
                    <div class="empty-state-text">Try adjusting your filters or create a new trade!</div>
                </div>
            `;
            return;
        }

        grid.innerHTML = '';
        filteredTrades.forEach(trade => {
            grid.appendChild(this.createTradeCard(trade));
        });
    }

    createTradeCard(trade) {
        const card = document.createElement('div');
        card.className = 'trade-card';
        
        const timeAgo = this.getTimeAgo(trade.created_at);
        const stars = '★'.repeat(Math.floor(trade.user?.average_rating || 0)) + '☆'.repeat(5 - Math.floor(trade.user?.average_rating || 0));

        card.innerHTML = `
            <div class="trade-card-header">
                <img class="trader-avatar" src="${trade.user?.avatar_url || './imgs/placeholder.png'}" alt="${this.escapeHtml(trade.user?.username || 'Unknown')}" onerror="this.src='./imgs/placeholder.png'">
                <div class="trader-info">
                    <div class="trader-name">${this.escapeHtml(trade.user?.username || 'Unknown')}</div>
                    <div class="trader-stats">${stars} (${trade.user?.total_trades || 0} trades)</div>
                    <div class="trade-meta">${timeAgo} • ${trade.views || 0} views</div>
                </div>
                <span class="trade-status ${trade.status}">${trade.status}</span>
            </div>
            ${trade.description ? `<div class="trade-description">${this.escapeHtml(trade.description)}</div>` : ''}
            <div class="trade-items-container">
                <div class="trade-side">
                    <div class="trade-side-label">Offering</div>
                    <div class="trade-items-list">
                        ${trade.offering_items.map(item => this.renderTradeItem(item)).join('')}
                    </div>
                </div>
                <div class="trade-side">
                    <div class="trade-side-label">Looking For</div>
                    <div class="trade-items-list">
                        ${trade.seeking_items && trade.seeking_items.length > 0 
                            ? trade.seeking_items.map(item => this.renderTradeItem(item)).join('')
                            : '<div style="color: var(--text-secondary);">Open to offers</div>'
                        }
                    </div>
                </div>
            </div>
            <div class="trade-actions">
                <button class="btn-view" onclick="tradingHub.viewTrade(${trade.id})">View Details</button>
                ${this.currentUser && trade.user_id !== this.currentUser.userId ? `<button class="btn-offer" onclick="tradingHub.makeOffer(${trade.id})">Make Offer</button>` : ''}
            </div>
        `;

        return card;
    }

    renderTradeItem(item) {
        if (item.type === 'robux') {
            return `<div class="trade-item-robux">💰 ${item.amount} R$</div>`;
        } else if (item.type === 'other-game') {
            return `<div class="trade-item-other">🎮 ${this.escapeHtml(item.game_name)}: ${this.escapeHtml(item.item_name)}</div>`;
        } else {
            return `
                <div class="trade-item">
                    <img class="trade-item-img" src="${item.item_image || './imgs/placeholder.png'}" alt="${this.escapeHtml(item.item_name)}" onerror="this.src='./imgs/placeholder.png'">
                    <span class="trade-item-name">${this.escapeHtml(item.item_name)}</span>
                </div>
            `;
        }
    }

    async viewTrade(id) {
        // TODO: Implement trade detail view
        console.log('View trade:', id);
    }

    async makeOffer(id) {
        // TODO: Implement make offer functionality
        console.log('Make offer:', id);
    }

    getTimeAgo(timestamp) {
        const seconds = Math.floor((Date.now() - timestamp) / 1000);
        if (seconds < 60) return 'Just now';
        const minutes = Math.floor(seconds / 60);
        if (minutes < 60) return `${minutes} min${minutes > 1 ? 's' : ''} ago`;
        const hours = Math.floor(minutes / 60);
        if (hours < 24) return `${hours} hour${hours > 1 ? 's' : ''} ago`;
        const days = Math.floor(hours / 24);
        if (days < 7) return `${days} day${days > 1 ? 's' : ''} ago`;
        const weeks = Math.floor(days / 7);
        if (weeks < 4) return `${weeks} week${weeks > 1 ? 's' : ''} ago`;
        const months = Math.floor(days / 30);
        if (months < 12) return `${months} month${months > 1 ? 's' : ''} ago`;
        const years = Math.floor(days / 365);
        return `${years} year${years > 1 ? 's' : ''} ago`;
    }

    escapeHtml(text) {
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

// Initialize TradingHub
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
