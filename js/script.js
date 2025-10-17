// ==================== UTILITIES ====================
const Utils = {
    loadFromStorage(key, defaultValue) {
        try {
            const stored = localStorage.getItem(key);
            return stored ? JSON.parse(stored) : defaultValue;
        } catch (e) {
            return defaultValue;
        }
    },

    saveToStorage(key, value) {
        try {
            localStorage.setItem(key, JSON.stringify(value));
        } catch (e) {
            console.error('Failed to save to localStorage:', e);
        }
    },

    formatPrice(price) {
        function parseValue(str) {
            str = str.trim().toLowerCase();
            if (str.endsWith('k')) {
                const num = parseFloat(str.slice(0, -1));
                return isNaN(num) ? null : num * 1000;
            }
            if (str.endsWith('m')) {
                const num = parseFloat(str.slice(0, -1));
                return isNaN(num) ? null : num * 1_000_000;
            }
            const num = parseFloat(str);
            return isNaN(num) ? null : num;
        }

        function formatNum(num) {
            if (num === null || isNaN(num)) return null;
            if (num >= 1_000_000) {
                let val = (num / 1_000_000).toFixed(1);
                val = val.replace(/\.0$/, '');
                return val + 'M';
            } else if (num >= 1000) {
                let val = (num / 1000).toFixed(1);
                val = val.replace(/\.0$/, '');
                return val + 'k';
            }
            return num.toLocaleString();
        }

        const str = String(price);
        const hasPlus = str.includes('+');
        const cleanStr = str.replace('+', '');

        if (cleanStr.includes('-')) {
            const parts = cleanStr.split('-').map(p => {
                const num = parseValue(p);
                return formatNum(num);
            });
            if (parts.every(v => v === null)) return str;
            return parts.map((v, i) => v ?? cleanStr.split('-')[i].trim()).join('-') + (hasPlus ? '+' : '');
        }

        const num = parseValue(cleanStr);
        const formatted = formatNum(num);
        return (formatted ?? str) + (hasPlus ? '+' : '');
    },

    showToast(title, message, type = 'info') {
        if (!document.getElementById('toast-container')) {
            const container = document.createElement('div');
            container.classList.add('toast-container');
            container.id = 'toast-container';
            document.body.appendChild(container);
        }
        const container = document.getElementById('toast-container');
        if (!container) return;

        const toast = document.createElement('div');
        toast.className = `toast ${type}`;

        const icons = {
            error: '<svg style="width: 24px; height: 24px;" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18M6 6l12 12"/></svg>',
            success: '<svg style="width: 24px; height: 24px;" viewBox="0 0 24 24" data-name="Line Color" xmlns="http://www.w3.org/2000/svg"><path style="fill:none;stroke:#fff;stroke-linecap:round;stroke-linejoin:round;stroke-width:2" d="m5 12 5 5 9-9"/></svg>',
            info: '<svg fill="#fff" style="width: 24px; height: 24px;" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M12 10a1 1 0 0 0-1 1v6a1 1 0 0 0 2 0v-6a1 1 0 0 0-1-1m0-4a1.25 1.25 0 1 0 1.25 1.25A1.25 1.25 0 0 0 12 6"/></svg>',
            warning: '<svg style="width: 24px; height: 24px;" fill="#fff" viewBox="0 0 36 36" xmlns="http://www.w3.org/2000/svg"><path d="M30.33 25.54 20.59 7.6a3 3 0 0 0-5.27 0L5.57 25.54A3 3 0 0 0 8.21 30h19.48a3 3 0 0 0 2.64-4.43Zm-13.87-12.8a1.49 1.49 0 0 1 3 0v6.89a1.49 1.49 0 1 1-3 0ZM18 26.25a1.72 1.72 0 1 1 1.72-1.72A1.72 1.72 0 0 1 18 26.25"/><path fill="none" d="M0 0h36v36H0z"/></svg>'
        };

        toast.innerHTML = `
            <div class="toast-icon">${icons[type]}</div>
            <div class="toast-content">
                <div class="toast-title">${title}</div>
                <div class="toast-message">${message}</div>
            </div>
            <button class="toast-close" onclick="this.parentElement.remove()">×</button>
        `;

        container.appendChild(toast);

        // Auto remove after 5 seconds
        setTimeout(() => {
            toast.classList.add('hiding');
            setTimeout(() => toast.remove(), 300);
        }, 5000);
    }
};

