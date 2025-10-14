// ============================================
//        FEATURE FLAGS - TOGGLE FEATURES
// ============================================
const FEATURES = {
    DONATION_SYSTEM: true  // Set to true when ready to launch!
};
// ============================================

class Auth {
    constructor() {
        this.currentCode = null;
        this.user = null;
        this.token = localStorage.getItem('auth_token');
        this.pollInterval = null;
        this.timerInterval = null; // Add this line
        this.init();
    }

    async init() {

        document.querySelector('header').insertAdjacentHTML('beforeend', `
            <button style="top: 20px;left: 12px;position: absolute;" class="btn" id="installBtn">
				<svg width="20" height="20" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
					<path fill="none" stroke="currentColor" stroke-width="2"
						d="M12 6v10zm0-5c6.075 0 11 4.925 11 11s-4.925 11-11 11S1 18.075 1 12 5.925 1 12 1Zm5 11-5 5-5-5" />
				</svg>
				Install App
			</button>
            <div id="profile-dropdown" class="profile-dropdown"></div>
            <div class="header-actions">
                <button	style="display: none;" class="btn" onclick="auth.openModal()" id="auth-button">
                    <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
                        <path
                            d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 3c1.66 0 3 1.34 3 3s-1.34 3-3 3-3-1.34-3-3 1.34-3 3-3zm0 14.2c-2.5 0-4.71-1.28-6-3.22.03-1.99 4-3.08 6-3.08 1.99 0 5.97 1.09 6 3.08-1.29 1.94-3.5 3.22-6 3.22z" />
                    </svg>
                    <span>Link Account</span>
                </button>
                <div id="user-profile-btn" style="display: none;"></div>
                <div class="theme-toggle" onclick="catalog.toggleTheme()"></div>
		</div>
        `);

        if (this.token) {
            await this.checkSession();
            if (FEATURES.DONATION_SYSTEM) {
                await this.checkDonationStatus(true);
            }
        } else {
            const authButton = document.getElementById('auth-button');
            if (authButton) {
                authButton.style.display = 'flex';
            }
        }

        // Close dropdown when clicking outside
        document.addEventListener('click', (e) => {
            const dropdown = document.getElementById('profile-dropdown');
            const profileBtn = document.getElementById('user-profile-btn');
            if (dropdown && profileBtn && !dropdown.contains(e.target) && !profileBtn.contains(e.target)) {
                dropdown.classList.remove('show');
            }
        });

        

    }


    // Celebration card
    showCelebration(username) {
        document.querySelector('.auth-modal').style.display = 'none';

        document.body.insertAdjacentHTML('beforeend', `
            <div id="celebration-card" class="celebration-card">
                <div class="celebration-icon">🎉</div>
                <div class="celebration-title">Account Linked!</div>
                <div class="celebration-message">Welcome to Epic Catalogue! Your Roblox account has been successfully linked.
                </div>
                <button class="celebration-close-btn" onclick="auth.closeCelebration()">Epic!</button>
            </div>
        `);

        const card = document.getElementById('celebration-card');
        const message = card.querySelector('.celebration-message');
        message.innerHTML = `Welcome, <strong>${username}!</strong><br>Your Roblox account has been successfully linked to Epic Catalogue.`;
        card.classList.add('show');
        // Start confetti!
        confetti.start();
    }

    closeCelebration() {
        this.closeModal();
        document.getElementById('celebration-card').classList.remove('show');
        setTimeout(() => {
            document.querySelector('.auth-modal').style.display = 'block';
        }, 300);
        confetti.stop();
    }

