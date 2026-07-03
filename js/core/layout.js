/* Split out of the old js/script.js (see git history). Loaded via js/core/bridge.js. */
import { openSurface } from '../components/surface.js';

// Stroke icons for the mobile dock (24px grid, currentColor).
const DOCK_ICONS = {
  home: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V20a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1V9.5"/></svg>',
  catalog: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="13.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="3.5" y="13.5" width="7" height="7" rx="1.5"/><rect x="13.5" y="13.5" width="7" height="7" rx="1.5"/></svg>',
  trading: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h13m0 0-3.5-3.5M17 7l-3.5 3.5"/><path d="M20 17H7m0 0 3.5-3.5M7 17l3.5 3.5"/></svg>',
  forum: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a7.5 7.5 0 0 1-7.5 7.5c-1.1 0-2.14-.22-3.08-.63L5 20l1.63-5.42A7.5 7.5 0 1 1 21 11.5Z"/></svg>',
  profile: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="4"/><path d="M4.5 20.5a7.5 7.5 0 0 1 15 0"/></svg>',
  more: '<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="19" cy="12" r="1.8"/></svg>',
  gallery: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3.5" y="4.5" width="17" height="15" rx="2"/><circle cx="9" cy="10" r="1.6"/><path d="m4 17 4.5-4.5 3 3L16 11l4 4.5"/></svg>',
  shield: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3 5 6v5c0 4.5 3 8.1 7 10 4-1.9 7-5.5 7-10V6l-7-3Z"/></svg>',
  calendar: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3.5" y="5" width="17" height="16" rx="2"/><path d="M3.5 10h17M8 3v4m8-4v4"/></svg>',
};

