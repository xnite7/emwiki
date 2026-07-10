/* Split out of the old js/script.js (see git history). Loaded via js/core/bridge.js. */
import { Utils } from '../core/utils.js';
import { tooltipForPrice } from '../core/valueTiers.js';

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
                                        ''//item.admin ? `Changed by: ${item.admin}` : ''
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
            <button class="modal-nav modal-prev"></button>
            <button class="modal-nav modal-next"></button>

            <div class="modal-container">
                <!-- Credits displayed vertically on the right -->
                
                <div class="modal-content-wrapper">
                    <!-- Front Side -->
                    <div class="modal-content modal-front">
                    <div class="modal-credits" id="modal-credits"></div>
                        <div class="modal-header">
                            <div class="modal-title-wrapper">
                                <h1 class="modal-title"></h1>
                                <div class="modal-alias" id="modal-alias-front" style="display:none;"></div>
                            <div class="modal-quantity" id="modal-quantity" style="display:none;"></div>
                                </div>
                            <div class="modal-price"></div>
                        </div>

                        <canvas class="modal-image" style="display:none;"></canvas>
                        <div class="modal-svg" style="display:none;"></div>

                        <div class="modal-description"></div>
                        
                        <div class="modal-details"></div>
                        
                        <div class="modal-badges">
                            <span class="badge-premium" style="display:none;">Roblox Plus</span>
                            <span class="badge-typicalgroup" style="display:none;">Typical Games</span>
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
                            <div class="metadata-item" id="modal-author" style="display:none;">
                                <strong>Author:</strong> <span></span>
                            </div>
                        </div>
                        
                        <div class="modal-lore-section" id="modal-lore-section" style="display:none;">
                            
                            <div class="modal-lore-content" id="modal-lore-content"></div>
                        </div>
                        <div></div>
                    </div>
                </div>

                <!-- Flip Button (only shown when back content exists) -->
                <button class="modal-flip-btn hidden">
                    <span class="flip-icon">↩</span>
                    <span class="flip-text">More Info</span>
                </button>
                <div class="modal-actions">
                    <div class="modal-action-wrapper">
                        <button class="modal-action-btn modal-favorite-btn" title="Add to Favorites">
                        </button>
                        <span class="modal-action-count modal-favorite-count">0</span>
                    </div>
                    <div class="modal-action-wrapper">
                        <button class="modal-action-btn modal-wishlist-btn" title="Add to Wishlist">
                        </button>
                    </div>
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
            image: (() => {
                const canvas = document.querySelector('.modal-image');
                if (canvas) Utils.protectCanvas(canvas);
                return canvas;
            })(),
            svg: document.querySelector('.modal-svg'),
            description: document.querySelector('.modal-description'),
            details: document.querySelector('.modal-details'),
            flipBtn: document.querySelector('.modal-flip-btn'),
            prevBtn: document.querySelector('.modal-prev'),
            nextBtn: document.querySelector('.modal-next'),
            wishlistBtn: document.querySelector('.modal-wishlist-btn'),
            favoriteBtn: document.querySelector('.modal-favorite-btn'),
            favoriteCount: document.querySelector('.modal-favorite-count'),
            graphSection: document.querySelector('.modal-graph-section'),
            graphContainer: document.querySelector('.modal-graph-container'),
            lastAdmin: document.querySelector('.modal-last-admin'),
            metadataSection: document.querySelector('.modal-metadata-section'),
            loreSection: document.getElementById('modal-lore-section'),
            loreContent: document.getElementById('modal-lore-content'),
            badges: {
                premium: document.querySelector('.badge-premium'),
                typicalgroup: document.querySelector('.badge-typicalgroup'),
                retired: document.querySelector('.badge-retired'),
                removed: document.querySelector('.badge-removed'),
                untradable: document.querySelector('.badge-untradable')
            },
            quantity: document.getElementById('modal-quantity')
        };
    }

    setupEventListeners() {

        window.addEventListener('popstate', () => {
            this.handleURLParams(true);
        });
        this.handleURLParams();

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

    async handleURLParams(reset = false) {
        const url = new URL(window.location);
        const itemParam = url.searchParams.get('item');

        // Handle item modal
        if (itemParam) {
            const itemName = itemParam.replace(/-/g, ' ');
            
            // First try local cache
            let item = this.catalog.allItems.find(i =>
                i.name.toLowerCase() === itemName.toLowerCase()
            );
            
            // If not found locally, fetch from API
            if (!item) {
                try {
                    const searchUrl = new URL('/api/items/search', window.location.origin);
                    searchUrl.searchParams.set('q', itemName);
                    searchUrl.searchParams.set('limit', '10');
                    
                    const res = await fetch(searchUrl.toString());
                    if (res.ok) {
                        const data = await res.json();
                        // Find exact match from results
                        item = data.items?.find(i =>
                            i.name.toLowerCase() === itemName.toLowerCase()
                        );
                    }
                } catch (err) {
                    console.error('Failed to fetch item:', err);
                }
            }
            
            if (item && !this.isOpen) {
                this.open(item);
            }
        } else {
            if (this.isOpen) {
                this.elements.modal.classList.remove('active');
                this.isOpen = false;
                document.body.style.overflow = '';
            }
        }
    }

    

    open(item) {
        this.currentItem = item;
        this.currentIndex = this.displayed.findIndex(i => i.name === item.name);

        // Update content
        this.updateContent(item);

        // Check if item has back content
        const hasHistory = item.priceHistory && item.priceHistory.filter(h => h.price !== 0 && h.price !== '0').length >= 2;
        const hasMetadata = item.author;
        const hasLore = item.lore && item.lore.trim() !== '';
        const hasBackContent = hasHistory || hasMetadata || hasLore;

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
                const wonkySound = new Audio('https://emwiki.com/imgs/boing.wav');
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
        const hasMetadata = item.author;
        const hasLore = item.lore && item.lore.trim() !== '';

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
                //this.elements.lastAdmin.textContent = `Last updated by ${lastChange.admin}`;
                //this.elements.lastAdmin.style.display = 'block';
                this.elements.lastAdmin.style.display = 'none';
            } else {
                this.elements.lastAdmin.style.display = 'none';
            }
        } else {
            this.elements.graphSection.style.display = 'none';
        }

        // Update metadata section (for author)
        if (hasMetadata) {
            this.elements.metadataSection.style.display = 'block';
            const authorEl = document.getElementById('modal-author');
            if (item.author && authorEl) {
                authorEl.style.display = 'block';
                authorEl.querySelector('span').textContent = item.author;
            } else if (authorEl) {
                authorEl.style.display = 'none';
            }
        } else {
            this.elements.metadataSection.style.display = 'none';
        }

        // Update lore section
        if (hasLore) {
            this.elements.loreSection.style.display = 'block';
            this.elements.loreContent.textContent = item.lore;
        } else {
            this.elements.loreSection.style.display = 'none';
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

        // Scale the title down for long names so it wraps to fit the header
        // instead of squeezing the price/robux badge beside it.
        const nameLen = (item.name || '').length;
        const titleSize = nameLen <= 14
            ? 1.9
            : Math.max(1.15, 1.9 - (nameLen - 14) * 0.055);
        this.elements.title.style.fontSize = titleSize.toFixed(3) + 'rem';

        // Alias (displayed under title with AKA prefix)
        const aliasEl = document.getElementById('modal-alias-front');
        if (item.alias && item.alias.trim() && aliasEl) {
            aliasEl.textContent = `AKA ${item.alias}`;
            aliasEl.style.display = 'block';
        } else if (aliasEl) {
            aliasEl.style.display = 'none';
        }
        
        this.elements.description.innerHTML = item.from || '';

        // Price
        if (item.price !== '0') {
            this.updatePriceDisplay();
            this.elements.price.style.display = 'flex';
        } else {
            this.elements.price.style.display = 'none';
        }

        // Quantity (displayed on front, left bottom corner, tilted)
        // Can be static (string), dynamic (9+ digits badge ID for live count from Roblox), or 'group' for group member count
        if (item.quantity && item.quantity.trim() !== '' && this.elements.quantity) {
            const quantityValue = item.quantity.trim();
            
            // Check if quantity is a badge ID (9+ digits) for dynamic count
            if (Utils.isBadgeId(quantityValue)) {
                // Show loading state
                this.elements.quantity.textContent = 'x...';
                this.elements.quantity.style.display = 'block';
                this.elements.quantity.title = 'Loading badge count...';
                
                // Fetch badge data asynchronously
                Utils.getBadgeData(quantityValue).then(badgeData => {
                    if (badgeData && badgeData.awardedCount !== undefined) {
                        this.elements.quantity.textContent = 'x' + Utils.formatNumber(badgeData.awardedCount);
                        this.elements.quantity.title = `${badgeData.name || 'Badge'}: ${Utils.formatNumber(badgeData.awardedCount)} awarded`;
                    } else {
                        // Badge fetch failed, hide quantity
                        this.elements.quantity.style.display = 'none';
                        this.elements.quantity.title = '';
                    }
                }).catch(() => {
                    // On error, hide quantity
                    this.elements.quantity.style.display = 'none';
                    this.elements.quantity.title = '';
                });
            } else if (quantityValue === 'group') {
                // Show loading state
                this.elements.quantity.textContent = 'x...';
                this.elements.quantity.style.display = 'block';
                this.elements.quantity.title = 'Loading group member count...';
                
                // Fetch group data asynchronously
                Utils.getGroupData('2649054').then(groupData => {
                    if (groupData && groupData.memberCount !== undefined) {
                        this.elements.quantity.textContent = 'x' + Utils.formatNumber(groupData.memberCount);
                        this.elements.quantity.title = `${groupData.name || 'Group'}: ${Utils.formatNumber(groupData.memberCount)} members`;
                    } else {
                        // Group fetch failed, hide quantity
                        this.elements.quantity.style.display = 'none';
                        this.elements.quantity.title = '';
                    }
                }).catch(() => {
                    // On error, hide quantity
                    this.elements.quantity.style.display = 'none';
                    this.elements.quantity.title = '';
                });
            } else {
                // Static quantity - display as-is
                this.elements.quantity.textContent = 'x' + quantityValue;
                this.elements.quantity.style.display = 'block';
                this.elements.quantity.title = '';
            }
        } else if (this.elements.quantity) {
            this.elements.quantity.style.display = 'none';
            this.elements.quantity.title = '';
        }

        this.elements.image.style.scale = 0;

        // Image/SVG
        if (item.img) {
            const ctx = this.elements.image.getContext('2d');
            const img = new Image();
            img.onload = function () {
                this.elements.image.width = img.width;
                this.elements.image.height = img.height;
                ctx.drawImage(img, 0, 0);
                this.elements.image.style.scale = 1;
            }.bind(this);
            // Use optimized image for modal (higher quality, larger size)
            img.src = Utils.getOptimizedImage(item.img, { width: 800, quality: 90, format: 'webp', fit: 'scale-down' }) || item.img;
            Utils.protectCanvas(this.elements.image);

            
            this.elements.image.style.display = 'block';
            this.elements.svg.style.display = 'none';
            this.elements.title.style.opacity = 'unset';
            this.elements.title.style.lineHeight = 'unset';

        } else if (item.svg) {
            this.elements.svg.outerHTML = item.svg;
            this.elements.svg = this.elements.container.querySelector('.modal-content>svg');
            
            this.elements.svg.classList.add('modal-svg');
            this.elements.svg.style.display = 'unset';
            this.elements.image.style.display = 'none';
            this.elements.title.style.opacity = '0';
            this.elements.title.style.lineHeight = '0';



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
        this.elements.badges.typicalgroup.style.display = item.typicalgroup ? 'inline-block' : 'none';
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

        // Credits (displayed vertically on right side)
        const creditsEl = document.getElementById('modal-credits');
        if (item.credits && item.credits.trim() && creditsEl) {
            // Fetch username if it's a Roblox ID, otherwise use as-is





            Utils.getRobloxUsername(item.credits).then(username => {
                creditsEl.textContent = username;
                // Calculate font size based on text length (between 15px and 20px)
                // Longer text = smaller font, shorter text = larger font
                const textLength = username.length;
                const minFontSize = 32;
                const maxFontSize = 60;
                const maxLength = 13; // Assume 30 chars is the threshold for minimum font size

                let fontSize;
                if (textLength >= maxLength) {
                    fontSize = minFontSize;
                } else {
                    // Linear interpolation: fontSize decreases as length increases
                    fontSize = maxFontSize - ((textLength / maxLength) * (maxFontSize - minFontSize));
                }

            creditsEl.style.fontSize = `${fontSize}px`;

            });
            creditsEl.style.display = 'block';
        } else if (creditsEl) {
            creditsEl.style.display = 'none';
        }
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
            unobtainable: "https://emwiki.com/imgs/Red_x.png",
            robux: "https://emwiki.com/imgs/cf8ZvY7.png",
            coins: "https://emwiki.com/imgs/Coin.webp",
            stars: "https://emwiki.com/imgs/WKeX5AS.png",
            visors: "https://emwiki.com/imgs/7IoLZCN.png",
            pumpkins: "https://emwiki.com/imgs/bHRBTrU.png",
            eggs: "https://emwiki.com/imgs/qMxjgQy.png",
            opals: "https://emwiki.com/imgs/wwMMAvr.png",
            baubles: "https://emwiki.com/imgs/bauble.png",
            tokens: "https://emwiki.com/imgs/Cy9r140.png",
            candies: "https://emwiki.com/imgs/candy.png"
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
                const hasMetadata = this.currentItem.author;
                const hasLore = this.currentItem.lore && this.currentItem.lore.trim() !== '';
                const hasBackContent = hasHistory || hasMetadata || hasLore;

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

    async updateActionButtons() {
        if (!this.currentItem) return;

        const isFavorite = this.catalog.favorites.includes(this.currentItem.name);
        const isWishlisted = this.catalog.wishlist.includes(this.currentItem.name);

        this.elements.favoriteBtn.classList.toggle('active', isFavorite);
        this.elements.favoriteBtn.title = isFavorite ? 'Remove from Favorites' : 'Add to Favorites';
        // Update wishlist button
        this.elements.wishlistBtn.classList.toggle('active', isWishlisted);
        this.elements.wishlistBtn.title = isWishlisted ? 'Remove from Wishlist' : 'Add to Wishlist';

    
        // Fetch and update favorite count
        await this.updateFavoriteCount();

        this.elements.favoriteCount.textContent = isFavorite ? parseInt(this.elements.favoriteCount.textContent) + 1 : this.elements.favoriteCount.textContent;

        this.elements.favoriteCount.textContent = isWishlisted ? parseInt(this.elements.favoriteCount.textContent) + 1 : this.elements.favoriteCount.textContent;
    }

    async updateFavoriteCount(zeed = true) {
        if (!this.currentItem || !this.elements.favoriteCount) return;
        try {
            const response = await fetch(`/api/auth/user/preferences/stats?item=${encodeURIComponent(this.currentItem.name)}`);
            if (response.ok) {
                const data = await response.json();
                const totalCount = (data.favorites_count || 0) + (data.wishlist_count || 0);
                this.elements.favoriteCount.textContent = totalCount.toLocaleString();
            } else {
                this.elements.favoriteCount.textContent = '0';
            }
        } catch (e) {
            console.error('Error fetching favorite count:', e);
            this.elements.favoriteCount.textContent = '0';
        }
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

        const starSVG = `<svg class="demand-star" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
            <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
        </svg>`;

        const stars = [];
        for (let i = 0; i < 5; i++) {
            if (i < item.demand) {
                stars.push(starSVG);
            } else {
                stars.push(starSVG.replace('demand-star"', 'demand-star empty"'));
            }
        }

        // Tier "+" / Owner's Choice explanation — same tap-to-reveal pattern as
        // the tax indicator, so it works on touch where hover doesn't exist.
        const tierTip = item.unstable ? null : tooltipForPrice(item.price, this.catalog.taxMode);

        this.elements.price.innerHTML = `
            <h2${item.unstable ? ' class="unstable" title="Unstable value — recently added or returned to Gamenight, so its price is volatile."' : ''}${tierTip ? ' class="has-tier-tooltip" onclick="event.stopPropagation(); this.classList.toggle(\'show-tooltip\')"' : ''}>${convertedPrice}${item.unstable ? '<span class="unstable-mark">!</span>' : ''}${tierTip ? `<span class="tax-tooltip tier-tooltip">${tierTip}</span>` : ''}</h2>

            ${this.catalog.taxMode !== 'nt' ? `
                <span class="modal-tax-indicator" onclick="event.stopPropagation(); this.classList.toggle('show-tooltip')">
                    ${currentTax.short}
                    <span class="tax-tooltip">${currentTax.full}</span>
                </span>

            ` : ''}
            ${item.demand !== undefined && item.demand > 0 ? `<div class="modal-demand ${item.demand === 1 ? 'bad-demand' : item.demand === 2 ? 'okay-demand' : item.demand === 3 ? 'good-demand' : item.demand === 4 ? 'great-demand' : 'amazing-demand'}"><div class="demand-stars">${stars.join('')}</div></div>` : ''}
        `;

        // Remove old note if it exists
        const existingNote = this.elements.price.parentElement.querySelector('.modal-tax-note');
        if (existingNote) existingNote.remove();
    }
}

export { PriceGraph, ItemModal };