// ==================== BASE APP CLASS ====================
class BaseApp {
    constructor() {
        this.items = [];
        this.currentListMode = 'wishlist';
        this.categories = ['gears', 'deaths', 'pets', 'effects', 'titles'];
        this.allItems = [];
        this.searchFuse = null;

        this.modal = new ItemModal(this);
        this.favorites = Utils.loadFromStorage('favorites', []);
        this.wishlist = Utils.loadFromStorage('wishlist', []);
        this.recentlyViewed = Utils.loadFromStorage('recentlyViewed', []);

        this.particleCanvas = document.createElement('canvas');
        this.particleCanvas.id = 'particle-canvas';
        document.body.appendChild(this.particleCanvas);

        this.loadTheme();
        this.particleSystem = new ParticleSystem(this.particleCanvas);
        this.initializeSearch();

        document.body.insertAdjacentHTML('beforeend', `
            
            
            <div id="donation-progress-container" class="donation-progress-container">
        <div class="donation-progress-card">
            <button class="close-donation-progress" onclick="auth.closeDonationProgress()">×</button>

            <div class="donation-progress-header">
                <h3>Support Epic Catalogue</h3>
                <p class="donation-progress-subtitle">Become a Donator and unlock exclusive perks!</p>
            </div>
            <div class="donation-stat">
                <div class="donation-stat-value" id="total-donated">0</div>
                <div class="strike"></div>
                <div class="donation-stat-value">500</div>
                <div class="donation-stat-label">Until Donator</div>
            </div>


            <div class="progress-bar-container">
                <div class="progress-bar" id="donation-progress-bar">
                    <div class="progress-bar-fill"></div>
                    <div class="progress-bar-shine"></div>
                </div>
                <div class="progress-percentage" id="progress-percentage">0%</div>
            </div>

            <div class="donation-perks">
                <h4>🎁 Unlock at <svg style="width: 15px;transform: translateY(2px);margin-left: 4px;"
                        xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16.6 18">
                        <path
                            d="M6.251 6.993v3.999h4.025V6.99Zm-.156-4.689c1.917-1.213 2.507-1.154 4.484.034l3.37 2.027c.648.43 1.255.949 1.157 2.077v4.444c.009 1.578-.127 2.032-1.065 2.656l-3.492 2.052c-2.118 1.195-2.219 1.353-4.55.001l-3.28-1.913c-.886-.562-1.373-1.115-1.315-2.45V6.733c-.025-1.63.458-1.874 1.242-2.405Zm.395 1.298c1.287-.804 1.855-1.088 3.612.034l2.777 1.641c.568.423.954.838.96 1.652v3.952c-.007.705-.271 1.405-.9 1.77l-2.813 1.684c-1.786.942-1.799 1.004-3.127.287l-3.22-1.835c-.658-.474-1.038-.651-1.006-2.009V7.131c.005-1.044.193-1.432.991-1.952ZM5.605.944C7.71-.331 8.871-.345 11.011.985l4.062 2.444c.646.363 1.512 1.515 1.528 2.588v5.847c.003 1.055-.645 2.014-1.424 2.63l-4.178 2.501c-1.843 1.087-3.052 1.56-5.486.002l-3.928-2.348C.71 14.043-.006 13.267 0 11.695V6.272c.033-1.551.668-2.233 1.498-2.899Z"
                            fill="#ffd700" fill-rule="evenodd"></path>
                    </svg> 500:</h4>
                <div class="perk-list">
                    <div class="perk-item">
                        <span class="perk-icon">✨</span>
                        <span>Donator Role Badge</span>
                    </div>
                    <div class="perk-item">
                        <span class="perk-icon">🎨</span>
                        <span>Custom Profile Colors</span>
                    </div>
                    <div class="perk-item">
                        <span class="perk-icon">🏆</span>
                        <span>Public Donators List</span>
                    </div>
                </div>
            </div>

            <button class="donate-now-btn" onclick="auth.joinGame()">
                Donate!
            </button>
        </div>
    </div>

    <!-- Donator Achievement Celebration -->
    <div id="donator-celebration" class="donator-celebration">
        <div class="donator-celebration-card">
            <button class="close-donator-celebration" onclick="auth.closeDonatorCelebration()">×</button>

            <div class="achievement-badge">
                <div class="achievement-glow"></div>
                <div class="achievement-icon">💎</div>
            </div>

            <h2 class="achievement-title">DONATOR UNLOCKED!</h2>
            <p class="achievement-message">Thank you for supporting Epic Catalogue! You've unlocked exclusive features.
            </p>

            <div class="unlocked-features">
                <h3>✨ Your New Perks</h3>
                <div class="feature-grid">
                    <div class="feature-card">
                        <div class="feature-icon">💎</div>
                        <div class="feature-name">Donator Role</div>
                        <div class="feature-desc">Special badge on your profile</div>
                    </div>
                    <div class="feature-card">
                        <div class="feature-icon">🎨</div>
                        <div class="feature-name">Custom Colors</div>
                        <div class="feature-desc">Personalize your profile</div>
                    </div>
                    <div class="feature-card">
                        <div class="feature-icon">🏆</div>
                        <div class="feature-name">Hall of Fame</div>
                        <div class="feature-desc">Featured on donators list</div>
                    </div>
                </div>
            </div>

            <button class="achievement-close-btn" onclick="auth.closeDonatorCelebration()">
                Awesome! 🎉
            </button>
        </div>
    </div>
    <div id="auth-container" style="display: none;">
        <div class="auth-modal">
            <button class="close-auth" onclick="auth.closeModal()">×</button>
            <h2>Link Your <strong>Roblox Account</strong></h2>
            <div id="auth-step-1">
                <p>Click below to generate your unique code</p>

                <button class="auth-btn" onclick="auth.generateCode()">
                    <span>Generate Code</span>

                </button>
                <span class="auth-btn-arrow">
                    <svg viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
                        <path
                            d="M13.025 1l-2.847 2.828 6.176 6.176h-16.354v3.992h16.354l-6.176 6.176 2.847 2.828 10.975-11z" />
                    </svg>
                </span>
            </div>
            <div id="auth-step-2" style="display: none;">
                <p>Your code is:</p>
                <div class="auth-code-container">
                    <div class="auth-code" id="auth-code-display" onclick="auth.copyCode()"></div>
                    <svg class="copy-icon" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                        <path
                            d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z" />
                    </svg>
                </div>
                <p class="auth-instructions">
                    Join the game and enter this code!<br>
                    Code expires in <span id="code-timer">5:00</span>
                </p>
                <div class="auth-actions">
                    <button class="join-game-btn" onclick="auth.joinGame()">
                        <span>Join Game</span>
                    </button>
                </div>
                <p style="font-size: 12px; color: var(--text-secondary); margin-top: 15px;">Checking for verification...
                </p>
            </div>
        </div>
    </div>
            
            
            <div id="stats-dashboard" class="stats-dashboard">
                <div class="stats-content">
                    <div class="stats-header">
                        <h2>My Lists</h2>
                        <span class="close-stats" onclick="catalog.closeStats()">×</span>
                    </div>
                        <div style="display: flex; justify-content: space-between; align-items: center; padding: 0px 10px 7px;">
                            <h3 style="margin: 0; font-size: 23px; font-variant: all-petite-caps; cursor: pointer;"
                                id="wishlist-tab" class="active" onclick="catalog.switchListMode('wishlist')">
                                <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"
                                    style="width:26px;margin-bottom:-7px;">
                                    <path
                                        d="M14 10h-1V9c0-.6-.4-1-1-1s-1 .4-1 1v1h-1c-.6 0-1 .4-1 1s.4 1 1 1h1v1c0 .6.4 1 1 1s1-.4 1-1v-1h1c.6 0 1-.4 1-1s-.4-1-1-1" />
                                    <path
                                        d="M19 3H5c-.6 0-1 .4-1 1s.4 1 1 1v14.1c0 .7.4 1.4 1.1 1.8.3.2.6.2.9.2.4 0 .8-.1 1.1-.3l3.9-2.6 3.9 2.6c.6.4 1.4.5 2.1.1.7-.3 1.1-1 1.1-1.8V5c.6 0 1-.4 1-1s-.5-1-1.1-1m-2 16.1-3.9-2.6c-.3-.2-.7-.3-1.1-.3s-.8.1-1.1.3L7 19.1V5h10z" />
                                </svg> Wishlist
                            </h3>
                            <h3 style="margin: 0; font-size: 23px; font-variant: all-petite-caps; cursor: pointer; opacity: 0.5;"
                                id="favorites-tab" onclick="catalog.switchListMode('favorites')">
                                <svg viewBox="0 0 16 16" style="width:21px;margin-bottom:-4px;"
                                    xmlns="http://www.w3.org/2000/svg">
                                    <path fill-rule="evenodd"
                                        d="M7.247 2.247A4.243 4.243 0 0 0 1.25 8.25L8 15l6.75-6.75a4.243 4.243 0 0 0-5.997-6.003L8 3zM8 12.172l5.336-5.336a2.243 2.243 0 1 0-3.172-3.172L8 5.828 5.836 3.664a2.243 2.243 0 1 0-3.172 3.172z" />
                                </svg> Favorites
                            </h3>
                        </div>
                    <div class="wishlist-section">
                        
                        <div id="wishlist-items" class="catalog-grid"></div>
                        <div class="wishlist-total">
                            <span id="list-mode-label">Wishlist</span> Total Value:
                            <svg style="margin-right: 3px;margin-left: 3px;width: 18px;transform: translateY(4px);"
                                xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16.6 18">
                                <path
                                    d="M6.251 6.993v3.999h4.025V6.99Zm-.156-4.689c1.917-1.213 2.507-1.154 4.484.034l3.37 2.027c.648.43 1.255.949 1.157 2.077v4.444c.009 1.578-.127 2.032-1.065 2.656l-3.492 2.052c-2.118 1.195-2.219 1.353-4.55.001l-3.28-1.913c-.886-.562-1.373-1.115-1.315-2.45V6.733c-.025-1.63.458-1.874 1.242-2.405Zm.395 1.298c1.287-.804 1.855-1.088 3.612.034l2.777 1.641c.568.423.954.838.96 1.652v3.952c-.007.705-.271 1.405-.9 1.77l-2.813 1.684c-1.786.942-1.799 1.004-3.127.287l-3.22-1.835c-.658-.474-1.038-.651-1.006-2.009V7.131c.005-1.044.193-1.432.991-1.952ZM5.605.944C7.71-.331 8.871-.345 11.011.985l4.062 2.444c.646.363 1.512 1.515 1.528 2.588v5.847c.003 1.055-.645 2.014-1.424 2.63l-4.178 2.501c-1.843 1.087-3.052 1.56-5.486.002l-3.928-2.348C.71 14.043-.006 13.267 0 11.695V6.272c.033-1.551.668-2.233 1.498-2.899Z"
                                    fill-rule="evenodd"></path>
                            </svg><span id="wishlist-value"> 0</span>
                        </div>
                    </div>

                    <div class="recent-section">
                        <h3 style="margin-bottom: 15px;font-size: 23px;font-variant: all-petite-caps;"><svg stroke="#fff"
                                viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg" style="width:23px;margin-bottom:-6px;">
                                <path d="M20.59 22 15 16.41V7h2v8.58l5 5.01z"></path>
                                <path d="M16 2A13.94 13.94 0 0 0 6 6.23V2H4v8h8V8H7.08A12 12 0 1 1 4 16H2A14 14 0 1 0 16 2">
                                </path>
                            </svg> Recently Viewed</h3>
                        <div id="recent-viewed-items" class="catalog-grid"></div>
                    </div>
                </div>
            </div>`
        );
        // wait till DOM is ready
        setTimeout(() => this.updateStatsIfOpen(), 1500);
    }

