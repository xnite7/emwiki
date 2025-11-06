// Gallery Page JavaScript
class Gallery {
    constructor() {
        this.currentOffset = 0;
        this.itemsPerPage = 24;
        this.isLoading = false;
        this.hasMore = true;
        this.currentUser = null;
        this.currentSort = 'newest'; // 'likes' or 'newest'


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
        await new Promise(resolve => setTimeout(resolve, 920));
        await this.loadGallery();
    }

    updateUIForAuth() {
        if (this.currentUser) {
            document.getElementById('gallery-actions').style.display = 'flex';
        }
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

        // Load more
        const loadMoreBtn = document.getElementById('load-more-btn');
        if (loadMoreBtn) {
            loadMoreBtn.addEventListener('click', () => this.loadMore());
        }

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
        if (this.isLoading || !this.hasMore) return;

        this.isLoading = true;
        const container = document.getElementById('gallery-grid');

        try {
            const token = localStorage.getItem('auth_token');
            const headers = token ? { 'Authorization': `Bearer ${token}` } : {};
            const response = await fetch(`https://emwiki.com/api/gallery?limit=${this.itemsPerPage}&offset=${this.currentOffset}&sort=${this.currentSort}`, {
                headers
            });
            const { items } = await response.json();

            if (items.length === 0) {
                this.hasMore = false;
                if (this.currentOffset === 0) {
                    container.innerHTML = `
                        <div class="empty-state" style="grid-column: 1/-1;">
                            <h3>No gallery items yet</h3>
                            <p>Be the first to share your Epic Minigames moments!</p>
                        </div>
                    `;
                }
            } else {
                if (this.currentOffset === 0) {
                    container.innerHTML = '';
                }

                items.forEach(item => {
                    container.appendChild(this.createGalleryItem(item));
                });

                this.currentOffset += items.length;

                if (items.length < this.itemsPerPage) {
                    this.hasMore = false;
                }
            }

            // Show/hide load more button
            const loadMoreContainer = document.querySelector('.load-more-container');
            if (this.hasMore) {
                loadMoreContainer.style.display = 'block';
            } else {
                loadMoreContainer.style.display = 'none';
            }

        } catch (error) {
            console.error('Failed to load gallery:', error);
            this.showToast('Failed to load gallery', 'error');
        } finally {
            this.isLoading = false;
        }
    }

    createProfilePill(username, avatarUrl, role) {
        const roles = role ? JSON.parse(role) : ['user'];
        const highestRole = this.getHighestRole(roles);
        const roleLabel = highestRole !== 'user' ? `<span class="profile-pill-role role-${highestRole}">${highestRole}</span>` : '';
        const avatar = avatarUrl || 'https://via.placeholder.com/48';

        return `
            <div class="profile-pill">
                <img class="profile-pill-avatar" src="${avatar}" alt="${this.escapeHtml(username)}" onerror="this.src='https://via.placeholder.com/48'">
                <span class="profile-pill-name">${this.escapeHtml(username)}</span>
                ${roleLabel}
            </div>
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
                   <video class="gallery-item-media" src="${item.media_url}" muted preload="metadata"></video>
                   <div class="video-play-icon">
                       <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                           <path d="M8 5v14l11-7z"/>
                       </svg>
                   </div>
               </div>`
            : `<img class="gallery-item-media" src="${item.media_url}" alt="${item.title}" loading="lazy">`;

        const likesCount = item.likes_count || 0;
        const profilePill = this.createProfilePill(item.username, item.avatar_url, item.role);

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
            mediaContainer.innerHTML = `<video src="${item.media_url}" controls autoplay></video>`;
        } else {
            mediaContainer.innerHTML = `<img src="${item.media_url}" alt="${item.title}">`;
        }
        // Set info
        title.textContent = item.title;
        const profilePill = this.createProfilePill(item.username, item.avatar_url, item.role);
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
                    if (this.currentUser) {
                        likeBtn.disabled = false;
                        e.stopPropagation();
                        this.toggleLike(item.id, likeBtn);
                    } else {
                        alert('Please Login to like');
                        return;
                    }
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
            container.innerHTML = '<p class="loading">Failed to load submissions</p>';
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
        this.currentOffset = 0;
        this.hasMore = true;

        // Update active sort button
        document.querySelectorAll('.sort-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.sort === sortBy);
        });

        // Reload gallery
        this.loadGallery();
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

            document.querySelector(`.gallery-item[data-id="${itemId}"]`).querySelector('.likes-display').innerHTML = likesCount;
            document.querySelector(`.gallery-item[data-id="${itemId}"]`).querySelector('.likes-display').classList.toggle('liked', result.liked);

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
            this.currentOffset = 0;
            this.hasMore = true;
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
