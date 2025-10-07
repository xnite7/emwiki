class Auth {
    constructor() {
        this.user = null;
        this.token = localStorage.getItem('auth_token');
        this.pollInterval = null;
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

            // Start countdown
            this.startTimer(expiresIn);
            
            // Start polling for verification
            this.startPolling(code);
        } catch (error) {
            alert('Error: ' + error.message);
        }
    }

    startTimer(seconds) {
        let remaining = seconds;
        const timerEl = document.getElementById('code-timer');
        
        const interval = setInterval(() => {
            remaining--;
            const mins = Math.floor(remaining / 60);
            const secs = remaining % 60;
            timerEl.textContent = `${mins}:${secs.toString().padStart(2, '0')}`;
            
            if (remaining <= 0) {
                clearInterval(interval);
                this.closeModal();
                alert('Code expired. Please try again.');
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