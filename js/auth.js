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
        if (this.token) {
            await this.checkSession();
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
    // Toast notification system
    showToast(title, message, type = 'info') {
        const container = document.getElementById('toast-container');
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

    // Celebration card
    showCelebration(username) {
        document.querySelector('.auth-modal').style.display = 'none';
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
            }
        } catch (error) {
            console.error('Session check failed:', error);
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
            this.showToast('Connection Error', error.message, 'error');
        }
    }

    async copyCode() {
        if (!this.currentCode) return;

        try {
            await navigator.clipboard.writeText(this.currentCode);
            const display = document.getElementById('auth-code-display');
            display.classList.add('copied');
            this.showToast('Copied!', 'Code copied to clipboard', 'success');

            setTimeout(() => {
                display.classList.remove('copied');

            }, 2000);
        } catch (error) {
            this.showToast('Copy Failed', 'Code: ' + this.currentCode, 'error');
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
        // Poll every 2 seconds to check if code was verified
        this.pollInterval = setInterval(async () => {
            try {
                const response = await fetch('https://emwiki.site/api/auth/check-code', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ code })
                });

                const data = await response.json();

                if (data.verified && data.token) {
                    // Store the token
                    localStorage.setItem('auth_token', data.token);
                    this.token = data.token;
                    this.user = data.user;

                    // Clear intervals
                    clearInterval(this.pollInterval);
                    if (this.timerInterval) {
                        clearInterval(this.timerInterval);
                    }

                    // Update UI
                    this.updateUI();

                    this.showCelebration(this.user.username);
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
        this.showToast('Logged Out', 'You have been successfully logged out', 'info');

        setTimeout(() => location.reload(), 1500);
    }
}

const auth = new Auth();

// Confetti System
class Confetti {
    constructor() {
        this.canvas = document.getElementById('confetti-canvas');
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