    // Profile dropdown
    showProfileMenu() {
        const dropdown = document.getElementById('profile-dropdown');

        if (dropdown.classList.contains('show')) {
            dropdown.classList.remove('show');
            return;
        }

        const roleColors = {
            admin: 'admin',
            vip: 'vip',
            moderator: 'moderator',
            user: ''
        };

        dropdown.innerHTML = `
            <div class="profile-dropdown-header">
                <img src="${this.user.avatarUrl || 'https://www.roblox.com/headshot-thumbnail/image?userId=' + this.user.userId + '&width=150&height=150&format=png'}" alt="${this.user.username}">
                <div class="profile-dropdown-info">
                    <div class="profile-dropdown-name">${this.user.displayName}</div>
                    <div class="profile-dropdown-role ${roleColors[this.user.role]}">${this.user.role || 'User'}</div>
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
                    <svg style="width:20px;" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="m10 17.55-1.77 1.72a2.47 2.47 0 0 1-3.5-3.5l4.54-4.55a2.46 2.46 0 0 1 3.39-.09l.12.1a1 1 0 0 0 1.4-1.43 3 3 0 0 0-.18-.21 4.46 4.46 0 0 0-6.09.22l-4.6 4.55a4.48 4.48 0 0 0 6.33 6.33L11.37 19A1 1 0 0 0 10 17.55M20.69 3.31a4.49 4.49 0 0 0-6.33 0L12.63 5A1 1 0 0 0 14 6.45l1.73-1.72a2.47 2.47 0 0 1 3.5 3.5l-4.54 4.55a2.46 2.46 0 0 1-3.39.09l-.12-.1a1 1 0 0 0-1.4 1.43 3 3 0 0 0 .23.21 4.47 4.47 0 0 0 6.09-.22l4.55-4.55a4.49 4.49 0 0 0 .04-6.33"/></svg> View Roblox Profile
                </button>

                <button class="profile-action-btn" onclick="catalog.openStats()">My Lists</button>

                <button class="profile-action-btn donator locked" onclick="auth.checkDonationStatus()">
                    <svg style="width:18px;" viewBox="0 -32 576 576" xmlns="http://www.w3.org/2000/svg"><path d="M464 0H112c-4 0-7.8 2-10 5.4L2 152.6c-2.9 4.4-2.6 10.2.7 14.2l276 340.8c4.8 5.9 13.8 5.9 18.6 0l276-340.8c3.3-4.1 3.6-9.8.7-14.2L474.1 5.4C471.8 2 468.1 0 464 0m-19.3 48 63.3 96h-68.4l-51.7-96zm-202.1 0h90.7l51.7 96H191zm-111.3 0h56.8l-51.7 96H68zm-43 144h51.4L208 352zm102.9 0h193.6L288 435.3zM368 352l68.2-160h51.4z"/></svg> Donator Settings
                </button>

                <button class="profile-action-btn logout" onclick="auth.logout()">
                    <svg style="width: 16px;" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 52 52"><path d="M21 48.5v-3c0-.8-.7-1.5-1.5-1.5h-10c-.8 0-1.5-.7-1.5-1.5v-33C8 8.7 8.7 8 9.5 8h10c.8 0 1.5-.7 1.5-1.5v-3c0-.8-.7-1.5-1.5-1.5H6C3.8 2 2 3.8 2 6v40c0 2.2 1.8 4 4 4h13.5c.8 0 1.5-.7 1.5-1.5"></path><path d="M49.6 27c.6-.6.6-1.5 0-2.1L36.1 11.4c-.6-.6-1.5-.6-2.1 0l-2.1 2.1c-.6.6-.6 1.5 0 2.1l5.6 5.6c.6.6.2 1.7-.7 1.7H15.5c-.8 0-1.5.6-1.5 1.4v3c0 .8.7 1.6 1.5 1.6h21.2c.9 0 1.3 1.1.7 1.7l-5.6 5.6c-.6.6-.6 1.5 0 2.1l2.1 2.1c.6.6 1.5.6 2.1 0z"></path></svg> Logout
                </button>
            </div>
        `;

        dropdown.classList.add('show');
    }
    async checkSession() {
        try {
            const response = await fetch('https://emwiki.site/api/auth/session', {
                headers: {
                    'Authorization': `Bearer ${this.token}`
                }
            });

            if (response.ok) {
                this.user = await response.json();
                this.updateUI();
            } else {
                localStorage.removeItem('auth_token');
                this.token = null;

                const authButton = document.getElementById('auth-button');
                if (authButton) {
                    authButton.style.display = 'none';
                }

            }
        } catch (error) {
            console.error('Session check failed:', error);

            const authButton = document.getElementById('auth-button');
            if (authButton) {
                authButton.style.display = 'none';
            }
        }
    }

    openModal() {
        document.getElementById('auth-container').style.display = 'flex';
        // Add show class for animation
        setTimeout(() => {
            document.getElementById('auth-container').classList.add('show');
        }, 10);
    }

    closeModal() {
        document.getElementById('auth-container').classList.remove('show');
        setTimeout(() => {
            document.getElementById('auth-container').style.display = 'none';
        }, 300);
    }

