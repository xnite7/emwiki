/* Split out of the old js/script.js (see git history). Loaded via js/core/bridge.js. */
import { Utils } from './utils.js';
import { ItemModal } from '../components/item-modal.js';
import { renderItemCard, addItemBadges, fitItemName } from '../components/item-card.js';
import { tierLabelForPrice, tooltipForPrice } from './valueTiers.js';

// ==================== BASE APP CLASS ====================
class BaseApp {
    constructor() {
        this.domCache = {
            searchBar: null,
            searchResults: null,
            catalog: null
        };
        console.log('running script #1')

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
        this.setupItemDelegation();


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
                            <img style="width: 110px;" src="https://emwiki.com/imgs/Epic.png" alt="Donation Icon">
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

            
            
            <div id="stats-dashboard" class="stats-dashboard">
                <div class="stats-content">
                    <div class="stats-header">
                        <h1>My Lists</h1>
                        <btn class="close-btn" onclick="catalog.closeStats()"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"></path><path d="m6 6 12 12"></path></svg></btn>
                    </div>
                        <div style="display: flex; justify-content: space-between; align-items: center; padding: 0px 10px 7px;">
                            <h3
                                id="wishlist-tab" class="active" onclick="catalog.switchListMode('wishlist')">
                                <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"
                                    style="width:26px;margin-bottom:-7px;">
                                    <path
                                        d="M14 10h-1V9c0-.6-.4-1-1-1s-1 .4-1 1v1h-1c-.6 0-1 .4-1 1s.4 1 1 1h1v1c0 .6.4 1 1 1s1-.4 1-1v-1h1c.6 0 1-.4 1-1s-.4-1-1-1" />
                                    <path
                                        d="M19 3H5c-.6 0-1 .4-1 1s.4 1 1 1v14.1c0 .7.4 1.4 1.1 1.8.3.2.6.2.9.2.4 0 .8-.1 1.1-.3l3.9-2.6 3.9 2.6c.6.4 1.4.5 2.1.1.7-.3 1.1-1 1.1-1.8V5c.6 0 1-.4 1-1s-.5-1-1.1-1m-2 16.1-3.9-2.6c-.3-.2-.7-.3-1.1-.3s-.8.1-1.1.3L7 19.1V5h10z" />
                                </svg> Wishlist
                            </h3>
                            <h3
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
                        <h3><svg stroke="#fff"
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
                <img src="https://emwiki.com/imgs/uparrow.png" alt="Back to top">
            </button>
            `
        );


        setTimeout(() => this.updateStatsIfOpen(), 1500);
        this.setupScrollEffects();


    }


    setupScrollEffects() {
        // Back to top button
        const backToTop = document.getElementById('backToTop');

        // Throttle to one update per animation frame (passive) so the scroll
        // thread isn't blocked and we don't toggle the class on every pixel.
        let backToTopTicking = false;
        window.addEventListener('scroll', () => {
            if (backToTopTicking) return;
            backToTopTicking = true;
            requestAnimationFrame(() => {
                backToTop.classList.toggle('show', window.pageYOffset > 300);
                backToTopTicking = false;
            });
        }, { passive: true });

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
            // Fetch all preferences in one API call instead of 4 separate calls
            const prefs = await Utils.loadAllFromAccount({
                favorites: [],
                wishlist: [],
                recentlyViewed: [],
                taxMode: 'nt'
            });
            this.favorites = prefs.favorites;
            this.wishlist = prefs.wishlist;
            this.recentlyViewed = prefs.recentlyViewed;
            this.taxMode = prefs.taxMode;
        } else {
            this.favorites = Utils.loadFromStorage('favorites', []);
            this.wishlist = Utils.loadFromStorage('wishlist', []);
            this.recentlyViewed = Utils.loadFromStorage('recentlyViewed', []);
            this.taxMode = Utils.loadFromStorage('taxMode', 'nt');
        }

        this.showPrices = Utils.loadFromStorage('showPrices', true);
        this.LoadPrice();

        await this.selectTax(this.taxMode);
        // Don't await here - let it update async in background
        this.updateStatsIfOpen();
    }

    async loadData() {
        try {
            // Check localStorage cache first
            const cached = Utils.loadFromStorage('itemsCache', null);
            const cacheTime = Utils.loadFromStorage('itemsCacheTime', 0);
            const CACHE_TTL = 10 * 1000; //5 * 60 * 1000; // 1 hour cache

            if (cached && (Date.now() - cacheTime) < CACHE_TTL) {
                this.allItems = cached;
                console.log(`Loaded ${this.allItems.length} items from cache`);
                return this.allItems;
            }

            // Fetch all items at once (no category filter) - single API call
            const url = new URL('/api/items', window.location.origin);
            url.searchParams.set('limit', '2000');

            const res = await fetch(url.toString());
            if (!res.ok) throw new Error('Failed to fetch items');

            const data = await res.json();
            this.allItems = data.items || [];

            // Cache in localStorage
            Utils.saveToStorage('itemsCache', this.allItems);
            Utils.saveToStorage('itemsCacheTime', Date.now());

            console.log(`Loaded ${this.allItems.length} items from database`);
            return this.allItems;
        } catch (error) {
            console.error('Failed to load data:', error);
            Utils.showToast('Error', 'Failed to load items', 'error');
            return null;
        }
    }

    /**
     * Ensures items are loaded for "My Lists" functionality.
     * Only fetches if we have wishlist/favorites items that aren't in allItems.
     */
    async ensureItemsLoaded() {
        const itemsToShow = this.currentListMode === 'wishlist' ? this.wishlist : this.favorites;
        
        // Check if all needed items are already loaded
        const allItemsSet = new Set(this.allItems.map(i => i.name));
        const missingItems = itemsToShow.filter(name => !allItemsSet.has(name));
        
        if (missingItems.length === 0) return; // All items already loaded
        
        // Need to load items - fetch from API
        console.log(`Loading ${missingItems.length} missing items for My Lists...`);
        await this.loadData();
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

        } else if (now.getMonth() === 1) { // if february

            rarities = [{
                type: "https://emwiki.com/imgs/epicfaces/loveface.png",
                chance: 20
            }, {
                type: "https://emwiki.com/imgs/epicfaces/o7IJiwl.png",
                chance: 20
            }, {
                type: "https://emwiki.com/imgs/epicfaces/loveface.png",
                chance: 0
            }];

            titleColors = [
                ['#ff4d6d', '#ff8fab']
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
        if (grad1Stops.length >= 2) {
            grad1Stops[0].setAttribute('style', `stop-color: ${titleColors[0][1]}`);
            grad1Stops[1].setAttribute('style', `stop-color: ${titleColors[0][0]}`);
        }

        // Update gradient 2
        if (grad2Stops.length >= 2) {
            grad2Stops[0].setAttribute('style', `stop-color: ${titleColors[0][1]}`);
            grad2Stops[1].setAttribute('style', `stop-color: ${titleColors[0][0]}`);
        }

        const epicImage = document.getElementById('epic-image');
        if (epicImage) {
            epicImage.setAttribute('href', pickRandom(rarities));
        }
    }

    getItemCategory(item) {
        return item.category;
    }

    createItemElement(item) {
        this.modal.displayed.push(item);
        return renderItemCard(item, {
            wishlist: this.wishlist,
            favorites: this.favorites,
            convertPrice: (p) => this.convertPrice(p),
            priceTooltip: (p) => this.priceTooltip(p),
            category: this.getItemCategory(item)
        });
    }

    setupItemDelegation() {
        // One set of document-level listeners for every card built by createItemElement, instead of
        // ~6 listeners per card (300+ per catalog batch). Cards set `el._item`; profile's read-only
        // cards don't, so they're ignored here and keep their own click handler.
        document.addEventListener('click', (e) => {
            const card = e.target.closest('.item');
            if (!card || !card._item) return;
            const item = card._item;

            // Wishlist ⭐ button
            if (e.target.closest('.wishlist-button')) {
                this.toggleWishlist(item.name);
                return;
            }

            // Favorite ❤ button (with particle burst on add)
            const heartBtn = e.target.closest('.heart-button');
            if (heartBtn) {
                const rect = heartBtn.getBoundingClientRect();
                const wasFavorite = heartBtn.classList.contains('red');
                this.toggleFavorite(item.name);
                if (!wasFavorite && this.particleSystem) {
                    this.particleSystem.createParticles(rect.left + rect.width / 2, rect.top + rect.height / 2);
                }
                return;
            }

            // Anywhere else on the card opens the modal
            this.modal.open(item);
        });

        // Mobile long-press → context menu, delegated once (mirrors the old per-card 500 ms timer).
        let pressTimer = null;
        let startX = 0, startY = 0, hasMoved = false, pressItem = null;

        const endPress = () => {
            if (pressTimer !== null) {
                clearTimeout(pressTimer);
                pressTimer = null;
            }
        };

        document.addEventListener('touchstart', (e) => {
            const card = e.target.closest('.item');
            if (!card || !card._item) return;
            pressItem = card._item;
            startX = e.touches[0].clientX;
            startY = e.touches[0].clientY;
            hasMoved = false;
            endPress();
            pressTimer = setTimeout(() => {
                pressTimer = null;
                if (!hasMoved) {
                    this.showContextMenu(startX, startY, pressItem);
                }
            }, 500);
        }, { passive: true });

        document.addEventListener('touchmove', (e) => {
            if (pressTimer === null) return;
            const moveX = Math.abs(e.touches[0].clientX - startX);
            const moveY = Math.abs(e.touches[0].clientY - startY);
            if (moveX > 10 || moveY > 10) {
                hasMoved = true;
                endPress();
            }
        }, { passive: true });

        document.addEventListener('touchend', endPress);
        document.addEventListener('touchcancel', endPress);
    }

    showContextMenu(x, y, item) {
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
            <div class="context-menu-item ${isFavorite ? 'active' : ''}" data-action="favorite">
                ${isFavorite ? 'Remove from Favorites' : 'Add to Favorites'}
            </div>
            <div class="context-menu-item ${isWishlisted ? 'active' : ''}" data-action="wishlist">
                ${isWishlisted ? 'Remove from Wishlist' : 'Add to Wishlist'}
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
                    this.toggleFavorite(item.name);
                } else if (action === 'wishlist') {
                    this.toggleWishlist(item.name);
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
        addItemBadges(element, item);
    }

    initializeSearch() {
        this.domCache.searchBar = document.getElementById('search-bar');
        this.domCache.searchResults = document.getElementById('search-results');
        if (!this.domCache.searchBar || !this.domCache.searchResults) return;

        // Initialize Fuse.js with allItems (will be populated after loadData)
        // Use API search for better performance when items are loaded
        this.searchFuse = null;
        this.searchTimeout = null;

        this.domCache.searchBar.addEventListener('input', async (e) => {
            const query = e.target.value.trim();
            if (!query) {
                this.domCache.searchResults.style.display = 'none';
                return;
            }

            // Clear previous timeout
            if (this.searchTimeout) {
                clearTimeout(this.searchTimeout);
            }

            // Debounce search
            this.searchTimeout = setTimeout(async () => {
                // Use API search endpoint for better performance
                try {
                    const url = new URL('/api/items/search', window.location.origin);
                    url.searchParams.set('q', query);
                    url.searchParams.set('limit', '6');
                    
                    const res = await fetch(url.toString());
                    if (!res.ok) throw new Error('Search failed');
                    
                    const data = await res.json();
                    const items = data.items || [];
                    
                    // Format results for displaySearchResults
                    const results = items.map(item => ({ item }));
                    this.displaySearchResults(results);
                } catch (error) {
                    console.error('Search error:', error);
                    // Fallback to Fuse.js if API fails
                    if (this.allItems.length > 0 && !this.searchFuse) {
                        this.searchFuse = new Fuse(this.allItems, {
                            keys: ['name'],
                            threshold: 0.3
                        });
                    }
                    if (this.searchFuse) {
                        const results = this.searchFuse.search(query).slice(0, 6);
                        this.displaySearchResults(results);
                    }
                }
            }, 200);
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
            await Utils.saveToStorage('recentlyViewed', this.recentlyViewed);
        } else {
            Utils.saveToStorage('recentlyViewed', this.recentlyViewed);
        }
    }

    async openStats() {
        document.getElementById('stats-dashboard').classList.add('show');
        await this.updateStatsIfOpen();
        document.getElementById('profile-dropdown')?.hidePopover();
    }

    closeStats() {
        document.getElementById('stats-dashboard').classList.remove('show');
    }

    async switchListMode(mode) {
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

        await this.updateStatsIfOpen();
    }

    viewAllInCatalog() {
        // Navigate to catalog page with the current list mode as filter parameter
        window.location.href = `/catalog?filter=${this.currentListMode}`;
    }

    async updateStatsIfOpen() {
        if (!document.getElementById('stats-dashboard').classList.contains('show')) return;

        const wishlistDiv = document.getElementById('wishlist-items');
        const itemsToShow = this.currentListMode === 'wishlist' ? this.wishlist : this.favorites;
        
        // Check if we need to load items
        const allItemsSet = new Set(this.allItems.map(i => i.name));
        const missingItems = itemsToShow.filter(name => !allItemsSet.has(name));
        
        if (missingItems.length > 0) {
            // Show loading state while fetching items
            wishlistDiv.innerHTML = '<div style="text-align: center; padding: 20px; color: var(--text-secondary);">Loading items...</div>';
            await this.ensureItemsLoaded();
        }

        // Update wishlist or favorites based on mode
        wishlistDiv.innerHTML = '';
        document.getElementById('wishlist-value').style.gridTemplateColumns = '';
        let totalValue = 0;

        itemsToShow.forEach(itemName => {
            const item = this.allItems.find(i => i.name === itemName);
            if (item) {
                const div = document.createElement('div');
                div.className = 'item';
                div.innerHTML = `
                    <small class="item-name">${item.name}</small>
                    <div class="remove-wishlist">×</div>
                `;
                fitItemName(div.querySelector('.item-name'), item.name);

                if (item.img) {
                    const img = document.createElement('img');
                    img.loading = 'lazy';
                    img.decoding = 'async';
                    img.className = 'itemimg';

                    img.alt = item.name || '';
                    // Use optimized image for wishlist items (thumbnail size)
                    img.src = Utils.getOptimizedImage(item.img, { width: 70, height: 70, format: 'webp', fit: 'scale-down' }) || item.img;
                    Utils.protectImage(img);
                    div.appendChild(img);
                } else if (item.svg) {
                    div.insertAdjacentHTML('beforeend', item.svg);
                }

                div.insertAdjacentHTML('beforeend', this.itemPriceHTML(item));

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
                    totalValue += this.parsePriceValue(item.price);
                }
            }
        });

        // Show empty state if no items
        if (itemsToShow.length === 0) {
            const listType = this.currentListMode === 'wishlist' ? 'wishlist' : 'favorites';
            wishlistDiv.innerHTML = `<div class="empty" style="text-align: center; padding: 20px; color: var(--text-secondary);">
                Your ${listType} is empty.<br>
                <small>Add items from the <a href="/catalog" style="color: var(--text-primary);">catalog</a>!</small>
            </div>`;
            document.getElementById('wishlist-value').style.gridTemplateColumns = 'unset';

        }

        document.getElementById('wishlist-value').textContent = totalValue.toLocaleString();

        // Update recently viewed
        const recentDiv = document.getElementById('recent-viewed-items');
        recentDiv.innerHTML = '';

        this.recentlyViewed.slice(0, 5).forEach(itemName => {
            const item = this.allItems.find(i => i.name === itemName);
            if (item) {
                const div = document.createElement('div');
                div.className = 'item';
                div.innerHTML = `<small class="item-name" style="z-index:2;font-size:10px;margin-top:5px;">${item.name}</small>`;
                fitItemName(div.querySelector('.item-name'), item.name, 10);
                if (item.img) {
                    const img = document.createElement('img');
                    img.loading = 'lazy';
                    img.decoding = 'async';
                    img.className = 'itemimg';

                    img.alt = item.name || '';
                    // Use optimized image for favorites list (thumbnail size)
                    img.src = Utils.getOptimizedImage(item.img, { width: 70, height: 70, format: 'webp', fit: 'scale-down' }) || item.img;
                    Utils.protectImage(img);
                    div.appendChild(img);
                } else if (item.svg) {
                    div.insertAdjacentHTML('beforeend', item.svg);
                }

                div.insertAdjacentHTML('beforeend', this.itemPriceHTML(item));


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
                if (priceEl) {
                    priceEl.textContent = this.convertPrice(item.price);
                    if (!item.unstable) {
                        // Tax can move an item across the tier floor, so refresh
                        // the "+"/O-C tooltip to match the value now shown.
                        const tip = this.priceTooltip(item.price);
                        priceEl.classList.toggle('has-tier-tooltip', !!tip);
                        if (tip) priceEl.title = tip; else priceEl.removeAttribute('title');
                    }
                }
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

        // Values >= 1000 display as a tier label derived from the raw stored
        // value (single source of truth in valueTiers.js). Tax mode is applied
        // to the value before the lookup so the tier tracks the tax the user is
        // viewing. Anything below 1000 (or unparseable) falls through to the
        // exact-value conversion below.
        const tierLabel = tierLabelForPrice(price, this.taxMode);
        if (tierLabel) return tierLabel;

        // Below the tier floor: everything that reaches here is under 1000
        // (values >= 1000 already returned a tier label above). Per the tier
        // spec, sub-1000 values display the raw number with NO trailing "+".
        const cleanStr = String(price).replace('+', '');

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

        return parseAndConvert(cleanStr);
    }

    // Tooltip text for a stored price under the active tax mode: explains the
    // tier "+" for numeric tiers, "Owner's Choice" for O/C, null otherwise.
    priceTooltip(price) {
        return tooltipForPrice(price, this.taxMode);
    }

    // Shared markup for an item's price chip (wishlist/list views). Renders the
    // tier label via convertPrice and attaches the tier/O-C tooltip (or the
    // unstable warning, which takes precedence) as a native title.
    itemPriceHTML(item) {
        if (item.price === '' || item.price == null) return '';
        const hidden = item.price == '0' ? 'opacity: 0; height: 16px;' : '';
        let cls = 'item-price';
        let title = '';
        if (item.unstable) {
            cls += ' unstable';
            title = ' title="Unstable value — recently added or returned to Gamenight, so its price is volatile."';
        } else {
            const tip = this.priceTooltip(item.price);
            if (tip) { cls += ' has-tier-tooltip'; title = ` title="${tip}"`; }
        }
        const mark = item.unstable ? '<span class="unstable-mark">!</span>' : '';
        return `<div class="${cls}"${title} style="${hidden}">${this.convertPrice(Utils.formatPrice(item.price))}${mark}</div>`;
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


export { BaseApp, ParticleSystem };
