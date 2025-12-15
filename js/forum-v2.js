// Modern Forum V2 - Ultra Design JavaScript
class ForumV2 {
    constructor() {
        this.currentUser = null;
        this.currentCategory = 'all';
        this.currentSort = 'newest';
        this.currentSearch = '';
        this.currentThread = null;
        this.posts = [];
        this.comments = [];
        this.isLoading = false;
        this.searchTimeout = null;
        
        this.init();
    }

    async init() {
        // Wait for auth to be ready
        if (window.Auth) {
            window.Auth.addEventListener('sessionReady', () => {
                this.currentUser = window.Auth.user;
                this.updateUIForAuth();
            });

            // Check if already authenticated
            if (window.Auth.user) {
                this.currentUser = window.Auth.user;
                this.updateUIForAuth();
            }
        }

        this.setupEventListeners();
        await this.loadPosts();
    }

    updateUIForAuth() {
        const createBtn = document.getElementById('create-post-btn');
        const myPostsBtn = document.getElementById('my-posts-btn');
        
        if (this.currentUser) {
            if (createBtn) createBtn.style.display = 'inline-flex';
            if (myPostsBtn) myPostsBtn.style.display = 'inline-flex';
        } else {
            if (createBtn) createBtn.style.display = 'none';
            if (myPostsBtn) myPostsBtn.style.display = 'none';
        }
    }

