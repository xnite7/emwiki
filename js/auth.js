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
            error: '❌',
            success: '✅',
            info: 'ℹ️',
            warning: '⚠️'
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
        const card = document.getElementById('celebration-card');
        const message = card.querySelector('.celebration-message');
        message.textContent = `Welcome, ${username}! Your Roblox account has been successfully linked to Epic Catalogue.`;
        card.classList.add('show');
    }

    closeCelebration() {
        document.getElementById('celebration-card').classList.remove('show');
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
                    🔗 View Roblox Profile
                </button>
                <button class="profile-action-btn logout" onclick="auth.logout()">
                    🚪 Logout
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
                    this.closeModal();
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