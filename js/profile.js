// Profile Page Handler
class ProfilePage {
    constructor() {
        this.userId = null;
        this.profileData = null;
        this.apiBase = 'https://emwiki.com/api';

        // Wait for Auth to be ready
        if (window.Auth) {
            window.Auth.addEventListener("sessionReady", () => {
                console.log("User session ready");
                this.init();
            });
        } else {
            this.init();
        }
    }

    async init() {
        // Get user ID from URL parameter
        const urlParams = new URLSearchParams(window.location.search);
        this.userId = urlParams.get('user') || urlParams.get('id');

        if (!this.userId) {
            this.showError('No user ID provided');
            return;
        }

        await this.loadProfile();
    }

    async loadProfile() {
        try {
            const response = await fetch(`${this.apiBase}/profile/${this.userId}`);

            if (!response.ok) {
                if (response.status === 404) {
                    this.showError('User not found');
                } else {
                    this.showError('Failed to load profile');
                }
                return;
            }

            this.profileData = await response.json();
            this.renderProfile();
        } catch (error) {
            console.error('Error loading profile:', error);
            this.showError('Failed to load profile');
        }
    }

    showError(message) {
        document.getElementById('loading-state').style.display = 'none';
        document.getElementById('error-state').style.display = 'flex';
        document.getElementById('profile-content').style.display = 'none';
    }

    renderProfile() {
        document.getElementById('loading-state').style.display = 'none';
        document.getElementById('error-state').style.display = 'none';
        document.getElementById('profile-content').style.display = 'block';

        const { user, stats, reviews, recentTrades, donationData } = this.profileData;

        // Update page title
        document.title = `${user.displayName} - Epic Catalogue`;

        // Render profile header
        this.renderProfileHeader(user, donationData);

        // Render stats
        this.renderStats(stats);

        // Render recent trades
        this.renderRecentTrades(recentTrades);

        // Render reviews
        this.renderReviews(reviews);
    }

    renderProfileHeader(user, donationData) {
        // Avatar
        const avatarImg = document.getElementById('profile-avatar');
        avatarImg.src = user.avatarUrl || './imgs/placeholder.png';
        avatarImg.alt = `${user.displayName}'s Avatar`;

        // Display name
        document.getElementById('profile-display-name').textContent = user.displayName;

        // Username
        document.getElementById('profile-username').textContent = `@${user.username}`;

        // Roles
        const rolesContainer = document.getElementById('profile-roles');
        rolesContainer.innerHTML = '';

        if (user.roles && Array.isArray(user.roles)) {
            // Filter out 'user' role and show special roles
            const specialRoles = user.roles.filter(role => role !== 'user');

            specialRoles.forEach(role => {
                const badge = document.createElement('span');
                badge.className = `role-badge role-${role}`;
                badge.textContent = role.toUpperCase();
                rolesContainer.appendChild(badge);
            });
        }

        // Joined date
        const joinedDate = new Date(user.createdAt);
        document.getElementById('profile-joined').innerHTML = `
            <strong>Joined:</strong> ${this.formatDate(joinedDate)}
        `;

        // Last online
        const lastOnline = new Date(user.lastOnline);
        const isOnline = Date.now() - user.lastOnline < 5 * 60 * 1000; // 5 minutes
        const onlineStatus = isOnline ? '🟢 Online' : `Last seen: ${this.formatRelativeTime(lastOnline)}`;

        document.getElementById('profile-last-online').innerHTML = `
            <strong>${onlineStatus}</strong>
        `;
    }

    renderStats(stats) {
        document.getElementById('stat-total-trades').textContent = stats.total_trades || 0;
        document.getElementById('stat-successful-trades').textContent = stats.successful_trades || 0;

        const rating = stats.average_rating || 0;
        document.getElementById('stat-rating').textContent = rating.toFixed(1);

        document.getElementById('stat-reviews').textContent = stats.total_reviews || 0;
    }

    renderRecentTrades(trades) {
        const container = document.getElementById('recent-trades-container');

        if (!trades || trades.length === 0) {
            container.innerHTML = '<p class="no-data-message">No recent trades</p>';
            return;
        }

        container.innerHTML = '';

        trades.forEach(trade => {
            const tradeCard = document.createElement('div');
            tradeCard.className = 'trade-card';

            const roleIcon = trade.role === 'seller' ? '📤' : '📥';
            const roleText = trade.role === 'seller' ? 'Sold' : 'Bought';

            tradeCard.innerHTML = `
                <div class="trade-icon">${roleIcon}</div>
                <div class="trade-info">
                    <div class="trade-item-name">${this.escapeHtml(trade.item_name)}</div>
                    <div class="trade-meta">${roleText} • ${this.formatRelativeTime(new Date(trade.completed_at))}</div>
                </div>
            `;

            container.appendChild(tradeCard);
        });
    }

    renderReviews(reviews) {
        const container = document.getElementById('reviews-container');

        if (!reviews || reviews.length === 0) {
            container.innerHTML = '<p class="no-data-message">No reviews yet</p>';
            return;
        }

        container.innerHTML = '';

        reviews.forEach(review => {
            const reviewCard = document.createElement('div');
            reviewCard.className = 'review-card';

            const stars = this.renderStars(review.rating);

            reviewCard.innerHTML = `
                <div class="review-header">
                    <div class="reviewer-info">
                        <img src="${review.reviewer_avatar || './imgs/placeholder.png'}"
                             alt="${this.escapeHtml(review.reviewer_display_name)}"
                             class="reviewer-avatar">
                        <div>
                            <div class="reviewer-name">${this.escapeHtml(review.reviewer_display_name)}</div>
                            <div class="review-date">${this.formatRelativeTime(new Date(review.created_at))}</div>
                        </div>
                    </div>
                    <div class="review-rating">${stars}</div>
                </div>
                ${review.comment ? `<div class="review-comment">${this.escapeHtml(review.comment)}</div>` : ''}
            `;

            container.appendChild(reviewCard);
        });
    }

    renderStars(rating) {
        const fullStars = Math.floor(rating);
        const hasHalfStar = rating % 1 >= 0.5;
        const emptyStars = 5 - fullStars - (hasHalfStar ? 1 : 0);

        let stars = '';
        for (let i = 0; i < fullStars; i++) {
            stars += '⭐';
        }
        if (hasHalfStar) {
            stars += '⭐';
        }
        for (let i = 0; i < emptyStars; i++) {
            stars += '☆';
        }

        return `${stars} (${rating}/5)`;
    }

    formatDate(date) {
        return date.toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });
    }

    formatRelativeTime(date) {
        const now = Date.now();
        const diff = now - date.getTime();

        const seconds = Math.floor(diff / 1000);
        const minutes = Math.floor(seconds / 60);
        const hours = Math.floor(minutes / 60);
        const days = Math.floor(hours / 24);
        const months = Math.floor(days / 30);
        const years = Math.floor(days / 365);

        if (seconds < 60) return 'just now';
        if (minutes < 60) return `${minutes}m ago`;
        if (hours < 24) return `${hours}h ago`;
        if (days < 30) return `${days}d ago`;
        if (months < 12) return `${months}mo ago`;
        return `${years}y ago`;
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    window.profilePage = new ProfilePage();
});