    async generateCode() {
        try {
            const response = await fetch('https://emwiki.site/api/auth/generate-code', {
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
            this.displayCodeWithAnimation(code);
            this.startTimer(expiresIn);
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
        // Replace with your actual game URL
        const gameUrl = 'https://www.roblox.com/games/122649225404413/Epic-Catalogue';
        window.open(gameUrl, '_blank');
    }

    displayCodeWithAnimation(code) {
        const display = document.getElementById('auth-code-display');
        display.innerHTML = '';

        // Split code into individual digits
        const digits = code.split('');

        digits.forEach((digit, index) => {
            const span = document.createElement('span');
            span.textContent = digit;
            display.appendChild(span);
        });
    }

    startTimer(seconds) {
        let remaining = seconds;
        const timerEl = document.getElementById('code-timer');

        if (this.timerInterval) {
            clearInterval(this.timerInterval);
        }

        this.timerInterval = setInterval(() => {
            remaining--;
            const mins = Math.floor(remaining / 60);
            const secs = remaining % 60;
            timerEl.textContent = `${mins}:${secs.toString().padStart(2, '0')}`;

            if (remaining <= 0) {
                clearInterval(this.timerInterval);
                if (this.pollInterval) {
                    clearInterval(this.pollInterval);
                }
                this.generateCode();
            }
        }, 1000);
    }

    startPolling(code) {
        this.pollInterval = setInterval(async () => {
            try {
                const response = await fetch('https://emwiki.site/api/auth/check-code', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ code })
                });

                const data = await response.json();

                if (data.verified && data.token) {
                    localStorage.setItem('auth_token', data.token);
                    this.token = data.token;
                    this.user = data.user;

                    clearInterval(this.pollInterval);
                    if (this.timerInterval) {
                        clearInterval(this.timerInterval);
                    }

                    // Update UI
                    this.updateUI();
                    this.closeModal();
                    this.showCelebration(this.user.username);

                    if (FEATURES.DONATION_SYSTEM) {
                        setTimeout(() => {
                            this.checkDonationStatus(true);
                        }, 3000);
                    }
                }
            } catch (error) {
                console.error('Polling error:', error);
            }
        }, 2000);
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

        profileBtn.onclick = () => this.showProfileMenu();
    }


    async checkDonationStatus(initial = false) {
        if (!this.token || !FEATURES.DONATION_SYSTEM) return;

        try {
            const response = await fetch('https://emwiki.site/api/auth/donation-status', {
                headers: {
                    'Authorization': `Bearer ${this.token}`
                }
            });

            if (response.ok) {
                const data = await response.json();

                // Update user role if changed
                if (data.role) {
                    this.user.role = data.role;
                }

                // Show donator celebration if they just became a donator
                if (data.justBecameDonator) {
                    this.showDonatorCelebration(data.totalSpent);
                    confetti.start(); // Trigger confetti!
                    document.querySelector('.profile-action-btn.donator').classList.remove('locked');
                } else if (!data.isDonator && !initial) {
                    // Show progress if not yet a donator
                    this.showDonationProgress(data);
                } else if (data.isDonator) {
                    document.querySelector('.profile-action-btn.donator').classList.remove('locked');
                }
            }
        } catch (error) {
            console.error('Failed to check donation status:', error);
        }
    }

    showDonationProgress(data) {
        const container = document.getElementById('donation-progress-container');
        const progressBar = document.getElementById('donation-progress-bar');
        const progressFill = progressBar.querySelector('.progress-bar-fill');
        const progressPercentage = document.getElementById('progress-percentage');
        const totalDonated = document.getElementById('total-donated');


        // Update values
        totalDonated.textContent = data.totalSpent;
        progressPercentage.textContent = `${Math.round(data.progress)}%`;

        // Show container
        container.classList.add('show');

        // Animate progress bar
        setTimeout(() => {
            progressFill.style.width = `${data.progress}%`;
        }, 100);

        // If at 100%, make it gold
        if (data.progress >= 100) {
            progressBar.classList.add('gold');
        }
    }

    closeDonationProgress() {
        document.getElementById('donation-progress-container').classList.remove('show');
    }

    showDonatorCelebration(totalSpent) {
        const celebration = document.getElementById('donator-celebration');
        celebration.classList.add('show');

        // Start confetti
        confetti.start();

        // Show toast
        Utils.showToast(
            'Donator Status Achieved! 💎',
            `You've donated ${totalSpent} Robux! Thank you for your support!`,
            'success'
        );
    }

    closeDonatorCelebration() {
        document.getElementById('donator-celebration').classList.remove('show');
        confetti.stop();
    }

    async logout() {
        if (this.token) {
            await fetch('https://emwiki.site/api/auth/logout', {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${this.token}` }
            });
        }

        localStorage.removeItem('auth_token');
        this.token = null;
        this.user = null;

        // Show auth button again
        const authButton = document.getElementById('auth-button');
        if (authButton) {
            authButton.style.display = 'flex';
        }

        document.getElementById('user-profile-btn').style.display = 'none';
        Utils.showToast('Logged Out', 'You have been successfully logged out', 'info');

        setTimeout(() => location.reload(), 1500);
    }
}

const auth = new Auth();

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

// Initialize confetti system
const confetti = new Confetti();