    async loadData() {
        try {
            const res = await fetch('https://emwiki.site/api/gist-version');
            const data = await res.json();
            const parsed = JSON.parse(data.files?.['auto.json']?.content);

            this.categories.forEach(cat => {
                this.items[cat] = parsed[cat] || [];
            });

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

            return this.items;
        } catch (error) {
            console.error('Failed to load data:', error);
            Utils.showToast('Error', 'Failed to load items', 'error');
            return null;
        }
    }

    toggleTheme() {
        document.body.classList.toggle('light-theme');
        const isLight = document.body.classList.contains('light-theme');
        localStorage.setItem('theme', isLight ? 'light' : 'dark');
    }

    loadTheme() {
        const theme = localStorage.getItem('theme') || 'dark';
        if (theme === 'light') {
            document.body.classList.add('light-theme');
        }

        function pickRandom(rarities) {
            // Calculate chances for common
            var filler = 100 - rarities.map(r => r.chance).reduce((sum, current) => sum + current);

            if (filler <= 0) {
                return;
            }

            // Create an array of 100 elements, based on the chances field
            var probability = rarities.map((r, i) => Array(r.chance === 0 ? filler : r.chance).fill(i)).reduce((c, v) => c.concat(v), []);

            // Pick one
            var pIndex = Math.floor(Math.random() * 100);
            var rarity = rarities[probability[pIndex]];

            return rarity.type;
        }

        //if halloween
        const now = new Date();

        var rarities = [{
            type: "https://emwiki.site/imgs/epicfaces/tran.webp",
            chance: 10
        }, {
            type: "https://emwiki.site/imgs/epicfaces/3d.png",
            chance: 2
        }, {
            type: "https://emwiki.site/imgs/epicfaces/Epic_Banana.webp",
            chance: 8
        }, {
            type: "https://emwiki.site/imgs/epicfaces/XRmpB1c.png",
            chance: 0
        }, {
            type: "https://emwiki.site/imgs/burrito.png",
            chance: 3
        }];

        var titleColors = [
            ['#24ff5d', '#ff0']
        ];

        if (now.getMonth() === 9) { // if october

            rarities = [{
                type: "https://emwiki.site/imgs/epicfaces/kitta.png",
                chance: 15
            }, {
                type: "https://emwiki.site/imgs/epicfaces/devlil.png",
                chance: 15
            }, {
                type: "https://emwiki.site/imgs/epicfaces/Ghost_Epic_Face.webp",
                chance: 15
            }, {
                type: "https://emwiki.site/imgs/epicfaces/pmupkin.png",
                chance: 0
            }, {
                type: "https://emwiki.site/imgs/epicfaces/Uncanny_Epic_Face.webp",
                chance: 3
            }];


            titleColors = [
                ['#ff7518', '#000000']
            ];

        } else if (now.getMonth() === 11) { // if december

            rarities = [{
                type: "https://emwiki.site/imgs/epicfaces/xmas.png",
                chance: 20
            }, {
                type: "https://emwiki.site/imgs/epicfaces/rudolf.png",
                chance: 20
            }, {
                type: "https://emwiki.site/imgs/epicfaces/santa.png",
                chance: 0
            }];

            titleColors = [
                ['red', 'white']
            ];

        }

        // Get the gradient stops by their IDs
        const grad1Stops = document.querySelectorAll('#eppp1 stop');
        const grad2Stops = document.querySelectorAll('#eppp2 stop');

        // Update gradient 1
        grad1Stops[0].setAttribute('style', `stop-color: ${titleColors[0][1]}`);
        grad1Stops[1].setAttribute('style', `stop-color: ${titleColors[0][0]}`);

        // Update gradient 2
        grad2Stops[0].setAttribute('style', `stop-color: ${titleColors[0][1]}`);
        grad2Stops[1].setAttribute('style', `stop-color: ${titleColors[0][0]}`);

        document.getElementById('epic-image').setAttribute('href', pickRandom(rarities));
    }

