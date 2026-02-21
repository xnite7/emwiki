class ForumV2 {
    constructor() {
        this.currentUser = null;
        this.isAdminUser = false;
        this.currentCategory = 'all';
        this.currentSort = 'newest';
        this.currentSearch = '';
        this.currentThread = null;
        this.posts = [];
        this.comments = [];
        this.isLoading = false;
        this.searchTimeout = null;
        this.editingPostId = null;
        this._confirmResolver = null;
        this.showingMyPosts = false;
        this._allItems = null;
        this._itemsLoading = false;
        this._baseApp = null;
        this.postAttachedItems = [];
        this.commentAttachedItems = [];

        this.init();
    }

    async init() {
        if (window.Auth) {
            window.Auth.addEventListener('sessionReady', () => {
                this.currentUser = window.Auth.user;
                this.isAdminUser = this._checkAdmin(window.Auth.user);
                this.updateUIForAuth();
            });
            if (window.Auth.user) {
                this.currentUser = window.Auth.user;
                this.isAdminUser = this._checkAdmin(window.Auth.user);
                this.updateUIForAuth();
            }
        }

        this.setupEventListeners();
        this.setupPopstate();
        await this.loadPosts();

        // If URL has a post ID on load, open that thread
        const postId = this._getPostIdFromUrl();
        if (postId) {
            await this.viewThread(postId, true);
        }
    }

    _getPostIdFromUrl() {
        const match = window.location.pathname.match(/\/forum\/(\d+)/);
        return match ? parseInt(match[1]) : null;
    }

    setupPopstate() {
        window.addEventListener('popstate', async (e) => {
            const postId = this._getPostIdFromUrl();
            if (postId) {
                await this.viewThread(postId, true);
            } else {
                this._showListViewOnly();
            }
        });
    }

    // ── Auth helpers ──

    _checkAdmin(user) {
        if (!user || !user.role) return false;
        try {
            const roles = JSON.parse(user.role);
            return roles.includes('admin') || roles.includes('moderator');
        } catch { return false; }
    }

    _getRoleBadge(roleJson) {
        if (!roleJson) return '';
        try {
            const roles = JSON.parse(roleJson);
            if (roles.includes('admin')) return '<span class="role-badge primary admin">Admin</span>';
            if (roles.includes('moderator')) return '<span class="role-badge primary moderator">Mod</span>';
        } catch { /* ignore */ }
        return '';
    }

    _profileLink(userId, inner) {
        return `<a href="/profile/${userId}" class="profile-link">${inner}</a>`;
    }

    async fetchWithAuth(url, opts = {}) {
        const token = localStorage.getItem('auth_token');
        if (token) {
            opts.headers = { ...opts.headers, 'Authorization': `Bearer ${token}` };
        }
        return fetch(url, opts);
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

        if (this.currentThread) this.renderThread();
    }

    // ── Event Listeners ──

    setupEventListeners() {
        document.getElementById('create-post-btn')?.addEventListener('click', () => this.openPostModal());
        document.getElementById('my-posts-btn')?.addEventListener('click', () => this.toggleMyPosts());
        document.getElementById('back-to-list')?.addEventListener('click', () => this.showListView());

        document.querySelectorAll('.category-btn').forEach(btn => {
            btn.addEventListener('click', () => this.filterByCategory(btn.dataset.category));
        });

        document.getElementById('sort-select')?.addEventListener('change', (e) => {
            this.currentSort = e.target.value;
            this.renderPosts();
        });

        const searchInput = document.getElementById('forum-search');
        if (searchInput) {
            searchInput.addEventListener('input', () => {
                clearTimeout(this.searchTimeout);
                this.searchTimeout = setTimeout(() => {
                    this.currentSearch = searchInput.value.toLowerCase().trim();
                    this.renderPosts();
                }, 300);
            });
        }

        this.setupModal();
        this.setupConfirmDialog();
        this.setupFormattingToolbar('post-fmt-toolbar', 'post-content-input');
        this.setupImageDrop('post-content-input');

        const contentInput = document.getElementById('post-content-input');
        const charCount = document.getElementById('post-char-count');
        if (contentInput && charCount) {
            contentInput.addEventListener('input', () => {
                charCount.textContent = contentInput.value.length;
                charCount.parentElement.classList.toggle('over', contentInput.value.length > 5000);
            });
        }

        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                const modal = document.getElementById('post-modal');
                if (modal?.classList.contains('active')) this.closePostModal();
            }
        });
    }

    // ── Modal ──

    setupModal() {
        const modal = document.getElementById('post-modal');
        document.getElementById('close-post-modal')?.addEventListener('click', () => this.closePostModal());
        document.getElementById('cancel-post-modal')?.addEventListener('click', () => this.closePostModal());
        modal?.addEventListener('click', (e) => { if (e.target === modal) this.closePostModal(); });

        document.getElementById('post-form')?.addEventListener('submit', (e) => {
            e.preventDefault();
            this.handleSubmitPost();
        });
    }

    openPostModal(editPost = null) {
        if (!this.currentUser) return this.showToast('Please log in to create a post', 'error');

        this.editingPostId = editPost ? editPost.id : null;
        const title = document.getElementById('post-modal-title');
        const submitBtn = document.getElementById('submit-post-btn');
        const catSelect = document.getElementById('post-category');
        const titleInput = document.getElementById('post-title-input');
        const contentInput = document.getElementById('post-content-input');
        const charCount = document.getElementById('post-char-count');

        if (editPost) {
            if (title) title.textContent = 'Edit Post';
            if (submitBtn) submitBtn.textContent = 'Save Changes';
            if (catSelect) catSelect.value = editPost.category;
            if (titleInput) titleInput.value = editPost.title;
            if (contentInput) contentInput.value = editPost.content;
            if (charCount) charCount.textContent = editPost.content.length;
            try {
                const items = editPost.attached_items ? (typeof editPost.attached_items === 'string' ? JSON.parse(editPost.attached_items) : editPost.attached_items) : [];
                this.postAttachedItems = Array.isArray(items) ? [...items] : [];
            } catch { this.postAttachedItems = []; }
        } else {
            if (title) title.textContent = 'New Post';
            if (submitBtn) submitBtn.textContent = 'Create Post';
            document.getElementById('post-form')?.reset();
            if (charCount) charCount.textContent = '0';
            this.postAttachedItems = [];
        }

        document.getElementById('post-modal')?.classList.add('active');
        this.setupItemPicker('post-item-search', 'post-item-picker', this.postAttachedItems);
        this.ensureItemsLoaded();
        titleInput?.focus();
    }

    closePostModal() {
        document.getElementById('post-modal')?.classList.remove('active');
        this.editingPostId = null;
    }

    // ── Confirm Dialog ──

    setupConfirmDialog() {
        document.getElementById('confirm-cancel')?.addEventListener('click', () => this.resolveConfirm(false));
        document.getElementById('confirm-ok')?.addEventListener('click', () => this.resolveConfirm(true));
    }

    confirm(title, message) {
        document.getElementById('confirm-title').textContent = title;
        document.getElementById('confirm-message').textContent = message;
        document.getElementById('confirm-dialog')?.classList.add('active');
        return new Promise(resolve => { this._confirmResolver = resolve; });
    }

    resolveConfirm(value) {
        document.getElementById('confirm-dialog')?.classList.remove('active');
        if (this._confirmResolver) { this._confirmResolver(value); this._confirmResolver = null; }
    }

    // ── Formatting Toolbar ──

    setupFormattingToolbar(toolbarId, textareaId) {
        const toolbar = document.getElementById(toolbarId);
        if (!toolbar) return;

        toolbar.addEventListener('click', (e) => {
            const btn = e.target.closest('.fmt-btn');
            if (!btn) return;
            const fmt = btn.dataset.fmt;
            const textarea = document.getElementById(textareaId);
            if (!textarea) return;
            this.insertFormatting(textarea, fmt);
        });
    }

    insertFormatting(textarea, fmt) {
        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        const text = textarea.value;
        const selected = text.substring(start, end);

        let before = '', after = '', insert = '';

        switch (fmt) {
            case 'bold': before = '**'; after = '**'; insert = selected || 'bold text'; break;
            case 'italic': before = '*'; after = '*'; insert = selected || 'italic text'; break;
            case 'underline': before = '__'; after = '__'; insert = selected || 'underlined text'; break;
            case 'h2': before = '\n## '; after = '\n'; insert = selected || 'Heading'; break;
            case 'h3': before = '\n### '; after = '\n'; insert = selected || 'Subheading'; break;
            case 'quote': before = '\n> '; after = '\n'; insert = selected || 'quote'; break;
            case 'image': {
                this.triggerImagePicker(textarea);
                return;
            }
            case 'link': {
                const url = prompt('Enter link URL:');
                if (!url) return;
                before = '['; after = `](${url})`;
                insert = selected || 'link text';
                break;
            }
            case 'color': {
                this.openColorPicker(textarea);
                return;
            }
            default: return;
        }

        const replacement = before + insert + after;
        textarea.value = text.substring(0, start) + replacement + text.substring(end);
        textarea.focus();
        const cursorPos = start + before.length + insert.length;
        textarea.setSelectionRange(cursorPos, cursorPos);
        textarea.dispatchEvent(new Event('input'));
    }

    // ── Color Picker ──

    openColorPicker(textarea) {
        document.querySelectorAll('.color-popover').forEach(p => p.remove());

        const btn = textarea.closest('.form-group, .comment-form-wrap')?.querySelector('.fmt-color-btn');
        if (!btn) return;

        const savedStart = textarea.selectionStart;
        const savedEnd = textarea.selectionEnd;

        const presets = [
            '#f44336', '#ff9800', '#ffc107', '#4caf50', '#2196f3',
            '#9c27b0', '#e91e63', '#00bcd4', '#8bc34a', '#ffffff'
        ];

        const popover = document.createElement('div');
        popover.className = 'color-popover';

        presets.forEach(color => {
            const swatch = document.createElement('div');
            swatch.className = 'color-swatch';
            swatch.style.background = color;
            swatch.addEventListener('click', (e) => {
                e.stopPropagation();
                this.applyColor(textarea, color, savedStart, savedEnd);
                popover.remove();
            });
            popover.appendChild(swatch);
        });

        const customBtn = document.createElement('div');
        customBtn.className = 'color-swatch custom';
        customBtn.textContent = 'Custom...';
        customBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            const input = document.createElement('input');
            input.type = 'color';
            input.value = '#4a9eff';
            input.addEventListener('input', () => {
                this.applyColor(textarea, input.value, savedStart, savedEnd);
                popover.remove();
            });
            input.click();
        });
        popover.appendChild(customBtn);

        btn.appendChild(popover);

        const closePopover = (e) => {
            if (!popover.contains(e.target) && e.target !== btn) {
                popover.remove();
                document.removeEventListener('click', closePopover);
            }
        };
        setTimeout(() => document.addEventListener('click', closePopover), 0);
    }

    applyColor(textarea, color, start, end) {
        const text = textarea.value;
        const selected = text.substring(start, end) || 'colored text';
        const replacement = `{color:${color}}${selected}{/color}`;
        textarea.value = text.substring(0, start) + replacement + text.substring(end);
        textarea.focus();
        const cursorPos = start + `{color:${color}}`.length + selected.length;
        textarea.setSelectionRange(cursorPos, cursorPos);
        textarea.dispatchEvent(new Event('input'));
    }

    // ── Image Upload (drag-and-drop, paste, file picker) ──

    triggerImagePicker(textarea) {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/jpeg,image/png,image/gif,image/webp';
        input.onchange = () => {
            if (input.files?.[0]) this.uploadAndInsertImage(input.files[0], textarea);
        };
        input.click();
    }

    setupImageDrop(textareaId) {
        const textarea = document.getElementById(textareaId);
        if (!textarea) return;

        textarea.addEventListener('dragover', (e) => {
            e.preventDefault();
            textarea.classList.add('drag-over');
        });

        textarea.addEventListener('dragleave', () => {
            textarea.classList.remove('drag-over');
        });

        textarea.addEventListener('drop', (e) => {
            e.preventDefault();
            textarea.classList.remove('drag-over');
            const file = [...(e.dataTransfer?.files || [])].find(f => f.type.startsWith('image/'));
            if (file) this.uploadAndInsertImage(file, textarea);
        });

        textarea.addEventListener('paste', (e) => {
            const items = e.clipboardData?.items;
            if (!items) return;
            for (const item of items) {
                if (item.type.startsWith('image/')) {
                    e.preventDefault();
                    const file = item.getAsFile();
                    if (file) this.uploadAndInsertImage(file, textarea);
                    return;
                }
            }
        });
    }

    async uploadAndInsertImage(file, textarea) {
        if (!this.currentUser) return this.showToast('Log in to upload images', 'error');

        const validTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
        if (!validTypes.includes(file.type)) return this.showToast('Only JPEG, PNG, GIF, WebP allowed', 'error');
        if (file.size > 5 * 1024 * 1024) return this.showToast('Image must be under 5 MB', 'error');

        const placeholder = `![Uploading ${file.name}...]()`;
        const pos = textarea.selectionStart;
        textarea.value = textarea.value.substring(0, pos) + placeholder + textarea.value.substring(pos);
        textarea.dispatchEvent(new Event('input'));

        try {
            const formData = new FormData();
            formData.append('file', file);

            const response = await this.fetchWithAuth('https://emwiki.com/api/forum/posts/upload', {
                method: 'POST',
                body: formData
            });

            if (!response.ok) {
                const err = await response.json();
                throw new Error(err.error || 'Upload failed');
            }

            const data = await response.json();
            const md = `![${file.name}](${data.url})`;
            textarea.value = textarea.value.replace(placeholder, md);
            textarea.dispatchEvent(new Event('input'));
            this.showToast('Image uploaded', 'success');
        } catch (err) {
            textarea.value = textarea.value.replace(placeholder, '');
            textarea.dispatchEvent(new Event('input'));
            this.showToast(err.message || 'Image upload failed', 'error');
        }
    }

    // ── Rich Text Parsing ──

    parseContent(raw) {
        if (!raw) return '';
        let text = this.escapeHtml(raw);

        // Headings (must be at line start)
        text = text.replace(/^### (.+)$/gm, '<h3>$1</h3>');
        text = text.replace(/^## (.+)$/gm, '<h2>$1</h2>');

        // Blockquotes
        text = text.replace(/^&gt; (.+)$/gm, '<blockquote>$1</blockquote>');

        // Bold
        text = text.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');

        // Italic (single *, but not inside **)
        text = text.replace(/(?<!\*)\*([^*]+?)\*(?!\*)/g, '<em>$1</em>');

        // Underline
        text = text.replace(/__(.+?)__/g, '<u>$1</u>');

        // Images - sanitize to only allow http/https
        text = text.replace(/!\[([^\]]*?)\]\((https?:\/\/[^)]+?)\)/g,
            '<img src="$2" alt="$1" loading="lazy" onerror="this.style.display=\'none\'">');

        // Links
        text = text.replace(/\[([^\]]+?)\]\((https?:\/\/[^)]+?)\)/g,
            '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');

        // Colored text (hex-only to prevent XSS)
        text = text.replace(/\{color:(#[0-9a-fA-F]{3,6})\}(.+?)\{\/color\}/g,
            '<span style="color:$1">$2</span>');

        // Newlines to <br>
        text = text.replace(/\n/g, '<br>');

        return text;
    }

    extractFirstImage(raw) {
        if (!raw) return null;
        const match = raw.match(/!\[[^\]]*?\]\((https?:\/\/[^)]+?)\)/);
        return match ? match[1] : null;
    }

    stripFormatting(raw) {
        if (!raw) return '';
        let t = raw;
        t = t.replace(/!\[[^\]]*?\]\([^)]+?\)/g, '');
        t = t.replace(/\[([^\]]+?)\]\([^)]+?\)/g, '$1');
        t = t.replace(/\*\*(.+?)\*\*/g, '$1');
        t = t.replace(/\*(.+?)\*/g, '$1');
        t = t.replace(/__(.+?)__/g, '$1');
        t = t.replace(/\{color:#[0-9a-fA-F]{3,6}\}(.+?)\{\/color\}/g, '$1');
        t = t.replace(/^#{2,3}\s*/gm, '');
        t = t.replace(/^>\s*/gm, '');
        return t.trim();
    }

    // ── Load Posts ──

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

            const response = await fetch('https://emwiki.com/api/forum/posts');
            if (!response.ok) throw new Error(`HTTP ${response.status}`);

            const data = await response.json();
            this.posts = data.posts || [];
            this.isLoading = false;

            if (loading) loading.style.display = 'none';

            if (this.posts.length === 0) {
                if (empty) empty.style.display = 'block';
            } else {
                if (container) container.style.display = 'flex';
                this.renderPosts();
            }
        } catch (err) {
            console.error('Error loading posts:', err);
            this.isLoading = false;
            if (loading) loading.style.display = 'none';
            const errorMsg = document.getElementById('error-message');
            if (errorMsg) errorMsg.textContent = err.message || 'Please try again later.';
            if (error) error.style.display = 'block';
        }
    }

    // ── Render Post List ──

    renderPosts() {
        const container = document.getElementById('posts-container');
        const empty = document.getElementById('posts-empty');
        if (!container) return;

        let filtered = [...this.posts];

        if (this.showingMyPosts && this.currentUser) {
            filtered = filtered.filter(p => p.user_id === this.currentUser.user_id);
        }

        if (this.currentCategory !== 'all') {
            filtered = filtered.filter(p => p.category === this.currentCategory);
        }

        if (this.currentSearch) {
            filtered = filtered.filter(p =>
                p.title.toLowerCase().includes(this.currentSearch) ||
                p.content.toLowerCase().includes(this.currentSearch) ||
                p.username.toLowerCase().includes(this.currentSearch)
            );
        }

        filtered.sort((a, b) => {
            if (a.is_pinned && !b.is_pinned) return -1;
            if (!a.is_pinned && b.is_pinned) return 1;
            switch (this.currentSort) {
                case 'oldest': return a.created_at - b.created_at;
                case 'most-liked': return (b.like_count || 0) - (a.like_count || 0);
                case 'most-commented': return (b.comment_count || 0) - (a.comment_count || 0);
                default: return b.created_at - a.created_at;
            }
        });

        if (filtered.length === 0) {
            container.innerHTML = '';
            container.style.display = 'none';
            if (empty) {
                empty.querySelector('h3').textContent = this.currentSearch ? 'No posts found' : 'No posts in this category';
                empty.querySelector('p').textContent = this.currentSearch ? 'Try a different search term' : 'Be the first to start a discussion!';
                empty.style.display = 'block';
            }
            return;
        }

        if (empty) empty.style.display = 'none';
        container.style.display = 'flex';
        container.innerHTML = filtered.map(p => this.createPostCard(p)).join('');

        container.querySelectorAll('.post-card').forEach(card => {
            card.addEventListener('click', (e) => {
                if (e.target.closest('.profile-link')) return;
                if (e.target.closest('.post-card-overlay')) return;
                this.viewThread(parseInt(card.dataset.id));
            });
        });
    }

    avatarImg(avatarUrl, username) {
        if (avatarUrl) {
            return `<img src="${this.escapeHtml(avatarUrl)}" alt="${this.escapeHtml(username || '')}" loading="lazy">`;
        }
        return (username || '?').charAt(0).toUpperCase();
    }

    createPostCard(post) {
        const thumb = this.extractFirstImage(post.content);
        const preview = this.stripFormatting(post.content).substring(0, 160);

        const categoryGradients = {
            general: '#9e9e9e', trading: '#2196f3', updates: '#ff9800',
            guides: '#9c27b0', feedback: '#4caf50', 'off-topic': '#f44336'
        };
        const catColor = categoryGradients[post.category] || '#9e9e9e';

        const badges = [];
        if (post.is_pinned) badges.push('<span class="post-badge pin"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 17v5"/><path d="M5 17h14l-1.5-7h-11z"/></svg>Pinned</span>');
        if (post.is_locked) badges.push('<span class="post-badge lock"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>Locked</span>');

        const thumbStyle = thumb
            ? `background-image:url('${this.escapeHtml(thumb)}')`
            : `background:linear-gradient(135deg, ${catColor}22, ${catColor}11)`;

        const initial = (post.username || '?').charAt(0).toUpperCase();
        const thumbInner = thumb ? '' : `<div class="post-thumb-fallback" style="color:${catColor}">${this.escapeHtml(initial)}</div>`;

        return `<div class="post-card ${post.is_pinned ? 'pinned' : ''}" data-id="${post.id}">
            <a class="post-card-overlay" href="/forum/${post.id}" aria-label="${this.escapeHtml(post.title)}"></a>
            <div class="post-thumb" style="${thumbStyle}">${thumbInner}</div>
            <div class="post-body">
                <div class="post-meta-top">
                    <span class="post-category-badge ${this.escapeHtml(post.category)}">${this.capitalizeFirst(post.category)}</span>
                    ${badges.join('')}
                </div>
                <h3 class="post-title">${this.escapeHtml(post.title)}</h3>
                <p class="post-preview">${this.escapeHtml(preview)}</p>
                <div class="post-footer">
                    <div class="post-author">
                        ${this._profileLink(post.user_id, `<div class="post-author-avatar">${this.avatarImg(post.avatar_url, post.username)}</div><span class="post-author-name">${this.escapeHtml(post.username)}</span>`)}
                        ${this._getRoleBadge(post.role)}
                        <span class="post-time">${this.timeAgo(post.created_at)}</span>
                    </div>
                    <div class="post-stats">
                        <span class="post-stat"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>${post.views || 0}</span>
                        <span class="post-stat"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>${post.like_count || 0}</span>
                        <span class="post-stat"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>${post.comment_count || 0}</span>
                    </div>
                </div>
            </div>
        </div>`;
    }

    // ── Category / Filter ──

    filterByCategory(category) {
        this.currentCategory = category;
        document.querySelectorAll('.category-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.category === category);
        });
        this.renderPosts();
    }

    toggleMyPosts() {
        const btn = document.getElementById('my-posts-btn');
        this.showingMyPosts = !this.showingMyPosts;
        if (btn) btn.textContent = this.showingMyPosts ? 'All Posts' : 'My Posts';
        this.renderPosts();
    }

    // ── View Thread ──

    async viewThread(postId, fromPopstate = false) {
        try {
            const response = await this.fetchWithAuth(`https://emwiki.com/api/forum/posts/${postId}`);
            if (!response.ok) throw new Error('Failed to load post');

            const data = await response.json();
            this.currentThread = data.post;
            this.comments = data.comments || [];

            this.incrementViewCount(postId);
            this.renderThread();

            document.getElementById('forum-list-view').style.display = 'none';
            document.querySelector('.forum-sort-row')?.style.setProperty('display', 'none');
            const tv = document.getElementById('thread-view');
            tv.classList.add('active');
            tv.style.display = 'block';
            window.scrollTo({ top: 0, behavior: 'smooth' });

            if (!fromPopstate) {
                history.pushState({ postId }, '', `/forum/${postId}`);
            }
        } catch (err) {
            console.error('Error loading thread:', err);
            this.showToast('Failed to load thread', 'error');
        }
    }

    renderThread() {
        const container = document.getElementById('thread-content');
        if (!container || !this.currentThread) return;
        const post = this.currentThread;

        const isOwner = this.currentUser && this.currentUser.user_id === post.user_id;
        const canAdmin = this.isAdminUser;

        let adminBtns = '';
        if (canAdmin) {
            adminBtns += `<button class="btn btn-warn" data-action="pin">${post.is_pinned ? 'Unpin' : 'Pin'}</button>`;
            adminBtns += `<button class="btn btn-warn" data-action="lock">${post.is_locked ? 'Unlock' : 'Lock'}</button>`;
            adminBtns += `<button class="btn btn-danger" data-action="delete-post">Delete</button>`;
        } else if (isOwner) {
            adminBtns += `<button class="btn" data-action="edit-post">Edit</button>`;
            adminBtns += `<button class="btn btn-danger" data-action="delete-post">Delete</button>`;
        }

        const editedStr = post.edited_at ? `<span class="comment-edited">(edited)</span>` : '';

        const likedClass = post.user_has_liked ? ' liked' : '';
        const heartFill = post.user_has_liked ? 'fill="currentColor"' : 'fill="none"';

        container.innerHTML = `
            <div class="thread-header">
                <h1 class="thread-title">${this.escapeHtml(post.title)}</h1>
                <div class="thread-header-meta">
                    <span class="post-category-badge ${this.escapeHtml(post.category)}">${this.capitalizeFirst(post.category)}</span>
                    ${post.is_pinned ? '<span class="post-badge pin">Pinned</span>' : ''}
                    ${post.is_locked ? '<span class="post-badge lock">Locked</span>' : ''}
                    ${adminBtns ? `<div class="thread-admin-actions">${adminBtns}</div>` : ''}
                </div>
            </div>
            <div class="thread-daddy">
                ${this._profileLink(post.user_id, `<div class="thread-avatar">${this.avatarImg(post.avatar_url, post.username)}</div>`)}
                <div class="thread-post">
                    <div class="thread-author-bar">
                        
                        ${this._profileLink(post.user_id, `<span class="thread-author-name">${this.escapeHtml(post.username)}</span>`)}
                        
                        ${this._getRoleBadge(post.role)}
                        <span class="op-badge" tabindex="0">OP</span>
                        <span class="thread-post-date">${this.timeAgo(post.created_at)} ${editedStr}</span>
                    </div>
                    <div class="thread-content">${this.parseContent(post.content)}</div>
                    ${this.renderAttachedItemsHtml(post.attached_items)}
                    <div class="thread-actions-row">
                        <button class="thread-action-btn${likedClass}" data-action="like-post">
                            <svg viewBox="0 0 24 24" ${heartFill} stroke="currentColor" stroke-width="2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
                            <span class="like-count">${post.like_count || 0}</span>
                        </button>
                        <span class="thread-stat"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>${post.views || 0} views</span>
                        <span class="thread-stat"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>${this.comments.length} comments</span>
                    </div>
                </div>
            </div>
            <div class="comments-section">
                <div class="comments-header">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
                    Comments <span class="comment-count-num">${this.comments.length}</span>
                </div>
                ${this.currentUser && !post.is_locked ? `
                <div class="comment-form-wrap visible">
                    <div class="fmt-toolbar" id="comment-fmt-toolbar">
                        <button type="button" class="fmt-btn" data-fmt="bold" title="Bold"><b>B</b></button>
                        <button type="button" class="fmt-btn" data-fmt="italic" title="Italic"><i>I</i></button>
                        <button type="button" class="fmt-btn" data-fmt="image" title="Image">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-5-5L5 21"/></svg>
                        </button>
                        <button type="button" class="fmt-btn" data-fmt="link" title="Link">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
                        </button>
                        <button type="button" class="fmt-btn fmt-color-btn" data-fmt="color" title="Text Color">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 20h16"/><path d="m6 16 6-14 6 14"/><path d="M8 12h8"/></svg>
                        </button>
                    </div>
                    <textarea class="comment-textarea" id="comment-input" maxlength="2000" placeholder="Write a comment..."></textarea>
                    <div class="item-picker" id="comment-item-picker">
                        <div class="item-picker-chips"></div>
                        <input type="text" id="comment-item-search" class="item-picker-input" placeholder="Attach items..." autocomplete="off">
                    </div>
                    <div class="comment-form-footer">
                        <span class="char-count"><span id="comment-char-count">0</span>/2000</span>
                        <button class="btn btn-primary" id="submit-comment-btn">Post Comment</button>
                    </div>
                </div>` : (!this.currentUser ? '<div class="comment-login-prompt">Log in to join the conversation</div>' : '<div class="comment-login-prompt">This thread is locked</div>')}
                <div id="comments-list">
                    ${this.comments.length === 0 ? '<div class="comments-empty">No comments yet. Be the first!</div>' : this.comments.map(c => this.renderComment(c)).join('')}
                </div>
            </div>
        `;

        this.bindThreadActions(container);
    }

    renderComment(comment) {
        const isOwner = this.currentUser && this.currentUser.user_id === comment.user_id;
        const canDelete = isOwner || this.isAdminUser;

        const likedClass = comment.user_has_liked ? ' liked' : '';
        const heartFill = comment.user_has_liked ? 'fill="currentColor"' : 'fill="none"';
        const editedStr = comment.edited_at ? ' <span class="comment-edited">(edited)</span>' : '';

        let actionBtns = `<button class="comment-act-btn${likedClass}" data-action="like-comment" data-id="${comment.id}">
            <svg viewBox="0 0 24 24" ${heartFill} stroke="currentColor" stroke-width="2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
            <span>${comment.like_count || 0}</span>
        </button>`;

        if (isOwner) {
            actionBtns += `<button class="comment-act-btn" data-action="edit-comment" data-id="${comment.id}">Edit</button>`;
        }
        if (canDelete) {
            actionBtns += `<button class="comment-act-btn" data-action="delete-comment" data-id="${comment.id}">Delete</button>`;
        }

        const isOp = this.currentThread && comment.user_id === this.currentThread.user_id;

        return `<div class="comment-item" data-comment-id="${comment.id}">
            <div class="comment-top">
                ${this._profileLink(comment.user_id, `<div class="comment-avatar">${this.avatarImg(comment.avatar_url, comment.username)}</div><span class="comment-author-name">${this.escapeHtml(comment.username)}</span>`)}
                ${isOp ? '<span class="op-badge" tabindex="0">OP</span>' : ''}
                ${this._getRoleBadge(comment.role)}
                <span class="comment-time">${this.timeAgo(comment.created_at)}${editedStr}</span>
                <div class="comment-actions">${actionBtns}</div>
            </div>
            <div class="comment-body">${this.parseContent(comment.content)}${this.renderAttachedItemsHtml(comment.attached_items)}</div>
        </div>`;
    }

    // ── Thread Event Binding ──

    bindThreadActions(container) {
        this.setupFormattingToolbar('comment-fmt-toolbar', 'comment-input');
        this.setupImageDrop('comment-input');

        const commentInput = document.getElementById('comment-input');
        const commentCharCount = document.getElementById('comment-char-count');
        if (commentInput && commentCharCount) {
            commentInput.addEventListener('input', () => {
                commentCharCount.textContent = commentInput.value.length;
                commentCharCount.parentElement.classList.toggle('over', commentInput.value.length > 2000);
            });
        }

        // Item picker for comments
        this.commentAttachedItems = [];
        this.setupItemPicker('comment-item-search', 'comment-item-picker', this.commentAttachedItems);
        this.ensureItemsLoaded();

        // Bind clickable item chips in post and comments
        this.bindAttachedItemClicks(container);

        document.getElementById('submit-comment-btn')?.addEventListener('click', () => this.handleCreateComment());

        // Thread action buttons
        container.querySelectorAll('[data-action]').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.stopPropagation();
                const action = btn.dataset.action;
                const id = btn.dataset.id ? parseInt(btn.dataset.id) : null;

                switch (action) {
                    case 'like-post': this.toggleLikePost(); break;
                    case 'edit-post': this.openPostModal(this.currentThread); break;
                    case 'delete-post': this.handleDeletePost(); break;
                    case 'pin': this.togglePin(); break;
                    case 'lock': this.toggleLock(); break;
                    case 'like-comment': this.toggleLikeComment(id, btn); break;
                    case 'edit-comment': this.startEditComment(id); break;
                    case 'delete-comment': this.handleDeleteComment(id); break;
                }
            });
        });
    }

    // ── CRUD: Posts ──

    async handleSubmitPost() {
        if (!this.currentUser) return this.showToast('Please log in', 'error');

        const category = document.getElementById('post-category')?.value;
        const title = document.getElementById('post-title-input')?.value.trim();
        const content = document.getElementById('post-content-input')?.value.trim();

        if (!title || !content) return this.showToast('Please fill in all fields', 'error');
        if (title.length > 200) return this.showToast('Title is too long (max 200)', 'error');
        if (content.length > 5000) return this.showToast('Content is too long (max 5000)', 'error');

        const submitBtn = document.getElementById('submit-post-btn');
        if (submitBtn) submitBtn.disabled = true;

        try {
            const url = this.editingPostId ? `https://emwiki.com/api/forum/posts/${this.editingPostId}` : 'https://emwiki.com/api/forum/posts';
            const method = this.editingPostId ? 'PUT' : 'POST';

            const response = await this.fetchWithAuth(url, {
                method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ category, title, content, attached_items: this.postAttachedItems.length > 0 ? this.postAttachedItems : undefined })
            });

            if (!response.ok) {
                const err = await response.json();
                throw new Error(err.error || 'Failed');
            }

            const data = await response.json();
            this.showToast(this.editingPostId ? 'Post updated!' : 'Post created!', 'success');
            this.closePostModal();

            await this.loadPosts();

            if (this.editingPostId) {
                await this.viewThread(this.editingPostId);
            } else if (data.post?.id) {
                await this.viewThread(data.post.id);
            }
        } catch (err) {
            this.showToast(err.message, 'error');
        } finally {
            if (submitBtn) submitBtn.disabled = false;
        }
    }

    async handleDeletePost() {
        if (!this.currentThread) return;
        const ok = await this.confirm('Delete Post', 'This will permanently remove the post and all its comments. Continue?');
        if (!ok) return;

        try {
            const response = await this.fetchWithAuth(`https://emwiki.com/api/forum/posts/${this.currentThread.id}`, { method: 'DELETE' });
            if (!response.ok) throw new Error('Failed to delete');
            this.showToast('Post deleted', 'success');
            this.showListView();
            await this.loadPosts();
        } catch (err) {
            this.showToast(err.message, 'error');
        }
    }

    // ── CRUD: Comments ──

    async handleCreateComment() {
        if (!this.currentUser || !this.currentThread) return;

        const input = document.getElementById('comment-input');
        const content = input?.value.trim();
        if (!content) return this.showToast('Comment cannot be empty', 'error');
        if (content.length > 2000) return this.showToast('Comment is too long (max 2000)', 'error');

        const btn = document.getElementById('submit-comment-btn');
        if (btn) btn.disabled = true;

        try {
            const response = await this.fetchWithAuth('https://emwiki.com/api/forum/comments', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ post_id: this.currentThread.id, content, attached_items: this.commentAttachedItems.length > 0 ? this.commentAttachedItems : undefined })
            });

            if (!response.ok) {
                const err = await response.json();
                throw new Error(err.error || 'Failed');
            }

            const data = await response.json();
            this.comments.push(data.comment);
            if (input) { input.value = ''; input.dispatchEvent(new Event('input')); }

            this.renderThread();
            this.showToast('Comment posted!', 'success');

            const post = this.posts.find(p => p.id === this.currentThread.id);
            if (post) post.comment_count = (post.comment_count || 0) + 1;
        } catch (err) {
            this.showToast(err.message, 'error');
        } finally {
            if (btn) btn.disabled = false;
        }
    }

    startEditComment(commentId) {
        const comment = this.comments.find(c => c.id === commentId);
        if (!comment) return;

        const item = document.querySelector(`.comment-item[data-comment-id="${commentId}"]`);
        if (!item) return;

        const bodyEl = item.querySelector('.comment-body');
        const actionsEl = item.querySelector('.comment-actions');

        bodyEl.innerHTML = `<textarea class="comment-textarea" id="edit-comment-input" maxlength="2000" style="min-height:70px">${this.escapeHtml(comment.content)}</textarea>`;
        actionsEl.innerHTML = `
            <button class="btn btn-primary" style="font-size:12px;padding:5px 12px" id="save-edit-comment">Save</button>
            <button class="btn" style="font-size:12px;padding:5px 12px" id="cancel-edit-comment">Cancel</button>`;

        document.getElementById('save-edit-comment')?.addEventListener('click', () => this.saveEditComment(commentId));
        document.getElementById('cancel-edit-comment')?.addEventListener('click', () => this.renderThread());
        document.getElementById('edit-comment-input')?.focus();
    }

    async saveEditComment(commentId) {
        const input = document.getElementById('edit-comment-input');
        const content = input?.value.trim();
        if (!content) return this.showToast('Comment cannot be empty', 'error');

        try {
            const response = await this.fetchWithAuth(`https://emwiki.com/api/forum/comments/${commentId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ content })
            });

            if (!response.ok) throw new Error('Failed to update');

            const comment = this.comments.find(c => c.id === commentId);
            if (comment) {
                comment.content = content;
                comment.edited_at = Math.floor(Date.now() / 1000);
            }
            this.renderThread();
            this.showToast('Comment updated', 'success');
        } catch (err) {
            this.showToast(err.message, 'error');
        }
    }

    async handleDeleteComment(commentId) {
        const ok = await this.confirm('Delete Comment', 'Remove this comment permanently?');
        if (!ok) return;

        try {
            const response = await this.fetchWithAuth(`https://emwiki.com/api/forum/comments/${commentId}`, { method: 'DELETE' });
            if (!response.ok) throw new Error('Failed to delete');
            this.comments = this.comments.filter(c => c.id !== commentId);
            this.renderThread();
            this.showToast('Comment deleted', 'success');

            const post = this.posts.find(p => p.id === this.currentThread.id);
            if (post && post.comment_count > 0) post.comment_count--;
        } catch (err) {
            this.showToast(err.message, 'error');
        }
    }

    // ── Likes ──

    async toggleLikePost() {
        if (!this.currentUser) return this.showToast('Please log in to like posts', 'error');
        if (!this.currentThread) return;

        const btn = document.querySelector('[data-action="like-post"]');
        const countEl = btn?.querySelector('.like-count');
        const svgEl = btn?.querySelector('svg');

        // Optimistic update
        const wasLiked = this.currentThread.user_has_liked;
        this.currentThread.user_has_liked = !wasLiked;
        this.currentThread.like_count = (this.currentThread.like_count || 0) + (wasLiked ? -1 : 1);

        btn?.classList.toggle('liked', !wasLiked);
        if (svgEl) svgEl.setAttribute('fill', wasLiked ? 'none' : 'currentColor');
        if (countEl) countEl.textContent = this.currentThread.like_count;

        try {
            const response = await this.fetchWithAuth(`https://emwiki.com/api/forum/posts/${this.currentThread.id}/like`, { method: 'POST' });
            if (!response.ok) throw new Error();
            const data = await response.json();
            this.currentThread.like_count = data.like_count;
            this.currentThread.user_has_liked = data.liked;
            if (countEl) countEl.textContent = data.like_count;

            const post = this.posts.find(p => p.id === this.currentThread.id);
            if (post) { post.like_count = data.like_count; post.user_has_liked = data.liked; }
        } catch {
            // Revert on failure
            this.currentThread.user_has_liked = wasLiked;
            this.currentThread.like_count = (this.currentThread.like_count || 0) + (wasLiked ? 1 : -1);
            btn?.classList.toggle('liked', wasLiked);
            if (svgEl) svgEl.setAttribute('fill', wasLiked ? 'currentColor' : 'none');
            if (countEl) countEl.textContent = this.currentThread.like_count;
        }
    }

    async toggleLikeComment(commentId, btn) {
        if (!this.currentUser) return this.showToast('Please log in to like comments', 'error');

        const comment = this.comments.find(c => c.id === commentId);
        if (!comment) return;

        const countEl = btn?.querySelector('span');
        const svgEl = btn?.querySelector('svg');
        const wasLiked = comment.user_has_liked;

        comment.user_has_liked = !wasLiked;
        comment.like_count = (comment.like_count || 0) + (wasLiked ? -1 : 1);
        btn?.classList.toggle('liked', !wasLiked);
        if (svgEl) svgEl.setAttribute('fill', wasLiked ? 'none' : 'currentColor');
        if (countEl) countEl.textContent = comment.like_count;

        try {
            const response = await this.fetchWithAuth(`https://emwiki.com/api/forum/comments/${commentId}/like`, { method: 'POST' });
            if (!response.ok) throw new Error();
            const data = await response.json();
            comment.like_count = data.like_count;
            comment.user_has_liked = data.liked;
            if (countEl) countEl.textContent = data.like_count;
        } catch {
            comment.user_has_liked = wasLiked;
            comment.like_count = (comment.like_count || 0) + (wasLiked ? 1 : -1);
            btn?.classList.toggle('liked', wasLiked);
            if (svgEl) svgEl.setAttribute('fill', wasLiked ? 'currentColor' : 'none');
            if (countEl) countEl.textContent = comment.like_count;
        }
    }

    // ── Admin: Pin / Lock ──

    async togglePin() {
        if (!this.currentThread || !this.isAdminUser) return;
        const newVal = !this.currentThread.is_pinned;
        try {
            const response = await this.fetchWithAuth(`https://emwiki.com/api/forum/posts/${this.currentThread.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ is_pinned: newVal })
            });
            if (!response.ok) throw new Error();
            this.currentThread.is_pinned = newVal;
            const post = this.posts.find(p => p.id === this.currentThread.id);
            if (post) post.is_pinned = newVal;
            this.renderThread();
            this.showToast(newVal ? 'Post pinned' : 'Post unpinned', 'success');
        } catch {
            this.showToast('Failed to update pin status', 'error');
        }
    }

    async toggleLock() {
        if (!this.currentThread || !this.isAdminUser) return;
        const newVal = !this.currentThread.is_locked;
        try {
            const response = await this.fetchWithAuth(`https://emwiki.com/api/forum/posts/${this.currentThread.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ is_locked: newVal })
            });
            if (!response.ok) throw new Error();
            this.currentThread.is_locked = newVal;
            const post = this.posts.find(p => p.id === this.currentThread.id);
            if (post) post.is_locked = newVal;
            this.renderThread();
            this.showToast(newVal ? 'Post locked' : 'Post unlocked', 'success');
        } catch {
            this.showToast('Failed to update lock status', 'error');
        }
    }

    // ── View Management ──

    showListView() {
        history.pushState(null, '', '/forum');
        this._showListViewOnly();
    }

    _showListViewOnly() {
        document.getElementById('forum-list-view').style.display = 'block';
        document.querySelector('.forum-sort-row')?.style.removeProperty('display');
        const tv = document.getElementById('thread-view');
        tv.classList.remove('active');
        tv.style.display = 'none';
        this.currentThread = null;
        this.comments = [];
        this.renderPosts();
    }

    async incrementViewCount(postId) {
        try { await fetch(`https://emwiki.com/api/forum/posts/${postId}/view`, { method: 'POST' }); }
        catch { /* non-critical */ }
    }

    // ── Item Attachments ──

    async ensureItemsLoaded() {
        if (this._allItems) return this._allItems;
        if (this._itemsLoading) {
            return new Promise(resolve => {
                const check = setInterval(() => {
                    if (this._allItems) { clearInterval(check); resolve(this._allItems); }
                }, 100);
            });
        }
        this._itemsLoading = true;
        try {
            const cached = localStorage.getItem('itemsCache');
            if (cached) {
                this._allItems = JSON.parse(cached);
                return this._allItems;
            }
            const res = await fetch('https://emwiki.com/api/items?limit=2000');
            const data = await res.json();
            this._allItems = data.items || [];
            return this._allItems;
        } catch {
            this._allItems = [];
            return [];
        } finally {
            this._itemsLoading = false;
        }
    }

    findItemByName(name) {
        if (!this._allItems) return null;
        return this._allItems.find(i => i.name === name) || null;
    }

    async openItemModal(itemName) {
        const items = await this.ensureItemsLoaded();
        const item = items.find(i => i.name === itemName);
        if (!item) return this.showToast('Item not found', 'error');

        if (!this._baseApp) {
            if (window.BaseApp) {
                this._baseApp = new window.BaseApp();
                await this._baseApp.loadData();
            } else {
                window.location.href = `/catalog?item=${encodeURIComponent(itemName)}`;
                return;
            }
        }
        this._baseApp.modal.displayed = items;
        this._baseApp.modal.open(item);
    }

    getItemImgSrc(item) {
        if (!item) return '';
        if (item.img) return item.img.replace(/\\/g, '/');
        return '';
    }

    renderAttachedItemsHtml(attachedJson) {
        if (!attachedJson) return '';
        let names;
        try { names = typeof attachedJson === 'string' ? JSON.parse(attachedJson) : attachedJson; }
        catch { return ''; }
        if (!Array.isArray(names) || names.length === 0) return '';

        const chips = names.map(name => {
            const item = this.findItemByName(name);
            const img = item ? this.getItemImgSrc(item) : '';
            const imgTag = img ? `<img src="${this.escapeHtml(img)}" alt="" loading="lazy">` : '';
            return `<button class="attached-item-chip" data-item-name="${this.escapeHtml(name)}">${imgTag}<span>${this.escapeHtml(name)}</span></button>`;
        }).join('');

        return `<div class="attached-items-display">${chips}</div>`;
    }

    bindAttachedItemClicks(container) {
        container.querySelectorAll('.attached-item-chip').forEach(chip => {
            chip.addEventListener('click', (e) => {
                e.stopPropagation();
                this.openItemModal(chip.dataset.itemName);
            });
        });
    }

    setupItemPicker(inputId, containerId, listArray) {
        const input = document.getElementById(inputId);
        const container = document.getElementById(containerId);
        if (!input || !container) return;

        let dropdown = null;
        let searchTimer = null;

        const renderChips = () => {
            const chipsEl = container.querySelector('.item-picker-chips');
            if (!chipsEl) return;
            chipsEl.innerHTML = listArray.map((name, i) => {
                const item = this.findItemByName(name);
                const img = item ? this.getItemImgSrc(item) : '';
                const imgTag = img ? `<img src="${this.escapeHtml(img)}" alt="">` : '';
                return `<span class="item-picker-chip">${imgTag}${this.escapeHtml(name)}<button data-idx="${i}">&times;</button></span>`;
            }).join('');

            chipsEl.querySelectorAll('button').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    listArray.splice(parseInt(btn.dataset.idx), 1);
                    renderChips();
                });
            });
        };

        const showDropdown = (results) => {
            hideDropdown();
            if (results.length === 0) return;

            dropdown = document.createElement('div');
            dropdown.className = 'item-picker-dropdown';

            results.forEach(item => {
                const opt = document.createElement('div');
                opt.className = 'item-picker-option';
                const img = this.getItemImgSrc(item);
                opt.innerHTML = `${img ? `<img src="${this.escapeHtml(img)}" alt="">` : ''}<span>${this.escapeHtml(item.name)}</span>`;
                opt.addEventListener('click', (e) => {
                    e.stopPropagation();
                    if (listArray.length >= 10) return this.showToast('Max 10 items', 'error');
                    if (listArray.includes(item.name)) return this.showToast('Already attached', 'error');
                    listArray.push(item.name);
                    input.value = '';
                    hideDropdown();
                    renderChips();
                });
                dropdown.appendChild(opt);
            });

            input.parentElement.appendChild(dropdown);
        };

        const hideDropdown = () => {
            if (dropdown) { dropdown.remove(); dropdown = null; }
        };

        input.addEventListener('input', () => {
            clearTimeout(searchTimer);
            const q = input.value.trim().toLowerCase();
            if (q.length < 2) { hideDropdown(); return; }

            searchTimer = setTimeout(async () => {
                const items = await this.ensureItemsLoaded();
                const results = items.filter(i =>
                    i.name.toLowerCase().includes(q) ||
                    (i.alias && i.alias.toLowerCase().includes(q))
                ).slice(0, 8);
                showDropdown(results);
            }, 200);
        });

        input.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') hideDropdown();
        });

        document.addEventListener('click', (e) => {
            if (!container.contains(e.target)) hideDropdown();
        });

        renderChips();
    }

    // ── Utilities ──

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
        if (!text) return '';
        const el = document.createElement('div');
        el.textContent = text;
        return el.innerHTML;
    }

    capitalizeFirst(str) {
        if (!str) return '';
        return str.charAt(0).toUpperCase() + str.slice(1).replace(/-/g, ' ');
    }

    showToast(message, type = 'info') {
        const toast = document.createElement('div');
        toast.className = `forum-toast ${type}`;
        toast.textContent = message;
        document.body.appendChild(toast);
        setTimeout(() => {
            toast.style.animation = 'toastOut 0.3s ease forwards';
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    }
}

if (!window.forumV2) {
    window.forumV2 = new ForumV2();
}
