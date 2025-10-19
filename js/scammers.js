// Lightweight app for scammers page
class ScammersApp {
  constructor() {
    this.loadTheme();
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
      { type: "https://emwiki.site/imgs/epicfaces/tran.webp", chance: 10 },
      { type: "https://emwiki.site/imgs/epicfaces/3d.png", chance: 2 },
      { type: "https://emwiki.site/imgs/epicfaces/Epic_Banana.webp", chance: 8 },
      { type: "https://emwiki.site/imgs/epicfaces/XRmpB1c.png", chance: 0 },
      { type: "https://emwiki.site/imgs/burrito.png", chance: 3 }
    ];
    let titleColors = [['#24ff5d', '#ff0']];

    if (now.getMonth() === 9) {
      rarities = [
        { type: "https://emwiki.site/imgs/epicfaces/kitta.png", chance: 15 },
        { type: "https://emwiki.site/imgs/epicfaces/devlil.png", chance: 15 },
        { type: "https://emwiki.site/imgs/epicfaces/Ghost_Epic_Face.webp", chance: 15 },
        { type: "https://emwiki.site/imgs/epicfaces/pmupkin.png", chance: 0 },
        { type: "https://emwiki.site/imgs/epicfaces/Uncanny_Epic_Face.webp", chance: 3 }
      ];
      titleColors = [['#ff7518', '#000000']];
    } else if (now.getMonth() === 11) {
      rarities = [
        { type: "https://emwiki.site/imgs/epicfaces/xmas.png", chance: 20 },
        { type: "https://emwiki.site/imgs/epicfaces/rudolf.png", chance: 20 },
        { type: "https://emwiki.site/imgs/epicfaces/santa.png", chance: 0 }
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

// Initialize app
const scammersApp = new ScammersApp();


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
    robloxUser = "Unknown",
    robloxProfile = "#",
    avatar = "imgs/plr.jpg",
    discordDisplay = null,
    victims = null,
    itemsScammed = null,
    robloxAlts = null,
    severity = null // Optional: for warning badges
  } = scammer;

  const block = document.createElement('section');
  block.className = 'scammer-block';

  // Build alt accounts HTML
  const altsHTML = Array.isArray(robloxAlts) && robloxAlts.length > 0
    ? `<p><strong>Alts:</strong> ${robloxAlts.map(alt =>
      `<a href="${alt.profile}" target="_blank" rel="noopener noreferrer">${alt.name}</a>`
    ).join(", ")}</p>`
    : "";

  // Build Discord display - removed inline styles, using CSS instead
  const discordHTML = discordDisplay && discordDisplay.trim() !== "NA"
    ? `<p><img src="./imgs/discord.png" alt="Discord"> ${discordDisplay}</p>`
    : "";

  // Optional: High severity warning badge
  const warningBadge = severity === "high"
    ? '<span class="scammer-warning">⚠️ High Risk</span>'
    : "";

  block.innerHTML = `
    ${warningBadge}
    <div class="scammer-content">
      <img class="scammer-img" src="${avatar}" 
           alt="Avatar of ${robloxUser}" 
           loading="lazy"
           onerror="this.src='imgs/plr.jpg'" />
      <div class="scammer-info">
        <a href="${robloxProfile}" target="_blank" rel="noopener noreferrer">
          <h2>
            ${robloxUser}
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M12 5l7 7-7 7"></path>
              <path d="M5 12h14"></path>
            </svg>
          </h2>
        </a>
        ${discordHTML}
        ${victims && victims.trim() !== "NA"
      ? `<p><strong>Victims:</strong> ${victims}</p>`
      : ""}
        ${itemsScammed && itemsScammed.trim() !== "NA"
      ? `<p><strong>Items Scammed:</strong> ${itemsScammed}</p>`
      : ""}
        ${altsHTML}
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

  try {
    const response = await fetch('https://emwiki.site/api/roblox-proxy?mode=discord-scammers');

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
      sortedScammers.forEach(scammer => createScammerBlock(scammer, container));

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

// Optional: Add refresh functionality
function refreshScammers() {
  const container = $('#scammers-container');
  if (container) {
    showLoadingSkeleton(container);
    loadScammers();
  }
}

// Optional: Auto-refresh every 5 minutes
// setInterval(refreshScammers, 5 * 60 * 1000);