    getItemCategory(item) {
        return item.category || this.categories.find(cat =>
            this.items[cat]?.includes(item)
        );
    }

    createItemElement(item) {
        const div = document.createElement('div');
        div.className = 'item';
        this.modal.displayed.push(item);

        const categoryColors = {
            gears: 'gear',
            deaths: 'death',
            pets: 'pet',
            effects: 'effect',
            titles: 'title'
        };

        const category = this.getItemCategory(item);
        if (category) {
            //div.style.background = `linear-gradient(135deg, ${categoryColors[category]}20, ${categoryColors[category]}10)`;
            //div.style.borderColor = categoryColors[category] + '40';
            div.id = categoryColors[category] || '';
        }

        // Name
        const name = document.createElement('div');
        name.className = 'item-name';
        name.textContent = item.name;
        div.appendChild(name);

        // Image/SVG
        if (item.img) {
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            const img = new Image();
            img.onload = function () {
                canvas.width = img.width;
                canvas.height = img.height;
                ctx.drawImage(img, 0, 0);
            };
            img.src = item.img;
            div.appendChild(canvas);
        } else if (item.svg) {
            div.insertAdjacentHTML('beforeend', item.svg);
        }



        // Price
        const price = document.createElement('div');
        price.className = 'item-price';
        price.textContent = Utils.formatPrice(item.price);
        div.appendChild(price);

        if (item.price == '0') {
            price.style.opacity = '0';
            price.style.height = '16px';

        }

        // Badges
        // Badges
        this.addBadges(div, item);


        const wishlistBtn = document.createElement('div');
        wishlistBtn.className = 'wishlist-button';
        wishlistBtn.textContent = '⭐';
        if (this.wishlist.includes(item.name)) {
            wishlistBtn.classList.add('active');
        }
        wishlistBtn.onclick = (e) => {
            e.stopPropagation();
            this.toggleWishlist(item.name);
            wishlistBtn.classList.toggle('active');
        };
        wishlistBtn.title = 'Add to Wishlist';
        div.appendChild(wishlistBtn);


        const heart = document.createElement('div');
        heart.className = 'heart-button';
        const isFavorite = this.favorites.includes(item.name);
        heart.textContent = isFavorite ? '❤️' : '🤍';
        if (isFavorite) heart.classList.add('red');
        heart.onclick = (e) => {
            e.stopPropagation();
            const rect = heart.getBoundingClientRect();
            const wasFavorite = heart.classList.contains('red');
            this.toggleFavorite(item.name);
            heart.textContent = !wasFavorite ? '❤️' : '🤍';
            heart.classList.toggle('red');
            if (!wasFavorite && this.particleSystem) {
                this.particleSystem.createParticles(rect.left + rect.width / 2, rect.top + rect.height / 2);
            }
        };
        heart.title = 'Add to Favorites';
        div.appendChild(heart);

        div.onclick = () => this.modal.open(item);

        return div;
    }

    addBadges(element, item) {
        if (item.premium) {
            const badge = document.createElement('img');
            badge.className = 'badge premium';
            badge.src = './imgs/prem.png';
            badge.title = 'Roblox Premium';
            element.appendChild(badge);
        }

        if (item.removed) {
            const badge = document.createElement('div');
            badge.className = 'badge removed';
            badge.innerText = 'Removed';
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
            badge.src = './imgs/new.png';
            badge.className = 'badge new';
            element.appendChild(badge);
        }

        if (item.retired) {
            const badge = document.createElement('span');
            badge.className = 'badge retired';
            badge.textContent = 'RETIRED';
            element.appendChild(badge);
        }
    }

    initializeSearch() {
        const searchBar = document.getElementById('search-bar');
        const searchResults = document.getElementById('search-results');
        if (!searchBar || !searchResults) return;

        // Initialize Fuse.js
        this.searchFuse = new Fuse(this.allItems, {
            keys: ['name'],
            threshold: 0.3
        });

        searchBar.addEventListener('input', (e) => {
            const query = e.target.value.trim();
            if (!query) {
                searchResults.style.display = 'none';
                return;
            }

            const results = this.searchFuse.search(query).slice(0, 6);
            this.displaySearchResults(results);
        });

        document.addEventListener('click', (e) => {
            if (!searchBar.contains(e.target) && !searchResults.contains(e.target)) {
                searchResults.style.display = 'none';
            }
        });
    }

    displaySearchResults(results) {
        const searchResults = document.getElementById('search-results');
        searchResults.innerHTML = '';

        if (results.length === 0) {
            searchResults.style.display = 'none';
            return;
        }

        results.forEach(result => {
            const item = result.item;
            const div = document.createElement('div');
            div.className = 'search-result-item';
            div.style.padding = '12px';
            div.style.cursor = 'pointer';
            div.style.borderBottom = '1px solid var(--border-color)';
            div.textContent = item.name;
            div.onclick = () => {
                this.modal.open(item);
                searchResults.style.display = 'none';
            };
            searchResults.appendChild(div);
        });

        searchResults.style.display = 'block';
    }

    toggleFavorite(name) {
        const index = this.favorites.indexOf(name);
        if (index > -1) {
            this.favorites.splice(index, 1);
        } else {
            this.favorites.push(name);
        }
        Utils.saveToStorage('favorites', this.favorites);
        this.updateStatsIfOpen(); // Add this line
    }

    toggleWishlist(name) {
        const index = this.wishlist.indexOf(name);
        if (index > -1) {
            this.wishlist.splice(index, 1);
        } else {
            this.wishlist.push(name);
        }
        Utils.saveToStorage('wishlist', this.wishlist);
        this.updateStatsIfOpen();
    }

