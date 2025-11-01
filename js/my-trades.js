// My Trades Dashboard
class TradeDashboard {
    constructor() {
        this.apiBase = 'https://emwiki.com/api/trades';
        this.currentUser = null;
        this.myListings = [];
        this.receivedOffers = [];
        this.sentOffers = [];
        this.init();
    }

    async init() {
        const sessionToken = localStorage.getItem('sessionToken');
        if (!sessionToken) {
            window.location.href = '/trading';
            return;
        }

        if (window.Auth) {
            this.currentUser = await window.Auth.checkAuth();
        }

        if (!this.currentUser) {
            window.location.href = '/trading';
            return;
        }

        await this.loadData();
        this.renderCurrentTab();
    }

    async loadData() {
        try {
            const headers = await this.getAuthHeaders();

            // Load my listings
            const listingsRes = await fetch(`${this.apiBase}/listings?user_id=${this.currentUser.id}`, { headers });
            if (listingsRes.ok) {
                const data = await listingsRes.json();
                this.myListings = data.listings || [];
            }

            // Load offers
            const offersRes = await fetch(`${this.apiBase}/offers`, { headers });
            if (offersRes.ok) {
                const data = await offersRes.json();
                // Separate received and sent offers
                this.receivedOffers = (data.offers || []).filter(o => o.to_user_id === this.currentUser.id);
                this.sentOffers = (data.offers || []).filter(o => o.from_user_id === this.currentUser.id);
            }
        } catch (error) {
            if (window.Utils) {
                Utils.showToast('Error', 'Failed to load dashboard data', 'error');
            }
        }
    }

