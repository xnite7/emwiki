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

    async saveToAccount(key, value) {
        const token = localStorage.getItem('auth_token');
        if (!token) return false;

        try {
            const response = await fetch('https://emwiki.com/api/auth/user/preferences', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ [key]: value })
            });
            return response.ok;
        } catch (error) {
            console.error('Failed to save to account:', error);
            return false;
        }
    },

    async loadFromAccount(key, defaultValue) {
        const token = localStorage.getItem('auth_token');
        if (!token) return defaultValue;

        try {
            const response = await fetch(`https://emwiki.com/api/auth/user/preferences?key=${key}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (response.ok) {
                const data = await response.json();
                return data[key] !== undefined ? data[key] : defaultValue;
            }
        } catch (error) {
            console.error('Failed to load from account:', error);
        }

        return defaultValue;
    },

    async migrateToAccount() {
        const token = localStorage.getItem('auth_token');
        if (!token) return;
        const localData = {
            favorites: Utils.loadFromStorage('favorites', []),
            wishlist: Utils.loadFromStorage('wishlist', [])
        };
        const onlineData = {
            favorites: Utils.loadFromAccount('favorites', []),
            wishlist: Utils.loadFromAccount('wishlist', [])
        };
        const hasData = localData.favorites.length > 0 ||
            localData.wishlist.length > 0;
        if (!hasData) return;
        const hasData2 = onlineData.favorites.length > 0 ||
            onlineData.wishlist.length > 0;
        if (hasData2) return;
        try {
            const response = await fetch('https://emwiki.com/api/auth/user/preferences/migrate', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(localData)
            });
            if (response.ok) {
                // Clear localStorage after successful migration
                localStorage.removeItem('favorites');
                localStorage.removeItem('wishlist');
                Utils.showToast('Data Synced', 'Your preferences have been synced to your account!', 'success');
                return true;
            }
        } catch (error) {
            console.error('Failed to migrate data:', error);
        }
        return false;
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
        const cleanStr = str.replace('+', '').trim();

        // CRITICAL: Check for range FIRST before any other processing
        // Use a more specific regex to detect actual ranges (number-number)
        if (/\d+\s*-\s*\d+/.test(cleanStr)) {
            const parts = cleanStr.split('-');
            const formattedParts = parts.map(p => {
                const num = parseValue(p.trim());
                return formatNum(num);
            });
            if (formattedParts.every(v => v !== null)) {
                return formattedParts.join('-') + (hasPlus ? '+' : '');
            }
        }

        // Single value
        const num = parseValue(cleanStr);
        const formatted = formatNum(num);
        return (formatted ?? str) + (hasPlus ? '+' : '');
    },

    showToast(title, message, type = 'info') {
        const container = document.getElementById('toast-container');
        if (!container) return;
        container.hidePopover();
        container.showPopover();

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
        this.domCache = {
            searchBar: null,
            searchResults: null,
            catalog: null
        };

        this.currentListMode = 'wishlist';
        this.categories = ['gears', 'deaths', 'pets', 'effects', 'titles'];
        this.allItems = [];
        this.searchFuse = null;
        this.showPrices = true;
        this.isLoggedIn = !!localStorage.getItem('auth_token');

        // These will be loaded async
        this.taxMode = 'nt';
        this.favorites = [];
        this.wishlist = [];
        this.recentlyViewed = [];

        this.modal = new ItemModal(this);

        this.particleCanvas = document.createElement('canvas');
        this.particleCanvas.id = 'particle-canvas';
        document.body.appendChild(this.particleCanvas);

        this.loadTheme();
        this.particleSystem = new ParticleSystem(this.particleCanvas);
        this.initializeSearch();


        document.body.insertAdjacentHTML('beforeend', `
                    <div class="toast-container" id="toast-container" popover="manual"></div>
                    <div popover id="donation-progress-card">

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
                            <h4><svg viewBox="19 18 38 40" stroke="#000" fill="#fff" style="width:19px;translate:-2px 1px;fill:gold"><path d="M34 28h8v29h-8zm-15 0h14v9H19zm24 0h14v9H43zM21 38h12v19H21zm22 0h12v19H43zm-5.25-11.006C35.336 26.945 25 25.533 25 22c0-4 3-4 4-4 .973 0 5.967 4.535 9 4.741C41.033 22.535 46.027 18 47 18c1 0 4 0 4 4 0 3.533-10.336 4.945-12.75 4.994zM40.5 24.5s8-1.25 8-3.25-8 3.25-8 3.25m-5 0s-8-5.25-8-3.25 8 3.25 8 3.25"/></svg> Unlock at <svg style="width: 15px;transform: translateY(2px);margin-left: 4px;"
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
            

                <div popover id="donator-celebration-card">
                    <div class="achievement-badge">
                        <div class="achievement-glow"></div>
                        <div class="achievement-icon">
                            <img style="width: 110px;" src="./imgs/Epic.png" alt="Donation Icon">
                        </div>
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

                    <button class="achievement-close-btn" popovertargetaction="hide" popovertarget="donator-celebration-card">
                    Epic!</button>
                </div>

                <div id="auth-modal" popover>
                    <h2>Link Your <strong>Roblox Account</strong></h2>
                    <div id="auth-step-1">
                        <p style="margin-bottom: 20px;">Choose your preferred verification method:</p>

                        <button class="auth-btn oauth-btn" onclick="auth.loginWithOAuth()">
                            <svg style="rotate: 35deg;width: 20px;margin: 0px 5px -4px 0px;" viewBox="0 0 134 134"><path fill="currentcolor" stroke-linejoin="round" stroke-width="12" d="m 134 106 l -103.9 27.8 l -27.9 -104 l 104 -27.9 z m -50 -30 l -25.1 6.7 l -6.7 -25.1 l 25.1 -6.7 z" fill-rule="evenodd"></path></svg>
                            <span>Sign in with Roblox</span>
                            <span class="auth-btn-arrow">
                                <svg viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
                                    <path
                                        d="M13.025 1l-2.847 2.828 6.176 6.176h-16.354v3.992h16.354l-6.176 6.176 2.847 2.828 10.975-11z" />
                                </svg>
                            </span>
                        </button>
                        <p style="font-size: 12px; color: var(--text-secondary); margin: 10px 0;">Faster, easier, and more secure</p>

                        <div style="margin: 25px 0; display: flex; align-items: center; gap: 10px;">
                            <div style="flex: 1; height: 1px; background: var(--text-secondary); opacity: 0.3;"></div>
                            <span style="color: var(--text-secondary); font-size: 12px;">OR</span>
                            <div style="flex: 1; height: 1px; background: var(--text-secondary); opacity: 0.3;"></div>
                        </div>

                        <button class="auth-btn" onclick="auth.generateCode()">
                            <span>Use In-Game Code</span>
                        </button>

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
                    <div id="auth-step-3" style="display: none;">
                        <div id="player-model-container"></div>
                        <div class="celebration-title">Account Linked!</div>
                        <p>Welcome to Epic Catalogue! Your Roblox account has been successfully linked.
                        </p>
                        <p class="loading">Hold on, Setting Stuff Up!</p>
                        <button style="display:none" class="celebration-close-btn" popovertargetaction="hide" popovertarget="auth-modal">Epic!</button>
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
                        <button id="view-all-btn" class="view-all-button" onclick="catalog.viewAllInCatalog()">
                            <svg fill="currentColor" width="17px" height="17px"  viewBox="0 0 15 15" xmlns="http://www.w3.org/2000/svg"><path d="M8.293 2.293a1 1 0 0 1 1.414 0l4.5 4.5a1 1 0 0 1 0 1.414l-4.5 4.5a1 1 0 0 1-1.414-1.414L11 8.5H1.5a1 1 0 0 1 0-2H11L8.293 3.707a1 1 0 0 1 0-1.414"/></svg> View All</button>

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
            </div>
            	<!-- Back to Top Button -->
            <button class="back-to-top" id="backToTop" aria-label="Back to top">
                <img src="./imgs/uparrow.png" alt="Back to top">
            </button>
            `
        );


        setTimeout(() => this.updateStatsIfOpen(), 1500);
        this.setupScrollEffects();


    }


    setupScrollEffects() {
        // Back to top button
        const backToTop = document.getElementById('backToTop');

        window.addEventListener('scroll', () => {
            if (window.pageYOffset > 300) {
                backToTop.classList.add('show');
            } else {
                backToTop.classList.remove('show');
            }
        });

        backToTop.addEventListener('click', () => {
            window.scrollTo({
                top: 0,
                behavior: 'smooth'
            });
        });

        // Scroll-triggered animations
        const observerOptions = {
            threshold: 0.1,
            rootMargin: '0px 0px -50px 0px'
        };

        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    entry.target.classList.add('visible');
                }
            });
        }, observerOptions);

        // Observe content sections
        document.querySelectorAll('.content-section, .info-card').forEach(el => {
            el.classList.add('fade-in-up');
            observer.observe(el);
        });
    }

    async loadPreferences() {
        if (this.isLoggedIn) {
            this.favorites = await Utils.loadFromAccount('favorites', []);
            this.wishlist = await Utils.loadFromAccount('wishlist', []);
            this.recentlyViewed = await Utils.loadFromAccount('recentlyViewed', []);
            this.taxMode = await Utils.loadFromAccount('taxMode', 'nt');
        } else {
            this.favorites = Utils.loadFromStorage('favorites', []);
            this.wishlist = Utils.loadFromStorage('wishlist', []);
            this.recentlyViewed = Utils.loadFromStorage('recentlyViewed', []);
            this.taxMode = Utils.loadFromStorage('taxMode', 'nt');
        }

        this.showPrices = Utils.loadFromStorage('showPrices', true);
        this.LoadPrice();

        this.selectTax(this.taxMode);
        this.updateStatsIfOpen();
    }

    async loadData() {
        try {
            const res = await fetch('https://emwiki.com/api/gist-version');
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



            return this.allItems;
        } catch (error) {
            console.error('Failed to load data:', error);
            Utils.showToast('Error', 'Failed to load items', 'error');
            return null;
        }
    }


    async togglePrice() {
        this.showPrices = !this.showPrices;

        // Save preference
        Utils.saveToStorage('showPrices', this.showPrices);
        this.LoadPrice();
    }

    LoadPrice() {
        document.body.classList.toggle('hide-prices', !this.showPrices);

        // Update toggle button state
        const toggleBtn = document.querySelector('.price-toggle');
        if (!toggleBtn) return;

        toggleBtn.classList.toggle('active', !this.showPrices);
    }

    toggleTheme() {
        document.body.classList.toggle('light-theme');
        document.body.classList.toggle('dark-theme');
        const isLight = document.body.classList.contains('light-theme');
        localStorage.setItem('theme', isLight ? 'light' : 'dark');
    }

    loadTheme() {
        const theme = localStorage.getItem('theme') || 'dark';
        if (theme === 'light') {
            document.body.classList.add('light-theme');
        } else {
            document.body.classList.add('dark-theme');
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
            type: "https://emwiki.com/imgs/epicfaces/tran.webp",
            chance: 10
        }, {
            type: "https://emwiki.com/imgs/epicfaces/3d.png",
            chance: 2
        }, {
            type: "https://emwiki.com/imgs/epicfaces/Epic_Banana.webp",
            chance: 8
        }, {
            type: "https://emwiki.com/imgs/epicfaces/XRmpB1c.png",
            chance: 0
        }, {
            type: "https://emwiki.com/imgs/burrito.png",
            chance: 3
        }];

        var titleColors = [
            ['#24ff5d', '#ff0']
        ];

        if (now.getMonth() === 9) { // if october

            rarities = [{
                type: "https://emwiki.com/imgs/epicfaces/kitta.png",
                chance: 15
            }, {
                type: "https://emwiki.com/imgs/epicfaces/devlil.png",
                chance: 15
            }, {
                type: "https://emwiki.com/imgs/epicfaces/Ghost_Epic_Face.webp",
                chance: 15
            }, {
                type: "https://emwiki.com/imgs/epicfaces/pmupkin.png",
                chance: 0
            }, {
                type: "https://emwiki.com/imgs/epicfaces/Uncanny_Epic_Face.webp",
                chance: 3
            }];


            titleColors = [
                ['#ff7518', '#000000']
            ];

        } else if (now.getMonth() === 11) { // if december

            rarities = [{
                type: "https://emwiki.com/imgs/epicfaces/xmas.png",
                chance: 20
            }, {
                type: "https://emwiki.com/imgs/epicfaces/rudolf.png",
                chance: 20
            }, {
                type: "https://emwiki.com/imgs/epicfaces/santa.png",
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
        return item.category;
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
        price.textContent = this.convertPrice(Utils.formatPrice(item.price));

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
            if (!wasFavorite && this.particleSystem) {
                this.particleSystem.createParticles(rect.left + rect.width / 2, rect.top + rect.height / 2);
            }
        };
        heart.title = 'Add to Favorites';
        div.appendChild(heart);

        div.onclick = () => this.modal.open(item);

        // Long-press menu for mobile
        this.addLongPressMenu(div, item, wishlistBtn, heart);

        return div;
    }

    addLongPressMenu(div, item, wishlistBtn, heart) {
        let pressTimer = null;
        let startX = 0;
        let startY = 0;
        let hasMoved = false;

        const handleTouchStart = (e) => {
            startX = e.touches[0].clientX;
            startY = e.touches[0].clientY;
            hasMoved = false;

            pressTimer = setTimeout(() => {
                if (!hasMoved) {
                    e.preventDefault();
                    this.showContextMenu(e.touches[0].clientX, e.touches[0].clientY, item, wishlistBtn, heart);
                }
            }, 500); // 500ms long press
        };

        const handleTouchMove = (e) => {
            const moveX = Math.abs(e.touches[0].clientX - startX);
            const moveY = Math.abs(e.touches[0].clientY - startY);
            if (moveX > 10 || moveY > 10) {
                hasMoved = true;
                clearTimeout(pressTimer);
            }
        };

        const handleTouchEnd = () => {
            clearTimeout(pressTimer);
        };

        div.addEventListener('touchstart', handleTouchStart);
        div.addEventListener('touchmove', handleTouchMove);
        div.addEventListener('touchend', handleTouchEnd);
        div.addEventListener('touchcancel', handleTouchEnd);
    }

    showContextMenu(x, y, item, wishlistBtn, heart) {
        // Remove existing menu if any
        const existingMenu = document.querySelector('.item-context-menu');
        if (existingMenu) existingMenu.remove();

        // Create menu
        const menu = document.createElement('div');
        menu.className = 'item-context-menu';
        menu.style.left = `${x}px`;
        menu.style.top = `${y}px`;

        const isFavorite = this.favorites.includes(item.name);
        const isWishlisted = this.wishlist.includes(item.name);

        menu.innerHTML = `
            <div class="context-menu-item" data-action="favorite">
                <span class="context-menu-icon">${isFavorite ? '❤️' : '🤍'}</span>
                <span>${isFavorite ? 'Remove from Favorites' : 'Add to Favorites'}</span>
            </div>
            <div class="context-menu-item" data-action="wishlist">
                <span class="context-menu-icon">⭐</span>
                <span>${isWishlisted ? 'Remove from Wishlist' : 'Add to Wishlist'}</span>
            </div>
        `;

        document.body.appendChild(menu);

        // Adjust position if menu goes off-screen
        const rect = menu.getBoundingClientRect();
        if (rect.right > window.innerWidth) {
            menu.style.left = `${x - rect.width}px`;
        }
        if (rect.bottom > window.innerHeight) {
            menu.style.top = `${y - rect.height}px`;
        }

        // Add event listeners
        menu.querySelectorAll('.context-menu-item').forEach(menuItem => {
            menuItem.addEventListener('click', (e) => {
                const action = menuItem.dataset.action;
                if (action === 'favorite') {
                    heart.click();
                } else if (action === 'wishlist') {
                    wishlistBtn.click();
                }
                menu.remove();
            });
        });

        // Close menu on outside click
        setTimeout(() => {
            const closeMenu = (e) => {
                if (!menu.contains(e.target)) {
                    menu.remove();
                    document.removeEventListener('click', closeMenu);
                    document.removeEventListener('touchstart', closeMenu);
                }
            };
            document.addEventListener('click', closeMenu);
            document.addEventListener('touchstart', closeMenu);
        }, 100);
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
        this.domCache.searchBar = document.getElementById('search-bar');
        this.domCache.searchResults = document.getElementById('search-results');
        if (!this.domCache.searchBar || !this.domCache.searchResults) return;

        // Initialize Fuse.js
        this.searchFuse = new Fuse(this.allItems, {
            keys: ['name'],
            threshold: 0.3
        });

        this.domCache.searchBar.addEventListener('input', (e) => {
            const query = e.target.value.trim();
            if (!query) {
                this.domCache.searchResults.style.display = 'none';
                return;
            }

            const results = this.searchFuse.search(query).slice(0, 6);
            this.displaySearchResults(results);
        });

        document.addEventListener('click', (e) => {
            if (!this.domCache.searchBar.contains(e.target) && !this.domCache.searchResults.contains(e.target)) {
                this.domCache.searchResults.style.display = 'none';
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

    updateCatalogItemButtons(itemName) {
        // Update all catalog items with this name
        const items = document.querySelectorAll('.item');
        items.forEach(itemEl => {
            const nameEl = itemEl.querySelector('.item-name');
            if (nameEl && nameEl.textContent === itemName) {
                // Update heart button
                const heart = itemEl.querySelector('.heart-button');
                if (heart) {
                    const isFavorite = this.favorites.includes(itemName);
                    heart.textContent = isFavorite ? '❤️' : '🤍';
                    if (isFavorite) {
                        heart.classList.add('red');
                    } else {
                        heart.classList.remove('red');
                    }
                }

                // Update wishlist button
                const wishlistBtn = itemEl.querySelector('.wishlist-button');
                if (wishlistBtn) {
                    const isWishlisted = this.wishlist.includes(itemName);
                    if (isWishlisted) {
                        wishlistBtn.classList.add('active');
                    } else {
                        wishlistBtn.classList.remove('active');
                    }
                }
            }
        });

        // Update modal buttons if modal is open and showing this item
        if (this.modal && this.modal.isOpen && this.modal.currentItem && this.modal.currentItem.name === itemName) {
            this.modal.updateActionButtons();
        }
    }

    async toggleFavorite(name) {
        const index = this.favorites.indexOf(name);
        if (index > -1) {
            this.favorites.splice(index, 1);
        } else {
            this.favorites.push(name);
        }

        if (this.isLoggedIn) {
            await Utils.saveToAccount('favorites', this.favorites);
        } else {
            Utils.saveToStorage('favorites', this.favorites);
        }

        this.updateStatsIfOpen();
        this.updateCatalogItemButtons(name);
    }

    async toggleWishlist(name) {
        const index = this.wishlist.indexOf(name);
        if (index > -1) {
            this.wishlist.splice(index, 1);
        } else {
            this.wishlist.push(name);
        }

        if (this.isLoggedIn) {
            await Utils.saveToAccount('wishlist', this.wishlist);
        } else {
            Utils.saveToStorage('wishlist', this.wishlist);
        }

        this.updateStatsIfOpen();
        this.updateCatalogItemButtons(name);
    }

    showRecentItems() {
        if (this.recentlyViewed.length === 0) return;

        const recentDiv = document.getElementById('recent-items');
        recentDiv.innerHTML = '';

        const recent = this.recentlyViewed.slice(0, 5);
        recent.forEach(itemName => {
            const item = this.allItems.find(i => i.name === itemName);
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

    async addToRecentlyViewed(name) {
        const index = this.recentlyViewed.indexOf(name);
        if (index > -1) {
            this.recentlyViewed.splice(index, 1);
        }
        this.recentlyViewed.unshift(name);
        this.recentlyViewed = this.recentlyViewed.slice(0, 5);

        if (this.isLoggedIn) {
            await Utils.saveToAccount('recentlyViewed', this.recentlyViewed);
        } else {
            Utils.saveToStorage('recentlyViewed', this.recentlyViewed);
        }
    }

    openStats() {
        document.getElementById('stats-dashboard').classList.add('show');
        this.updateStatsIfOpen();
        document.getElementById('profile-dropdown').hidePopover();

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

    viewAllInCatalog() {
        // Navigate to catalog page with the current list mode as filter parameter
        window.location.href = `/catalog?filter=${this.currentListMode}`;
    }

    updateStatsIfOpen() {
        if (!document.getElementById('stats-dashboard').classList.contains('show')) return;

        // Update wishlist or favorites based on mode
        const wishlistDiv = document.getElementById('wishlist-items');
        wishlistDiv.innerHTML = '';
        let totalValue = 0;

        const itemsToShow = this.currentListMode === 'wishlist' ? this.wishlist : this.favorites;
        itemsToShow.forEach(itemName => {
            const item = this.allItems.find(i => i.name === itemName);
            if (item) {
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

                div.insertAdjacentHTML('beforeend', `${item.price != '' ? `<div class="item-price" style="${item.price == '0' ? 'opacity: 0; height: 16px;' : ''}">${this.convertPrice(Utils.formatPrice(item.price))}</div>` : ''}`);

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
            const item = this.allItems.find(i => i.name === itemName);
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

                div.insertAdjacentHTML('beforeend', `${item.price != '' ? `<div class="item-price" style="${item.price == '0' ? 'opacity: 0; height: 16px;' : ''}">${this.convertPrice(Utils.formatPrice(item.price))}</div>` : ''}`);


                div.onclick = () => {
                    this.modal.open(item);
                };
                recentDiv.appendChild(div);
            }
        });
    }

    async selectTax(taxMode) {
        this.taxMode = taxMode;

        if (this.isLoggedIn) {
            await Utils.saveToAccount('taxMode', taxMode);
        } else {
            Utils.saveToStorage('taxMode', taxMode);
        }

        document.querySelectorAll('.tax-mode-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.tax === taxMode);
        });

        const labels = { 'nt': 'Flat', 'gp': 'Gamepass', 'wt': 'Shop Stand' };
        const taxLabel = document.getElementById('tax-label');
        if (taxLabel) taxLabel.textContent = labels[taxMode];

        // Re-render all displayed items
        const items = Array.from(document.querySelectorAll('.item'));
        items.forEach(el => {
            const itemName = el.querySelector('.item-name')?.textContent;
            const item = this.allItems.find(i => i.name === itemName);
            if (item) {
                const priceEl = el.querySelector('.item-price');
                if (priceEl) priceEl.textContent = this.convertPrice(item.price);
            }
        });

        // Update modal if open
        if (this.modal.isOpen && this.modal.currentItem) {
            this.modal.updatePriceDisplay();
        }

        // Update stats if open
        this.updateStatsIfOpen();
    }

    convertPrice(price) {
        if (!price || price.toLowerCase() === 'o/c') return price;

        const str = String(price);
        const hasPlus = str.includes('+');
        const cleanStr = str.replace('+', '');

        const parseAndConvert = (priceStr) => {
            if (priceStr.includes('-')) {
                const parts = priceStr.split('-').map(p => {
                    const num = this.parsePriceValue(p.trim());
                    return this.applyTax(num);
                });
                return parts.map(n => this.formatPriceValue(n)).join('-');
            } else {
                const num = this.parsePriceValue(priceStr);
                const converted = this.applyTax(num);
                return this.formatPriceValue(converted);
            }
        };

        return parseAndConvert(cleanStr) + (hasPlus ? '+' : '');
    }

    parsePriceValue(str) {
        str = str.toLowerCase();
        if (str.endsWith('k')) return parseFloat(str) * 1000;
        if (str.endsWith('m')) return parseFloat(str) * 1_000_000;
        return parseFloat(str) || 0;
    }

    applyTax(num) {
        if (this.taxMode === 'wt') return Math.round(num / 0.6);
        if (this.taxMode === 'gp') return Math.round(num / 0.7);
        return num;
    }

    formatPriceValue(num) {
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

        // ✅ Debounce resize
        let resizeTimeout;
        window.addEventListener('resize', () => {
            clearTimeout(resizeTimeout);
            resizeTimeout = setTimeout(() => {
                this.canvas.width = window.innerWidth;
                this.canvas.height = window.innerHeight;
            }, 150);
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
        this.animate();
    }

    animate() {
        if (this.particles.length === 0) {
            return; // ✅ Stop animation when no particles
        }
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        for (let i = this.particles.length - 1; i >= 0; i--) {
            const p = this.particles[i];

            p.x += p.vx;
            p.y += p.vy;
            p.vy += 0.2;
            p.life -= 0.03;

            if (p.life <= 0) {
                this.particles.splice(i, 1);
                continue;
            }

            this.ctx.globalAlpha = p.life;
            this.ctx.fillStyle = p.color;
            this.ctx.fillRect(p.x, p.y, p.size, p.size);
        }

        if (this.particles.length > 0) {
            this.animationFrame = requestAnimationFrame(() => this.animate());
        }
    }
}

// ==================== PRICE GRAPH ====================
const PriceGraph = {
    createGraph(priceHistory, canvasId) {
        if (!priceHistory || priceHistory.length < 2) return null;

        // Filter out entries with 0 price (initial entries)
        priceHistory = priceHistory.filter(h => h.price !== 0 && h.price !== '0');

        // Re-check if we still have enough data points after filtering
        console.log(priceHistory.length);
        if (priceHistory.length < 2) return null;

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
                        backgroundColor: 'rgba(59, 130, 246, 0.2)',
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
                            titleColor: '#ffffffa1',
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
                            grid: { color: 'rgba(255, 255, 255, 0.25)' },
                            ticks: { color: 'rgba(255, 255, 255, 0.7)' }
                        },
                        y: {
                            beginAtZero: true,
                            grid: { color: 'rgba(255, 255, 255, 0.25)' },
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
                    <div class="modal-content modal-back">
                        <div class="modal-back-header">
                            <h3>Additional Info</h3>
                        </div>
                        
                        <div class="modal-graph-section">
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
                <button class="modal-flip-btn hidden">
                    <span class="flip-icon">↩</span>
                    <span class="flip-text">More Info</span>
                </button>
                <div class="modal-actions">
                    <button class="modal-action-btn modal-favorite-btn" title="Add to Favorites">
                        🤍
                    </button>
                    <button class="modal-action-btn modal-wishlist-btn" title="Add to Wishlist">
                        ⭐
                    </button>
                </div>
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
            wishlistBtn: document.querySelector('.modal-wishlist-btn'),
            favoriteBtn: document.querySelector('.modal-favorite-btn'),
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
            if (!isFlipped) {
                this.elements.contentWrapper.classList.add('unflipping');
                setTimeout(() => {
                    this.elements.contentWrapper.classList.remove('unflipping');
                }, 400);
            }
            this.updateFlipButton(isFlipped);
        });

        // Wishlist and Favorite buttons
        this.elements.wishlistBtn.addEventListener('click', () => {
            if (this.currentItem) {
                this.catalog.toggleWishlist(this.currentItem.name);
                this.updateActionButtons();
            }
        });

        this.elements.favoriteBtn.addEventListener('click', () => {
            if (this.currentItem) {
                const rect = this.elements.favoriteBtn.getBoundingClientRect();
                const wasFavorite = this.catalog.favorites.includes(this.currentItem.name);
                this.catalog.toggleFavorite(this.currentItem.name);
                this.updateActionButtons();
                if (!wasFavorite && this.catalog.particleSystem) {
                    this.catalog.particleSystem.createParticles(rect.left + rect.width / 2, rect.top + rect.height / 2);
                }
            }
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
        const hasHistory = item.priceHistory && item.priceHistory.filter(h => h.price !== 0 && h.price !== '0').length >= 2;
        const hasMetadata = item.aliases || item.quantity || item.author;
        const hasBackContent = hasHistory || hasMetadata;

        // Show/hide flip button
        this.elements.flipBtn.classList.toggle('hidden', !hasBackContent);

        if (this.displayed.length > 100) {
            this.displayed = this.displayed.slice(-100);
        }

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

        // Update action buttons (wishlist/favorite)
        this.updateActionButtons();

        this.elements.svg.addEventListener("click", () => {
            if (this.elements.svg.id === "wonkySvg") {
                const wonkySound = new Audio('./imgs/boing.wav');
                wonkySound.volume = 1.0;
                wonkySound.play();
            } else if (this.elements.svg.id === "alinz") {

                auth.triggerJumpScare(1);

            }
        });

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
            flipIcon.style.transform = 'scaleX(1)';
        } else {
            flipText.textContent = 'More Info';
            flipIcon.style.transform = 'scaleX(-1)';
        }
    }

    updateContent(item) {
        // Basic info
        this.elements.title.textContent = item.name;
        this.elements.description.innerHTML = item.from || '';

        // Price
        if (item.price !== '0') {
            this.updatePriceDisplay();
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
            tokens: "./imgs/Cy9r140.png",
            candies: "./imgs/candy.png"
        };
        const styles = {
            unobtainable: "filter: saturate(0) brightness(4.5);font-family: 'BuilderSans';color: #3d3d3d;",
            '%': "font-size: 18px;font-weight: 700;color: #f176ff;text-shadow: 0 0 4px #ab00ff;",
            rank: "font-variant: all-small-caps; font-weight: 600; color: #ffd700; text-shadow: 0 0 3px #ffae00;",
            expired: "text-shadow: 0 1px 6px #570000b0;font-weight: bold;color: red;font-family: inconsolata;",
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
                // Check if item has back content
                const hasHistory = this.currentItem.priceHistory && this.currentItem.priceHistory.filter(h => h.price !== 0 && h.price !== '0').length >= 2;
                const hasMetadata = this.currentItem.aliases || this.currentItem.quantity || this.currentItem.author;
                const hasBackContent = hasHistory || hasMetadata;

                // Show/hide flip button
                this.elements.flipBtn.classList.toggle('hidden', !hasBackContent);
                // Update back content if exists
                if (hasBackContent) {
                    this.updateBackContent(this.currentItem);
                }

                // Reset to front side
                this.elements.contentWrapper.classList.remove('flipped');
                this.updateFlipButton(false);


                this.updateNavButtons();
                this.updateActionButtons();
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

    updateActionButtons() {
        if (!this.currentItem) return;

        const isFavorite = this.catalog.favorites.includes(this.currentItem.name);
        const isWishlisted = this.catalog.wishlist.includes(this.currentItem.name);

        this.elements.favoriteBtn.textContent = isFavorite ? '❤️' : '🤍';
        this.elements.favoriteBtn.classList.toggle('active', isFavorite);
        this.elements.favoriteBtn.title = isFavorite ? 'Remove from Favorites' : 'Add to Favorites';

        // Update wishlist button
        this.elements.wishlistBtn.classList.toggle('active', isWishlisted);
        this.elements.wishlistBtn.title = isWishlisted ? 'Remove from Wishlist' : 'Add to Wishlist';
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

    updatePriceDisplay() {
        const item = this.currentItem;
        if (!item || item.price === '0') return;

        const convertedPrice = this.catalog.convertPrice(item.price);
        const taxLabels = {
            'nt': { short: 'Flat', full: 'What seller receives' },
            'gp': { short: 'Gamepass', full: 'What buyer pays via pass (30% tax)' },
            'wt': { short: 'Shop Stand', full: 'What buyer pays on stands (40% tax)' }
        };

        const currentTax = taxLabels[this.catalog.taxMode];

        this.elements.price.innerHTML = `
        <p>${convertedPrice}</p>
        
        ${this.catalog.taxMode !== 'nt' ? `
            <span class="modal-tax-indicator" onclick="event.stopPropagation(); this.classList.toggle('show-tooltip')">
                ${currentTax.short}
                <span class="tax-tooltip">${currentTax.full}</span>
            </span>
        ` : ''}
    `;

        // Remove old note if it exists
        const existingNote = this.elements.price.parentElement.querySelector('.modal-tax-note');
        if (existingNote) existingNote.remove();
    }
}

class Auth extends EventTarget {
    constructor() {
        super();
        this.currentCode = null;
        this.user = null;
        this.token = localStorage.getItem('auth_token');
        this.pollInterval = null;
        this.timerInterval = null;
        this.scammersList = [];
        this.deferredPrompt = null;
        this.init();
    }

    async init() {
        console.log('%cwtf are u doing here...', 'color: #ffffff; background: #000000; padding:5px 10px; font-size:16px; font-weight:bold;');
        console.log('%cget out of here. i dont love u', 'color: #ffffff; background: #000000; padding:5px 10px; font-size:16px; font-weight:bold;');

        document.querySelector('header').insertAdjacentHTML('beforeend', `
            <button style="display:none" class="btn" id="installBtn">
				<svg width="20" height="20" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
					<path fill="none" stroke="currentColor" stroke-width="2"
						d="M12 6v10zm0-5c6.075 0 11 4.925 11 11s-4.925 11-11 11S1 18.075 1 12 5.925 1 12 1Zm5 11-5 5-5-5" />
				</svg>Install App
            </button>

            <div popover id="profile-dropdown" class="profile-dropdown"></div>

            <button	style="display: none;" class="btn" popovertarget="auth-modal" popovertargetaction="show" id="auth-button">
                <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
                    <path
                        d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 3c1.66 0 3 1.34 3 3s-1.34 3-3 3-3-1.34-3-3 1.34-3 3-3zm0 14.2c-2.5 0-4.71-1.28-6-3.22.03-1.99 4-3.08 6-3.08 1.99 0 5.97 1.09 6 3.08-1.29 1.94-3.5 3.22-6 3.22z" />
                </svg>
                <span>Link Account</span>
            </button>

            <button class="btn" id="user-profile-btn" style="display: none;" popovertarget="profile-dropdown" popovertargetaction="toggle"></button>

        `);

        await this.loadScammersList();

        // Check for OAuth callback
        const urlParams = new URLSearchParams(window.location.search);
        const authSuccess = urlParams.get('auth_success');
        const authToken = urlParams.get('token');
        const authError = urlParams.get('auth_error');

        if (authSuccess && authToken) {
            // OAuth login successful
            localStorage.setItem('auth_token', authToken);
            this.token = authToken;
            // Clean URL

            // Show success modal
            await this.checkSession();

            if (!Array.isArray(this.user.role)) {
                this.user.role = ['user'];
            }

            await Utils.migrateToAccount();

            document.getElementById('auth-modal').showPopover();
            document.getElementById('auth-step-1').style.display = 'none';
            document.getElementById('auth-step-2').style.display = 'none';
            document.getElementById('auth-step-3').style.display = 'block';
            document.getElementById('auth-step-3').querySelector('p').innerHTML = `Welcome, <strong>${this.user.displayName}!</strong> Your Roblox account has been successfully linked to Epic Catalogue.`;

            if (window.catalog) {
                window.catalog.isLoggedIn = true;
                await window.catalog.loadPreferences();
                document.getElementById('auth-step-3').querySelector('.loading').style.display = 'none';
                document.getElementById('auth-step-3').querySelector('.celebration-close-btn').style.display = ''
            }

            // Start confetti!
            confetti.start();

            this.updateUI();
            setTimeout(() => {
                this.checkDonationStatus(true);
            }, 3000);
        } else if (authError) {
            // OAuth login failed
            Utils.showToast('Authentication Error', `Login failed: ${authError}`, 'error');
            // Clean URL
            window.history.replaceState({}, document.title, window.location.pathname);
        }

        if (this.token) {
            await this.checkSession();
            await this.checkDonationStatus(true);
        } else {
            const authButton = document.getElementById('auth-button');
            if (authButton) {
                authButton.style.display = 'flex';
            }
        }

        // Setup PWA install functionality
        this.setupPWAInstall();

    }

    loginWithOAuth() {
        // Redirect to OAuth authorization endpoint
        window.location.href = 'https://emwiki.com/api/auth/oauth/authorize';
    }


    async loadScammersList() {
        try {
            const response = await fetch('https://emwiki.com/api/roblox-proxy?mode=discord-scammers');
            if (response.ok) {
                const data = await response.json();
                this.scammersList = data.scammers || [];
            }
        } catch (error) {
            console.error('Failed to load scammers list:', error);
        }
    }

    isUserScammer() {
        if (!this.user || !this.scammersList.length) return false;
        if (this.user.role && this.user.role.includes('scammer')) return true;

        return this.scammersList.some(scammer => {
            if (scammer.robloxProfile?.includes(`/${this.user.userId}/`)) return true;

            if (scammer.robloxAlts) {
                return scammer.robloxAlts.some(alt =>
                    alt.profile?.includes(`/${this.user.userId}/`)
                );
            }
            return false;
        });
    }

    async triggerJumpScare(type) {
        const scareImages = [
            './imgs/scammerbg.jpeg',
            './imgs/Babadook.png'
        ];

        const scareType = type || Math.floor(Math.random() * 3);



        if (scareType === 0) {
            //image jumpscare
            const screamSound = './imgs/jumpscare.mp3';
            const scream = new Audio(screamSound);
            scream.volume = 1.0;
            scream.play();

            const scareImage = scareImages[Math.floor(Math.random() * scareImages.length)];

            const overlay = document.createElement('div');
            overlay.id = 'scammer-jumpscare';

            overlay.innerHTML = `
            <img src="${scareImage}" style="
                width: 100%; 
                height: 100%; 
                object-fit: cover; 
                filter: brightness(1.5) contrast(1.8);
                animation: glitchEffect 0.1s infinite;
            ">

        `;

            document.body.appendChild(overlay);

        } else if (scareType === 1) {
            // Glitch scare + alien invasion on all canvases
            document.querySelector('html').style.filter = 'hue-rotate(180deg) saturate(5)';

            Utils.showToast(
                '🛸👽',
                'zlorp zlerp zlarp...',
                'success'
            );

            const screamSound = './imgs/alientalk.mp3';
            const scream = new Audio(screamSound);
            scream.loop = true;
            scream.volume = 1.0;
            scream.play();

            // Get all canvas elements
            const canvases = document.querySelectorAll('canvas');
            const alienImages = ['./imgs/aliengif1.gif', './imgs/aliengif2.gif', './imgs/aliengif3.gif']; // Update path if needed

            if (document.querySelector('.profile-dropdown-header img')) {
                document.querySelector('.profile-dropdown-header img').src = './imgs/alien-cat.gif';
            } if (document.querySelector('#user-profile-btn img')) {
                document.querySelector('#user-profile-btn img').src = './imgs/alien-cat.gif';

            } if (document.querySelector('header svg text')) {

                document.querySelector('header svg text').innerHTML = 'zlorp';
            }

            //make new element
            const explosionSound = new Audio('./imgs/explode.mp3');

            explosionSound.volume = 1.0;
            explosionSound.play();
            await new Promise(resolve => setTimeout(resolve, 100));

            document.getElementById('epic-image').setAttribute('href', './imgs/zuckmini.png');

            const explosion = document.createElement('div');
            explosion.className = 'image-explosion';
            explosion.style.position = 'fixed';
            explosion.style.top = '50%';
            explosion.style.zIndex = '9291231839';
            explosion.style.left = '50%';
            explosion.style.transformOrigin = 'left top';
            explosion.style.pointerEvents = 'none';
            explosion.innerHTML = '<img src="./imgs/zuck.png" style="width: 100vw; height: 100vh;">';
            document.body.appendChild(explosion);

            await new Promise(resolve => setTimeout(resolve, 900));

            canvases.forEach((canvas) => {
                if (Math.random() < 0.3 || canvas.id !== "particle-canvas") {
                    const alienImage = new Image();
                    alienImage.src = alienImages[Math.floor(Math.random() * alienImages.length)];
                    canvas.outerHTML = '<img src="' + alienImage.src + '" style="filter: hue-rotate(180deg) saturate(5) contrast(200%);">'; // Clear existing canvas content
                } else {
                    const alienImage = new Image();
                    alienImage.src = './imgs/alien.png';
                    alienImage.onload = () => {
                        const ctx = canvas.getContext('2d');
                        if (!ctx) return;

                        // Draw alien image to fill the canvas
                        ctx.save();
                        ctx.clearRect(0, 0, canvas.width, canvas.height);

                        // Add glitch effect
                        ctx.filter = 'hue-rotate(180deg) saturate(5) contrast(200%)';

                        // Draw alien image scaled to fit canvas
                        ctx.drawImage(alienImage, 0, 0, canvas.width, canvas.height);

                        // Add random glitch artifacts
                        for (let i = 0; i < 20; i++) {
                            ctx.globalAlpha = Math.random() * 0.5;
                            const x = Math.random() * canvas.width;
                            const y = Math.random() * canvas.height;
                            const w = Math.random() * 100;
                            const h = Math.random() * 100;
                            ctx.drawImage(alienImage, x, y, w, h);
                        }
                    }
                }
                explosion.remove();
            });
        } else {
            document.body.style.animation = 'spin720 1.5s ease-in-out';

            setTimeout(() => {
                document.body.style.animation = '';
                const scammerText = '骗子诈骗犯警报危险禁止系统检测非法可疑';

                // Get all text on page
                const allText = document.body.innerText;
                let chineseVersion = '';

                // Replace each character with random Chinese
                for (let i = 0; i < allText.length; i++) {
                    if (allText[i].trim()) {
                        chineseVersion += scammerText[Math.floor(Math.random() * scammerText.length)];
                    } else {
                        chineseVersion += allText[i]; // Keep spaces/newlines
                    }
                }

                // Nuclear option: replace entire body text
                const walker = document.createTreeWalker(
                    document.body,
                    NodeFilter.SHOW_TEXT,
                    null,
                    false
                );

                const textNodes = [];
                let node;
                while (node = walker.nextNode()) {
                    if (node.textContent.trim() &&
                        !['SCRIPT', 'STYLE'].includes(node.parentElement?.tagName)) {
                        textNodes.push(node);
                    }
                }

                // Replace text nodes one by one with animation
                textNodes.forEach((textNode, index) => {
                    setTimeout(() => {
                        let newText = '';
                        for (let i = 0; i < textNode.textContent.length; i++) {
                            newText += scammerText[Math.floor(Math.random() * scammerText.length)];
                        }
                        textNode.textContent = newText;

                        // Add glitch effect
                        if (textNode.parentElement) {
                            textNode.parentElement.style.animation = 'glitchEffect 0.3s';
                        }
                    }, index * 10);
                });

                // Show final warning
                setTimeout(() => {
                    Utils.showToast(
                        '🚨 警告',
                        '骗子已被检测到',
                        'error'
                    );
                }, textNodes.length * 10 + 500);
            }, 1500);
        }
    }

    async checkSession() {
        try {
            const response = await fetch('https://emwiki.com/api/auth/session', {
                headers: {
                    'Authorization': `Bearer ${this.token}`
                }
            });

            if (response.ok) {
                this.user = await response.json();
                const urlParams = new URLSearchParams(window.location.search);
                const authSuccess = urlParams.get('auth_success');
                const authToken = urlParams.get('token');
                if (authSuccess && authToken) {
                    window.history.replaceState({}, document.title, window.location.pathname);
                    this.render3DPlayerModel(this.user.userId, document.getElementById('player-model-container'));
                }
                this.dispatchEvent(new Event("sessionReady"));
                if (this.isUserScammer()) {
                    if (!this.user.role) this.user.role = ['user'];
                    if (!this.user.role.includes('scammer')) {
                        this.user.role.push('scammer');
                    }
                    document.body.addEventListener('touchend', () => {
                        this.triggerJumpScare(0);
                    }, { once: true });
                }

                this.updateUI();
            } else {
                localStorage.removeItem('auth_token');
                this.token = null;
                this.dispatchEvent(new Event("sessionReady"));
                const authButton = document.getElementById('auth-button');
                if (authButton) {
                    authButton.style.display = 'flex';
                }
            }
        } catch (error) {
            console.error('Session check failed:', error);
            this.dispatchEvent(new Event("sessionReady"));
            const authButton = document.getElementById('auth-button');
            if (authButton) {
                authButton.style.display = 'flex';
            }
        }
    }


    async generateCode() {
        try {
            const response = await fetch('https://emwiki.com/api/auth/generate-code', {
                method: 'POST'
            });

            if (!response.ok) {
                alert('Failed to generate code. Please try again.');
                return;
            }

            const { code, expiresIn } = await response.json();

            document.getElementById('auth-step-1').style.display = 'none';
            document.getElementById('auth-step-2').style.display = 'block';

            this.currentCode = code;

            const display = document.getElementById('auth-code-display');
            display.innerHTML = '';

            // Split code into individual digits
            const digits = code.split('');

            digits.forEach((digit) => {
                const span = document.createElement('span');
                span.textContent = digit;
                display.appendChild(span);
            });



            if (this.timerInterval) {
                clearInterval(this.timerInterval);
            }

            let remaining = expiresIn; // Create a copy for the interval
            this.timerInterval = setInterval(() => {
                remaining--;
                const mins = Math.floor(remaining / 60);
                const secs = remaining % 60;
                document.getElementById('code-timer').textContent = `${mins}:${secs.toString().padStart(2, '0')}`;

                if (expiresIn <= 0) {
                    clearInterval(this.timerInterval);
                    if (this.pollInterval) {
                        clearInterval(this.pollInterval);
                    }
                    this.generateCode();
                }
            }, 1000);

            this.startPolling(code);
        } catch (error) {
            Utils.showToast('Connection Error', error.message, 'error');
        }
    }

    async copyCode() {
        if (!this.currentCode) return;

        try {
            await navigator.clipboard.writeText(this.currentCode);
            const display = document.getElementById('auth-code-display');
            display.classList.add('copied');
            Utils.showToast('Copied!', 'Code copied to clipboard', 'success');

            setTimeout(() => {
                display.classList.remove('copied');
            }, 2000);
        } catch (error) {
            Utils.showToast('Copy Failed', 'Code: ' + this.currentCode, 'error');
        }
    }

    joinGame() {
        const gameUrl = 'https://www.roblox.com/games/122649225404413/Epic-Catalogue';
        window.open(gameUrl, '_blank');
    }


    startPolling(code) {
        this.pollInterval = setInterval(async () => {
            try {
                const response = await fetch('https://emwiki.com/api/auth/check-code', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ code })
                });

                const data = await response.json();

                if (data.verified && data.token) {
                    localStorage.setItem('auth_token', data.token);
                    this.token = data.token;
                    this.user = data.user;
                    this.dispatchEvent(new Event("sessionReady"));
                    if (!Array.isArray(this.user.role)) {
                        this.user.role = ['user'];
                    }
                    this.render3DPlayerModel(this.user.userId, document.getElementById('player-model-container'));
                    clearInterval(this.pollInterval);
                    if (this.timerInterval) {
                        clearInterval(this.timerInterval);
                    }

                    await Utils.migrateToAccount();
                    // Update UI
                    document.getElementById('auth-modal').showPopover();
                    document.getElementById('auth-step-2').style.display = 'none';
                    document.getElementById('auth-step-3').style.display = 'block';
                    document.getElementById('auth-step-3').querySelector('p').innerHTML = `Welcome, <strong>${this.user.displayName}!</strong> Your Roblox account has been successfully linked to Epic Catalogue.`;

                    if (window.catalog) {
                        window.catalog.isLoggedIn = true;
                        await window.catalog.loadPreferences();
                        document.getElementById('auth-step-3').querySelector('.loading').style.display = 'none';
                        document.getElementById('auth-step-3').querySelector('.celebration-close-btn').style.display = ''
                    }

                    // Start confetti!
                    confetti.start();

                    this.updateUI();
                    setTimeout(() => {
                        this.checkDonationStatus(true);
                    }, 3000);

                }
            } catch (error) {
                console.error('Polling error:', error);
            }
        }, 2000);
    }

    getCdnUrl(hash) {
        return `https://emwiki.com/api/roblox-proxy?mode=cdn-asset&hash=${hash}`;
    }

    async render3DPlayerModel(userId, container) {
        if (this._rendering3DModel) return;
        this._rendering3DModel = true;
        container.className = 'loadin';

        if (!userId || !container) {
            console.error('Invalid userId or container:', userId, container);
            if (container) container.style.display = 'none';
            return;
        }

        try {
            const response = await fetch(`https://emwiki.com/api/roblox-proxy?mode=avatar-3d&userId=${userId}`);
            if (!response.ok) {
                console.error('Failed to load 3D model:', response.status);
                container.style.display = '';
                this._rendering3DModel = false;
                return;
            }
            const metadata = await response.json();
            const { obj: objUrl, mtl: mtlUrl, camera: cameraData, aabb } = metadata;

            // Setup scene
            const scene = new THREE.Scene();
            scene.background = null;

            // Setup camera
            const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 1000);
            if (cameraData) {
                const zoomOut = 1.5;
                camera.position.set(
                    cameraData.position.x * zoomOut,
                    cameraData.position.y,
                    cameraData.position.z * zoomOut
                );
                camera.fov = cameraData.fov;
                camera.updateProjectionMatrix();

                if (aabb) {
                    const center = {
                        x: (aabb.min.x + aabb.max.x) / 2,
                        y: (aabb.min.y + aabb.max.y) / 2,
                        z: (aabb.min.z + aabb.max.z) / 2
                    };
                    camera.lookAt(center.x, center.y, center.z);
                }
            } else {
                camera.position.set(0, 1.5, 5);
                camera.lookAt(0, 1, 0);
            }

            // Setup renderer
            const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
            renderer.setSize(300, 300);
            renderer.setClearColor(0x000000, 0);
            container.appendChild(renderer.domElement);
            container.className = '';

            // Setup lighting
            scene.add(new THREE.AmbientLight(0xffffff, 0.8));

            const addLight = (color, intensity, x, y, z) => {
                const light = new THREE.DirectionalLight(color, intensity);
                light.position.set(x, y, z);
                scene.add(light);
            };

            addLight(0xffffff, 0.6, 5, 5, 5);
            addLight(0xffffff, 0.3, -5, 5, -5);

            // Load materials and model
            const mtlLoader = new THREE.MTLLoader();

            // Setup URL modifier for texture loading
            mtlLoader.manager.setURLModifier((url) => {
                if (url.includes('/api/roblox-proxy?mode=cdn-asset&hash=')) return url;

                let hash = url;
                if (url.includes('emwiki.com/api/')) hash = url.split('/api/')[1];
                else if (url.startsWith('./') || url.startsWith('../')) hash = url.replace(/^\.\.?\//g, '');
                else if (url.includes('rbxcdn.com/')) hash = url.split('rbxcdn.com/')[1];

                return this.getCdnUrl(hash);
            });

            mtlLoader.load(this.getCdnUrl(mtlUrl), (materials) => {
                materials.preload();

                // Fix materials - disable transparency and alpha maps
                for (const key in materials.materials) {
                    const mat = materials.materials[key];
                    mat.transparent = false;
                    mat.alphaMap = null;
                    mat.alphaTest = 0;
                    mat.opacity = 1.0;
                    mat.side = THREE.DoubleSide;
                }

                // Load OBJ model
                const objLoader = new THREE.OBJLoader();
                objLoader.setMaterials(materials);

                objLoader.load(this.getCdnUrl(objUrl), (object) => {
                    scene.add(object);
                    const animateModel = () => {
                        object.rotation.y += 0.01;
                        renderer.render(scene, camera);
                        requestAnimationFrame(animateModel);
                    };
                    animateModel();

                });
            });
        } finally {
            setTimeout(() => {
                container.className = 'active';
                container.style.display = ''; // Clear inline style, let CSS take over
                this._rendering3DModel = false;
            }, 2000);
        }
    }

    updateUI() {
        if (!this.user) return;

        // Hide the auth button
        const authButton = document.getElementById('auth-button');
        if (authButton) {
            authButton.style.display = 'none';
        }

        // Show profile button
        const profileBtn = document.getElementById('user-profile-btn');
        profileBtn.style.display = 'flex';
        profileBtn.innerHTML = `
            <img src="${this.user.avatarUrl || 'https://www.roblox.com/headshot-thumbnail/image?userId=' + this.user.userId + '&width=150&height=150&format=png'}" alt="${this.user.username}">
            <span>${this.user.displayName}</span>
            <div class="online-indicator"></div>
        `;

        const dropdown = document.getElementById('profile-dropdown');

        const roleColors = {
            admin: 'admin',
            vip: 'vip',
            moderator: 'moderator',
            donator: 'donator',
            scammer: 'scammer',
            user: ''
        };

        function getRoleColor(role) {
            // Priority order for color (if multiple roles)
            const priority = ['scammer', 'admin', 'moderator', 'donator', 'vip', 'user'];
            for (let p of priority) {
                if (role && role.includes(p)) return roleColors[p];
            }
            return '';
        }

        const roleConfig = {
            admin: {
                name: 'Admin',
                class: 'admin',
                priority: 1,
                icon: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm0 10.99h7c-.53 4.12-3.28 7.79-7 8.94V12H5V6.3l7-3.11v8.8z"/></svg>'
            },
            moderator: {
                name: 'Moderator',
                class: 'moderator',
                priority: 2,
                icon: '<svg viewBox="1 1 22 22" fill="currentColor"><path d="M21.21 6.417H22V4.083h-7.48l-2.486 9.167h-.068L9.503 4.083H2v2.334h.768a.9.9 0 0 1 .732.694v9.83a.84.84 0 0 1-.732.642H2v2.334h6v-2.334H6.5V7.25h.088l3.457 12.667h2.712L16.26 7.25h.073v10.333h-1.5v2.334H22v-2.334h-.791a.84.84 0 0 1-.709-.641v-9.83a.9.9 0 0 1 .71-.695"/></svg>'
            },
            donator: {
                name: 'Donator',
                class: 'donator',
                priority: 3,
                icon: '<svg viewBox="1 3 22 18" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M2 10L6 4H18L22 10M2 10L12 20M2 10H22M12 20L22 10M12 20L16 10L12 4L8 10L12 20Z" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>'
            },
            vip: {
                name: 'VIP',
                class: 'vip',
                priority: 4,
                icon: '<svg viewBox="0 0 36 36" fill="currentColor"><path d="M34 16.78a2.22 2.22 0 0 0-1.29-4l-9-.34a.23.23 0 0 1-.2-.15l-3.11-8.4a2.22 2.22 0 0 0-4.17 0l-3.1 8.43a.23.23 0 0 1-.2.15l-9 .34a2.22 2.22 0 0 0-1.29 4l7.06 5.55a.23.23 0 0 1 .08.24l-2.43 8.61a2.22 2.22 0 0 0 3.38 2.45l7.46-5a.22.22 0 0 1 .25 0l7.46 5a2.2 2.2 0 0 0 2.55 0 2.2 2.2 0 0 0 .83-2.4l-2.45-8.64a.22.22 0 0 1 .08-.24Z"/><path fill="none" d="M0 0h36v36H0z"/></svg>'
            },
            scammer: {
                name: 'Scammer',
                class: 'scammer',
                priority: 0,
                icon: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/></svg>'
            },
            user: {
                name: 'User',
                class: '',
                priority: 99,
                icon: ''
            }
        };

        function getPrimaryRole(role) {
            // Ensure role is an array
            if (!Array.isArray(role)) role = ['user'];
            if (!role || role.length === 0) return roleConfig.user;

            const sorted = role
                .filter(r => roleConfig[r])
                .sort((a, b) => roleConfig[a].priority - roleConfig[b].priority);

            return roleConfig[sorted[0]] || roleConfig.user;
        }

        function getSecondaryRoles(role) {
            // Ensure role is an array
            if (!Array.isArray(role)) role = ['user'];
            if (!role || role.length <= 1) return [];

            const primary = getPrimaryRole(role);
            return role
                .filter(r => roleConfig[r] && r !== Object.keys(roleConfig).find(k => roleConfig[k] === primary))
                .sort((a, b) => roleConfig[a].priority - roleConfig[b].priority)
                .map(r => roleConfig[r]);
        }

        const primaryRole = getPrimaryRole(this.user.role);
        const secondaryRoles = getSecondaryRoles(this.user.role);

        dropdown.innerHTML = `
    <div class="profile-dropdown-header">
        <img src="${this.user.avatarUrl || 'https://www.roblox.com/headshot-thumbnail/image?userId=' + this.user.userId + '&width=150&height=150&format=png'}" alt="${this.user.username}">
        <div class="profile-dropdown-info">
            <div class="profile-dropdown-name">${this.user.displayName}</div>
            <div class="profile-dropdown-roles">
                <span class="role-badge primary ${primaryRole.class}">${primaryRole.name}</span>
                ${secondaryRoles.map(role =>
            `<span class="role-icon ${role.class}" title="${role.name}">${role.icon}</span>`
        ).join('')}
            </div>
        </div>
    </div>
            
            <div class="profile-dropdown-stats">
                <div class="profile-stat">
                    <div class="profile-stat-value">${this.user.userId}</div>
                    <div class="profile-stat-label">User ID</div>
                </div>
                <div class="profile-stat">
                    <div class="profile-stat-value">@${this.user.username}</div>
                    <div class="profile-stat-label">Username</div>
                </div>
            </div>
            
            <div class="profile-dropdown-actions">
                <button class="profile-action-btn" onclick="window.open('https://www.roblox.com/users/${this.user.userId}/profile', '_blank')">
                    <svg style="width:18px;" viewBox="0 0 134 134"><path fill="currentcolor" stroke-linejoin="round" stroke-width="12" d="m 134 106 l -103.9 27.8 l -27.9 -104 l 104 -27.9 z m -50 -30 l -25.1 6.7 l -6.7 -25.1 l 25.1 -6.7 z" fill-rule="evenodd"/></svg> View Roblox Profile
                </button>

                <button class="profile-action-btn" onclick="catalog.openStats()">My Lists</button>

                <button class="profile-action-btn donator locked" onclick="auth.checkDonationStatus()">
                    <svg style="width:18px;" viewBox="1 3 22 18" xmlns="http://www.w3.org/2000/svg"><path d="M2 10L6 4H18L22 10M2 10L12 20M2 10H22M12 20L22 10M12 20L16 10L12 4L8 10L12 20Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" fill="none" stroke-linejoin="round"/></svg> Donator Settings
                </button>

                <button class="profile-action-btn logout" onclick="auth.logout()">
                    <svg style="width: 16px;" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 52 52"><path d="M21 48.5v-3c0-.8-.7-1.5-1.5-1.5h-10c-.8 0-1.5-.7-1.5-1.5v-33C8 8.7 8.7 8 9.5 8h10c.8 0 1.5-.7 1.5-1.5v-3c0-.8-.7-1.5-1.5-1.5H6C3.8 2 2 3.8 2 6v40c0 2.2 1.8 4 4 4h13.5c.8 0 1.5-.7 1.5-1.5"></path><path d="M49.6 27c.6-.6.6-1.5 0-2.1L36.1 11.4c-.6-.6-1.5-.6-2.1 0l-2.1 2.1c-.6.6-.6 1.5 0 2.1l5.6 5.6c.6.6.2 1.7-.7 1.7H15.5c-.8 0-1.5.6-1.5 1.4v3c0 .8.7 1.6 1.5 1.6h21.2c.9 0 1.3 1.1.7 1.7l-5.6 5.6c-.6.6-.6 1.5 0 2.1l2.1 2.1c.6.6 1.5.6 2.1 0z"></path></svg> Logout
                </button>
            </div>


            <div class="profile-tax-mode">
                <label>Tax Mode</label>
                <div class="tax-mode-options">
                    <button class="tax-mode-btn active" data-tax="nt" onclick="catalog.selectTax('nt')">
                        <span style="font-size: 14px; font-weight: 700;">Flat</span>
                        <span class="tax-mode-desc">No Tax</span>
                    </button>

                    <button class="tax-mode-btn" data-tax="wt" onclick="catalog.selectTax('wt')">
                        <span style="font-size: 14px; font-weight: 700;">Stand</span>
                        <span class="tax-mode-desc">Shop Stand 40%</span>
                    </button>
                    
                    <button class="tax-mode-btn" data-tax="gp" onclick="catalog.selectTax('gp')">
                        <span style="font-size: 14px; font-weight: 700;">Gamepass</span>
                        <span class="tax-mode-desc">Pass 30%</span>
                    </button>
                </div>
            </div>
            <div class="profile-dropdown-divider"></div>
            <div class="toggles">
                <div class="theme-toggle" onclick="catalog.toggleTheme()"></div>
                <div class="price-toggle" onclick="catalog.togglePrice()"></div>
            </div>
        `;

    }


    async checkDonationStatus(initial = false) {
        if (!this.token) return;

        try {
            const response = await fetch('https://emwiki.com/api/auth/donation-status', {
                headers: {
                    'Authorization': `Bearer ${this.token}`
                }
            });

            if (response.ok) {
                const data = await response.json();

                if (data.roles) {
                    this.user.role = data.roles;
                } else if (data.role) {
                    // Backward compatibility: if server still sends single role
                    if (!this.user.role) this.user.role = [];
                    if (!this.user.role.includes(data.role)) {
                        this.user.role.push(data.role);
                    }
                }

                if (data.justBecameDonator) {
                    document.getElementById('donator-celebration-card').showPopover();

                    confetti.start();

                    Utils.showToast(
                        'Donator Status Achieved! 💎',
                        `You've donated ${data.totalSpent} Robux! Thank you for your support!`,
                        'success'
                    );

                    setTimeout(() => {
                        confetti.stop();
                    }, 1500);

                    document.querySelector('.profile-action-btn.donator').classList.remove('locked');
                } else if (!data.isDonator && !initial) {

                    document.getElementById('total-donated').textContent = data.totalSpent;
                    document.getElementById('progress-percentage').textContent = `${Math.round(data.progress)}%`;
                    document.getElementById('donation-progress-card').showPopover();
                    document.querySelector('.progress-bar-fill').style.width = `${data.progress}%`;

                } else if (data.isDonator) {
                    document.querySelector('.profile-action-btn.donator').classList.remove('locked');
                }
            }
        } catch (error) {
            console.error('Failed to check donation status:', error);
        }
    }



    closeDonatorCelebration() {
        document.getElementById('donator-celebration-card').hidePopover();

    }

    async logout() {
        if (this.token) {
            await fetch('https://emwiki.com/api/auth/logout', {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${this.token}` }
            });
        }

        localStorage.removeItem('auth_token');


        location.reload();
    }

    setupPWAInstall() {
        const installBtn = document.getElementById('installBtn');
        if (!installBtn) return;

        // Check if device is suitable for PWA install
        const isSuitableDevice = () => {
            const userAgent = navigator.userAgent.toLowerCase();
            const isIOS = /iphone|ipad|ipod/.test(userAgent);
            const isAndroid = /android/.test(userAgent);
            const isWindows = /windows/.test(userAgent);
            const isMac = /macintosh|mac os x/.test(userAgent);
            const isLinux = /linux/.test(userAgent);

            // PWA install is supported on most modern devices except iOS (which requires manual add to home screen)
            // Show on desktop (Windows, Mac, Linux) and Android
            return (isAndroid || isWindows || isMac || isLinux) && !isIOS;
        };

        // Listen for the beforeinstallprompt event
        window.addEventListener('beforeinstallprompt', (e) => {
            // Prevent the default browser install prompt
            e.preventDefault();

            // Store the event for later use
            this.deferredPrompt = e;

            // Only show button on suitable devices
            if (isSuitableDevice()) {
                installBtn.style.display = 'flex';
            }
        });

        // Handle install button click
        installBtn.addEventListener('click', async () => {
            if (!this.deferredPrompt) {
                return;
            }

            // Show the install prompt
            this.deferredPrompt.prompt();

            // Wait for the user to respond to the prompt
            const { outcome } = await this.deferredPrompt.userChoice;

            if (outcome === 'accepted') {
                Utils.showToast('App Installed', 'EM Wiki has been installed successfully!', 'success');
            }

            // Clear the deferred prompt since it can only be used once
            this.deferredPrompt = null;

            // Hide the button after install attempt
            installBtn.style.display = 'none';
        });

        // Check if app is already installed (running in standalone mode)
        if (window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone) {
            // App is already installed, don't show the button
            installBtn.style.display = 'none';
        }

        // Listen for successful app install
        window.addEventListener('appinstalled', () => {
            Utils.showToast('Success', 'EM Wiki has been added to your home screen!', 'success');
            installBtn.style.display = 'none';
            this.deferredPrompt = null;
        });
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


// Confetti System
class Confetti {
    constructor() {
        this.canvas = document.createElement('canvas');
        this.canvas.id = 'confetti-canvas';
        document.body.appendChild(this.canvas);
        this.ctx = this.canvas.getContext('2d');
        this.particles = [];
        this.animationFrame = null;

        this.colors = [
            '#24ff5a', // Green
            '#4a9eff', // Blue
            '#ffd700', // Gold
            '#ff5050', // Red
            '#c960fe', // Purple
            '#ffb135', // Orange
            '#00ffff', // Cyan
            '#ff69b4'  // Pink
        ];

        this.resize();
        window.addEventListener('resize', () => this.resize());
    }

    resize() {
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;
    }

    createParticle(x, y) {
        return {
            x: x || Math.random() * this.canvas.width,
            y: y || -10,
            vx: (Math.random() - 0.5) * 8,
            vy: Math.random() * -15 - 5,
            rotation: Math.random() * 360,
            rotationSpeed: (Math.random() - 0.5) * 10,
            size: Math.random() * 8 + 4,
            color: this.colors[Math.floor(Math.random() * this.colors.length)],
            gravity: 0.5,
            life: 1.0,
            decay: Math.random() * 0.01 + 0.005,
            shape: Math.random() > 0.5 ? 'square' : 'circle'
        };
    }

    start() {
        this.canvas.classList.add('active');
        this.particles = [];

        // Create initial burst from top
        for (let i = 0; i < 150; i++) {
            const x = Math.random() * this.canvas.width;
            this.particles.push(this.createParticle(x, 0));
        }

        // Continue spawning confetti for 2 seconds
        let spawnCount = 0;
        const spawnInterval = setInterval(() => {
            for (let i = 0; i < 10; i++) {
                const x = Math.random() * this.canvas.width;
                this.particles.push(this.createParticle(x, 0));
            }
            spawnCount++;
            if (spawnCount > 20) {
                clearInterval(spawnInterval);
            }
        }, 100);

        this.animate();
    }

    animate() {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        for (let i = this.particles.length - 1; i >= 0; i--) {
            const p = this.particles[i];

            // Update physics
            p.vy += p.gravity;
            p.x += p.vx;
            p.y += p.vy;
            p.rotation += p.rotationSpeed;
            p.life -= p.decay;

            // Remove if off screen or dead
            if (p.y > this.canvas.height + 50 || p.life <= 0) {
                this.particles.splice(i, 1);
                continue;
            }

            // Draw particle
            this.ctx.save();
            this.ctx.translate(p.x, p.y);
            this.ctx.rotate((p.rotation * Math.PI) / 180);
            this.ctx.globalAlpha = p.life;

            this.ctx.fillStyle = p.color;
            this.ctx.shadowColor = p.color;
            this.ctx.shadowBlur = 8;

            if (p.shape === 'square') {
                this.ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size);
            } else {
                this.ctx.beginPath();
                this.ctx.arc(0, 0, p.size / 2, 0, Math.PI * 2);
                this.ctx.fill();
            }

            this.ctx.restore();
        }

        if (this.particles.length > 0) {
            this.animationFrame = requestAnimationFrame(() => this.animate());
        } else {
            this.stop();
        }
    }

    stop() {
        if (this.animationFrame) {
            cancelAnimationFrame(this.animationFrame);
        }
        this.canvas.classList.remove('active');
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    }
}

// ==================== POPOVER MOBILE FIX ====================
// ==================== POPOVER MOBILE FIX ====================
class PopoverManager {
    constructor() {
        this.openPopovers = new Set();
        this.init();
    }

    init() {
        // Track open popovers
        document.addEventListener('toggle', (e) => {
            if (e.target.matches('[popover]')) {
                if (e.newState === 'open') {
                    this.openPopovers.add(e.target);
                } else {
                    this.openPopovers.delete(e.target);
                }
            }
        }, true);

        // Close on outside click/touch
        this.setupOutsideClickHandler();
    }

    setupOutsideClickHandler() {
        // Use a single global handler (more efficient)
        const closeOnOutsideInteraction = (e) => {
            // Don't do anything if no popovers are open
            if (this.openPopovers.size === 0) return;

            this.openPopovers.forEach(popover => {
                // Check if click/touch was outside the popover
                const isClickInside = popover.contains(e.target);

                // Check if click was on a trigger button
                const trigger = document.querySelector(`[popovertarget="${popover.id}"]`);
                const isClickOnTrigger = trigger && trigger.contains(e.target);

                // Close if clicked outside and not on trigger
                if (!isClickInside && !isClickOnTrigger) {
                    popover.hidePopover();
                }
            });
        };

        // Listen to both click and touchend (for mobile)
        document.addEventListener('click', closeOnOutsideInteraction);
        document.addEventListener('touchend', closeOnOutsideInteraction);
    }
}




// Initialize
const popoverManager = new PopoverManager();

// Initialize confetti system
const confetti = new Confetti();
const auth = new Auth();

// Export for use in both pages
if (typeof window !== 'undefined') {
    window.Utils = Utils;
    window.BaseApp = BaseApp;
    window.PriceGraph = PriceGraph;
    window.CountdownManager = CountdownManager;
    window.Auth = auth;
}