    showRecentItems() {
        if (this.recentlyViewed.length === 0) return;

        const recentDiv = document.getElementById('recent-items');
        recentDiv.innerHTML = '';

        const recent = this.recentlyViewed.slice(0, 5);
        recent.forEach(itemName => {
            const item = this.items.find(i => i.name === itemName);
            if (item) {
                const div = document.createElement('div');
                div.className = 'recent-item';
                div.innerHTML = `
                            ${item.img ? `<img src="${item.img}" alt="${item.name}">` : '<div style="width:30px;height:30px;background:#666;border-radius:5px;"></div>'}
                            <span>${item.name}</span>
                        `;
                div.onclick = () => {
                    document.getElementById('search-bar').value = item.name;
                    this.filters.search = item.name.toLowerCase();
                    this.applyFilters();
                    recentDiv.classList.remove('show');
                };
                recentDiv.appendChild(div);
            }
        });

        recentDiv.classList.add('show');
    }

    addToRecentlyViewed(name) {
        const index = this.recentlyViewed.indexOf(name);
        if (index > -1) {
            this.recentlyViewed.splice(index, 1);
        }
        this.recentlyViewed.unshift(name);
        this.recentlyViewed = this.recentlyViewed.slice(0, 5); // Keep last 4
        Utils.saveToStorage('recentlyViewed', this.recentlyViewed);
    }

    openStats() {
        document.getElementById('stats-dashboard').classList.add('show');
        this.updateStatsIfOpen();
        document.getElementById('profile-dropdown').classList.remove('show');

    }

    closeStats() {
        document.getElementById('stats-dashboard').classList.remove('show');
    }

    switchListMode(mode) {
        this.currentListMode = mode;

        // Update tab styling
        const wishlistTab = document.getElementById('wishlist-tab');
        const favoritesTab = document.getElementById('favorites-tab');
        const listLabel = document.getElementById('list-mode-label');

        if (mode === 'wishlist') {
            favoritesTab.classList.remove('active');
            wishlistTab.classList.add('active');
            listLabel.textContent = 'Wishlist';
        } else {
            wishlistTab.classList.remove('active');
            favoritesTab.classList.add('active');
            listLabel.textContent = 'Favorites';
        }

        this.updateStatsIfOpen();
    }

    updateStatsIfOpen() {
        if (!document.getElementById('stats-dashboard').classList.contains('show')) return;

        // Update wishlist or favorites based on mode
        const wishlistDiv = document.getElementById('wishlist-items');
        wishlistDiv.innerHTML = '';
        let totalValue = 0;

        const itemsToShow = this.currentListMode === 'wishlist' ? this.wishlist : this.favorites;
        itemsToShow.forEach(itemName => {
            const item = this.items.find(i => i.name === itemName);
            if (item) {
                console.log('Processing item:', item);
                const div = document.createElement('div');
                div.className = 'item';
                div.innerHTML = `
                    <div class="item-name">${item.name}</div>
                    
                    <div class="remove-wishlist">×</div>
                `;

                if (item.img) {
                    const canvas = document.createElement('canvas');

                    const ctx = canvas.getContext('2d');
                    const img = new Image();
                    img.onload = function () {
                        canvas.width = img.width;
                        canvas.height = img.height;
                        ctx.drawImage(img, 0, 0);
                    };
                    img.src = item.img;
                    div.appendChild(canvas);
                } else if (item.svg) {
                    div.insertAdjacentHTML('beforeend', item.svg);
                }

                div.insertAdjacentHTML('beforeend', `${item.price != '0' && item.price != '' ? `<div class="item-price">${Utils.formatPrice(item.price)}</div>` : ''}`);

                div.querySelector('.remove-wishlist').onclick = (e) => {
                    e.stopPropagation();
                    if (this.currentListMode === 'wishlist') {
                        this.toggleWishlist(item.name);
                    } else {
                        this.toggleFavorite(item.name);
                    }
                };
                div.onclick = () => {
                    this.modal.open(item);
                };
                wishlistDiv.appendChild(div);

                if (item.price !== '0') {
                    totalValue += parseInt(item.price) || 0;
                }
            }
        });

        document.getElementById('wishlist-value').textContent = Utils.formatPrice(totalValue);

        // Update recently viewed
        const recentDiv = document.getElementById('recent-viewed-items');
        recentDiv.innerHTML = '';

        this.recentlyViewed.slice(0, 5).forEach(itemName => {
            const item = this.items.find(i => i.name === itemName);
            if (item) {
                const div = document.createElement('div');
                div.className = 'item';
                div.innerHTML = `<div class="item-name" style="z-index:2;font-size:10px;margin-top:5px;">${item.name}</div>`;
                if (item.img) {
                    const canvas = document.createElement('canvas');

                    const ctx = canvas.getContext('2d');
                    const img = new Image();
                    img.onload = function () {
                        canvas.width = img.width;
                        canvas.height = img.height;
                        ctx.drawImage(img, 0, 0);
                    };

                    img.src = item.img;

                    div.appendChild(canvas);
                } else if (item.svg) {
                    div.insertAdjacentHTML('beforeend', item.svg);
                }

                div.insertAdjacentHTML('beforeend', `${item.price != '0' && item.price != '' ? `<div class="item-price">${Utils.formatPrice(item.price)}</div>` : ''}`);


                div.onclick = () => {
                    this.modal.open(item);
                };
                recentDiv.appendChild(div);
            }
        });
    }

}

// ==================== PARTICLE SYSTEM ====================
class ParticleSystem {
    constructor(canvas) {
        this.canvas = canvas;

        if (!this.canvas) return;

        this.ctx = this.canvas.getContext('2d');
        this.particles = [];
        this.setupCanvas();
        this.animate();
    }

    setupCanvas() {
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;
        window.addEventListener('resize', () => {
            this.canvas.width = window.innerWidth;
            this.canvas.height = window.innerHeight;
        });
    }

    createParticles(x, y, colors = ['#ff0000', '#ff4444', '#ff8888', '#ffaaaa']) {
        for (let i = 0; i < 20; i++) {
            this.particles.push({
                x: x,
                y: y,
                vx: (Math.random() - 0.5) * 8,
                vy: (Math.random() - 0.5) * 8,
                size: Math.random() * 3 + 2,
                color: colors[Math.floor(Math.random() * colors.length)],
                life: 1.0
            });
        }
    }