    switchTab(tabName) {
        // Update tab buttons
        document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
        event.target.classList.add('active');

        // Update tab content
        document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));
        document.getElementById(tabName).classList.add('active');

        this.renderCurrentTab();
    }

    renderCurrentTab() {
        const activeTab = document.querySelector('.tab-content.active');
        if (!activeTab) return;

        switch (activeTab.id) {
            case 'myListings':
                this.renderMyListings();
                break;
            case 'receivedOffers':
                this.renderReceivedOffers();
                break;
            case 'sentOffers':
                this.renderSentOffers();
                break;
        }
    }

    renderMyListings() {
        const grid = document.getElementById('listings-grid');
        if (!grid) return;

        if (this.myListings.length === 0) {
            grid.innerHTML = `
                <div class="empty-state">
                    <div class="empty-state-icon">📋</div>
                    <h2>No Listings Yet</h2>
                    <p>Create your first trade listing to get started!</p>
                    <a href="/trading" class="btn-view">Go to Trading Hub</a>
                </div>
            `;
            return;
        }

        grid.innerHTML = '';
        this.myListings.forEach(listing => {
            grid.appendChild(this.createListingCard(listing));
        });
    }

    createListingCard(listing) {
        const card = document.createElement('div');
        card.className = 'listing-card';

        const timeAgo = this.getTimeAgo(new Date(listing.created_at));

        card.innerHTML = `
            <div class="listing-header">
                <div>
                    <div class="listing-title">${listing.title}</div>
                    <div class="listing-meta">Posted ${timeAgo} • ${listing.views || 0} views</div>
                </div>
                <span class="listing-status ${listing.status}">${listing.status}</span>
            </div>

            ${listing.description ? `<p style="color: var(--text-secondary); margin-bottom: 15px;">${listing.description}</p>` : ''}

            <div class="listing-items">
                <div>
                    <div style="font-size: 0.85rem; color: var(--text-secondary); margin-bottom: 8px; font-weight: 700;">OFFERING</div>
                    <div class="items-list">
                        ${listing.offering_items.map(item => `
                            <span class="item-tag">${item.item_name}</span>
                        `).join('')}
                    </div>
                </div>

                <div class="arrow">⇄</div>

                <div>
                    <div style="font-size: 0.85rem; color: var(--text-secondary); margin-bottom: 8px; font-weight: 700;">SEEKING</div>
                    <div class="items-list">
                        ${listing.seeking_items && listing.seeking_items.length > 0 ?
                            listing.seeking_items.map(item => `<span class="item-tag">${item.item_name}</span>`).join('') :
                            '<span class="item-tag" style="opacity: 0.6;">Any offers</span>'}
                    </div>
                </div>
            </div>

            <div class="listing-actions">
                ${listing.status === 'active' ? `
                    <button class="action-btn btn-cancel" onclick="dashboard.cancelListing(${listing.id})">Cancel</button>
                ` : ''}
                <button class="action-btn btn-view" onclick="window.location.href='/trading#${listing.id}'">View</button>
            </div>
        `;

        return card;
    }

    renderReceivedOffers() {
        const grid = document.getElementById('received-offers-grid');
        if (!grid) return;

        if (this.receivedOffers.length === 0) {
            grid.innerHTML = `
                <div class="empty-state">
                    <div class="empty-state-icon">📨</div>
                    <h2>No Offers Received</h2>
                    <p>When someone makes an offer on your listings, they'll appear here.</p>
                </div>
            `;
            return;
        }

        grid.innerHTML = '';
        this.receivedOffers.forEach(offer => {
            grid.appendChild(this.createOfferCard(offer, true));
        });
    }

    renderSentOffers() {
        const grid = document.getElementById('sent-offers-grid');
        if (!grid) return;

        if (this.sentOffers.length === 0) {
            grid.innerHTML = `
                <div class="empty-state">
                    <div class="empty-state-icon">📤</div>
                    <h2>No Offers Sent</h2>
                    <p>Browse the trading hub and make offers on listings!</p>
                    <a href="/trading" class="btn-view">Go to Trading Hub</a>
                </div>
            `;
            return;
        }

        grid.innerHTML = '';
        this.sentOffers.forEach(offer => {
            grid.appendChild(this.createOfferCard(offer, false));
        });
    }

    createOfferCard(offer, isReceived) {
        const card = document.createElement('div');
        card.className = 'offer-card';

        const timeAgo = this.getTimeAgo(new Date(offer.created_at));

        card.innerHTML = `
            <div class="offer-header">
                <div class="offer-info">
                    <h3>${offer.listing_title || `Listing #${offer.listing_id}`}</h3>
                    <div class="offer-from">${isReceived ? `From: ${offer.from_username}` : `To: ${offer.to_username}`} • ${timeAgo}</div>
                </div>
                <span class="offer-status ${offer.status}">${offer.status}</span>
            </div>

            ${offer.message ? `<div class="offer-message">"${offer.message}"</div>` : ''}

            <div>
                <div style="font-size: 0.85rem; color: var(--text-secondary); margin-bottom: 8px; font-weight: 700;">OFFERED ITEMS</div>
                <div class="items-list">
                    ${offer.offered_items.map(item => `<span class="item-tag">${item.item_name}</span>`).join('')}
                </div>
            </div>

            ${isReceived && offer.status === 'pending' ? `
                <div class="offer-actions">
                    <button class="action-btn btn-reject" onclick="dashboard.rejectOffer(${offer.id})">Reject</button>
                    <button class="action-btn btn-accept" onclick="dashboard.acceptOffer(${offer.id})">Accept Offer</button>
                </div>
            ` : ''}

            ${!isReceived && offer.status === 'pending' ? `
                <div class="offer-actions">
                    <button class="action-btn btn-cancel" onclick="dashboard.cancelOffer(${offer.id})">Cancel Offer</button>
                </div>
            ` : ''}
        `;

        return card;
    }

    async cancelListing(listingId) {
        if (!confirm('Are you sure you want to cancel this listing?')) return;

        try {
            const headers = await this.getAuthHeaders();
            const response = await fetch(`${this.apiBase}/listings/${listingId}`, {
                method: 'DELETE',
                headers
            });

            if (!response.ok) throw new Error('Failed to cancel listing');

            if (window.Utils) {
                Utils.showToast('Success', 'Listing cancelled', 'success');
            }

            await this.loadData();
            this.renderMyListings();
        } catch (error) {
            if (window.Utils) {
                Utils.showToast('Error', 'Failed to cancel listing', 'error');
            }
        }
    }

    async acceptOffer(offerId) {
        if (!confirm('Accept this offer? This will complete the trade.')) return;

        try {
            const headers = await this.getAuthHeaders();
            const response = await fetch(`${this.apiBase}/offers/${offerId}/accept`, {
                method: 'POST',
                headers
            });

            if (!response.ok) throw new Error('Failed to accept offer');

            if (window.Utils) {
                Utils.showToast('Success', 'Offer accepted! Trade completed.', 'success');
            }

            await this.loadData();
            this.renderReceivedOffers();
        } catch (error) {
            if (window.Utils) {
                Utils.showToast('Error', 'Failed to accept offer', 'error');
            }
        }
    }

    async rejectOffer(offerId) {
        if (!confirm('Reject this offer?')) return;

        try {
            const headers = await this.getAuthHeaders();
            const response = await fetch(`${this.apiBase}/offers/${offerId}/reject`, {
                method: 'POST',
                headers
            });

            if (!response.ok) throw new Error('Failed to reject offer');

            if (window.Utils) {
                Utils.showToast('Success', 'Offer rejected', 'success');
            }

            await this.loadData();
            this.renderReceivedOffers();
        } catch (error) {
            if (window.Utils) {
                Utils.showToast('Error', 'Failed to reject offer', 'error');
            }
        }
    }

    async cancelOffer(offerId) {
        if (!confirm('Cancel this offer?')) return;

        try {
            const headers = await this.getAuthHeaders();
            const response = await fetch(`${this.apiBase}/offers/${offerId}/cancel`, {
                method: 'POST',
                headers
            });

            if (!response.ok) throw new Error('Failed to cancel offer');

            if (window.Utils) {
                Utils.showToast('Success', 'Offer cancelled', 'success');
            }

            await this.loadData();
            this.renderSentOffers();
        } catch (error) {
            if (window.Utils) {
                Utils.showToast('Error', 'Failed to cancel offer', 'error');
            }
        }
    }

    getTimeAgo(date) {
        const seconds = Math.floor((new Date() - date) / 1000);

        const intervals = {
            year: 31536000,
            month: 2592000,
            week: 604800,
            day: 86400,
            hour: 3600,
            minute: 60
        };

        for (const [unit, secondsInUnit] of Object.entries(intervals)) {
            const interval = Math.floor(seconds / secondsInUnit);
            if (interval >= 1) {
                return `${interval} ${unit}${interval > 1 ? 's' : ''} ago`;
            }
        }

        return 'Just now';
    }

    async getAuthHeaders() {
        const sessionToken = localStorage.getItem('sessionToken');
        return {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${sessionToken}`
        };
    }
}

// Initialize
const dashboard = new TradeDashboard();
