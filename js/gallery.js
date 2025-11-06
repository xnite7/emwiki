// Gallery Page JavaScript
class Gallery {
    constructor() {
        this.currentPage = 1;
        this.itemsPerPage = 10;
        this.isLoading = false;
        this.totalItems = 0;
        this.totalPages = 0;
        this.currentUser = null;
        this.currentSort = 'newest'; // 'likes' or 'newest'
        this.intersectionObserver = null;
        this.loadedVideos = new Set(); // Track which videos have loaded

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
        this.setupLazyLoading();
        await new Promise(resolve => setTimeout(resolve, 920));
        await this.loadGallery();
    }

    updateUIForAuth() {
        if (this.currentUser) {
            document.getElementById('gallery-actions').style.display = 'flex';
        }
    }

    setupLazyLoading() {
        // Intersection Observer for lazy loading videos and images
        const options = {
            root: null,
            rootMargin: '100px', // Start loading 100px before entering viewport
            threshold: 0.01
        };

        this.intersectionObserver = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    const media = entry.target;

                    if (media.tagName === 'VIDEO') {
                        // Load video source
                        if (media.dataset.src && !this.loadedVideos.has(media.dataset.src)) {
                            media.src = media.dataset.src;

                            // If no poster, load first frame as thumbnail
                            if (!media.poster || media.poster === '') {
                                media.preload = 'metadata';
                                media.addEventListener('loadeddata', function() {
                                    media.dataset.loaded = 'true';
                                }, { once: true });
                            }

                            media.load();
                            this.loadedVideos.add(media.dataset.src);
                        }
                    } else if (media.tagName === 'IMG') {
                        // Load image source
                        if (media.dataset.src) {
                            media.src = media.dataset.src;
                        }
                    }

                    // Stop observing once loaded
                    this.intersectionObserver.unobserve(media);
                }
            });
        }, options);
    }

    setupEventListeners() {
        // Upload button
        const uploadBtn = document.getElementById('upload-btn');
        if (uploadBtn) {
            uploadBtn.addEventListener('click', () => this.openUploadModal());
        }

        // My submissions button
        const mySubmissionsBtn = document.getElementById('my-submissions-btn');
        if (mySubmissionsBtn) {
            mySubmissionsBtn.addEventListener('click', () => this.openSubmissionsModal());
        }

        // Upload modal
        this.setupUploadModal();

        // Submissions modal
        this.setupSubmissionsModal();

        // Viewer modal
        this.setupViewerModal();

        // Pagination controls
        document.addEventListener('click', (e) => {
            if (e.target.closest('.pagination-btn')) {
                const btn = e.target.closest('.pagination-btn');
                const page = parseInt(btn.dataset.page);
                if (!isNaN(page)) {
                    this.goToPage(page);
                }
            }
        });

        // Sort controls
        const sortButtons = document.querySelectorAll('.sort-btn');
        sortButtons.forEach(btn => {
            btn.addEventListener('click', () => {
                const sortBy = btn.dataset.sort;
                this.changeSort(sortBy);
            });
        });
    }

    setupUploadModal() {
        const modal = document.getElementById('upload-modal');
        const closeBtn = modal.querySelector('.modal-close');
        const cancelBtn = modal.querySelector('.modal-cancel');
        const form = document.getElementById('upload-form');
        const fileInput = document.getElementById('media-file');
        const previewContainer = document.getElementById('preview-container');

        closeBtn.addEventListener('click', () => this.closeModal(modal));
        cancelBtn.addEventListener('click', () => this.closeModal(modal));

        // File preview
        fileInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) {
                this.previewFile(file, previewContainer);
            }
        });

        // Form submit
        form.addEventListener('submit', (e) => {
            e.preventDefault();
            this.handleUpload();
        });
    }

    setupSubmissionsModal() {
        const modal = document.getElementById('submissions-modal');
        const closeBtn = modal.querySelector('.modal-close');

        closeBtn.addEventListener('click', () => this.closeModal(modal));
    }

    setupViewerModal() {
        const modal = document.getElementById('viewer-modal');
        const closeBtn = modal.querySelector('.viewer-close');

        closeBtn.addEventListener('click', () => this.closeModal(modal));

        // Close on background click
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                this.closeModal(modal);
            }
        });
    }

    previewFile(file, container) {
        const reader = new FileReader();

        reader.onload = (e) => {
            container.classList.add('active');

            if (file.type.startsWith('image/')) {
                container.innerHTML = `<img src="${e.target.result}" alt="Preview">`;
            } else if (file.type.startsWith('video/')) {
                container.innerHTML = `<video src="${e.target.result}" controls></video>`;
            }
        };

        reader.readAsDataURL(file);
    }

    async handleUpload() {
        const fileInput = document.getElementById('media-file');
        const titleInput = document.getElementById('media-title');
        const descriptionInput = document.getElementById('media-description');
        const progressContainer = document.querySelector('.upload-progress');
        const progressFill = document.querySelector('.progress-fill');
        const progressText = document.querySelector('.progress-text');

        const file = fileInput.files[0];
        const title = titleInput.value.trim();
        const description = descriptionInput.value.trim();

        if (!file || !title) {
            this.showToast('Please fill in all required fields', 'error');
            return;
        }

        try {
            // Show progress
            progressContainer.style.display = 'block';
            progressFill.style.width = '30%';
            progressText.textContent = 'Uploading file...';

            // Upload file to R2
            const formData = new FormData();
            formData.append('file', file);

            const token = localStorage.getItem('auth_token');
            const uploadResponse = await fetch('https://emwiki.com/api/gallery/upload', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`
                },
                body: formData
            });

            if (!uploadResponse.ok) {
                const error = await uploadResponse.json();
                throw new Error(error.error || 'Upload failed');
            }

            const { url, type } = await uploadResponse.json();

            progressFill.style.width = '60%';
            progressText.textContent = 'Submitting for review...';

            // Submit gallery item
            const mediaType = type.startsWith('image/') ? 'image' : 'video';
            const submitResponse = await fetch('https://emwiki.com/api/gallery/submit', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    title,
                    description,
                    media_url: url,
                    media_type: mediaType
                })
            });

            if (!submitResponse.ok) {
                const error = await submitResponse.json();
                throw new Error(error.error || 'Submission failed');
            }

            progressFill.style.width = '100%';
            progressText.textContent = 'Complete!';

            const result = await submitResponse.json();
            this.showToast(result.message || 'Submission successful!', 'success');

            // Close modal and reset form
            setTimeout(() => {
                this.closeModal(document.getElementById('upload-modal'));
                document.getElementById('upload-form').reset();
                document.getElementById('preview-container').classList.remove('active');
                progressContainer.style.display = 'none';
                progressFill.style.width = '0%';
            }, 1000);

        } catch (error) {
            console.error('Upload error:', error);
            this.showToast(error.message, 'error');
            progressContainer.style.display = 'none';
        }
    }

    async loadGallery() {
        if (this.isLoading) return;

        this.isLoading = true;
        const container = document.getElementById('gallery-grid');
        const offset = (this.currentPage - 1) * this.itemsPerPage;

        try {
            const token = localStorage.getItem('auth_token');
            const headers = token ? { 'Authorization': `Bearer ${token}` } : {};
            const response = await fetch(`https://emwiki.com/api/gallery?limit=${this.itemsPerPage}&offset=${offset}&sort=${this.currentSort}`, {
                headers
            });
            const { items, total } = await response.json();

            this.totalItems = total || items.length;
            this.totalPages = Math.ceil(this.totalItems / this.itemsPerPage);

            if (items.length === 0 && this.currentPage === 1) {
                container.innerHTML = `
                    <div class="empty-state" style="grid-column: 1/-1;">
                        <h3>No gallery items yet</h3>
                        <p>Be the first to share your Epic Minigames moments!</p>
                    </div>
                `;
            } else {
                container.innerHTML = '';

                items.forEach(item => {
                    container.appendChild(this.createGalleryItem(item));
                });
            }

            // Update pagination
            this.updatePagination();

            // Scroll to top of gallery
            const hero = document.querySelector('.hero-section');
            if (hero && this.currentPage > 1) {
                hero.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }

        } catch (error) {
            console.error('Failed to load gallery:', error);
            this.showToast('Failed to load gallery', 'error');
        } finally {
            this.isLoading = false;
        }
    }

    createProfilePill(username, avatarUrl, role, userId) {
        let roles = ['user'];
        if (role) {
            try {
                roles = JSON.parse(role);
            } catch (e) {
                // If role is already an array or invalid JSON, handle gracefully
                roles = Array.isArray(role) ? role : [role];
            }
        }
        const highestRole = this.getHighestRole(roles);
        const roleLabel = highestRole !== 'user' ? `<span class="profile-pill-role role-${highestRole}">${highestRole}</span>` : '';
        const avatar = avatarUrl || 'https://via.placeholder.com/48';

        return `
            <a href="/profile?user=${userId}" class="profile-pill profile-pill-link" onclick="event.stopPropagation();">
                <img class="profile-pill-avatar" src="${avatar}" alt="${this.escapeHtml(username)}" onerror="this.src='https://via.placeholder.com/48'">
                <span class="profile-pill-name">${this.escapeHtml(username)}</span>
                ${roleLabel}
            </a>
        `;
    }

    getHighestRole(roles) {
        // Priority: admin > moderator/mod > vip > user
        if (roles.includes('admin')) return 'admin';
        if (roles.includes('moderator')) return 'moderator';
        if (roles.includes('mod')) return 'mod';
        if (roles.includes('vip')) return 'vip';
        return 'user';
    }

    createGalleryItem(item) {
        const div = document.createElement('div');
        div.className = 'gallery-item';
        div.dataset.id = item.id;

        const mediaElement = item.media_type === 'video'
            ? `<div class="video-wrapper">
                   <video class="gallery-item-media" data-src="${item.media_url}" poster="${item.thumbnail_url || ''}" muted preload="none" playsinline disablePictureInPicture controlsList="nodownload noplaybackrate" oncontextmenu="return false;"></video>
                       <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                           <path d="M8 5v14l11-7z"/>
                       </svg>
               </div>`
            : `<img class="gallery-item-media" data-src="${item.media_url}" alt="${item.title}" loading="lazy" oncontextmenu="return false;">`;

        const likesCount = item.likes_count || 0;
        const profilePill = this.createProfilePill(item.username, item.avatar_url, item.role, item.user_id);

        div.innerHTML = `
            ${mediaElement}
            <div class="gallery-item-info">
                <div class="gallery-item-title">${this.escapeHtml(item.title)}</div>
                <div class="gallery-item-author">
                    <span>${this.formatDate(item.created_at)}</span>
                    ${profilePill}
                    <span class="likes-display ${item.user_liked ? 'liked' : ''}">${likesCount}</span>
                </div>
            </div>
        `;

        div.addEventListener('click', () => this.openViewer(item));

        // Setup lazy loading for this item's media
        const media = div.querySelector('.gallery-item-media');
        if (media) {
            this.intersectionObserver.observe(media);
        }

        return div;
    }

    async openViewer(item) {
        const modal = document.getElementById('viewer-modal');
        const mediaContainer = modal.querySelector('.viewer-media');
        const title = modal.querySelector('.viewer-title');
        const author = modal.querySelector('.viewer-author');
        const description = modal.querySelector('.viewer-description');
        const views = modal.querySelector('.viewer-views');
        const actionsContainer = modal.querySelector('.viewer-actions');

        // Fetch item from API to increment view count and get latest data


        actionsContainer.innerHTML = '';
        // Set media
        if (item.media_type === 'video') {
            mediaContainer.innerHTML = `
                <div class="custom-video-player">
                    <video src="${item.media_url}" playsinline disablePictureInPicture controlsList="nodownload noplaybackrate" oncontextmenu="return false;"></video>
                    <div class="custom-controls">
                        <button class="play-pause-btn" aria-label="Play/Pause">
                            <svg class="play-icon" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
                            <svg class="pause-icon" viewBox="0 0 24 24" style="display:none;"><path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z"/></svg>
                        </button>
                        <div class="progress-bar-container">
                            <div class="progress-bar">
                                <div class="progress-filled"></div>
                            </div>
                        </div>
                        <span class="time-display">0:00 / 0:00</span>
                        <button class="volume-btn" aria-label="Volume">
                            <svg class="volume-icon" viewBox="0 0 24 24"><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02z"/></svg>
                        </button>
                        <button class="fullscreen-btn" aria-label="Fullscreen">
                            <svg viewBox="0 0 24 24"><path d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z"/></svg>
                        </button>
                    </div>
                </div>
            `;
            this.setupCustomVideoPlayer(mediaContainer);
        } else {
            mediaContainer.innerHTML = `<img src="${item.media_url}" alt="${item.title}" oncontextmenu="return false;">`;
        }
        // Set info
        title.textContent = item.title;
        const profilePill = this.createProfilePill(item.username, item.avatar_url, item.role, item.user_id);
        author.innerHTML = `${profilePill} <span style="color: var(--text-secondary); margin-left: 8px;"> ${this.formatDate(item.created_at)}</span>`;
        description.textContent = item.description || '';

        views.innerHTML = `${item.views || 0} <svg viewBox="0 -3 42 42" style="width: 19px; height: 19px; fill: currentColor;"><path d="M15.3 20.1c0 3.1 2.6 5.7 5.7 5.7s5.7-2.6 5.7-5.7-2.6-5.7-5.7-5.7-5.7 2.6-5.7 5.7m8.1 12.3C30.1 30.9 40.5 22 40.5 22s-7.7-12-18-13.3c-.6-.1-2.6-.1-3-.1-10 1-18 13.7-18 13.7s8.7 8.6 17 9.9c.9.4 3.9.4 4.9.2M11.1 20.7c0-5.2 4.4-9.4 9.9-9.4s9.9 4.2 9.9 9.4S26.5 30 21 30s-9.9-4.2-9.9-9.3"></path></svg>`;

        modal.classList.add('active');


        try {
            const token = localStorage.getItem('auth_token');
            const headers = token ? { 'Authorization': `Bearer ${token}` } : {};
            const response = await fetch(`https://emwiki.com/api/gallery/${item.id}`, { headers });

            if (response.ok) {
                const data = await response.json();

                const likeBtn = document.createElement('button');
                likeBtn.disabled = false;

                likeBtn.innerHTML = data.item.likes_count || 0;
                likeBtn.className = 'like-btn' + (data.item.user_liked ? ' liked' : '');

                likeBtn.dataset.id = item.id;
                likeBtn.dataset.liked = data.item.user_liked ? '1' : '0';

                likeBtn.addEventListener('click', (e) => {
                        likeBtn.disabled = false;
                        e.stopPropagation();
                        this.toggleLike(item.id, likeBtn);
                });
                actionsContainer.innerHTML = '';

                actionsContainer.appendChild(likeBtn);

                views.innerHTML = `${data.item.views || 0} <svg viewBox="0 -3 42 42" style="width: 19px; height: 19px; fill: currentColor;"><path d="M15.3 20.1c0 3.1 2.6 5.7 5.7 5.7s5.7-2.6 5.7-5.7-2.6-5.7-5.7-5.7-5.7 2.6-5.7 5.7m8.1 12.3C30.1 30.9 40.5 22 40.5 22s-7.7-12-18-13.3c-.6-.1-2.6-.1-3-.1-10 1-18 13.7-18 13.7s8.7 8.6 17 9.9c.9.4 3.9.4 4.9.2M11.1 20.7c0-5.2 4.4-9.4 9.9-9.4s9.9 4.2 9.9 9.4S26.5 30 21 30s-9.9-4.2-9.9-9.3"></path></svg>`;
            }
        } catch (error) {
            console.error('Failed to fetch item details:', error);
        }

        // Admin/mod delete button
        if (this.currentUser && this.isAdmin()) {
            const deleteBtn = document.createElement('button');
            deleteBtn.className = 'admin-delete-btn';
            deleteBtn.textContent = '🗑️';
            deleteBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.adminDeleteItem(item.id);
            });
            actionsContainer.appendChild(deleteBtn);
        }
    }

    async openSubmissionsModal() {
        const modal = document.getElementById('submissions-modal');
        const container = document.getElementById('my-submissions-list');

        container.innerHTML = '<p class="loading">Loading...</p>';
        modal.classList.add('active');

        try {
            const token = localStorage.getItem('auth_token');
            const response = await fetch('https://emwiki.com/api/gallery/my-submissions', {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            const { items } = await response.json();

            if (items.length === 0) {
                container.innerHTML = `
                    <div class="empty-state">
                        <h3>No submissions yet</h3>
                        <p>Upload your first media to get started!</p>
                    </div>
                `;
            } else {
                container.innerHTML = '';
                items.forEach(item => {
                    container.appendChild(this.createSubmissionItem(item));
                });
            }
        } catch (error) {
            console.error('Failed to load submissions:', error);
            container.innerHTML = '<p class="loading">No submissions</p>';
        }
    }

    createSubmissionItem(item) {
        const div = document.createElement('div');
        div.className = 'submission-item';

        const mediaElement = item.media_type === 'video'
            ? `<div class="submission-video-wrapper">
                   <video class="submission-thumbnail" src="${item.media_url}" muted preload="metadata"></video>
                   <div class="video-play-icon">
                       <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                           <path d="M8 5v14l11-7z"/>
                       </svg>
                   </div>
               </div>`
            : `<img class="submission-thumbnail" src="${item.media_url}" alt="${item.title}">`;

        const statusClass = item.status;
        const statusText = item.status.charAt(0).toUpperCase() + item.status.slice(1);

        div.innerHTML = `
            ${mediaElement}
            <div class="submission-details">
                <div class="submission-title">${this.escapeHtml(item.title)}</div>
                <div class="submission-status ${statusClass}">${statusText}</div>
                <div class="submission-date">${this.formatDate(item.created_at)}</div>
                ${item.rejection_reason ? `<div class="submission-rejection">Reason: ${this.escapeHtml(item.rejection_reason)}</div>` : ''}
                <div class="submission-actions">
                    <button class="delete-btn" data-id="${item.id}">Delete</button>
                </div>
            </div>
        `;

        // Delete button
        const deleteBtn = div.querySelector('.delete-btn');
        deleteBtn.addEventListener('click', () => this.deleteSubmission(item.id));

        return div;
    }

    async deleteSubmission(id) {
        if (!confirm('Are you sure you want to delete this submission?')) {
            return;
        }

        try {
            const token = localStorage.getItem('auth_token');
            const response = await fetch(`https://emwiki.com/api/gallery/${id}`, {
                method: 'DELETE',
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            if (!response.ok) {
                throw new Error('Failed to delete');
            }

            this.showToast('Submission deleted', 'success');
            this.openSubmissionsModal(); // Refresh list
        } catch (error) {
            console.error('Delete error:', error);
            this.showToast('Failed to delete submission', 'error');
        }
    }

    openUploadModal() {
        if (!this.currentUser) {
            this.showToast('Please log in to upload media', 'error');
            return;
        }

        const modal = document.getElementById('upload-modal');
        modal.classList.add('active');
    }

    closeModal(modal) {
        modal.classList.remove('active');

        // Stop videos
        const videos = modal.querySelectorAll('video');
        videos.forEach(video => {
            video.pause();
            video.currentTime = 0;
        });
    }

    loadMore() {
        this.loadGallery();
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    formatDate(timestamp) {
        const date = new Date(timestamp);
        const now = new Date();
        const diff = now - date;

        const minutes = Math.floor(diff / 60000);
        const hours = Math.floor(diff / 3600000);
        const days = Math.floor(diff / 86400000);

        if (minutes < 60) {
            return `${minutes}m ago`;
        } else if (hours < 24) {
            return `${hours}h ago`;
        } else if (days < 7) {
            return `${days}d ago`;
        } else {
            return date.toLocaleDateString();
        }
    }

    changeSort(sortBy) {
        if (this.currentSort === sortBy) return;

        this.currentSort = sortBy;
        this.currentPage = 1;

        // Update active sort button
        document.querySelectorAll('.sort-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.sort === sortBy);
        });

        // Reload gallery
        this.loadGallery();
    }

    goToPage(page) {
        if (page < 1 || page > this.totalPages || page === this.currentPage) return;
        this.currentPage = page;
        this.loadGallery();
    }

    updatePagination() {
        const paginationContainer = document.querySelector('.pagination-container');
        if (!paginationContainer) return;

        if (this.totalPages <= 1) {
            paginationContainer.style.display = 'none';
            return;
        }

        paginationContainer.style.display = 'flex';

        let html = '';

        // Previous button
        html += `<button class="pagination-btn pagination-prev" data-page="${this.currentPage - 1}" ${this.currentPage === 1 ? 'disabled' : ''}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="15 18 9 12 15 6"></polyline>
            </svg>
            <span>Previous</span>
        </button>`;

        // Page numbers
        html += '<div class="pagination-numbers">';

        const maxVisible = 7;
        let startPage = Math.max(1, this.currentPage - Math.floor(maxVisible / 2));
        let endPage = Math.min(this.totalPages, startPage + maxVisible - 1);

        if (endPage - startPage < maxVisible - 1) {
            startPage = Math.max(1, endPage - maxVisible + 1);
        }

        // First page + ellipsis
        if (startPage > 1) {
            html += `<button class="pagination-btn pagination-num" data-page="1">1</button>`;
            if (startPage > 2) {
                html += `<span class="pagination-ellipsis">...</span>`;
            }
        }

        // Page numbers
        for (let i = startPage; i <= endPage; i++) {
            html += `<button class="pagination-btn pagination-num ${i === this.currentPage ? 'active' : ''}" data-page="${i}">${i}</button>`;
        }

        // Ellipsis + last page
        if (endPage < this.totalPages) {
            if (endPage < this.totalPages - 1) {
                html += `<span class="pagination-ellipsis">...</span>`;
            }
            html += `<button class="pagination-btn pagination-num" data-page="${this.totalPages}">${this.totalPages}</button>`;
        }

        html += '</div>';

        // Next button
        html += `<button class="pagination-btn pagination-next" data-page="${this.currentPage + 1}" ${this.currentPage === this.totalPages ? 'disabled' : ''}>
            <span>Next</span>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="9 18 15 12 9 6"></polyline>
            </svg>
        </button>`;

        paginationContainer.innerHTML = html;
    }

    async toggleLike(itemId, buttonElement) {
        if (!this.currentUser) {
            this.showToast('Please log in to like items', 'error');
            return;
        }

        try {
            const token = localStorage.getItem('auth_token');
            const response = await fetch(`https://emwiki.com/api/gallery/like/${itemId}`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            if (!response.ok) {
                throw new Error('Failed to toggle like');
            }

            const result = await response.json();

            // Update button state
            const currentCount = parseInt(buttonElement.innerHTML.match(/\d+/)[0]) || 0;
            const newCount = result.liked ? currentCount + 1 : currentCount - 1;

            buttonElement.dataset.liked = result.liked ? '1' : '0';
            buttonElement.className = 'like-btn' + (result.liked ? ' liked' : '');
            buttonElement.innerHTML = newCount;

            const likesCount = newCount || 0;

            // Update likes display in gallery grid (only if item is currently rendered)
            const galleryItem = document.querySelector(`.gallery-item[data-id="${itemId}"]`);
            if (galleryItem) {
                const likesDisplay = galleryItem.querySelector('.likes-display');
                if (likesDisplay) {
                    likesDisplay.innerHTML = likesCount;
                    likesDisplay.classList.toggle('liked', result.liked);
                }
            }

        } catch (error) {
            console.error('Like error:', error);
            this.showToast('Failed to update like', 'error');
        }
    }

    async adminDeleteItem(itemId) {
        if (!confirm('Are you sure you want to delete this gallery item? This action cannot be undone.')) {
            return;
        }

        try {
            const token = localStorage.getItem('auth_token');
            const response = await fetch(`https://emwiki.com/api/gallery/${itemId}`, {
                method: 'DELETE',
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            if (!response.ok) {
                throw new Error('Failed to delete');
            }

            this.showToast('Item deleted successfully', 'success');

            // Close viewer modal
            const viewerModal = document.getElementById('viewer-modal');
            this.closeModal(viewerModal);

            // Reload gallery
            this.currentPage = 1;
            this.loadGallery();

        } catch (error) {
            console.error('Delete error:', error);
            this.showToast('Failed to delete item', 'error');
        }
    }

    isAdmin() {
        if (!this.currentUser || !this.currentUser.role) return false;
        try {
            const roles = this.currentUser.role;
            return roles.includes('admin') || roles.includes('moderator');
        } catch {
            return false;
        }
    }

    setupCustomVideoPlayer(container) {
        const player = container.querySelector('.custom-video-player');
        const video = player.querySelector('video');
        const playPauseBtn = player.querySelector('.play-pause-btn');
        const playIcon = player.querySelector('.play-icon');
        const pauseIcon = player.querySelector('.pause-icon');
        const progressBar = player.querySelector('.progress-bar');
        const progressFilled = player.querySelector('.progress-filled');
        const timeDisplay = player.querySelector('.time-display');
        const volumeBtn = player.querySelector('.volume-btn');
        const fullscreenBtn = player.querySelector('.fullscreen-btn');

        // Play/Pause
        playPauseBtn.addEventListener('click', () => {
            if (video.paused) {
                video.play();
                playIcon.style.display = 'none';
                pauseIcon.style.display = 'block';
            } else {
                video.pause();
                playIcon.style.display = 'block';
                pauseIcon.style.display = 'none';
            }
        });

        // Click video to play/pause
        video.addEventListener('click', () => playPauseBtn.click());

        // Update progress bar
        video.addEventListener('timeupdate', () => {
            const percent = (video.currentTime / video.duration) * 100;
            progressFilled.style.width = percent + '%';
            timeDisplay.textContent = `${this.formatTime(video.currentTime)} / ${this.formatTime(video.duration)}`;
        });

        // Seek
        progressBar.addEventListener('click', (e) => {
            const rect = progressBar.getBoundingClientRect();
            const percent = (e.clientX - rect.left) / rect.width;
            video.currentTime = percent * video.duration;
        });

        // Volume
        volumeBtn.addEventListener('click', () => {
            video.muted = !video.muted;
            volumeBtn.style.opacity = video.muted ? '0.5' : '1';
        });

        // Fullscreen
        fullscreenBtn.addEventListener('click', () => {
            if (!document.fullscreenElement) {
                player.requestFullscreen();
            } else {
                document.exitFullscreen();
            }
        });

        // Auto-play
        video.play().catch(() => {
            // Auto-play failed, show play button
            playIcon.style.display = 'block';
            pauseIcon.style.display = 'none';
        });
    }

    formatTime(seconds) {
        if (isNaN(seconds)) return '0:00';
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    }

    showToast(message, type = 'info') {
        // Use existing toast system from Utils if available
        if (window.Utils && window.Utils.showToast) {
            window.Utils.showToast('Gallery', message, type);
        } else {
            alert(message);
        }
    }
}

// Initialize gallery when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        new Gallery();
    });
} else {
    new Gallery();
}