    animate() {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        for (let i = this.particles.length - 1; i >= 0; i--) {
            const p = this.particles[i];

            p.x += p.vx;
            p.y += p.vy;
            p.vy -= 0.3;
            p.life -= 0.03;

            if (p.life <= 0) {
                this.particles.splice(i, 1);
                continue;
            }

            this.ctx.globalAlpha = p.life;
            this.ctx.fillStyle = p.color;
            this.ctx.fillRect(p.x, p.y, p.size, p.size);
        }

        requestAnimationFrame(() => this.animate());
    }
}

// ==================== PRICE GRAPH ====================
const PriceGraph = {
    createGraph(priceHistory, canvasId) {
        if (!priceHistory || priceHistory.length < 2) return null;

        const canvas = document.createElement('canvas');
        canvas.id = canvasId;
        canvas.style.cssText = 'width: 100%; height: 200px;';

        requestAnimationFrame(() => {
            const ctx = canvas.getContext('2d');

            new Chart(ctx, {
                type: 'line',
                data: {
                    labels: priceHistory.map(h => new Date(h.timestamp)),
                    datasets: [{
                        label: 'Price',
                        data: priceHistory.map(h => h.price),
                        borderColor: '#3b82f6',
                        backgroundColor: 'rgba(59, 130, 246, 0.1)',
                        borderWidth: 3,
                        tension: 0.4,
                        fill: true,
                        pointRadius: 5,
                        pointHoverRadius: 7,
                        pointBackgroundColor: '#3b82f6',
                        pointBorderColor: '#fff',
                        pointBorderWidth: 2,
                        pointHoverBackgroundColor: '#fff',
                        pointHoverBorderColor: '#3b82f6'
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: { display: false },
                        tooltip: {
                            backgroundColor: 'rgba(0, 0, 0, 0.8)',
                            padding: 12,
                            titleColor: '#fff',
                            bodyColor: '#fff',
                            displayColors: false,
                            callbacks: {
                                title: (items) => {
                                    const date = new Date(items[0].parsed.x);
                                    return date.toLocaleDateString('en-US', {
                                        month: 'short',
                                        day: 'numeric',
                                        year: 'numeric'
                                    });
                                },
                                label: (context) => {
                                    const item = priceHistory[context.dataIndex];
                                    return [
                                        `Price: ${Utils.formatPrice(item.price)}`,
                                        item.admin ? `Changed by: ${item.admin}` : ''
                                    ].filter(Boolean);
                                }
                            }
                        }
                    },
                    scales: {
                        x: {
                            type: 'time',
                            time: {
                                unit: 'day',
                                displayFormats: { day: 'MMM d' }
                            },
                            grid: { color: 'rgba(255, 255, 255, 0.1)' },
                            ticks: { color: 'rgba(255, 255, 255, 0.7)' }
                        },
                        y: {
                            beginAtZero: true,
                            grid: { color: 'rgba(255, 255, 255, 0.1)' },
                            ticks: {
                                color: 'rgba(255, 255, 255, 0.7)',
                                callback: (value) => Utils.formatPrice(value)
                            }
                        }
                    },
                    interaction: {
                        intersect: false,
                        mode: 'index'
                    }
                }
            });
        });

        return canvas;
    }
};

class ItemModal {
    constructor(catalog) {
        this.catalog = catalog;
        this.isOpen = false;
        this.currentItem = null;
        this.currentIndex = -1;

        this.displayed = [];
        this.elements = {};
        this.init();
    }

    init() {
        this.createModal();
        this.setupEventListeners();
    }

    createModal() {
        // Create modal HTML
        const modalHTML = `
        <div id="item-modal" class="item-modal">
            <div class="modal-overlay"></div>
            <button class="modal-nav modal-prev">‹</button>
            <button class="modal-nav modal-next">›</button>
            <div class="modal-container">
                <div class="modal-content-wrapper">
                    <!-- Front Side -->
                    <div class="modal-content modal-front">
                        <div class="modal-header">
                            <h2 class="modal-title"></h2>
                            <div class="modal-price"></div>
                        </div>

                        <canvas class="modal-image" style="display:none;"></canvas>
                        <div class="modal-svg" style="display:none;"></div>

                        <div class="modal-description"></div>
                        
                        <div class="modal-details"></div>
                        
                        <div class="modal-badges">
                            <span class="badge-premium" style="display:none;">Premium</span>
                            <span class="badge-retired" style="display:none;">Retired</span>
                            <span class="badge-removed" style="display:none;">Removed</span>
                            <span class="badge-untradable" style="display:none;">Untradable</span>
                        </div>
                    </div>

                    <!-- Back Side (Graph & Metadata) -->
                    <div class="modal-content modal-back" style="display:none;">
                        <div class="modal-back-header">
                            <h3>Additional Info</h3>
                        </div>
                        
                        <div class="modal-graph-section" style="display:none;">
                            <h4>Price History</h4>
                            <div class="modal-graph-container"></div>
                            <div class="modal-last-admin"></div>
                        </div>
                        
                        <div class="modal-metadata-section" style="display:none;">
                            <div class="metadata-item" id="modal-aliases" style="display:none;">
                                <strong>Aliases:</strong> <span></span>
                            </div>
                            <div class="metadata-item" id="modal-quantity" style="display:none;">
                                <strong>Quantity Given:</strong> <span></span>
                            </div>
                            <div class="metadata-item" id="modal-author" style="display:none;">
                                <strong>Author:</strong> <span></span>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Flip Button (only shown when back content exists) -->
                <button class="modal-flip-btn" style="display:none;">
                    <span class="flip-icon">⟲</span>
                    <span class="flip-text">More Info</span>
                </button>
            </div>
        </div>
    `;

        document.body.insertAdjacentHTML('beforeend', modalHTML);

        // Cache elements
        this.elements = {
            modal: document.getElementById('item-modal'),
            overlay: document.querySelector('.modal-overlay'),
            container: document.querySelector('.modal-container'),
            contentWrapper: document.querySelector('.modal-content-wrapper'),
            frontContent: document.querySelector('.modal-front'),
            backContent: document.querySelector('.modal-back'),
            title: document.querySelector('.modal-title'),
            price: document.querySelector('.modal-price'),
            image: document.querySelector('.modal-image'),
            svg: document.querySelector('.modal-svg'),
            description: document.querySelector('.modal-description'),
            details: document.querySelector('.modal-details'),
            flipBtn: document.querySelector('.modal-flip-btn'),
            prevBtn: document.querySelector('.modal-prev'),
            nextBtn: document.querySelector('.modal-next'),
            graphSection: document.querySelector('.modal-graph-section'),
            graphContainer: document.querySelector('.modal-graph-container'),
            lastAdmin: document.querySelector('.modal-last-admin'),
            metadataSection: document.querySelector('.modal-metadata-section'),
            badges: {
                premium: document.querySelector('.badge-premium'),
                retired: document.querySelector('.badge-retired'),
                removed: document.querySelector('.badge-removed'),
                untradable: document.querySelector('.badge-untradable')
            }
        };
    }

    setupEventListeners() {
        // Close events
        this.elements.overlay.addEventListener('click', () => this.close());

        // Navigation
        this.elements.prevBtn.addEventListener('click', () => this.navigate(-1));
        this.elements.nextBtn.addEventListener('click', () => this.navigate(1));

        // Flip button
        this.elements.flipBtn.addEventListener('click', () => {
            const isFlipped = this.elements.contentWrapper.classList.toggle('flipped');
            this.updateFlipButton(isFlipped);
        });

        // Keyboard
        document.addEventListener('keydown', (e) => {
            if (!this.isOpen) return;

            switch (e.key) {
                case 'Escape': this.close(); break;
                case 'ArrowLeft': this.navigate(-1); break;
                case 'ArrowRight': this.navigate(1); break;
            }
        });

        // Touch gestures
        let touchStartX = 0;

        this.elements.container.addEventListener('touchstart', (e) => {
            touchStartX = e.touches[0].clientX;
        });

        this.elements.container.addEventListener('touchend', (e) => {
            const touchEndX = e.changedTouches[0].clientX;
            const diff = touchStartX - touchEndX;

            if (Math.abs(diff) > 50) {
                this.navigate(diff > 0 ? 1 : -1);
            }
        });
    }

    open(item) {
        this.currentItem = item;
        this.currentIndex = this.displayed.findIndex(i => i.name === item.name);

        // Update content
        this.updateContent(item);

        // Check if item has back content
        const hasHistory = item.priceHistory && item.priceHistory.length >= 2;
        const hasMetadata = item.aliases || item.quantity || item.author;
        const hasBackContent = hasHistory || hasMetadata;

        // Show/hide flip button
        this.elements.flipBtn.style.display = hasBackContent ? 'flex' : 'none';

        // Update back content if exists
        if (hasBackContent) {
            this.updateBackContent(item);
        }

        // Reset to front side
        this.elements.contentWrapper.classList.remove('flipped');
        this.updateFlipButton(false);

        // Show modal
        this.elements.modal.classList.add('active');
        this.isOpen = true;
        document.body.style.overflow = 'hidden';

        // Update URL
        this.updateURL(item.name);

        // Update navigation buttons
        this.updateNavButtons();

        // Add to recently viewed
        this.catalog.addToRecentlyViewed(item.name);
        this.catalog.updateStatsIfOpen();
    }

    updateBackContent(item) {
        const hasHistory = item.priceHistory && item.priceHistory.length >= 2;
        const hasMetadata = item.aliases || item.quantity || item.author;

        // Update graph section
        if (hasHistory) {
            this.elements.graphSection.style.display = 'block';
            this.elements.graphContainer.innerHTML = '';

            const graph = PriceGraph.createGraph(item.priceHistory, `graph-${Date.now()}`);
            if (graph) {
                this.elements.graphContainer.appendChild(graph);
            }

            // Show last admin
            const lastChange = item.priceHistory[item.priceHistory.length - 1];
            if (lastChange.admin) {
                this.elements.lastAdmin.textContent = `Last updated by ${lastChange.admin}`;
                this.elements.lastAdmin.style.display = 'block';
            } else {
                this.elements.lastAdmin.style.display = 'none';
            }
        } else {
            this.elements.graphSection.style.display = 'none';
        }

        // Update metadata section
        if (hasMetadata) {
            this.elements.metadataSection.style.display = 'block';

            const aliasesEl = document.getElementById('modal-aliases');
            const quantityEl = document.getElementById('modal-quantity');
            const authorEl = document.getElementById('modal-author');

            if (item.aliases) {
                aliasesEl.style.display = 'block';
                aliasesEl.querySelector('span').textContent = item.aliases;
            } else {
                aliasesEl.style.display = 'none';
            }

            if (item.quantity) {
                quantityEl.style.display = 'block';
                quantityEl.querySelector('span').textContent = item.quantity;
            } else {
                quantityEl.style.display = 'none';
            }

            if (item.author) {
                authorEl.style.display = 'block';
                authorEl.querySelector('span').textContent = item.author;
            } else {
                authorEl.style.display = 'none';
            }
        } else {
            this.elements.metadataSection.style.display = 'none';
        }
    }

    updateFlipButton(isFlipped) {
        const flipText = this.elements.flipBtn.querySelector('.flip-text');
        const flipIcon = this.elements.flipBtn.querySelector('.flip-icon');

        if (isFlipped) {
            flipText.textContent = 'Back';
            flipIcon.style.transform = 'scaleX(-1)';
        } else {
            flipText.textContent = 'More Info';
            flipIcon.style.transform = 'scaleX(1)';
        }
    }

    updateContent(item) {
        // Basic info
        this.elements.title.textContent = item.name;
        this.elements.description.innerHTML = item.from || '';

        // Price
        if (item.price !== '0') {
            this.elements.price.innerHTML = `
                    <img src="./imgs/rap.png" alt="RAP">
                    ${Utils.formatPrice(item.price)}
                `;
            this.elements.price.style.display = 'flex';
        } else {
            this.elements.price.style.display = 'none';
        }

        // Image/SVG
        if (item.img) {
            const ctx = this.elements.image.getContext('2d');
            const img = new Image();
            img.onload = function () {
                this.elements.image.width = img.width;
                this.elements.image.height = img.height;
                ctx.drawImage(img, 0, 0);
            }.bind(this);
            img.src = item.img;

            this.elements.image.style.display = 'block';
            this.elements.svg.style.display = 'none';
            this.elements.title.style.opacity = 'unset';
        } else if (item.svg) {
            this.elements.svg.outerHTML = item.svg;
            this.elements.svg = this.elements.container.querySelector('svg');
            this.elements.svg.classList.add('modal-svg');
            this.elements.svg.style.display = 'unset';
            this.elements.image.style.display = 'none';
            this.elements.title.style.opacity = '0';

        } else {
            this.elements.image.style.display = 'none';
            this.elements.svg.style.display = 'none';
        }

        // Additional details
        if (item['price/code/rarity']) {
            const details = item['price/code/rarity'].split('<br>').filter(Boolean);
            const appendedDetails = new Set();
            this.elements.details.innerHTML = details.map(detail => {
                if (appendedDetails.has(detail)) return '';
                appendedDetails.add(detail);
                return this.formatDetail(detail);
            }).join('');
        } else {
            this.elements.details.innerHTML = '';
        }

        // Badges
        this.elements.badges.premium.style.display = item.premium ? 'inline-block' : 'none';
        this.elements.badges.retired.style.display = item.retired ? 'inline-block' : 'none';
        this.elements.badges.removed.style.display = item.removed ? 'inline-block' : 'none';
        this.elements.badges.untradable.style.display = !item.tradable ? 'inline-block' : 'none';

        // Set theme color based on category
        const colors = {
            gears: '#37cd44',
            deaths: '#dd592e',
            titles: '#9a2dd1',
            pets: '#2766dd',
            effects: '#f3a425'
        };

        this.elements.container.style.backgroundColor = colors[item.category] || '#333';
    }

    formatDetail(detail) {
        // Check if it's a URL first
        const urlPattern = /https?:\/\/[^\s]+/;
        if (urlPattern.test(detail)) {
            const url = detail.match(urlPattern)[0];
            const isRoblox = url.includes('roblox.com');

            return `
            <a href="${url}" target="_blank" class="detail-link-btn">
                <span>${isRoblox ? 'Visit' : 'Open Link'}</span>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M19 19H5V5h7V3H5c-1.11 0-2 .9-2 2v14c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2v-7h-2v7zM14 3v2h3.59l-9.83 9.83 1.41 1.41L19 6.41V10h2V3h-7z"/>
                </svg>
            </a>
        `;
        }

        // Add icons for special currencies
        const icons = {
            unobtainable: "./imgs/Red_x.png",
            robux: "./imgs/cf8ZvY7.png",
            coins: "./imgs/Coin.webp",
            stars: "./imgs/WKeX5AS.png",
            visors: "./imgs/7IoLZCN.png",
            pumpkins: "./imgs/bHRBTrU.png",
            eggs: "./imgs/qMxjgQy.png",
            opals: "./imgs/wwMMAvr.png",
            baubles: "./imgs/bauble.png",
            tokens: "./imgs/Cy9r140.png"
        };
        const styles = {
            unobtainable: "filter: saturate(0) brightness(4.5);font-family: 'BuilderSans';color: #3d3d3d;",
            '%': "color: #f06bff;text-shadow: 0 0 4px #ab00ff;",
            rank: "font-variant: all-small-caps; font-weight: 600; color: #ffd700; text-shadow: 0 0 3px #ffae00;",
            expired: "font-weight: bold;color: red;font-family: inconsolata;",
            active: "font-weight: bold;color: #45ff45;font-family: inconsolata;",
            robux: "font: 1000 17px 'buildersans'",
            tokens: "text-shadow: -1.3px -1.3px 0 #ff00e7, 0 -1.3px 0 #ff00e7, 1.3px -1.3px 0 #ff00e7, 1.3px 0 0 #ff00e7, 1.3px 1.3px 0 #ff00e7, 0 1.3px 0 #ff00e7, -1.3px 1.3px 0 #ff00e7, -1.3px 0 0 #ff00e7"
        };
        const matchedKey = Object.keys(styles).find(key =>
            detail.toLowerCase().includes(key.toLowerCase())
        );

        let formatted = `<div class="detail-item" style="${matchedKey ? styles[matchedKey] : ''}">${detail}</div>`;

        Object.entries(icons).forEach(([key, src]) => {
            if (detail.toLowerCase().includes(key)) {
                formatted = `<div class="detail-item" style="${key in styles ? styles[key] : ''}"> <img src="${src}" title="${key.charAt(0).toUpperCase() + key.slice(1)}" class="detail-icon"> ${/\d+(?!\%)/.test(detail) ? detail.replace(new RegExp(key, 'i'), '').trim() : detail}</div>`;
            }
        });

        return formatted;
    }

    navigate(direction) {
        const newIndex = this.currentIndex + direction;

        if (newIndex >= 0 && newIndex < this.displayed.length) {
            this.currentIndex = newIndex;
            this.currentItem = this.displayed[newIndex];

            // Animate transition
            this.elements.container.classList.add('transitioning');

            setTimeout(() => {
                this.updateContent(this.currentItem);
                this.updateNavButtons();
                this.updateURL(this.currentItem.name);
                this.catalog.addToRecentlyViewed(this.currentItem.name);
                this.elements.container.classList.remove('transitioning');
            }, 150);
        }
    }

    updateNavButtons() {
        this.elements.prevBtn.disabled = this.currentIndex <= 0;
        this.elements.nextBtn.disabled = this.currentIndex >= this.displayed.length - 1;
    }

    updateURL(itemName) {
        const slug = itemName.toLowerCase().replace(/\s+/g, '-');
        const url = new URL(window.location);
        url.searchParams.set('item', slug);
        history.pushState(null, '', url.toString());
    }

    close() {
        this.elements.modal.classList.remove('active');
        this.isOpen = false;
        document.body.style.overflow = '';

        // Clear URL
        const url = new URL(window.location);
        url.searchParams.delete('item');
        history.pushState(null, '', url.toString());
    }
}

// ==================== COUNTDOWN SYSTEM ====================
class CountdownManager {
    constructor() {
        this.countdowns = [];
    }

    add(elementId) {
        this.countdowns.push(elementId);
    }

    start() {
        const updateCountdowns = () => {
            const now = new Date();
            const nextReset = new Date();
            nextReset.setDate(nextReset.getDate() + (7 - nextReset.getDay()));
            nextReset.setHours(0, 0, 0, 0);

            const diff = nextReset - now;
            const days = Math.floor(diff / (1000 * 60 * 60 * 24));
            const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
            const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
            const seconds = Math.floor((diff % (1000 * 60)) / 1000);

            const timeString = `${days}d ${hours}h ${minutes}m ${seconds}s`;

            this.countdowns.forEach(id => {
                const el = document.getElementById(id);
                if (el) el.textContent = timeString;
            });
        };

        updateCountdowns();
        setInterval(updateCountdowns, 1000);
    }
}

// Export for use in both pages
if (typeof window !== 'undefined') {
    window.Utils = Utils;
    window.BaseApp = BaseApp;
    window.PriceGraph = PriceGraph;
    window.CountdownManager = CountdownManager;
}