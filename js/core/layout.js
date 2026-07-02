/* Split out of the old js/script.js (see git history). Loaded via js/core/bridge.js. */
// ==================== LAYOUT (Header & Footer) ====================
const Layout = {
  navItems: [
    { href: '/catalog', label: 'Catalog', key: 'catalog' },
    { href: '/trading', label: 'Trading Hub', key: 'trading' },
    { href: '/forum', label: 'Forum', key: 'forum' },
    { href: '/gallery', label: 'Gallery', key: 'gallery' },
    { href: '/scammers', label: 'Scammers', key: 'scammers' }
  ],

  getActiveNav() {
    const data = document.body?.dataset?.activeNav;
    if (data) return data;
    const path = (window.location.pathname || '').replace(/\/$/, '') || '/';
    if (path === '/' || path === '/index' || path === '/index.html') return null;
    const match = path.match(/^\/(catalog|trading|forum|gallery|scammers)/);
    return match ? match[1] : null;
  },

  renderHeader() {
    const active = this.getActiveNav();
    const navHtml = this.navItems.map(({ href, label, key }) =>
      `<a href="${href}" class="nav-link${active === key ? ' active' : ''}">${label}</a>`
    ).join('\n\t\t\t');

    return `<header>
		<div id="christmaslights" style="display:none;position: absolute;left: 0;top: -45px;background: url(/imgs/titles/7a889a5ce371c6aa3a59862815826ee7.png);background-position: center;width: 100%;height: 40%;z-index: -1;"></div>
		<a href="https://emwiki.com">
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
		<div class="nav-links">
			${navHtml}
		</div>
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
      showPet: !!document.body?.dataset?.layoutPet,
      showReportScammer: !!document.body?.dataset?.layoutReportScammer
    };
    if (headerEl) headerEl.outerHTML = this.renderHeader();
    if (footerEl) footerEl.outerHTML = this.renderFooter(opts);
  }
};

export { Layout };
