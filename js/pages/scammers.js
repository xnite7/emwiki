/* Scammers page app. Extracted from scammers.html's inline module. */

    class Catalog extends BaseApp {
        constructor() {
            super();
            this.initPage();
        }

        initPage() {
            const blackscreen = document.querySelector('.blackscreen');
            if (blackscreen) {
                blackscreen.style.background = 'rgba(0,0,0,0)';
                blackscreen.addEventListener('transitionend', () => {
                    blackscreen.style.display = 'none';
                });
            }

            document.documentElement.style.overflow = "scroll";
            document.documentElement.style.overflowX = "hidden";
            const main = document.querySelector("main");
            if (main) {
                main.style.filter = 'unset';
                main.style.scale = '1';
            }
        }

        loadTheme() {
            const theme = localStorage.getItem('theme') || 'dark';
            if (theme === 'light') {
                document.body.classList.add('light-theme');
            }

            // Theme toggle
            const themeToggle = document.querySelector('.theme-toggle');
            if (themeToggle) {
                themeToggle.addEventListener('click', this.toggleTheme.bind(this));
            }

            this.updateSeasonalTheme();
        }

        toggleTheme() {
            document.body.classList.toggle('light-theme');
            const isLight = document.body.classList.contains('light-theme');
            localStorage.setItem('theme', isLight ? 'light' : 'dark');
        }

        updateSeasonalTheme() {
            // Copy the seasonal theme logic from BaseApp
            function pickRandom(rarities) {
                var filler = 100 - rarities.map(r => r.chance).reduce((sum, current) => sum + current);
                if (filler <= 0) return;
                var probability = rarities.map((r, i) => Array(r.chance === 0 ? filler : r.chance).fill(i)).reduce((c, v) => c.concat(v), []);
                var pIndex = Math.floor(Math.random() * 100);
                return rarities[probability[pIndex]].type;
            }

            const now = new Date();
            let rarities = [
                { type: "https://emwiki.com/imgs/epicfaces/tran.webp", chance: 10 },
                { type: "https://emwiki.com/imgs/epicfaces/3d.png", chance: 2 },
                { type: "https://emwiki.com/imgs/epicfaces/Epic_Banana.webp", chance: 8 },
                { type: "https://emwiki.com/imgs/epicfaces/XRmpB1c.png", chance: 0 },
                { type: "https://emwiki.com/imgs/burrito.png", chance: 3 }
            ];
            let titleColors = [['#24ff5d', '#ff0']];

            if (now.getMonth() === 9) {
                rarities = [
                    { type: "https://emwiki.com/imgs/epicfaces/kitta.png", chance: 15 },
                    { type: "https://emwiki.com/imgs/epicfaces/devlil.png", chance: 15 },
                    { type: "https://emwiki.com/imgs/epicfaces/Ghost_Epic_Face.webp", chance: 15 },
                    { type: "https://emwiki.com/imgs/epicfaces/pmupkin.png", chance: 0 },
                    { type: "https://emwiki.com/imgs/epicfaces/Uncanny_Epic_Face.webp", chance: 3 }
                ];
                titleColors = [['#ff7518', '#000000']];
            } else if (now.getMonth() === 11) {
                rarities = [
                    { type: "https://emwiki.com/imgs/epicfaces/xmas.png", chance: 20 },
                    { type: "https://emwiki.com/imgs/epicfaces/rudolf.png", chance: 20 },
                    { type: "https://emwiki.com/imgs/epicfaces/santa.png", chance: 0 }
                ];
                titleColors = [['red', 'white']];
            }

            const grad1Stops = document.querySelectorAll('#eppp1 stop');
            const grad2Stops = document.querySelectorAll('#eppp2 stop');

            if (grad1Stops.length >= 2) {
                grad1Stops[0].setAttribute('style', `stop-color: ${titleColors[0][1]}`);
                grad1Stops[1].setAttribute('style', `stop-color: ${titleColors[0][0]}`);
            }
            if (grad2Stops.length >= 2) {
                grad2Stops[0].setAttribute('style', `stop-color: ${titleColors[0][1]}`);
                grad2Stops[1].setAttribute('style', `stop-color: ${titleColors[0][0]}`);
            }

            const epicImage = document.getElementById('epic-image');
            if (epicImage) {
                epicImage.setAttribute('href', pickRandom(rarities));
            }
        }
    }



    // Utility: Safe DOM query
    const $ = (selector) => document.querySelector(selector);
    const $$ = (selector) => document.querySelectorAll(selector);

    // Initial page setup
    function initPage() {
        const blackscreen = $('.blackscreen');
        if (blackscreen) {
            blackscreen.style.background = 'rgba(0,0,0,0)';
            blackscreen.addEventListener('transitionend', () => {
                blackscreen.style.display = 'none';
            });
        }

        document.documentElement.style.overflow = "scroll";
        document.documentElement.style.overflowX = "hidden";
        const main = $("main");
        if (main) {
            main.style.filter = 'unset';
            main.style.scale = '1';
        }
    }

    // Filter/Search function - Fixed selector
    function filterItems() {
        const searchValue = $('#search-bar').value.toLowerCase().trim();
        const items = $$('.catalog-grid .scammer-block');
        let visibleCount = 0;

        items.forEach(item => {
            const name = item.querySelector('h2')?.textContent.toLowerCase() || "";
            const details = item.querySelector('.scammer-info')?.textContent.toLowerCase() || "";
            const isMatch = name.includes(searchValue) || details.includes(searchValue);

            item.style.display = isMatch ? 'block' : 'none';
            if (isMatch) visibleCount++;
        });

        // Update count if search is active
        if (searchValue && $('#scammer-count')) {
            $('#scammer-count').textContent =
                `🔍 ${visibleCount} Scammer${visibleCount !== 1 ? 's' : ''} Found`;
        } else if ($('#scammer-count')) {
            updateScammerCount(items.length);
        }
    }

    // Update scammer count display
    function updateScammerCount(count) {
        const countEl = $('#scammer-count');
        if (countEl) {
            countEl.textContent = `🚨 ${count} Reported Scammer${count !== 1 ? 's' : ''}`;
        }
    }

    // Create scammer block - Optimized
    async function createScammerBlock(scammer, container) {
        const {
            user_id = null,
            robloxDisplay = "Unknown",
            robloxUser = null,
            avatar = "imgs/plr.jpg",
            discordDisplay = null,
            discordId = null,
            victims = null,
            itemsScammed = null,
            robloxAlts = null,
            severity = null, // Optional: for warning badges
            hasThreadEvidence = false,
        } = scammer;

        const block = document.createElement('section');
        block.className = 'scammer-block';

        // Build alt accounts HTML
        const altsHTML = Array.isArray(robloxAlts) && robloxAlts.length > 0
            ? `<p><strong>Alts:</strong> ${robloxAlts.map(alt =>
                `<a href="https://www.roblox.com/users/${alt.userId}/profile" target="_blank" rel="noopener noreferrer">${alt.name}</a>`
            ).join(", ")}</p>`
            : "";

        // Build Discord display - removed inline styles, using CSS instead
        const discordHTML = discordDisplay && discordDisplay.trim() !== "NA"
            ? `<a id="scammerdiscordpill" ${discordId ? `href="https://discord.com/users/${discordId}"` : ``} target="_blank" rel="noopener noreferrer"><img src="./imgs/discord.png" alt="Discord"> ${discordDisplay}</a>`
            : "";

        // Optional: High severity warning badge
        const warningBadge = severity === "high"
            ? '<span class="scammer-warning">⚠️ High Risk</span>'
            : "";

        // Thread evidence button
        const threadButton = hasThreadEvidence && user_id
            ? `<button class="thread-evidence-btn" onclick="viewThreadEvidence('${user_id}', '${robloxUser}')" title="View investigation evidence">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                  <polyline points="14 2 14 8 20 8"></polyline>
                  <line x1="16" y1="13" x2="8" y2="13"></line>
                  <line x1="16" y1="17" x2="8" y2="17"></line>
                  <polyline points="10 9 9 9 8 9"></polyline>
                </svg>
                Evidence
              </button>`
            : "";

        block.innerHTML = `
    ${warningBadge}
    <div class="scammer-content">
      <img class="scammer-img" src="${avatar}" 
           alt="Avatar of @${robloxUser}" 
           loading="lazy"
           onerror="this.src='imgs/plr.jpg'" />
      <div class="scammer-info">
        <a href="https://www.roblox.com/users/${user_id}/profile" target="_blank" rel="noopener noreferrer">
          <h2>
            ${robloxDisplay}
            <svg xmlns="http://www.w3.org/2000/svg" style="fill:transparent" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M12 5l7 7-7 7"></path>
              <path d="M5 12h14"></path>
            </svg>
          </h2>
        </a>
        ${robloxUser && robloxUser !== robloxDisplay && robloxUser !== robloxDisplay
                ? `<p style="margin-top: -5px; margin-bottom: 8px; font-size: 14px; color: var(--text-secondary); opacity: 0.8;">@${robloxUser}</p>`
                : ""}
        ${discordHTML}
        ${victims && victims.trim() !== "NA"
                ? `<p><strong>Victims:</strong> ${victims}</p>`
                : ""}
        ${itemsScammed && itemsScammed.trim() !== "NA"
                ? `<p><strong>Items Scammed:</strong> ${itemsScammed}</p>`
                : ""}
        ${altsHTML}
        ${threadButton}
      </div>
    </div>
  `;
        container.appendChild(block);
    }

    // Loading skeleton
    function showLoadingSkeleton(container) {
        container.innerHTML = `
    <div class="scammer-skeleton"></div>
    <div class="scammer-skeleton"></div>
    <div class="scammer-skeleton"></div>
    <div class="scammer-skeleton"></div>
    <div class="scammer-skeleton"></div>
    <div class="scammer-skeleton"></div>
    <div class="scammer-skeleton"></div>
    <div class="scammer-skeleton"></div>
    <div class="scammer-skeleton"></div>
    <div class="scammer-skeleton"></div>
    <div class="scammer-skeleton"></div>
    <div class="scammer-skeleton"></div>
    <div class="scammer-skeleton"></div>
    <div class="scammer-skeleton"></div>
    <div class="scammer-skeleton"></div>
  `;
    }

    // Load scammers data
    async function loadScammers() {
        const container = $('#scammers-container');
        if (!container) {
            console.error('Missing #scammers-container in HTML');
            return;
        }

        showLoadingSkeleton(container);
        await new Promise(resolve => setTimeout(resolve, 500));
        try {
            const response = await fetch('/api/roblox-proxy?mode=discord-scammers');

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const data = await response.json();
            container.innerHTML = '';

            if (data && Array.isArray(data.scammers)) {
                // Update count
                updateScammerCount(data.scammers.length);

                // Sort by name (optional)
                const sortedScammers = data.scammers.sort((a, b) =>
                    (a.robloxUser || "Unknown").localeCompare(b.robloxUser || "Unknown")
                );

                // Create all scammer blocks
                sortedScammers.forEach(scammer => {
                    createScammerBlock(scammer, container);
                });

                console.log(`✅ Loaded ${data.scammers.length} scammers`);
            } else {
                throw new Error("Invalid data format");
            }
        } catch (error) {
            console.error("Failed to fetch scammers:", error);
            container.innerHTML = `
      <p class="error">
        ⚠️ Failed to load scammers list. Please try again later.
        <br><small>${error.message}</small>
      </p>
    `;

            // Update count element
            const countEl = $('#scammer-count');
            if (countEl) {
                countEl.textContent = '❌ Failed to load';
                countEl.style.background = 'rgba(255, 107, 107, 0.2)';
            }
        }
    }

    // Debounce search for better performance
    function debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    }

    // Initialize on DOM ready
    document.addEventListener("DOMContentLoaded", () => {
        initPage();
        loadScammers();

        // Add debounced search
        const searchBar = $('#search-bar');
        if (searchBar) {
            searchBar.addEventListener('input', debounce(filterItems, 300));

            // Also trigger on Enter key
            searchBar.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    filterItems();
                }
            });
        }
    });


    // View thread evidence modal
    async function viewThreadEvidence(userId, robloxUser) {
        const modal = document.getElementById('thread-evidence-modal');
        const modalContent = document.getElementById('thread-evidence-content');

        if (!modal || !modalContent) {
            console.error('Thread evidence modal not found');
            return;
        }


        // Show loading state
        modal.style.display = 'flex';
        modalContent.innerHTML = '<div class="thread-loading">Loading evidence...</div>';

        try {
            const response = await fetch(`/api/roblox-proxy?mode=thread-evidence&userId=${userId}`);

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || `HTTP error! status: ${response.status}`);
            }

            if (!data.thread_evidence) {
                const errorMsg = data.debug ? `${data.error} (${data.debug})` : data.error || 'No evidence found';
                modalContent.innerHTML = `<div class="thread-error">${errorMsg}</div>`;
                return;
            }

            // Render thread evidence
            renderThreadEvidence(data.thread_evidence, modalContent, userId, robloxUser);
        } catch (error) {
            console.error('Failed to fetch thread evidence:', error);
            modalContent.innerHTML = `<div class="thread-error">Failed to load evidence: ${error.message}</div>`;
        }
    }

    // Render thread evidence in investigation-style format
    function renderThreadEvidence(threadEvidence, container, userId, robloxUser) {
        // Handle both old format ({ thread_name, message_count, messages }) 
        // and new format (direct array of messages)
        let messages;
        if (Array.isArray(threadEvidence)) {
            // New format: threadEvidence is already an array of messages
            messages = threadEvidence;
        } else {
            // Old format: threadEvidence is an object with messages property
            messages = threadEvidence.messages || [];
        }

        let html = `
            <div class="thread-header">
                <h2>⁕⁖ Evidence of Scamming</h2>
                <button class="thread-close" onclick="closeThreadModal()">×</button>
            </div>
            <div class="thread-info">
                <p><strong>Evidence Against:</strong> <a href="/scammers?userId=${userId}" target="_blank">${robloxUser}</a></p>
                <p><strong>Messages:</strong> ${messages.length}</p>
            </div>
            <div class="thread-messages">
        `;

        if (messages && messages.length > 0) {
            messages.forEach((msg, index) => {
                // Skip empty messages (but allow messages with just attachments)
                if ((!msg.content || msg.content === '') && (!msg.attachments || msg.attachments.length === 0)) return;
                
                // Handle both author formats: string (new) or object (old)
                const authorName = typeof msg.author === 'string' 
                    ? msg.author 
                    : (msg.author?.global_name || msg.author?.username || 'Unknown');
                const authorAvatar = (typeof msg.author === 'object' && msg.author?.avatar && msg.author?.id)
                    ? `https://cdn.discordapp.com/avatars/${msg.author.id}/${msg.author.avatar}.png?size=64`
                    : 'https://cdn.discordapp.com/embed/avatars/0.png';
                const timestamp = new Date(msg.timestamp).toLocaleString();

                html += `
                    <div class="thread-message" data-index="${index}">
                        <div class="message-header">
                            <img src="${authorAvatar}" alt="${authorName}" class="message-avatar" />
                            <div class="message-author">
                                <strong>${authorName}</strong>
                                <span class="message-timestamp">${timestamp}</span>
                            </div>
                        </div>
                        ${msg.content ? `<div class="message-content">${escapeHtml(msg.content)}</div>` : ''}
                `;

                // Render attachments (images, videos, files)
                if (msg.attachments && msg.attachments.length > 0) {
                    html += '<div class="message-attachments">';
                    msg.attachments.forEach(att => {
                        // Check if image by content_type
                        const isImage = att.content_type && att.content_type.startsWith('image/');
                        // Check if video by stream URL or content_type
                        const isVideo = att.stream_url || att.stream_uid || (att.content_type && (att.content_type.startsWith('video/') || att.content_type === 'video/quicktime'));
                        
                        if (isImage) {
                            // Use Cloudflare Images URL (cf_url), fallback to Discord URL
                            const imageUrl = att.cf_url || att.url;
                            html += `
                                <div class="attachment-image">
                                    <img src="${imageUrl}" alt="${att.filename}" loading="lazy" />
                                    <a href="${imageUrl}" target="_blank" rel="noopener noreferrer" class="attachment-link">View Full Size</a>
                                </div>
                            `;
                        } else if (isVideo) {
                            const videoId = `video-${att.id}-${index}`;
                            
                            if (att.stream_uid) {
                                // Use Cloudflare Stream iframe embed for best playback
                                html += `
                                    <div class="attachment-video">
                                        <iframe 
                                            src="https://iframe.videodelivery.net/${att.stream_uid}" 
                                            style="width: 100%; max-width: 600px; aspect-ratio: 16/9; border: none; border-radius: 4px;"
                                            allow="accelerometer; gyroscope; autoplay; encrypted-media; picture-in-picture"
                                            allowfullscreen>
                                        </iframe>
                                    </div>
                                `;
                            } else {
                                // Fallback to regular video element
                                html += `
                                    <div class="attachment-video">
                                        <video id="${videoId}" controls playsinline preload="metadata" style="width: 100%; max-width: 600px; height: auto; background: #000; border-radius: 4px;">
                                            <source src="${att.url}" type="${att.content_type || 'video/mp4'}">
                                            Your browser does not support the video tag.
                                        </video>
                                    </div>
                                `;
                            }
                        } else {
                            html += `
                                <div class="attachment-file">
                                    <a href="${att.url}" target="_blank" rel="noopener noreferrer">
                                        📎 ${att.filename} ${att.size ? `(${formatFileSize(att.size)})` : ''}
                                    </a>
                                </div>
                            `;
                        }
                    });
                    html += '</div>';
                }

                // Render embeds
                if (msg.embeds && msg.embeds.length > 0) {
                    html += '<div class="message-embeds">';
                    msg.embeds.forEach(embed => {
                        html += `
                            <div class="embed">
                                ${embed.title ? `<div class="embed-title">${escapeHtml(embed.title)}</div>` : ''}
                                ${embed.description ? `<div class="embed-description">${escapeHtml(embed.description)}</div>` : ''}
                                ${embed.image ? `<img src="${embed.image.proxy_url || embed.image.url}" alt="Embed image" class="embed-image" />` : ''}
                                ${embed.thumbnail ? `<img src="${embed.thumbnail.proxy_url || embed.thumbnail.url}" alt="Embed thumbnail" class="embed-thumbnail" />` : ''}
                            </div>
                        `;
                    });
                    html += '</div>';
                }

                html += '</div>';
            });
        } else {
            html += '<div class="thread-empty">No messages found in this thread.</div>';
        }

        html += '</div></div>';
        container.innerHTML = html;
    }

    // Close thread modal
    function closeThreadModal() {
        const modal = document.getElementById('thread-evidence-modal');
        if (modal) {
            modal.style.display = 'none';
        }
    }

    // Utility functions
    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    function formatFileSize(bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
    }

    // Close modal when clicking outside
    window.onclick = function (event) {
        const modal = document.getElementById('thread-evidence-modal');
        if (event.target === modal) {
            closeThreadModal();
        }
    }

    document.addEventListener('DOMContentLoaded', () => {
        window.catalog = new Catalog();
    });

