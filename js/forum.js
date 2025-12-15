// Forum Page JavaScript
class Forum {
    constructor() {
        this.currentUser = null;
        this.currentCategory = 'all';
        this.currentThread = null;
        this.posts = [];
        this.comments = [];

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
        if (this.currentUser) {
            document.getElementById('create-post-btn').style.display = 'inline-flex';
            document.getElementById('my-posts-btn').style.display = 'inline-flex';
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
        const categoryBtns = document.querySelectorAll('.category-btn');
        categoryBtns.forEach(btn => {
            btn.addEventListener('click', (e) => {
                const category = e.target.dataset.category;
                this.filterByCategory(category);
            });
        });

        // Back to list button
        const backBtn = document.getElementById('back-to-list');
        if (backBtn) {
            backBtn.addEventListener('click', () => this.showListView());
        }

        // Modals
        this.setupModals();

        // Forms
        this.setupForms();

        // Character counter
        this.setupCharCounter();
    }

    setupModals() {
        // Create post modal
        const createModal = document.getElementById('create-post-modal');
        const createCloseBtn = createModal.querySelectorAll('.modal-close');
        createCloseBtn.forEach(btn => {
            btn.addEventListener('click', () => this.closeModal(createModal));
        });

        // Edit post modal
        const editModal = document.getElementById('edit-post-modal');
        const editCloseBtn = editModal.querySelectorAll('.modal-close');
        editCloseBtn.forEach(btn => {
            btn.addEventListener('click', () => this.closeModal(editModal));
        });

        // Close on background click
        [createModal, editModal].forEach(modal => {
            modal.addEventListener('click', (e) => {
                if (e.target === modal) {
                    this.closeModal(modal);
                }
            });
        });
    }

    setupForms() {
        // Create post form
        const createForm = document.getElementById('create-post-form');
        if (createForm) {
            createForm.addEventListener('submit', (e) => {
                e.preventDefault();
                this.handleCreatePost();
            });
        }

        // Edit post form
        const editForm = document.getElementById('edit-post-form');
        if (editForm) {
            editForm.addEventListener('submit', (e) => {
                e.preventDefault();
                this.handleEditPost();
            });
        }

        // Comment form
        const commentForm = document.getElementById('comment-form');
        if (commentForm) {
            commentForm.addEventListener('submit', (e) => {
                e.preventDefault();
                this.handleCreateComment();
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

        const editPostContent = document.getElementById('edit-post-content');
        const editContentCount = document.getElementById('edit-content-count');

        if (editPostContent && editContentCount) {
            editPostContent.addEventListener('input', () => {
                editContentCount.textContent = editPostContent.value.length;
            });
        }
    }

    async loadPosts() {
        const loading = document.getElementById('posts-loading');
        const container = document.getElementById('posts-container');
        const empty = document.getElementById('posts-empty');

        try {
            loading.style.display = 'block';
            container.style.display = 'none';
            empty.style.display = 'none';

            const response = await fetch('/api/forum/posts');
            if (!response.ok) throw new Error('Failed to load posts');

            const data = await response.json();
            this.posts = data.posts || [];

            loading.style.display = 'none';

            if (this.posts.length === 0) {
                empty.style.display = 'block';
            } else {
                container.style.display = 'block';
                this.renderPosts();
            }
        } catch (error) {
            console.error('Error loading posts:', error);
            loading.style.display = 'none';
            container.style.display = 'none';
            // Show error state in empty container
            empty.innerHTML = `
                <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <circle cx="12" cy="12" r="10"></circle>
                    <line x1="12" y1="8" x2="12" y2="12"></line>
                    <line x1="12" y1="16" x2="12.01" y2="16"></line>
                </svg>
                <h3>Failed to load posts</h3>
                <p>${error.message || 'Unable to connect to the server. Please try again later.'}</p>
                <button class="btn btn-primary" onclick="location.reload()" style="margin-top: 15px;">Retry</button>
            `;
            empty.style.display = 'block';
            this.showToast('Failed to load forum posts', 'error');
        }
    }

    renderPosts() {
        const container = document.getElementById('posts-container');

        let filteredPosts = this.posts;
        if (this.currentCategory !== 'all') {
            filteredPosts = this.posts.filter(post => post.category === this.currentCategory);
        }

        // Sort: pinned first, then by creation date
        filteredPosts.sort((a, b) => {
            if (a.is_pinned && !b.is_pinned) return -1;
            if (!a.is_pinned && b.is_pinned) return 1;
            return b.created_at - a.created_at;
        });

        if (filteredPosts.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
                    </svg>
                    <h3>No posts in this category</h3>
                    <p>Be the first to start a discussion!</p>
                </div>
            `;
            return;
        }

        container.innerHTML = filteredPosts.map(post => this.createPostCard(post)).join('');

        // Add click listeners
        container.querySelectorAll('.post-card').forEach((card, index) => {
            card.addEventListener('click', () => {
                this.viewThread(filteredPosts[index].id);
            });
        });
    }

    createPostCard(post) {
        const timeAgo = this.timeAgo(post.created_at);
        const commentCount = post.comment_count || 0;
        const likeCount = post.like_count || 0;

        const badges = [];
        if (post.is_pinned) {
            badges.push('<span class="post-badge pinned">📌 Pinned</span>');
        }
        if (post.is_locked) {
            badges.push('<span class="post-badge locked">🔒 Locked</span>');
        }

        // Truncate content for preview
        const preview = post.content.length > 200
            ? post.content.substring(0, 200) + '...'
            : post.content;

        return `
            <div class="post-card ${post.is_pinned ? 'pinned' : ''} ${post.is_locked ? 'locked' : ''}" data-id="${post.id}">
                <div class="post-icon">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
                    </svg>
                    <div class="post-stats-mini">
                        💬 ${commentCount}
                    </div>
                </div>
                <div class="post-main">
                    <div class="post-header">
                        <span class="post-category ${post.category}">${post.category}</span>
                        ${badges.join('')}
                    </div>
                    <h3 class="post-title">${this.escapeHtml(post.title)}</h3>
                    <p class="post-preview">${this.escapeHtml(preview)}</p>
                    <div class="post-meta">
                        <span class="post-author">${this.escapeHtml(post.username)}</span>
                        ${this.getUserRoleBadge(post)}
                        <span class="post-time">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <circle cx="12" cy="12" r="10"></circle>
                                <polyline points="12 6 12 12 16 14"></polyline>
                            </svg>
                            ${timeAgo}
                        </span>
                        <div class="post-stats">
                            <span class="post-stat">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                                    <circle cx="12" cy="12" r="3"></circle>
                                </svg>
                                ${post.views || 0}
                            </span>
                            <span class="post-stat">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path>
                                </svg>
                                ${likeCount}
                            </span>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    getUserRoleBadge(post) {
        if (!post.role || post.role === 'user') return '';

        const roleLabels = {
            admin: '👑 Admin',
            moderator: '🛡️ Mod',
            vip: '⭐ VIP',
            donator: '💎 Donator'
        };

        const label = roleLabels[post.role] || '';
        return `<span class="role-badge ${post.role}">${label}</span>`;
    }

    async viewThread(postId) {
        const listView = document.getElementById('forum-list-view');
        const threadView = document.getElementById('thread-view');

        try {
            // Fetch post details
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
            listView.style.display = 'none';
            threadView.style.display = 'block';

            // Scroll to top
            window.scrollTo(0, 0);
        } catch (error) {
            console.error('Error loading thread:', error);
            this.showToast('Failed to load thread', 'error');
        }
    }

    renderThread() {
        const container = document.getElementById('thread-content');
        const post = this.currentThread;

        const timeAgo = this.timeAgo(post.created_at);
        const editedText = post.edited_at ? `<span class="comment-edited">(edited ${this.timeAgo(post.edited_at)})</span>` : '';

        const badges = [];
        if (post.is_pinned) {
            badges.push('<span class="post-badge pinned">📌 Pinned</span>');
        }
        if (post.is_locked) {
            badges.push('<span class="post-badge locked">🔒 Locked</span>');
        }

        const isAuthor = this.currentUser && this.currentUser.user_id === post.user_id;
        const isAdmin = this.currentUser && (this.currentUser.role === 'admin' || this.currentUser.role === 'moderator');

        container.innerHTML = `
            <div class="thread-post">
                <div class="thread-header">
                    <div class="post-header">
                        <span class="post-category ${post.category}">${post.category}</span>
                        ${badges.join('')}
                    </div>
                    <h1 class="thread-title">${this.escapeHtml(post.title)}</h1>
                    <div class="thread-meta">
                        <span class="thread-author">
                            ${this.escapeHtml(post.username)}
                            ${this.getUserRoleBadge(post)}
                        </span>
                        <span class="post-time">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <circle cx="12" cy="12" r="10"></circle>
                                <polyline points="12 6 12 12 16 14"></polyline>
                            </svg>
                            ${timeAgo}
                        </span>
                        ${editedText}
                        <span class="post-stat">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                                <circle cx="12" cy="12" r="3"></circle>
                            </svg>
                            ${post.views || 0} views
                        </span>
                    </div>
                </div>
                <div class="thread-content">${this.escapeHtml(post.content)}</div>
                <div class="thread-actions">
                    <button class="thread-action-btn ${post.user_has_liked ? 'liked' : ''}" data-action="like">
                        <svg viewBox="0 0 24 24" fill="${post.user_has_liked ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2">
                            <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path>
                        </svg>
                        <span>${post.like_count || 0}</span>
                    </button>
                    ${isAuthor ? `
                        <button class="thread-action-btn" data-action="edit">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                            </svg>
                            Edit
                        </button>
                    ` : ''}
                    ${isAuthor || isAdmin ? `
                        <button class="thread-action-btn" data-action="delete">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <polyline points="3 6 5 6 21 6"></polyline>
                                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                            </svg>
                            Delete
                        </button>
                    ` : ''}
                </div>
            </div>
        `;

        // Add action listeners
        container.querySelectorAll('.thread-action-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const action = btn.dataset.action;

                if (action === 'like') {
                    this.toggleLikePost(post.id);
                } else if (action === 'edit') {
                    this.openEditPostModal(post);
                } else if (action === 'delete') {
                    this.deletePost(post.id);
                }
            });
        });

        // Show/hide comment form
        const commentFormContainer = document.getElementById('comment-form-container');
        if (this.currentUser && !post.is_locked) {
            commentFormContainer.style.display = 'block';
        } else {
            commentFormContainer.style.display = 'none';
        }

        // Render comments
        this.renderComments();
    }

    renderComments() {
        const container = document.getElementById('comments-container');

        if (this.comments.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <p>No comments yet. Be the first to comment!</p>
                </div>
            `;
            return;
        }

        // Sort comments by creation date
        const sortedComments = [...this.comments].sort((a, b) => a.created_at - b.created_at);

        container.innerHTML = sortedComments.map(comment => this.createCommentCard(comment)).join('');

        // Add action listeners
        container.querySelectorAll('.comment-action-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const commentId = parseInt(btn.closest('.comment').dataset.id);
                const action = btn.dataset.action;

                if (action === 'like') {
                    this.toggleLikeComment(commentId);
                } else if (action === 'delete') {
                    this.deleteComment(commentId);
                }
            });
        });
    }

    createCommentCard(comment) {
        const timeAgo = this.timeAgo(comment.created_at);
        const editedText = comment.edited_at ? `<span class="comment-edited">(edited ${this.timeAgo(comment.edited_at)})</span>` : '';

        const isAuthor = this.currentUser && this.currentUser.user_id === comment.user_id;
        const isAdmin = this.currentUser && (this.currentUser.role === 'admin' || this.currentUser.role === 'moderator');

        return `
            <div class="comment ${comment.parent_comment_id ? 'reply' : ''}" data-id="${comment.id}">
                <div class="comment-header">
                    <span class="comment-author">${this.escapeHtml(comment.username)}</span>
                    ${this.getUserRoleBadge(comment)}
                    <span class="comment-time">${timeAgo}</span>
                    ${editedText}
                </div>
                <div class="comment-content">${this.escapeHtml(comment.content)}</div>
                <div class="comment-actions">
                    ${this.currentUser ? `
                        <button class="comment-action-btn ${comment.user_has_liked ? 'liked' : ''}" data-action="like">
                            <svg viewBox="0 0 24 24" fill="${comment.user_has_liked ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2">
                                <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path>
                            </svg>
                            ${comment.like_count || 0}
                        </button>
                    ` : `
                        <span class="comment-action-btn">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path>
                            </svg>
                            ${comment.like_count || 0}
                        </span>
                    `}
                    ${isAuthor || isAdmin ? `
                        <button class="comment-action-btn" data-action="delete">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <polyline points="3 6 5 6 21 6"></polyline>
                                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                            </svg>
                            Delete
                        </button>
                    ` : ''}
                </div>
            </div>
        `;
    }

    async handleCreatePost() {
        if (!this.currentUser) {
            this.showToast('Please log in to create a post', 'error');
            return;
        }

        const category = document.getElementById('post-category').value;
        const title = document.getElementById('post-title').value.trim();
        const content = document.getElementById('post-content').value.trim();

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
            document.getElementById('create-post-form').reset();
            document.getElementById('content-count').textContent = '0';

            // Reload posts and view the new thread
            await this.loadPosts();
            this.viewThread(data.post.id);
        } catch (error) {
            console.error('Error creating post:', error);
            this.showToast(error.message, 'error');
        }
    }

    async handleEditPost() {
        const postId = document.getElementById('edit-post-id').value;
        const title = document.getElementById('edit-post-title').value.trim();
        const content = document.getElementById('edit-post-content').value.trim();

        if (!title || !content) {
            this.showToast('Please fill in all required fields', 'error');
            return;
        }

        try {
            const token = localStorage.getItem('auth_token');
            const response = await fetch(`/api/forum/posts/${postId}`, {
                method: 'PUT',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ title, content })
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.error || 'Failed to update post');
            }

            this.showToast('Post updated successfully!', 'success');
            this.closeModal(document.getElementById('edit-post-modal'));

            // Reload the thread
            await this.viewThread(postId);
        } catch (error) {
            console.error('Error updating post:', error);
            this.showToast(error.message, 'error');
        }
    }

    async handleCreateComment() {
        if (!this.currentUser) {
            this.showToast('Please log in to comment', 'error');
            return;
        }

        const content = document.getElementById('comment-content').value.trim();

        if (!content) {
            this.showToast('Please enter a comment', 'error');
            return;
        }

        try {
            const token = localStorage.getItem('auth_token');
            const response = await fetch('/api/forum/comments', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    post_id: this.currentThread.id,
                    content
                })
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.error || 'Failed to create comment');
            }

            const data = await response.json();

            // Add comment to list
            this.comments.push(data.comment);

            // Re-render comments
            this.renderComments();

            // Reset form
            document.getElementById('comment-content').value = '';

            this.showToast('Comment posted!', 'success');
        } catch (error) {
            console.error('Error creating comment:', error);
            this.showToast(error.message, 'error');
        }
    }

    async toggleLikePost(postId) {
        if (!this.currentUser) {
            this.showToast('Please log in to like posts', 'error');
            return;
        }

        try {
            const token = localStorage.getItem('auth_token');
            const response = await fetch(`/api/forum/posts/${postId}/like`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.error || 'Failed to like post');
            }

            const data = await response.json();

            // Update current thread
            this.currentThread.user_has_liked = data.liked;
            this.currentThread.like_count = data.like_count;

            // Re-render thread
            this.renderThread();
        } catch (error) {
            console.error('Error liking post:', error);
            this.showToast(error.message, 'error');
        }
    }

    async toggleLikeComment(commentId) {
        if (!this.currentUser) {
            this.showToast('Please log in to like comments', 'error');
            return;
        }

        try {
            const token = localStorage.getItem('auth_token');
            const response = await fetch(`/api/forum/comments/${commentId}/like`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.error || 'Failed to like comment');
            }

            const data = await response.json();

            // Update comment
            const comment = this.comments.find(c => c.id === commentId);
            if (comment) {
                comment.user_has_liked = data.liked;
                comment.like_count = data.like_count;
            }

            // Re-render comments
            this.renderComments();
        } catch (error) {
            console.error('Error liking comment:', error);
            this.showToast(error.message, 'error');
        }
    }

    async deletePost(postId) {
        if (!confirm('Are you sure you want to delete this post? This action cannot be undone.')) {
            return;
        }

        try {
            const token = localStorage.getItem('auth_token');
            const response = await fetch(`/api/forum/posts/${postId}`, {
                method: 'DELETE',
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.error || 'Failed to delete post');
            }

            this.showToast('Post deleted successfully', 'success');

            // Go back to list view and reload
            this.showListView();
            await this.loadPosts();
        } catch (error) {
            console.error('Error deleting post:', error);
            this.showToast(error.message, 'error');
        }
    }

    async deleteComment(commentId) {
        if (!confirm('Are you sure you want to delete this comment? This action cannot be undone.')) {
            return;
        }

        try {
            const token = localStorage.getItem('auth_token');
            const response = await fetch(`/api/forum/comments/${commentId}`, {
                method: 'DELETE',
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.error || 'Failed to delete comment');
            }

            // Remove from comments list
            this.comments = this.comments.filter(c => c.id !== commentId);

            // Re-render comments
            this.renderComments();

            this.showToast('Comment deleted successfully', 'success');
        } catch (error) {
            console.error('Error deleting comment:', error);
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

        const container = document.getElementById('posts-container');
        const myPosts = this.posts.filter(post => post.user_id === this.currentUser.user_id);

        if (myPosts.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
                    </svg>
                    <h3>You haven't created any posts yet</h3>
                    <p>Start a new discussion to get started!</p>
                </div>
            `;
            return;
        }

        container.innerHTML = myPosts.map(post => this.createPostCard(post)).join('');

        // Add click listeners
        container.querySelectorAll('.post-card').forEach((card, index) => {
            card.addEventListener('click', () => {
                this.viewThread(myPosts[index].id);
            });
        });
    }

    showListView() {
        document.getElementById('forum-list-view').style.display = 'block';
        document.getElementById('thread-view').style.display = 'none';
        this.currentThread = null;
        this.comments = [];
    }

    openCreatePostModal() {
        if (!this.currentUser) {
            this.showToast('Please log in to create a post', 'error');
            return;
        }

        const modal = document.getElementById('create-post-modal');
        modal.style.display = 'flex';
    }

    openEditPostModal(post) {
        const modal = document.getElementById('edit-post-modal');

        document.getElementById('edit-post-id').value = post.id;
        document.getElementById('edit-post-title').value = post.title;
        document.getElementById('edit-post-content').value = post.content;
        document.getElementById('edit-content-count').textContent = post.content.length;

        modal.style.display = 'flex';
    }

    closeModal(modal) {
        modal.style.display = 'none';
    }

    showToast(message, type = 'info') {
        // Create toast element
        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        toast.textContent = message;
        toast.style.cssText = `
            position: fixed;
            bottom: 20px;
            right: 20px;
            padding: 15px 20px;
            background: ${type === 'error' ? '#f44336' : type === 'success' ? '#4caf50' : '#2196f3'};
            color: white;
            border-radius: 8px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.3);
            z-index: 10000;
            animation: slideIn 0.3s ease;
        `;

        document.body.appendChild(toast);

        setTimeout(() => {
            toast.style.animation = 'slideOut 0.3s ease';
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
}

// Add CSS for toast animations
const style = document.createElement('style');
style.textContent = `
    @keyframes slideIn {
        from {
            transform: translateX(400px);
            opacity: 0;
        }
        to {
            transform: translateX(0);
            opacity: 1;
        }
    }

    @keyframes slideOut {
        from {
            transform: translateX(0);
            opacity: 1;
        }
        to {
            transform: translateX(400px);
            opacity: 0;
        }
    }
`;
document.head.appendChild(style);

// Initialize forum when page loads
if (!window.forum) {
    window.forum = new Forum();
}
