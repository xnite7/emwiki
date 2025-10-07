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
            document.getElementById('auth-code-display').textContent = code;

            this.currentCode = code;

            this.displayCodeWithAnimation(code);

            // Start countdown
            this.startTimer(expiresIn);

            // Start polling for verification
            this.startPolling(code);
        } catch (error) {
            alert('Error: ' + error.message);
        }
    }

    async copyCode() {
        if (!this.currentCode) return;

        try {
            await navigator.clipboard.writeText(this.currentCode);

            const btn = document.querySelector('.copy-code-btn');

            btn.classList.add('copied');

            setTimeout(() => {
                btn.classList.remove('copied');

            }, 2000);
        } catch (error) {
            console.error('Failed to copy:', error);
            alert('Code: ' + this.currentCode);
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

        // Clear any existing interval
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

                // Clear polling interval too
                if (this.pollInterval) {
                    clearInterval(this.pollInterval);
                }

                // Generate new code automatically
                this.generateCode();
            }
        }, 1000);
    }

    startPolling(code) {
        // Poll every 2 seconds to check if code was used
        this.pollInterval = setInterval(async () => {
            // This is a simple approach - in production you'd want websockets
            // For now, we just check if our session is valid
            await this.checkSession();

            if (this.user) {
                clearInterval(this.pollInterval);

                // Clear timer too
                if (this.timerInterval) {
                    clearInterval(this.timerInterval);
                }

                this.closeModal();
                alert(`Welcome, ${this.user.username}!`);
            }
        }, 2000);
    }

    updateUI() {
        if (!this.user) return;

        const profileBtn = document.getElementById('user-profile-btn');
        profileBtn.style.display = 'flex';
        profileBtn.innerHTML = `
            <img src="${this.user.avatarUrl || 'https://www.roblox.com/headshot-thumbnail/image?userId=' + this.user.userId + '&width=150&height=150&format=png'}" alt="${this.user.username}">
            <span>${this.user.displayName}</span>
            <div class="online-indicator"></div>
        `;

        profileBtn.onclick = () => this.showProfileMenu();
    }

    showProfileMenu() {
        // Add dropdown menu here if you want
        alert(`Logged in as: ${this.user.username}\nRole: ${this.user.role}`);
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
        document.getElementById('user-profile-btn').style.display = 'none';
        location.reload();
    }
}

const auth = new Auth();