// ==================== LAYOUT (Header, Footer & Dock) ====================
const Layout = {
  navItems: [
    { href: '/catalog', label: 'Catalog', key: 'catalog' },
    { href: '/trading', label: 'Trade', key: 'trading', new: true},
    { href: '/forum', label: 'Forum', key: 'forum' },
    { href: '/gallery', label: 'Gallery', key: 'gallery' },
    { href: '/scammers', label: 'Scammers', key: 'scammers' }
  ],

  dockItems: [
    { href: '/', label: 'Home', key: 'home', icon: 'home' },
    { href: '/catalog', label: 'Catalog', key: 'catalog', icon: 'catalog' },
    { href: '/trading', label: 'Trade', key: 'trading', icon: 'trading' },
    { href: '/forum', label: 'Forum', key: 'forum', icon: 'forum' },
    { href: '/profile', label: 'Profile', key: 'profile', icon: 'profile' },
  ],

  moreItems: [
    { href: '/gallery', label: 'Gallery', icon: 'gallery' },
    //{ href: '/gamenights', label: 'Game Nights', icon: 'calendar' },
    { href: '/scammers', label: 'Scammers List', icon: 'shield' },
  ],

  getActiveNav() {
    const data = document.body?.dataset?.activeNav;
    if (data) return data;
    const path = (window.location.pathname || '').replace(/\/$/, '') || '/';
    if (path === '/' || path === '/index' || path === '/index.html') return null;
    const match = path.match(/^\/(catalog|trading|forum|gallery|scammers|profile|gamenights)/);
    return match ? match[1] : null;
  },

  renderDock() {
    const active = this.getActiveNav() || 'home';
    const inMore = this.moreItems.some(({ href }) => href === '/' + active);
    const tabs = this.dockItems.map(({ href, label, key, icon }) =>
      `<a href="${href}" class="dock-item${active === key ? ' active' : ''}" aria-label="${label}"${active === key ? ' aria-current="page"' : ''}>
        ${DOCK_ICONS[icon]}<span>${label}</span>
      </a>`
    ).join('');

    return `<nav class="dock" aria-label="Primary">
      ${tabs}
      <button type="button" class="dock-item dock-more${inMore ? ' active' : ''}" aria-label="More">
        ${DOCK_ICONS.more}<span>More</span>
      </button>
    </nav>`;
  },

  openMoreSheet() {
    const list = document.createElement('div');
    list.className = 'more-sheet-list';
    for (const { href, label, icon } of this.moreItems) {
      const a = document.createElement('a');
      a.className = 'more-sheet-link';
      a.href = href;
      a.innerHTML = `${DOCK_ICONS[icon]}<span>${label}</span>`;
      list.appendChild(a);
    }
    openSurface({ title: 'More', content: list, variant: 'sheet', size: 'sm' });
  },

  renderHeader() {
    const active = this.getActiveNav();
    const navHtml = this.navItems.map(({ href, label, key, soon }) =>
      `<a href="${href}" class="nav-link${active === key ? ' active' : ''}${soon ? ' nav-link-soon' : ''}">${label}</a>`
    ).join('\n\t\t\t');

    return `<header>
		<div id="christmaslights" style="display:none;position: absolute;left: 0;top: -45px;background: url(/imgs/titles/7a889a5ce371c6aa3a59862815826ee7.png);background-position: center;width: 100%;height: 40%;z-index: -1;"></div>
		<a class="site-logo" href="https://emwiki.com">
			<svg width="500" height="300" viewBox="451 471 100 39" xmlns="http://www.w3.org/2000/svg">
				<defs>
					<linearGradient id="eppp1" y1="1" x2="0">
						<stop offset=".2" style="stop-color:#ff0" />
						<stop offset="1" style="stop-color:#24ff5a" />
					</linearGradient>
					<linearGradient id="eppp2" y1="1" x2="0">
						<stop offset="0" style="stop-color:#24ff5d" />
						<stop offset="1" style="stop-color:#ff0" />
					</linearGradient>
				</defs>
				<image id="cloud" x="461" y="459" href="https://emwiki.com/imgs/TWOKPhY.png" height="60" width="60" style="filter:opacity(.6)" />
				<text x="489" y="503" text-anchor="middle" stroke="#000" stroke-width="2.3" paint-order="stroke" stroke-linejoin="round" fill="url(#eppp1)" style="animation:floatAnim 12s ease-in-out infinite;font:200 46px Slapstick">EM</text>
				<image id="epic-image" x="464" y="463" href="https://emwiki.com/imgs/epicfaces/kitta.png" height="60" width="60" style="scale:.48;transform:translate(846px,103px);rotate:20deg;transform-origin:center;animation:floatAnim2 15s ease-in-out 1s infinite alternate" />
				<image id="cloud" x="495" y="477" href="https://emwiki.com/imgs/8UUB0Gt.png" height="60" width="60" style="filter:opacity(.86)" />
				<text x="516" y="514" text-anchor="middle" stroke="#000" stroke-width="2.3" paint-order="stroke" stroke-linejoin="round" fill="url(#eppp2)" style="animation:floatAnim 12s ease-in-out infinite;animation-delay:5.5s;font:200 16px Slapstick">wiki</text>
				<image id="cloud" x="445" y="487" href="https://emwiki.com/imgs/oYKd3nJ.png" height="28" width="42" style="filter:opacity(.8)" />
			</svg>
		</a>
		<nav class="nav-links" aria-label="Primary">
			${navHtml}
		</nav>
	</header>`;
  },

  renderFooter(opts = {}) {
    const { showPet = false, showReportScammer = false } = opts;
    const isHome = !document.body?.dataset?.activeNav && (window.location.pathname || '/').replace(/\/$/, '').match(/^(\/|\/index\.html?)$/);
    const contactExtra = '<a id="kypsus" href="https://docs.google.com/spreadsheets/d/11qKj8UTf2-x0Z7bNMuguEFKALCWI1v7QtkDbNlBzy9M"><strong>@Kypsus</strong>\'s Google Sheet</a>';
    const footerBottom = '<p>© 2025 emwiki.com • made with ❤ by <span id="xnite-link" style="cursor: pointer; text-decoration: underline;">xnite</span></p>';
    const petHtml = showPet ? '\n\t\t<!-- Pet -->\n\t\t<div id="petContainer"><div id="pet"></div></div>' : '';

    return `<footer>
		<div class="footer-content">
			<div class="footer-section">
				<h4>Browse</h4>
				<a href="/catalog">Catalog</a>
				<a href="/scammers">Scammers List</a>
				<a href="/admin">Admin Portal</a>
				<a href="/privacy-policy">Privacy Policy</a>

			</div>
			<div class="footer-section">
				<h4>Community</h4>
				<a href="/forum">Forum</a>
				<a href="/trading">Trading</a>
				<a href="/gallery">Gallery</a>
				<a href="/profile">Profiles</a>
			</div>
			<div class="footer-section">
				<h4>Contact</h4>
				<p>Found a bug? Reach out to <b>@xnite</b> on Discord!</p>
				${contactExtra}
			</div>
		</div>
		<div class="footer-bottom">
			${footerBottom}
		</div>${petHtml}
	</footer>`;
  },

  init() {
    const headerEl = document.getElementById('site-header');
    const footerEl = document.getElementById('site-footer');
    const opts = {
      // boolean data attributes are present-but-empty, so test presence
      showPet: 'layoutPet' in (document.body?.dataset || {}),
      showReportScammer: 'layoutReportScammer' in (document.body?.dataset || {})
    };
    if (headerEl) headerEl.outerHTML = this.renderHeader();
    if (footerEl) footerEl.outerHTML = this.renderFooter(opts);

    // Mobile dock on every page that has the shared header (CSS hides it ≥768px)
    if (headerEl && !document.querySelector('.dock')) {
      document.body.insertAdjacentHTML('beforeend', this.renderDock());
      document.querySelector('.dock-more')?.addEventListener('click', () => this.openMoreSheet());
    }
  }
};

export { Layout };
