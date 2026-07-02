/* Split out of the old js/script.js (see git history). Loaded via js/core/bridge.js. */
import { Utils } from './utils.js';

class Auth extends EventTarget {
    constructor() {
        super();
        this.currentCode = null;
        this.user = null;
        this.token = localStorage.getItem('auth_token');
        this.pollInterval = null;
        this.timerInterval = null;
        this.scammersList = [];

        // Promise that resolves when session check is complete
        // Other code should await this before making authenticated API calls
        this._sessionReadyPromise = new Promise(resolve => {
            this._resolveSessionReady = resolve;
        });
        
        this.init();
    }
    
    // Returns a promise that resolves when the session has been checked
    // Call this before making any authenticated API calls
    waitForSession() {
        return this._sessionReadyPromise;
    }

    async init() {
        console.log('%cwtf are u doing here...', 'color: #ffffff; background: #000000; padding:5px 10px; font-size:16px; font-weight:bold;');
        console.log('%cget out of here. i dont love u', 'color: #ffffff; background: #000000; padding:5px 10px; font-size:16px; font-weight:bold;');

        // Development mode - auto-login with fake user on localhost
        if (this.isDevelopmentMode() && !this.token) {
            this.setupDevUser();
        }

        const injectAuthUI = () => {
            const header = document.querySelector('header');
            if (!header) return;
            header.insertAdjacentHTML('beforeend', `
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
        };
        const injectAuthModal = () => {
            if (document.getElementById('auth-modal')) return; // already injected by BaseApp
            document.body.insertAdjacentHTML('beforeend', `
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
                        <button style="display:none" class="celebration-close-btn">Epic!</button>
                    </div>
                </div>
            `);
        };

        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => { injectAuthUI(); injectAuthModal(); });
        } else {
            injectAuthUI();
            injectAuthModal();
        }

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

                const epicBtn = document.getElementById('auth-step-3').querySelector('.celebration-close-btn');
                epicBtn.style.display = '';

                // Add Epic animation on click
                epicBtn.addEventListener('click', (e) => {
                    e.preventDefault();
                    this.playEpicAnimation();
                }, { once: true });
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
            // No token - resolve session ready immediately (user is not logged in)
            this._resolveSessionReady();
            this.dispatchEvent(new Event("sessionReady"));
            const authButton = document.getElementById('auth-button');
            if (authButton) {
                authButton.style.display = 'flex';
            }
        }


    }

    loginWithOAuth() {
        // Redirect to OAuth authorization endpoint
        window.location.href = '/api/auth/oauth/authorize';
    }


    async loadScammersList() {
        try {
            const response = await fetch('/api/roblox-proxy?mode=discord-scammers');
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

        const userId = String(this.user.userId);
        
        return this.scammersList.some(scammer => {
            // Check main user_id directly (new system)
            if (scammer.user_id && String(scammer.user_id) === userId) return true;
            
            // Fallback: check robloxProfile URL (backward compatibility)
            if (scammer.robloxProfile?.includes(`/${userId}/`)) return true;

            // Check alt accounts
            if (scammer.robloxAlts && Array.isArray(scammer.robloxAlts)) {
                return scammer.robloxAlts.some(alt => {
                    // Check user_id directly (new system)
                    if (alt.user_id && String(alt.user_id) === userId) return true;
                    // Fallback: check profile URL (backward compatibility)
                    return alt.profile?.includes(`/${userId}/`);
                });
            }
            
            return false;
        });
    }

    async triggerJumpScare(type) {
        const scareImages = [
            'https://emwiki.com/imgs/scammerbg.jpeg',
            'https://emwiki.com/imgs/Babadook.png'
        ];

        const scareType = type || Math.floor(Math.random() * 3);



        if (scareType === 0) {
            //image jumpscare
            const screamSound = 'https://emwiki.com/imgs/jumpscare.mp3';
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

            const screamSound = 'https://emwiki.com/imgs/alientalk.mp3';
            const scream = new Audio(screamSound);
            scream.loop = true;
            scream.volume = 1.0;
            scream.play();

            // Get all canvas elements
            const canvases = document.querySelectorAll('canvas');
            const alienImages = ['https://emwiki.com/imgs/aliengif1.gif', 'https://emwiki.com/imgs/aliengif2.gif', 'https://emwiki.com/imgs/aliengif3.gif']; // Update path if needed

            if (document.querySelector('.profile-dropdown-header img')) {
                document.querySelector('.profile-dropdown-header img').src = 'https://emwiki.com/imgs/alien-cat.gif';
            } if (document.querySelector('#user-profile-btn img')) {
                document.querySelector('#user-profile-btn img').src = 'https://emwiki.com/imgs/alien-cat.gif';

            } if (document.querySelector('header svg text')) {

                document.querySelector('header svg text').innerHTML = 'zlorp';
            }

            //make new element
            const explosionSound = new Audio('https://emwiki.com/imgs/explode.mp3');

            explosionSound.volume = 1.0;
            explosionSound.play();
            await new Promise(resolve => setTimeout(resolve, 100));

            document.getElementById('epic-image').setAttribute('href', 'https://emwiki.com/imgs/zuckmini.png');

            const explosion = document.createElement('div');
            explosion.className = 'image-explosion';
            explosion.style.position = 'fixed';
            explosion.style.top = '50%';
            explosion.style.zIndex = '9291231839';
            explosion.style.left = '50%';
            explosion.style.transformOrigin = 'left top';
            explosion.style.pointerEvents = 'none';
            explosion.innerHTML = '<img src="https://emwiki.com/imgs/zuck.png" style="width: 100vw; height: 100vh;">';
            document.body.appendChild(explosion);

            await new Promise(resolve => setTimeout(resolve, 900));

            canvases.forEach((canvas) => {
                if (Math.random() < 0.3 || canvas.id !== "particle-canvas") {
                    const alienImage = new Image();
                    alienImage.src = alienImages[Math.floor(Math.random() * alienImages.length)];
                    canvas.outerHTML = '<img src="' + alienImage.src + '" style="filter: hue-rotate(180deg) saturate(5) contrast(200%);">'; // Clear existing canvas content
                } else {
                    const alienImage = new Image();
                    alienImage.src = 'https://emwiki.com/imgs/alien.png';
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
        // In dev mode, use the fake user
        if (this.isDevelopmentMode() && this.token === 'dev_mode_token') {
            this.user = this.getDevUser();
            this._resolveSessionReady();
            this.dispatchEvent(new Event("sessionReady"));
            this.updateUI();
            return;
        }

        try {
            const response = await fetch('/api/auth/session', {
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
                this._resolveSessionReady();
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
            } else if (response.status === 401) {
                // Only log out if session is actually invalid (401), not on server errors (500)
                localStorage.removeItem('auth_token');
                this.token = null;
                this._resolveSessionReady();
                this.dispatchEvent(new Event("sessionReady"));
                const authButton = document.getElementById('auth-button');
                if (authButton) {
                    authButton.style.display = 'flex';
                }
            } else {
                // Server error (500, etc.) - keep user logged in, just show auth button
                console.error('Session check returned error:', response.status);
                this._resolveSessionReady();
                this.dispatchEvent(new Event("sessionReady"));
            }
        } catch (error) {
            // Network error - keep user logged in, don't clear token
            console.error('Session check failed:', error);
            this._resolveSessionReady();
            this.dispatchEvent(new Event("sessionReady"));
        }
    }


    async generateCode() {
        try {
            const response = await fetch('/api/auth/generate-code', {
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
                const response = await fetch('/api/auth/check-code', {
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

                        const epicBtn = document.getElementById('auth-step-3').querySelector('.celebration-close-btn');
                        epicBtn.style.display = '';

                        // Add Epic animation on click
                        epicBtn.addEventListener('click', (e) => {
                            e.preventDefault();
                            this.playEpicAnimation();
                        }, { once: true });
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
        return `/api/roblox-proxy?mode=cdn-asset&hash=${hash}`;
    }

    async render3DPlayerModel(userId, container) {
        if (this._rendering3DModel) return;
        this._rendering3DModel = true;
        container.className = 'loadin';

        // Wait for Three.js to load
        await _sharedScriptsReady;
        if (typeof THREE === 'undefined') {
            console.error('Three.js failed to load');
            container.style.display = '';
            this._rendering3DModel = false;
            return;
        }

        if (!userId || !container) {
            console.error('Invalid userId or container:', userId, container);
            if (container) container.style.display = 'none';
            return;
        }

        try {
            const response = await fetch(`/api/roblox-proxy?mode=avatar-3d&userId=${userId}`);
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

            // Setup renderer (antialias disabled for better performance)
            const renderer = new THREE.WebGLRenderer({
                alpha: true,
                antialias: false,
                powerPreference: 'high-performance'
            });
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

                    // Store references for later animations
                    this._model3D = {
                        scene,
                        camera,
                        renderer,
                        object,
                        animationId: null,
                        isVisible: true,
                        rotationSpeed: 0.01,
                        initialCameraPosition: { ...camera.position },
                        aabb: aabb
                    };

                    // Animation loop with visibility control
                    const animateModel = () => {
                        if (!this._model3D.isVisible) return;
                        this._model3D.object.rotation.y += this._model3D.rotationSpeed;
                        this._model3D.renderer.render(this._model3D.scene, this._model3D.camera);
                        this._model3D.animationId = requestAnimationFrame(animateModel);
                    };

                    // Use Intersection Observer to pause animation when not visible
                    const observer = new IntersectionObserver((entries) => {
                        entries.forEach(entry => {
                            this._model3D.isVisible = entry.isIntersecting;
                            if (this._model3D.isVisible && !this._model3D.animationId) {
                                animateModel();
                            } else if (!this._model3D.isVisible && this._model3D.animationId) {
                                cancelAnimationFrame(this._model3D.animationId);
                                this._model3D.animationId = null;
                            }
                        });
                    }, { threshold: 0.1 });

                    observer.observe(container);

                    // Start animation
                    animateModel();

                    // Show model immediately when loaded
                    container.className = 'active';
                    container.style.display = '';
                    this._rendering3DModel = false;
                });
            });
        } catch (error) {
            console.error('Error rendering 3D model:', error);
            container.className = 'active';
            container.style.display = '';
            this._rendering3DModel = false;
        }
    }

    // Epic button animation: spin faster with CSS zoom animation
    playEpicAnimation() {
        const container = document.getElementById('player-model-container');

        if (!this._model3D || !container) {
            // No 3D model loaded, just close the modal
            document.getElementById('auth-modal').hidePopover();
            return;
        }

        // Trigger CSS zoom animation
        container.classList.add('epic-animation');

        // Gradually increase rotation speed
        const originalSpeed = this._model3D.rotationSpeed;
        const startTime = performance.now();
        const duration = 800; // Match CSS animation duration

        const speedUpRotation = () => {
            const elapsed = performance.now() - startTime;
            const progress = Math.min(elapsed / duration, 1);

            // Gradually speed up rotation throughout the animation
            if (progress < 0.5) {
                // First half: speed up to 15x
                this._model3D.rotationSpeed = originalSpeed + (0.15 * (progress / 0.5));
            } else {
                // Second half: speed up even more to 35x
                const phase2Progress = (progress - 0.5) / 0.5;
                this._model3D.rotationSpeed = originalSpeed + 0.15 + (0.2 * phase2Progress);
            }

            if (progress < 1) {
                requestAnimationFrame(speedUpRotation);
            } else {
                // Animation complete, close modal
                setTimeout(() => {
                    document.getElementById('auth-modal').hidePopover();

                    // Reset after modal closes
                    setTimeout(() => {
                        container.classList.remove('epic-animation');
                        container.style.opacity = '1';
                        this._model3D.rotationSpeed = originalSpeed;
                    }, 500);
                }, 200);
            }
        };

        speedUpRotation();
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
        if (!profileBtn) return;
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
                <button class="profile-action-btn" onclick="window.location.href = 'https://emwiki.com/profile/${this.user.userId}'">
                    <svg style="width:18px;" viewBox="0 0 24 24" fill="currentColor"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/></svg> View My Profile
                </button>

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
            const response = await fetch('/api/auth/donation-status', {
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

                    document.querySelector('.profile-action-btn.donator')?.classList.remove('locked');
                } else if (!data.isDonator && !initial) {

                    document.getElementById('total-donated').textContent = data.totalSpent;
                    document.getElementById('progress-percentage').textContent = `${Math.round(data.progress)}%`;
                    document.getElementById('donation-progress-card')?.showPopover();
                    const progressFill = document.querySelector('.progress-bar-fill');
                    if (progressFill) progressFill.style.width = `${data.progress}%`;

                } else if (data.isDonator) {
                    document.querySelector('.profile-action-btn.donator')?.classList.remove('locked');
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
        if (this.token && this.token !== 'dev_mode_token') {
            await fetch('/api/auth/logout', {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${this.token}` }
            });
        }

        localStorage.removeItem('auth_token');


        location.reload();
    }

    isDevelopmentMode() {
        const isLocalFile = window.location.href.startsWith('file:///C:/Users/ADMIN/Desktop/EpicCatalogue/emwiki/');
        const optedIn = localStorage.getItem('emwiki_dev_user') === '1';
        return isLocalFile && optedIn;
    }

    getDevUser() {
        return {
            userId: 123456789,
            displayName: 'DevUser',
            username: 'devuser_testing',
            avatarUrl: 'https://emwiki.com/imgs/devadmin.png',
            role: ['admin', 'moderator'],
            createdAt: new Date().toISOString(),
            isDev: true
        };
    }

    setupDevUser() {
        console.log('%c[DEV MODE] Auto-logging in with fake user', 'color: #00ff00; background: #000000; padding:5px 10px; font-size:14px; font-weight:bold;');
        this.token = 'dev_mode_token';
        localStorage.setItem('auth_token', 'dev_mode_token');
        this.user = this.getDevUser();

        // Add visual indicator for dev mode
        const devBanner = document.createElement('div');
        devBanner.id = 'dev-mode-banner';
        devBanner.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            background: linear-gradient(90deg, #00ff00, #00cc00);
            color: black;
            text-align: center;
            padding: 5px;
            font-weight: bold;
            font-size: 12px;
            z-index: 10000;
            box-shadow: 0 2px 5px rgba(0,0,0,0.3);
        `;
        devBanner.textContent = '🔧 DEVELOPMENT MODE - Logged in as DevUser (Admin)';
        document.body.insertBefore(devBanner, document.body.firstChild);

        // Adjust page content to account for banner
        document.body.style.paddingTop = '25px';
    }

}



export { Auth };
