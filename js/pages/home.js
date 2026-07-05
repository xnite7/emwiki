/* Homepage app: hero stats, item rows, donators — plus the seasonal
   snow/hearts particles and the footer pet. Extracted from index.html. */
		class Catalog extends BaseApp {
			constructor() {
				super();
				this.currentCategory = 'all';
				this.countdownManager = new CountdownManager();
				// Homepage-specific item arrays (pre-filtered from API)
				this.newItems = [];
				this.weeklyItems = [];
				this.weeklystarItems = [];
				this.randomItem = null;
				this.init();
			}

			async init() {

				await this.loadHomepageData();
				await this.loadPreferences();
				this.setupEventListeners();
				this.countdownManager.add('countdown-shop');
				this.countdownManager.add('countdown-rotation');
				//this.countdownManager.start();
				// TODO: wire `.patch-link` to a real changelog destination
				// (e.g. <a href="changelog.html"> or a GitHub commits URL once the repo has a public remote).
				// Until then the link is non-interactive rather than showing a placeholder toast.

				this.loadDonators();
				this.populateGrids();
				this.initializeSearch();
				await this.modal.handleURLParams();
			}

			async loadHomepageData() {
				try {
					const res = await fetch('/api/items/homepage');
					if (!res.ok) throw new Error('Failed to fetch homepage items');
					
					const data = await res.json();
					
					// Store pre-filtered items
					this.newItems = data.newItems || [];
					this.weeklyItems = data.weeklyItems || [];
					this.weeklystarItems = data.weeklystarItems || [];
					this.randomItem = data.randomItem || null;
					
					// Update stats display
					document.getElementById('total-items').textContent = data.stats?.totalItems || 0;
					document.getElementById('new-items').textContent = data.stats?.newItemsCount || 0;
					
					// Also populate allItems for search functionality (combined from all categories)
					this.allItems = [...this.newItems, ...this.weeklyItems, ...this.weeklystarItems];
					
					console.log(`Loaded homepage items: ${this.newItems.length} new, ${this.weeklyItems.length} weekly, ${this.weeklystarItems.length} weeklystar`);
				} catch (error) {
					console.error('Failed to load homepage data:', error);
					Utils.showToast('Error', 'Failed to load items', 'error');
				}
			}

			setupEventListeners() {
				document.querySelectorAll('.category-btn').forEach(btn => {
					btn.addEventListener('click', () => {
						document.querySelectorAll('.category-btn').forEach(b => b.classList.remove('active'));
						btn.classList.add('active');
						this.currentCategory = btn.dataset.category;
						this.populateGrids();
					});
				});

				// Add dev shortcut
				document.getElementById('search-bar').addEventListener('keypress', (e) => {
					if (e.key === 'Enter') {
						if (e.target.value.toLowerCase().trim() === 'dev') {
							window.location.href = '/admin';
						}
					}
				});
				
				// Setup refresh button animation (only once)
				const myButton = document.querySelector('.refresh-btn');
				if (myButton) {
					myButton.addEventListener('click', () => {
						myButton.classList.add('active');
						setTimeout(() => myButton.classList.remove('active'), 300);
					});
				}
			}

			populateGrids() {
				// Use pre-filtered items from the API
				this.renderItems('new-items-grid', this.newItems);
				this.renderItems('weekly-shop-grid', this.weeklyItems);
				this.renderItems('weekly-rotation-grid', this.weeklystarItems);
				
				// Render initial random item
				if (this.randomItem) {
					this.renderItems('random-items-grid', [this.randomItem]);
				}
			}

			renderItems(gridId, items) {
				const grid = document.getElementById(gridId);
				if (!grid) return;

				grid.innerHTML = '';

				items.forEach(item => {
					const div = this.createItemElement(item)
					const priceCodeRarity = item['price/code/rarity'];
					if (item.weeklystar) {
						div.querySelector('.item-price').textContent = priceCodeRarity?.toLowerCase().split('<br>').pop().replace(' stars', '');
						div.querySelector('.item-price').classList.replace('item-price', 'star-price');
						const outlineColors = {
							'60': '#b31aff',
							'30': '#ff2a00',
							'15': '#fae351',
							'5': '#e0e6df'
						};
						Object.entries(outlineColors).forEach(([num, color]) => {
							if (priceCodeRarity.toLowerCase().includes(num)) {
								div.style.outline = `4px solid ${color}`;
								// In the "New Items" section, keep the item's category
								// background instead of clearing it — star-shop items that
								// are also new shouldn't read as transparent tiles there.
								if (gridId !== 'new-items-grid') {
									div.style.background = 'unset';
								}
							}
						});

					} else if (item.weekly) {
						if (priceCodeRarity) {
							const coinValue = priceCodeRarity?.toLowerCase().split('<br>').pop().replace(' coins', '').trim();
							if (coinValue) {
								div.querySelector('.item-price').textContent = coinValue;
								div.querySelector('.item-price').classList.add('coin-price');
								div.querySelector('.item-price').classList.replace('item-price', 'star-price');
							}
						}

					} else if (item.new) {
						if (priceCodeRarity?.toLowerCase().includes('unobtainable')) {
							div.style.order = 1;
						}
					}

					grid.appendChild(div);
				});
			}

			async refreshRandom() {
				try {
					const res = await fetch('/api/items/random');
					if (!res.ok) throw new Error('Failed to fetch random item');
					
					const data = await res.json();
					if (data.item) {
						this.randomItem = data.item;
						this.renderItems('random-items-grid', [this.randomItem]);
					}
				} catch (error) {
					console.error('Failed to refresh random item:', error);
				}
			}

			async loadDonators() {
				try {
					const res = await fetch('/api/donations');
					const data = await res.json();

					const donatorsList = document.getElementById('donators-list');
					donatorsList.innerHTML = '';

					// Sort by amount and get all donators
					const allDonators = data.sort((a, b) => b.amount - a.amount);

					// Create the scrolling track
					const track = document.createElement('div');
					track.className = 'donators-track';

					// Create donator items
					const createDonatorItem = (donator) => {
						const div = document.createElement('div');
						div.className = 'donator-item';
						div.innerHTML = `
							<img class="donator-avatar" src="${donator.avatar || 'https://emwiki.com/imgs/plr.jpg'}" alt="${donator.displayName}">
							<div class="donator-name">${donator.displayName}</div>
							<div class="donator-amount">${Utils.formatPrice(donator.totalSpent)}</div>
						`;
						div.addEventListener('click', () => {
							window.open(`https://www.roblox.com/users/${donator.userId}/profile`, '_blank');
						});
						return div;
					};

					// Add all donators twice for seamless infinite scroll
					allDonators.forEach(donator => track.appendChild(createDonatorItem(donator)));
					allDonators.forEach(donator => track.appendChild(createDonatorItem(donator)));

					donatorsList.appendChild(track);

					// Adjust animation speed based on number of donators
					const itemCount = allDonators.length;
					const duration = Math.max(15, itemCount * 2.5); // Min 15s, scales with count
					track.style.animationDuration = `${duration}s`;
				} catch (error) {
					console.error('Failed to load donators:', error);
				}
			}
		}

		document.addEventListener('DOMContentLoaded', () => {
			window.catalog = new Catalog();
		});

		// ==================== SNOW PARTICLES (CHRISTMAS) ====================
		class SnowParticleSystem {
			constructor() {
				// Check if it's December (Christmas season)
				const now = new Date();
				const month = now.getMonth(); // 0-11, where 11 is December
				if (month !== 11) return; // Only show in December

				document.getElementById('christmaslights').style.display = 'block';

				this.canvas = document.createElement('canvas');
				this.canvas.id = 'snow-canvas';
				this.canvas.style.position = 'fixed';
				this.canvas.style.top = '0';
				this.canvas.style.left = '0';
				this.canvas.style.width = '100%';
				this.canvas.style.height = '100%';
				this.canvas.style.pointerEvents = 'none';
				this.canvas.style.zIndex = '1';
				this.canvas.style.opacity = '0.6';
				document.body.appendChild(this.canvas);

				this.ctx = this.canvas.getContext('2d');
				this.particles = [];
				this.maxParticles = 25; // Reduced amount
				this.animationFrame = null;

				this.resize();
				window.addEventListener('resize', () => this.resize());
				this.init();
			}

			resize() {
				this.canvas.width = window.innerWidth;
				this.canvas.height = window.innerHeight;
			}

			createParticle() {
				return {
					x: Math.random() * this.canvas.width,
					y: Math.random() * -200 - 50, // Start above screen
					vx: (Math.random() - 0.5) * 0.5, // Gentle horizontal drift
					vy: Math.random() * 0.5 + 0.3, // Slow fall speed
					size: Math.random() * 3 + 1.5, // Small, subtle flakes
					opacity: Math.random() * 0.5 + 0.3, // Semi-transparent
					swing: Math.random() * Math.PI * 2, // For gentle swaying
					swingSpeed: Math.random() * 0.02 + 0.01
				};
			}

			init() {
				// Create initial particles
				for (let i = 0; i < this.maxParticles; i++) {
					this.particles.push(this.createParticle());
				}

				// Spawn new particles occasionally
				setInterval(() => {
					if (this.particles.length < this.maxParticles) {
						this.particles.push(this.createParticle());
					}
				}, 4000);

				this.animate();
			}

			animate() {
				this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

				for (let i = this.particles.length - 1; i >= 0; i--) {
					const p = this.particles[i];

					// Update swing for gentle horizontal movement
					p.swing += p.swingSpeed;
					p.x += Math.sin(p.swing) * 0.3 + p.vx;
					p.y += p.vy;

					// Reset if off screen
					if (p.y > this.canvas.height + 10) {
						p.x = Math.random() * this.canvas.width;
						p.y = -10;
						p.vx = (Math.random() - 0.5) * 0.5;
					}

					// Wrap horizontally
					if (p.x < -5) p.x = this.canvas.width + 5;
					if (p.x > this.canvas.width + 5) p.x = -5;

					// Draw snowflake with Gaussian blur effect using radial gradient
					this.ctx.save();
					this.ctx.globalAlpha = p.opacity;

					// Create a radial gradient for Gaussian blur effect
					const gradient = this.ctx.createRadialGradient(
						p.x, p.y, 0,
						p.x, p.y, p.size * 2
					);
					gradient.addColorStop(0, 'rgba(255, 255, 255, 0.9)');
					gradient.addColorStop(0.3, 'rgba(255, 255, 255, 0.5)');
					gradient.addColorStop(0.6, 'rgba(255, 255, 255, 0.2)');
					gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');

					this.ctx.fillStyle = gradient;
					this.ctx.beginPath();
					this.ctx.arc(p.x, p.y, p.size * 2, 0, Math.PI * 2);
					this.ctx.fill();
					this.ctx.restore();
				}

				this.animationFrame = requestAnimationFrame(() => this.animate());
			}

			stop() {
				if (this.animationFrame) {
					cancelAnimationFrame(this.animationFrame);
				}
				if (this.canvas && this.canvas.parentNode) {
					this.canvas.parentNode.removeChild(this.canvas);
				}
			}
		}

		// Initialize snow particles if it's December
		const snowSystem = new SnowParticleSystem();

		// ==================== HEART PARTICLES (VALENTINES) ====================
		class HeartParticleSystem {
			constructor() {
				const now = new Date();
				const month = now.getMonth(); // 0-11, where 1 is February
				if (month !== 1) return;

				this.canvas = document.createElement('canvas');
				this.canvas.id = 'hearts-canvas';
				this.canvas.style.position = 'fixed';
				this.canvas.style.top = '0';
				this.canvas.style.left = '0';
				this.canvas.style.width = '100%';
				this.canvas.style.height = '100%';
				this.canvas.style.pointerEvents = 'none';
				this.canvas.style.zIndex = '1';
				this.canvas.style.opacity = '0.5';
				document.body.appendChild(this.canvas);

				this.ctx = this.canvas.getContext('2d');
				this.particles = [];
				this.maxParticles = 20;
				this.animationFrame = null;

				this.resize();
				window.addEventListener('resize', () => this.resize());
				this.init();
			}

			resize() {
				this.canvas.width = window.innerWidth;
				this.canvas.height = window.innerHeight;
			}

			createParticle() {
				const hues = ['#ff4d6d', '#ff758f', '#ff8fab', '#c9184a', '#e05780', '#ff006e'];
				return {
					x: Math.random() * this.canvas.width,
					y: Math.random() * -200 - 50,
					vx: (Math.random() - 0.5) * 0.4,
					vy: Math.random() * 0.4 + 0.2,
					size: Math.random() * 10 + 8,
					opacity: Math.random() * 0.4 + 0.2,
					color: hues[Math.floor(Math.random() * hues.length)],
					swing: Math.random() * Math.PI * 2,
					swingSpeed: Math.random() * 0.015 + 0.008,
					rotation: (Math.random() - 0.5) * 0.6,
					rotSpeed: (Math.random() - 0.5) * 0.01
				};
			}

			drawHeart(x, y, size, rotation, color, opacity) {
				this.ctx.save();
				this.ctx.globalAlpha = opacity;
				this.ctx.translate(x, y);
				this.ctx.rotate(rotation);

				const w = size;
				const h = size;
				const topCurveHeight = h * 0.3;

				this.ctx.beginPath();
				this.ctx.moveTo(0, topCurveHeight);
				// Left bump
				this.ctx.bezierCurveTo(0, 0, -w / 2, 0, -w / 2, topCurveHeight);
				// Left side down to tip
				this.ctx.bezierCurveTo(-w / 2, (h + topCurveHeight) / 2, 0, (h + topCurveHeight) / 2, 0, h);
				// Right side up from tip
				this.ctx.bezierCurveTo(0, (h + topCurveHeight) / 2, w / 2, (h + topCurveHeight) / 2, w / 2, topCurveHeight);
				// Right bump
				this.ctx.bezierCurveTo(w / 2, 0, 0, 0, 0, topCurveHeight);
				this.ctx.closePath();

				this.ctx.fillStyle = color;
				this.ctx.shadowColor = color;
				this.ctx.shadowBlur = size * 0.6;
				this.ctx.fill();
				this.ctx.restore();
			}

			init() {
				for (let i = 0; i < this.maxParticles; i++) {
					this.particles.push(this.createParticle());
				}

				setInterval(() => {
					if (this.particles.length < this.maxParticles) {
						this.particles.push(this.createParticle());
					}
				}, 5000);

				this.animate();
			}

			animate() {
				this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

				for (let i = this.particles.length - 1; i >= 0; i--) {
					const p = this.particles[i];

					p.swing += p.swingSpeed;
					p.x += Math.sin(p.swing) * 0.4 + p.vx;
					p.y += p.vy;
					p.rotation += p.rotSpeed;

					if (p.y > this.canvas.height + 20) {
						p.x = Math.random() * this.canvas.width;
						p.y = -20;
						p.vx = (Math.random() - 0.5) * 0.4;
					}

					if (p.x < -10) p.x = this.canvas.width + 10;
					if (p.x > this.canvas.width + 10) p.x = -10;

					this.drawHeart(p.x, p.y, p.size, p.rotation, p.color, p.opacity);
				}

				this.animationFrame = requestAnimationFrame(() => this.animate());
			}

			stop() {
				if (this.animationFrame) {
					cancelAnimationFrame(this.animationFrame);
				}
				if (this.canvas && this.canvas.parentNode) {
					this.canvas.parentNode.removeChild(this.canvas);
				}
			}
		}

		const heartSystem = new HeartParticleSystem();

		// ==================== PET SYSTEM ====================
		const pet = document.getElementById('petContainer');
		const pet2 = document.getElementById('pet');
		const xniteLink = document.getElementById('xnite-link');
		const footer = document.querySelector('footer');
		if (pet && pet2 && xniteLink && footer) {

		let petState = {
			x: 50,
			direction: 1,
			speed: 1.5,
			isWalking: true,
			isIdle: false,
			isPlaying: false,
			destination: null
		};

		function movePet() {
			if (petState.isIdle || petState.isPlaying) return;

			const footerRect = footer.getBoundingClientRect();
			const maxX = footerRect.width - 32;

			// Check if pet has a destination (xnite link)
			if (petState.destination !== null) {
				const xniteRect = xniteLink.getBoundingClientRect();
				// Calculate position relative to footer
				const targetX = xniteRect.left - footerRect.left + (xniteRect.width / 2) - 16;
				const currentLeft = parseInt(pet.style.left) || 50;
				const currentBottom = parseInt(pet.style.bottom) || 20;
				const targetBottom = footerRect.height - (xniteRect.top - footerRect.top) + 10;
				const distanceX = targetX - currentLeft;
				const distanceY = targetBottom - currentBottom;

				if (Math.abs(distanceX) < 15 && Math.abs(distanceY) < 15) {
					// Reached xnite - position exactly above it
					petState.x = targetX;
					pet.style.left = petState.x + 'px';
					pet.style.bottom = targetBottom + 'px';
					petState.destination = null;
					petState.isWalking = false;
					petState.isPlaying = true;
					pet.classList.remove('walking');
					pet.classList.add('idle');
					playWithXnite();
					setTimeout(() => {
						petState.isPlaying = false;
						petState.isWalking = true;
						pet.classList.remove('idle');
						pet.classList.add('walking');
						randomDirection();
					}, 3000);
				} else {
					// Move towards xnite
					petState.direction = distanceX > 0 ? 1 : -1;
					petState.x += petState.speed * petState.direction * 2;
					if (Math.abs(distanceY) > 5) {
						const newBottom = currentBottom + (distanceY > 0 ? 1 : -1) * petState.speed * 1.5;
						pet.style.bottom = Math.max(20, Math.min(footerRect.height - 20, newBottom)) + 'px';
					}
				}
			} else {
				// Random walking within footer bounds
				petState.x += petState.speed * petState.direction;

				// Bounce off edges of footer
				if (petState.x <= 0 || petState.x >= maxX) {
					petState.direction *= -1;
				}

				// Random direction change
				if (Math.random() < 0.008) {
					randomDirection();
				}

				// Random idle
				if (Math.random() < 0.005) {
					idle();
				}
			}

			// Update pet position (keep within footer bounds)
			petState.x = Math.max(0, Math.min(maxX, petState.x));
			pet.style.left = petState.x + 'px';

			// Flip sprite based on direction
			if (petState.direction > 0) {
				pet2.classList.add('flipped');
			} else {
				pet2.classList.remove('flipped');
			}
		}

		function randomDirection() {
			petState.direction = Math.random() > 0.5 ? 1 : -1;
		}

		function idle() {
			petState.isWalking = false;
			petState.isIdle = true;
			pet.classList.remove('walking');
			pet.classList.add('idle');

			setTimeout(() => {
				petState.isIdle = false;
				petState.isWalking = true;
				pet.classList.remove('idle');
				pet.classList.add('walking');
			}, 2000 + Math.random() * 2000);
		}

		function playWithXnite() {
			// Pet plays with xnite
		}

		// Click interaction on pet
		pet.addEventListener('click', () => {
			const heart = document.createElement('div');
			heart.className = 'heart';
			heart.textContent = '❤️';
			pet.appendChild(heart);

			setTimeout(() => {
				heart.remove();
			}, 1000);
		});

		// Xnite link click - pet goes to footer
		xniteLink.addEventListener('click', () => {
			if (!petState.isPlaying) {
				petState.destination = true; // Set destination flag
			}
		});

		// Main game loop
		setInterval(movePet, 50);
		} // end pet system guard

		// Sometimes go to footer randomly
		setInterval(() => {
			if (Math.random() < 0.2 && !petState.isPlaying && petState.destination === null) {
				petState.destination = true; // Set destination flag
			}
		}, 8000);
