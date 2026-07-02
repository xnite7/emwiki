/* Split out of the old js/script.js (see git history). Loaded via js/core/bridge.js. */
// ==================== UTILITIES ====================
const Utils = {

    // Prevent right-click and drag on canvas elements
    protectCanvas(canvas) {
        if (!canvas) return;
        canvas.addEventListener('contextmenu', (e) => e.preventDefault());
        canvas.style.userSelect = 'none';
        canvas.style.webkitUserSelect = 'none';
    },

    // Same right-click/drag protection as protectCanvas, for <img> elements.
    // Lets us use native lazy-loading instead of drawing every image to a canvas.
    protectImage(img) {
        if (!img) return;
        img.draggable = false;
        img.addEventListener('contextmenu', (e) => e.preventDefault());
        img.style.userSelect = 'none';
        img.style.webkitUserSelect = 'none';
    },

    // Escape a value for safe interpolation inside an innerHTML template literal.
    // Use this for ANY user-supplied data being inserted via innerHTML.
    escapeHtml(value) {
        if (value === null || value === undefined) return '';
        const el = document.createElement('div');
        el.textContent = String(value);
        return el.innerHTML;
    },

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

        // Wait for session check to complete before making authenticated API calls
        if (window.Auth?.waitForSession) {
            await window.Auth.waitForSession();
        }
        
        // Re-check token after waiting (session check might have invalidated it)
        const currentToken = localStorage.getItem('auth_token');
        if (!currentToken) return false;

        try {
            const response = await fetch('/api/auth/user/preferences', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${currentToken}`,
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

        // Wait for session check to complete before making authenticated API calls
        if (window.Auth?.waitForSession) {
            await window.Auth.waitForSession();
        }
        
        // Re-check token after waiting (session check might have invalidated it)
        const currentToken = localStorage.getItem('auth_token');
        if (!currentToken) return defaultValue;

        try {
            const response = await fetch(`/api/auth/user/preferences?key=${key}`, {
                headers: { 'Authorization': `Bearer ${currentToken}` }
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

    async loadAllFromAccount(defaults) {
        const token = localStorage.getItem('auth_token');
        if (!token) return defaults;

        // Wait for session check to complete before making authenticated API calls
        // This prevents race conditions where this call interferes with the session check
        if (window.Auth?.waitForSession) {
            await window.Auth.waitForSession();
        }
        
        // Re-check token after waiting (session check might have invalidated it)
        const currentToken = localStorage.getItem('auth_token');
        if (!currentToken) return defaults;

        try {
            const response = await fetch('/api/auth/user/preferences', {
                headers: { 'Authorization': `Bearer ${currentToken}` }
            });

            if (response.ok) {
                const data = await response.json();
                return { ...defaults, ...data };
            }
        } catch (error) {
            console.error('Failed to load all preferences:', error);
        }

        return defaults;
    },

    async migrateToAccount() {
        const token = localStorage.getItem('auth_token');
        if (!token) return;
        
        // Wait for session check to complete before making authenticated API calls
        if (window.Auth?.waitForSession) {
            await window.Auth.waitForSession();
        }
        
        // Re-check token after waiting (session check might have invalidated it)
        const currentToken = localStorage.getItem('auth_token');
        if (!currentToken) return;
        
        const localData = {
            favorites: Utils.loadFromStorage('favorites', []),
            wishlist: Utils.loadFromStorage('wishlist', [])
        };
        const onlineData = {
            favorites: await Utils.loadFromAccount('favorites', []),
            wishlist: await Utils.loadFromAccount('wishlist', [])
        };
        const hasData = localData.favorites.length > 0 ||
            localData.wishlist.length > 0;
        if (!hasData) return;
        const hasData2 = onlineData.favorites.length > 0 ||
            onlineData.wishlist.length > 0;
        if (hasData2) return;
        try {
            const response = await fetch('/api/auth/user/preferences/migrate', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${currentToken}`,
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

    // Cache for Roblox usernames and avatars with timestamps
    robloxCache: new Map(),

    // Initialize cache from localStorage
    initRobloxCache() {
        try {
            const cached = localStorage.getItem('roblox_user_cache');
            if (cached) {
                const cacheData = JSON.parse(cached);
                const now = Date.now();
                const oneDayMs = 24 * 60 * 60 * 1000;
                
                // Load valid entries (less than 24 hours old)
                for (const [userId, entry] of Object.entries(cacheData)) {
                    if (now - entry.timestamp < oneDayMs) {
                        this.robloxCache.set(userId, entry);
                    }
                }
                
                // Clean up expired entries from localStorage
                const validCache = {};
                for (const [userId, entry] of this.robloxCache.entries()) {
                    validCache[userId] = entry;
                }
                localStorage.setItem('roblox_user_cache', JSON.stringify(validCache));
            }
        } catch (error) {
            console.error('Failed to load Roblox cache:', error);
        }
    },

    // Save cache to localStorage
    saveRobloxCache() {
        try {
            const cacheData = {};
            for (const [userId, entry] of this.robloxCache.entries()) {
                cacheData[userId] = entry;
            }
            localStorage.setItem('roblox_user_cache', JSON.stringify(cacheData));
        } catch (error) {
            console.error('Failed to save Roblox cache:', error);
        }
    },

    // Fetch Roblox username and avatar from user ID
    async getRobloxUserData(userId) {
        if (!userId || !/^\d+$/.test(userId)) {
            return null;
        }

        const now = Date.now();
        const oneDayMs = 24 * 60 * 60 * 1000;

        // Check cache first
        if (this.robloxCache.has(userId)) {
            const cached = this.robloxCache.get(userId);
            // If cache is less than 24 hours old, return cached data
            if (now - cached.timestamp < oneDayMs) {
                return cached;
            }
            // Cache expired, remove it
            this.robloxCache.delete(userId);
        }

        // Fetch from API
        try {
            const response = await fetch(`/api/roblox-proxy?userId=${userId}`);
            if (response.ok) {
                const data = await response.json();
                const cacheEntry = {
                    name: data.name || data.displayName || userId,
                    displayName: data.displayName || data.name || userId,
                    avatar: data.avatar || null,
                    timestamp: now
                };
                
                // Cache the result
                this.robloxCache.set(userId, cacheEntry);
                this.saveRobloxCache();
                
                return cacheEntry;
            }
        } catch (error) {
            console.error('Failed to fetch Roblox user data:', error);
        }

        return null;
    },

    // Fetch Roblox username from user ID (backward compatibility)
    async getRobloxUsername(credits) {
        if (!credits || !credits.trim()) return credits;
        
        // Check if it's a numeric ID (Roblox user IDs are numeric)
        const userId = credits.trim();
        if (!/^\d+$/.test(userId)) {
            // Not a numeric ID, return as-is
            return credits;
        }

        const userData = await this.getRobloxUserData(userId);
        return userData ? userData.name : credits;
    },

    // Cache for Roblox badge data with timestamps
    badgeCache: new Map(),

    // Initialize badge cache from localStorage
    initBadgeCache() {
        try {
            const cached = localStorage.getItem('roblox_badge_cache');
            if (cached) {
                const cacheData = JSON.parse(cached);
                const now = Date.now();
                const oneHourMs = 60 * 60 * 1000; // 1 hour cache for badge stats
                
                // Load valid entries (less than 1 hour old - badge stats update frequently)
                for (const [badgeId, entry] of Object.entries(cacheData)) {
                    if (now - entry.timestamp < oneHourMs) {
                        this.badgeCache.set(badgeId, entry);
                    }
                }
                
                // Clean up expired entries from localStorage
                const validCache = {};
                for (const [badgeId, entry] of this.badgeCache.entries()) {
                    validCache[badgeId] = entry;
                }
                localStorage.setItem('roblox_badge_cache', JSON.stringify(validCache));
            }
        } catch (error) {
            console.error('Failed to load badge cache:', error);
        }
    },

    // Save badge cache to localStorage
    saveBadgeCache() {
        try {
            const cacheData = {};
            for (const [badgeId, entry] of this.badgeCache.entries()) {
                cacheData[badgeId] = entry;
            }
            localStorage.setItem('roblox_badge_cache', JSON.stringify(cacheData));
        } catch (error) {
            console.error('Failed to save badge cache:', error);
        }
    },

    /**
     * Check if a quantity value is a valid Roblox badge ID
     * Badge IDs are 9+ digit numbers
     * @param {string} quantity - The quantity value to check
     * @returns {boolean} - True if it's a valid badge ID format
     */
    isBadgeId(quantity) {
        if (!quantity || typeof quantity !== 'string') return false;
        const trimmed = quantity.trim();
        // Badge IDs are exactly 9+ digits
        return /^\d{9,}$/.test(trimmed);
    },

    /**
     * Fetch Roblox badge data from badge ID
     * Returns badge info including awardedCount from statistics
     * @param {string} badgeId - The Roblox badge ID
     * @returns {Object|null} - Badge data or null if fetch failed
     */
    async getBadgeData(badgeId) {
        if (!badgeId || !/^\d{9,}$/.test(badgeId.trim())) {
            return null;
        }

        const badgeIdStr = badgeId.trim();
        const now = Date.now();
        const oneHourMs = 60 * 60 * 1000;

        // Check cache first
        if (this.badgeCache.has(badgeIdStr)) {
            const cached = this.badgeCache.get(badgeIdStr);
            // If cache is less than 1 hour old, return cached data
            if (now - cached.timestamp < oneHourMs) {
                return cached;
            }
            // Cache expired, remove it
            this.badgeCache.delete(badgeIdStr);
        }

        // Fetch from Roblox API (via proxy to avoid CORS)
        try {
            const response = await fetch(`/api/roblox-proxy?mode=badge&badgeId=${badgeIdStr}`);
            if (response.ok) {
                const data = await response.json();
                const cacheEntry = {
                    id: data.id,
                    name: data.name || data.displayName,
                    displayName: data.displayName || data.name,
                    description: data.description || data.displayDescription,
                    awardedCount: data.statistics?.awardedCount || 0,
                    iconImageId: data.iconImageId || data.displayIconImageId,
                    enabled: data.enabled,
                    timestamp: now
                };
                
                // Cache the result
                this.badgeCache.set(badgeIdStr, cacheEntry);
                this.saveBadgeCache();
                
                return cacheEntry;
            }
        } catch (error) {
            console.error('Failed to fetch badge data:', error);
        }

        return null;
    },

    // Cache for Roblox group data with timestamps
    groupCache: new Map(),

    // Initialize group cache from localStorage
    initGroupCache() {
        try {
            const cached = localStorage.getItem('roblox_group_cache');
            if (cached) {
                const cacheData = JSON.parse(cached);
                const now = Date.now();
                const oneDayMs = 24 * 60 * 60 * 1000; // 24 hour cache for group stats
                
                // Load valid entries (less than 24 hours old)
                for (const [groupId, entry] of Object.entries(cacheData)) {
                    if (now - entry.timestamp < oneDayMs) {
                        this.groupCache.set(groupId, entry);
                    }
                }
                
                // Clean up expired entries from localStorage
                const validCache = {};
                for (const [groupId, entry] of this.groupCache.entries()) {
                    validCache[groupId] = entry;
                }
                localStorage.setItem('roblox_group_cache', JSON.stringify(validCache));
            }
        } catch (error) {
            console.error('Failed to load group cache:', error);
        }
    },

    // Save group cache to localStorage
    saveGroupCache() {
        try {
            const cacheData = {};
            for (const [groupId, entry] of this.groupCache.entries()) {
                cacheData[groupId] = entry;
            }
            localStorage.setItem('roblox_group_cache', JSON.stringify(cacheData));
        } catch (error) {
            console.error('Failed to save group cache:', error);
        }
    },

    /**
     * Fetch Roblox group data from group ID
     * Returns group info including memberCount
     * @param {string} groupId - The Roblox group ID (defaults to '2649054')
     * @returns {Object|null} - Group data or null if fetch failed
     */
    async getGroupData(groupId = '2649054') {
        if (!groupId || !/^\d+$/.test(groupId.toString().trim())) {
            return null;
        }

        const groupIdStr = groupId.toString().trim();
        const now = Date.now();
        const oneDayMs = 24 * 60 * 60 * 1000;

        // Check cache first
        if (this.groupCache.has(groupIdStr)) {
            const cached = this.groupCache.get(groupIdStr);
            // If cache is less than 24 hours old, return cached data
            if (now - cached.timestamp < oneDayMs) {
                return cached;
            }
            // Cache expired, remove it
            this.groupCache.delete(groupIdStr);
        }

        // Fetch from Roblox API (via proxy to avoid CORS)
        try {
            const response = await fetch(`/api/roblox-proxy?mode=group&groupId=${groupIdStr}`);
            if (response.ok) {
                const data = await response.json();
                const cacheEntry = {
                    id: data.id,
                    name: data.name,
                    memberCount: data.memberCount || 0,
                    description: data.description,
                    owner: data.owner,
                    created: data.created,
                    timestamp: now
                };
                
                // Cache the result
                this.groupCache.set(groupIdStr, cacheEntry);
                this.saveGroupCache();
                
                return cacheEntry;
            }
        } catch (error) {
            console.error('Failed to fetch group data:', error);
        }

        return null;
    },

    /**
     * Format large numbers with commas for display
     * @param {number} num - The number to format
     * @returns {string} - Formatted number string
     */
    formatNumber(num) {
        if (typeof num !== 'number') return num;
        return num.toLocaleString();
    },

    /**
     * Generate optimized image URL with Cloudflare Images transformations
     * 
     * @param {string} imageUrl - Original image URL (Cloudflare Images URL or path)
     * @param {Object} options - Transformation options
     * @param {number} options.width - Target width in pixels
     * @param {number} options.height - Target height in pixels
     * @param {string} options.fit - Resize fit mode: 'scale-down', 'contain', 'cover', 'crop', 'pad' (default: 'scale-down')
     * @param {number} options.quality - JPEG/WebP quality 1-100 (default: 85)
     * @param {string} options.format - Output format: 'webp', 'avif', 'jpeg', 'png' (auto if not specified)
     * @returns {string} Optimized image URL
     * 
     * @example
     * Utils.getOptimizedImage(item.img, { width: 200 }) // Resize to 200px width
     * Utils.getOptimizedImage(item.img, { width: 200, height: 200, fit: 'cover' }) // 200x200 cover
     * Utils.getOptimizedImage(item.img, { width: 400, quality: 90, format: 'webp' }) // High quality WebP
     */
    getOptimizedImage(imageUrl, options = {}) {
        if (!imageUrl) return null;
        
        // If it's already a Cloudflare Images URL, add query params directly
        if (imageUrl.includes('imagedelivery.net')) {
            const url = new URL(imageUrl);
            
            if (options.width) url.searchParams.set('width', options.width);
            if (options.height) url.searchParams.set('height', options.height);
            if (options.fit) url.searchParams.set('fit', options.fit);
            if (options.quality) url.searchParams.set('quality', options.quality);
            if (options.format) url.searchParams.set('format', options.format);
            
            return url.toString();
        }
        
        // If it's a path (like items/gears/file.png), use our API endpoint
        // Convert to API endpoint URL
        let apiPath = imageUrl;
        if (!apiPath.startsWith('http://') && !apiPath.startsWith('https://')) {
            // Remove leading ./ or /
            apiPath = apiPath.replace(/^\.?\//, '');
            // Convert imgs/ to items/ if needed
            if (apiPath.startsWith('imgs/')) {
                apiPath = apiPath.replace('imgs/', 'items/');
            } else if (!apiPath.startsWith('items/')) {
                apiPath = `items/${apiPath}`;
            }
            apiPath = `/api/images/${apiPath}`;
        }
        
        // Add query parameters
        const url = new URL(apiPath);
        if (options.width) url.searchParams.set('width', options.width);
        if (options.height) url.searchParams.set('height', options.height);
        if (options.fit) url.searchParams.set('fit', options.fit);
        if (options.quality) url.searchParams.set('quality', options.quality);
        if (options.format) url.searchParams.set('format', options.format);
        
        return url.toString();
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

export { Utils };