    setupEventListeners() {
        // Create post button
        const createPostBtn = document.getElementById('create-post-btn');
        if (createPostBtn) {
            createPostBtn.addEventListener('click', () => this.openCreatePostModal());
        }

        // My posts button
        const myPostsBtn = document.getElementById('my-posts-btn');
        if (myPostsBtn) {
            myPostsBtn.addEventListener('click', () => this.filterMyPosts());
        }

        // Category filter
        document.querySelectorAll('.category-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const category = e.target.dataset.category;
                this.filterByCategory(category);
            });
        });

        // Sort select
        const sortSelect = document.getElementById('sort-select');
        if (sortSelect) {
            sortSelect.addEventListener('change', (e) => {
                this.currentSort = e.target.value;
                this.renderPosts();
            });
        }

        // Search input
        const searchInput = document.getElementById('forum-search');
        if (searchInput) {
            searchInput.addEventListener('input', (e) => {
                clearTimeout(this.searchTimeout);
                this.searchTimeout = setTimeout(() => {
                    this.currentSearch = e.target.value.toLowerCase().trim();
                    this.renderPosts();
                }, 300);
            });
        }

        // Back to list button
        const backBtn = document.getElementById('back-to-list');
        if (backBtn) {
            backBtn.addEventListener('click', () => this.showListView());
        }

        // Modal handlers
        this.setupModals();

        // Forms
        this.setupForms();

        // Character counter
        this.setupCharCounter();
    }

    setupModals() {
        const createModal = document.getElementById('create-post-modal');
        const closeBtns = document.querySelectorAll('#close-create-modal, #cancel-create');
        
        closeBtns.forEach(btn => {
            btn.addEventListener('click', () => this.closeModal(createModal));
        });

        // Close on background click
        if (createModal) {
            createModal.addEventListener('click', (e) => {
                if (e.target === createModal) {
                    this.closeModal(createModal);
                }
            });
        }

        // Close on Escape key
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                const activeModal = document.querySelector('.forum-v2-modal.active');
                if (activeModal) {
                    this.closeModal(activeModal);
                }
            }
        });
    }

    setupForms() {
        const createForm = document.getElementById('create-post-form');
        if (createForm) {
            createForm.addEventListener('submit', (e) => {
                e.preventDefault();
                this.handleCreatePost();
            });
        }
    }

    setupCharCounter() {
        const postContent = document.getElementById('post-content');
        const contentCount = document.getElementById('content-count');

        if (postContent && contentCount) {
            postContent.addEventListener('input', () => {
                contentCount.textContent = postContent.value.length;
            });
        }
    }

    async loadPosts() {
        if (this.isLoading) return;
        
        const loading = document.getElementById('posts-loading');
        const container = document.getElementById('posts-container');
        const empty = document.getElementById('posts-empty');
        const error = document.getElementById('posts-error');

        try {
            this.isLoading = true;
            
            if (loading) loading.style.display = 'block';
            if (container) container.style.display = 'none';
            if (empty) empty.style.display = 'none';
            if (error) error.style.display = 'none';

            const url = new URL('/api/forum/posts', window.location.origin);
            if (this.currentCategory !== 'all') {
                url.searchParams.set('category', this.currentCategory);
            }

            const response = await fetch(url);
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const data = await response.json();
            this.posts = data.posts || [];

            this.isLoading = false;
            
            if (loading) loading.style.display = 'none';

            if (this.posts.length === 0) {
                if (empty) empty.style.display = 'block';
            } else {
                if (container) container.style.display = 'grid';
                this.renderPosts();
            }
        } catch (err) {
            console.error('Error loading posts:', err);
            this.isLoading = false;
            
            if (loading) loading.style.display = 'none';
            if (container) container.style.display = 'none';
            if (empty) empty.style.display = 'none';
            
            const errorEl = document.getElementById('posts-error');
            if (errorEl) {
                const errorMsg = document.getElementById('error-message');
                if (errorMsg) {
                    errorMsg.textContent = err.message || 'Unable to connect to the server. Please try again later.';
                }
                errorEl.style.display = 'block';
            }
            
            this.showToast('Failed to load forum posts', 'error');
        }
    }

    renderPosts() {
        const container = document.getElementById('posts-container');
        if (!container) return;

        let filteredPosts = [...this.posts];

        // Filter by category
        if (this.currentCategory !== 'all') {
            filteredPosts = filteredPosts.filter(post => post.category === this.currentCategory);
        }

        // Filter by search
        if (this.currentSearch) {
            filteredPosts = filteredPosts.filter(post => 
                post.title.toLowerCase().includes(this.currentSearch) ||
                post.content.toLowerCase().includes(this.currentSearch) ||
                post.username.toLowerCase().includes(this.currentSearch)
            );
        }

        // Sort posts
        filteredPosts.sort((a, b) => {
            // Pinned posts always first
            if (a.is_pinned && !b.is_pinned) return -1;
            if (!a.is_pinned && b.is_pinned) return 1;

            switch (this.currentSort) {
                case 'oldest':
                    return a.created_at - b.created_at;
                case 'most-liked':
                    return (b.like_count || 0) - (a.like_count || 0);
                case 'most-commented':
                    return (b.comment_count || 0) - (a.comment_count || 0);
                case 'newest':
                default:
                    return b.created_at - a.created_at;
            }
        });

        if (filteredPosts.length === 0) {
            container.innerHTML = '';
            const empty = document.getElementById('posts-empty');
            if (empty) {
                empty.querySelector('.forum-v2-empty-title').textContent = 
                    this.currentSearch ? 'No posts found' : 'No posts in this category';
                empty.querySelector('.forum-v2-empty-text').textContent = 
                    this.currentSearch ? 'Try a different search term' : 'Be the first to start a discussion!';
                empty.style.display = 'block';
            }
            return;
        }

        const empty = document.getElementById('posts-empty');
        if (empty) empty.style.display = 'none';

        container.innerHTML = filteredPosts.map(post => this.createPostCard(post)).join('');

        // Add click listeners
        container.querySelectorAll('.forum-v2-post-card').forEach((card, index) => {
            card.addEventListener('click', () => {
                this.viewThread(filteredPosts[index].id);
            });
        });
    }

    createPostCard(post) {
        const timeAgo = this.timeAgo(post.created_at);
        const commentCount = post.comment_count || 0;
        const likeCount = post.like_count || 0;
        const viewCount = post.views || 0;

        const badges = [];
        if (post.is_pinned) {
            badges.push(`<span class="forum-v2-post-badge pinned">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <line x1="12" y1="17" x2="12" y2="22"></line>
                    <path d="M5 17h14l-1-7H6l-1 7z"></path>
                    <path d="M9 9V6a3 3 0 0 1 6 0v3"></path>
                </svg>
                Pinned
            </span>`);
        }
        if (post.is_locked) {
            badges.push(`<span class="forum-v2-post-badge locked">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                    <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
                </svg>
                Locked
            </span>`);
        }

        // Truncate content for preview
        const preview = post.content.length > 150
            ? post.content.substring(0, 150) + '...'
            : post.content;

        // Get author initial for avatar
        const authorInitial = post.username ? post.username.charAt(0).toUpperCase() : '?';

        return `
            <div class="forum-v2-post-card ${post.is_pinned ? 'pinned' : ''}" data-id="${post.id}">
                <div class="forum-v2-post-header">
                    <span class="forum-v2-post-category ${post.category}">${this.capitalizeFirst(post.category)}</span>
                    <div class="forum-v2-post-badges">${badges.join('')}</div>
                </div>
                <h3 class="forum-v2-post-title">${this.escapeHtml(post.title)}</h3>
                <p class="forum-v2-post-preview">${this.escapeHtml(preview)}</p>
                <div class="forum-v2-post-footer">
                    <div class="forum-v2-post-author">
                        <div class="forum-v2-post-author-avatar">${authorInitial}</div>
                        <div class="forum-v2-post-author-info">
                            <div class="forum-v2-post-author-name">${this.escapeHtml(post.username)}</div>
                            <div class="forum-v2-post-time">${timeAgo}</div>
                        </div>
                    </div>
                    <div class="forum-v2-post-stats">
                        <div class="forum-v2-post-stat">
                            <svg class="forum-v2-post-stat-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                                <circle cx="12" cy="12" r="3"></circle>
                            </svg>
                            ${viewCount}
                        </div>
                        <div class="forum-v2-post-stat">
                            <svg class="forum-v2-post-stat-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path>
                            </svg>
                            ${likeCount}
                        </div>
                        <div class="forum-v2-post-stat">
                            <svg class="forum-v2-post-stat-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
                            </svg>
                            ${commentCount}
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    async viewThread(postId) {
        const listView = document.getElementById('forum-list-view');
        const threadView = document.getElementById('thread-view');

        try {
            const response = await fetch(`/api/forum/posts/${postId}`);
            if (!response.ok) throw new Error('Failed to load post');

            const data = await response.json();
            this.currentThread = data.post;
            this.comments = data.comments || [];

            // Update view count
            this.incrementViewCount(postId);

            // Render thread
            this.renderThread();

            // Switch views
            if (listView) listView.style.display = 'none';
            if (threadView) {
                threadView.classList.add('active');
                threadView.style.display = 'block';
            }

            // Scroll to top
            window.scrollTo(0, 0);
        } catch (error) {
            console.error('Error loading thread:', error);
            this.showToast('Failed to load thread', 'error');
        }
    }

    renderThread() {
        const container = document.getElementById('thread-content');
        if (!container || !this.currentThread) return;

        const post = this.currentThread;
        const timeAgo = this.timeAgo(post.created_at);
        const authorInitial = post.username ? post.username.charAt(0).toUpperCase() : '?';

        container.innerHTML = `
            <div class="forum-v2-thread-post">
                <div class="forum-v2-post-header">
                    <span class="forum-v2-post-category ${post.category}">${this.capitalizeFirst(post.category)}</span>
                </div>
                <h1 class="forum-v2-thread-title">${this.escapeHtml(post.title)}</h1>
                <div class="forum-v2-post-author" style="margin-bottom: 24px;">
                    <div class="forum-v2-post-author-avatar">${authorInitial}</div>
                    <div class="forum-v2-post-author-info">
                        <div class="forum-v2-post-author-name">${this.escapeHtml(post.username)}</div>
                        <div class="forum-v2-post-time">${timeAgo}</div>
                    </div>
                </div>
                <div class="forum-v2-thread-content">${this.escapeHtml(post.content)}</div>
            </div>
        `;
    }

    filterByCategory(category) {
        this.currentCategory = category;

        // Update active button
        document.querySelectorAll('.category-btn').forEach(btn => {
            btn.classList.remove('active');
            if (btn.dataset.category === category) {
                btn.classList.add('active');
            }
        });

        // Re-render posts
        this.renderPosts();
    }

    filterMyPosts() {
        if (!this.currentUser) {
            this.showToast('Please log in to view your posts', 'error');
            return;
        }

        const filteredPosts = this.posts.filter(post => post.user_id === this.currentUser.user_id);
        this.posts = filteredPosts;
        this.renderPosts();
    }

    showListView() {
        const listView = document.getElementById('forum-list-view');
        const threadView = document.getElementById('thread-view');

        if (listView) listView.style.display = 'block';
        if (threadView) {
            threadView.classList.remove('active');
            threadView.style.display = 'none';
        }
        
        this.currentThread = null;
        this.comments = [];
    }

    openCreatePostModal() {
        if (!this.currentUser) {
            this.showToast('Please log in to create a post', 'error');
            return;
        }

        const modal = document.getElementById('create-post-modal');
        if (modal) {
            modal.classList.add('active');
            document.getElementById('post-title')?.focus();
        }
    }

    closeModal(modal) {
        if (modal) {
            modal.classList.remove('active');
        }
    }

    async handleCreatePost() {
        if (!this.currentUser) {
            this.showToast('Please log in to create a post', 'error');
            return;
        }

        const category = document.getElementById('post-category')?.value;
        const title = document.getElementById('post-title')?.value.trim();
        const content = document.getElementById('post-content')?.value.trim();

        if (!title || !content) {
            this.showToast('Please fill in all required fields', 'error');
            return;
        }

        try {
            const token = localStorage.getItem('auth_token');
            const response = await fetch('/api/forum/posts', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ category, title, content })
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.error || 'Failed to create post');
            }

            const data = await response.json();

            this.showToast('Post created successfully!', 'success');
            this.closeModal(document.getElementById('create-post-modal'));

            // Reset form
            const form = document.getElementById('create-post-form');
            if (form) form.reset();
            const contentCount = document.getElementById('content-count');
            if (contentCount) contentCount.textContent = '0';

            // Reload posts and view the new thread
            await this.loadPosts();
            this.viewThread(data.post.id);
        } catch (error) {
            console.error('Error creating post:', error);
            this.showToast(error.message, 'error');
        }
    }

    async incrementViewCount(postId) {
        try {
            await fetch(`/api/forum/posts/${postId}/view`, {
                method: 'POST'
            });
        } catch (error) {
            // Silent fail - view count is not critical
            console.error('Error incrementing view count:', error);
        }
    }

    showToast(message, type = 'info') {
        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        toast.textContent = message;
        toast.style.cssText = `
            position: fixed;
            bottom: 20px;
            right: 20px;
            padding: 16px 24px;
            background: ${type === 'error' ? '#f44336' : type === 'success' ? '#4caf50' : '#2196f3'};
            color: white;
            border-radius: 12px;
            box-shadow: 0 4px 20px rgba(0,0,0,0.3);
            z-index: 10001;
            animation: toastFadeIn 0.3s ease;
            font-weight: 600;
        `;

        document.body.appendChild(toast);

        setTimeout(() => {
            toast.style.animation = 'toastFadeOut 0.3s ease';
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    }

    timeAgo(timestamp) {
        const seconds = Math.floor(Date.now() / 1000 - timestamp);

        if (seconds < 60) return 'just now';
        if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
        if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
        if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;
        if (seconds < 2592000) return `${Math.floor(seconds / 604800)}w ago`;
        if (seconds < 31536000) return `${Math.floor(seconds / 2592000)}mo ago`;
        return `${Math.floor(seconds / 31536000)}y ago`;
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    capitalizeFirst(str) {
        if (!str) return '';
        return str.charAt(0).toUpperCase() + str.slice(1).replace(/-/g, ' ');
    }
}

// Add CSS for toast animations - fade instead of slide
const style = document.createElement('style');
style.textContent = `
    @keyframes toastFadeIn {
        from {
            opacity: 0;
            transform: scale(0.9);
        }
        to {
            opacity: 1;
            transform: scale(1);
        }
    }

    @keyframes toastFadeOut {
        from {
            opacity: 1;
            transform: scale(1);
        }
        to {
            opacity: 0;
            transform: scale(0.9);
        }
    }
`;
document.head.appendChild(style);

// Initialize forum when page loads
if (!window.forumV2) {
    window.forumV2 = new ForumV2();
}

