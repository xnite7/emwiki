// ============================================
// CONFIGURATION & CONSTANTS
// ============================================
const APP_CONFIG = {
  touch: 'ontouchstart' in window || navigator.maxTouchPoints > 0,

  colors: {
    gears: "rgb(91, 254, 106)",
    deaths: "rgb(255, 122, 94)",
    titles: "rgb(201, 96, 254)",
    pets: "rgb(55, 122, 250)",
    effects: "rgb(255, 177, 53)"
  },

  modalColors: {
    pets: "rgb(39, 102, 221)",
    effects: "rgb(243, 164, 37)",
    deaths: "rgb(221, 89, 62)",
    titles: "rgb(154, 45, 209)",
    gears: "rgb(55, 205, 68)"
  },

  icons: {
    premium: "./imgs/prem.png",
    untradable: "https://i.imgur.com/WLjbELh.png",
    retired: "./imgs/Red_x.png",
    robux: "./imgs/cf8ZvY7.png",
    coins: "./imgs/Coin.webp",
    stars: "./imgs/WKeX5AS.png",
    visors: "./imgs/7IoLZCN.png",
    pumpkins: "./imgs/bHRBTrU.png",
    eggs: "./imgs/qMxjgQy.png",
    opals: "./imgs/wwMMAvr.png",
    baubles: "./imgs/bauble.png",
    tokens: "./imgs/Cy9r140.png"
  },

  tilt: {
    max: "10",
    speed: "500",
    perspective: "1800",
    glare: true,
    maxGlare: "0.1",
    scale: "1.03",
    reset: "true"
  }
};

// ============================================
// STATE MANAGEMENT
// ============================================
class AppState {
  constructor() {
    this.currentItem = null;
    this.items = [];
    this.favorites = this.loadFavorites();
    this.searchHistory = this.loadSearchHistory();
    this.isModalOpen = false;
    this.isSwiping = false;
    this.showingFavoritesOnly = false;
  }

  loadFavorites() {
    const match = document.cookie.match(/(?:^|; )favorites=([^;]*)/);
    return match ? decodeURIComponent(match[1]).split("|") : [];
  }

  saveFavorites() {
    const value = encodeURIComponent(this.favorites.join("|"));
    document.cookie = `favorites=${value}; path=/; max-age=31536000`;
  }

  toggleFavorite(name) {
    const index = this.favorites.indexOf(name);
    if (index > -1) {
      this.favorites.splice(index, 1);
    } else {
      this.favorites.push(name);
    }
    this.saveFavorites();
    return this.favorites.includes(name);
  }

  loadSearchHistory() {
    return JSON.parse(localStorage.getItem("searchHistory") || "[]");
  }

  saveSearchHistory(name) {
    this.searchHistory = this.searchHistory.filter(item => item !== name);
    this.searchHistory.unshift(name);
    if (this.searchHistory.length > 4) {
      this.searchHistory = this.searchHistory.slice(0, 4);
    }
    localStorage.setItem("searchHistory", JSON.stringify(this.searchHistory));
  }
}

const appState = new AppState();

// ============================================
// MODAL SYSTEM
// ============================================
class ModalSystem {
  constructor() {
    this.cache = null;
    this.init();
  }


  init() {
    this.createModalStructure();
    this.setupEventListeners();
  }

  createModalStructure() {
    const modal = document.createElement('div');
    modal.id = 'product-modal';
    modal.className = 'modal';

    const content = this.createModalContent();
    modal.appendChild(content);

    // Add navigation arrows
    const leftArrow = document.createElement("div");
    leftArrow.id = "modal-left-arrow";
    leftArrow.className = "modal-arrow";
    leftArrow.innerHTML = "←";
    modal.appendChild(leftArrow);

    const rightArrow = document.createElement("div");
    rightArrow.id = "modal-right-arrow";
    rightArrow.className = "modal-arrow";
    rightArrow.innerHTML = "→";
    modal.appendChild(rightArrow);

    document.body.appendChild(modal);

    // Cache references
    this.cache = {
      modal: modal,
      content: content,
      title: content.querySelector('#modal-title'),
      prc: content.querySelector('#modal-prc'),
      description: content.querySelector('#modal-description'),
      price: content.querySelector('#modal-price-value'),
      popo: content.querySelector('#popo'),
      retired: content.querySelector('#modal-retired'),
      premium: content.querySelector('#modal-premium'),
      untradable: content.querySelector('#modal-untradable'),
      button: content.querySelector('#tour-button'),
      leftArrow: leftArrow,
      rightArrow: rightArrow
    };
  }

  createModalContent() {
    const content = document.createElement('div');
    content.id = 'modal-content';
    content.className = 'modal-content expand';

    // Apply tilt data attributes
    Object.entries(APP_CONFIG.tilt).forEach(([key, value]) => {
      content.dataset[`tilt${key.charAt(0).toUpperCase() + key.slice(1)}`] = value;
    });

    const overlay2 = document.createElement('div');
    overlay2.className = 'inner-border-overlay';

    content.append(overlay2);


    const contentArea = this.createContentArea();
    const closeBtn = document.createElement('span');
    closeBtn.id = 'close-modal';
    closeBtn.className = 'close-btn';

    // Glare effects
    const glare1 = this.createGlareElement();
    const glare2 = this.createGlareElement();

    // Assemble
    [contentArea, closeBtn, glare1, glare2]
      .forEach(el => content.appendChild(el));

    return content;
  }

  createContentArea() {
    const area = document.createElement('div');
    area.id = 'content-area';
    area.className = 'content-area';

    const overlay = document.createElement('div');
    overlay.className = 'gradient-overlay';

    const TPcontainer = document.createElement('div');
    TPcontainer.className = 'title-price-container';

    const title = document.createElement('h3');
    title.id = 'modal-title';
    title.className = 'modal-title';
    title.setAttribute('data-tilt-transform-element', '');

    const price = document.createElement('h3');
    price.id = 'modal-prc';
    price.className = 'modal-prc';

    TPcontainer.append(title, price);

    const priceImg = document.createElement('img');
    priceImg.id = 'modal-price-value';

    const description = document.createElement('p');
    description.id = 'modal-description';

    const priceDiv = document.createElement('div');
    priceDiv.id = 'popo';
    priceDiv.className = 'price';

    const priceText = document.createElement('p');
    priceText.textContent = '0';

    priceDiv.append(priceImg, priceText);

    const tourButton = document.createElement('button');
    tourButton.id = 'tour-button';
    tourButton.className = 'tour-button';
    tourButton.innerHTML = `
      Visit
      <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" style="margin-bottom: -4px;scale: 0.9;stroke-width: 3px;" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M12 5l7 7-7 7"></path>
        <path d="M5 12h14"></path>
      </svg>
    `;

    const dock = document.createElement('div');
    dock.className = 'dock';

    const premium = document.createElement('img');
    premium.id = 'modal-premium';
    premium.className = 'modal-icon';
    premium.src = APP_CONFIG.icons.premium;

    const retired = document.createElement('h3');
    retired.id = 'modal-retired';
    retired.textContent = 'Retired';

    const untradable = document.createElement('img');
    untradable.id = 'modal-untradable';
    untradable.className = 'modal-icon';
    untradable.src = APP_CONFIG.icons.untradable;

    dock.append(premium, retired, untradable);

    area.append(overlay, TPcontainer, description, priceDiv, tourButton, dock);

    return area;
  }

  createGlareElement() {
    const wrap = document.createElement('div');
    wrap.className = 'js-tilt-glare';
    const inner = document.createElement('div');
    inner.className = 'js-tilt-glare-inner';
    wrap.appendChild(inner);
    return wrap;
  }

  setupEventListeners() {
    // Close modal
    window.addEventListener('click', (e) => {
      if (e.target === this.cache.modal) this.close();
    });

    // Navigation
    this.cache.leftArrow.addEventListener('click', () => this.navigate('prev'));
    this.cache.rightArrow.addEventListener('click', () => this.navigate('next'));

    // Keyboard navigation
    document.addEventListener('keydown', (e) => {
      if (!appState.isModalOpen) return;
      if (e.key === 'ArrowLeft') this.navigate('prev');
      if (e.key === 'ArrowRight') this.navigate('next');
      if (e.key === 'Escape') this.close();
    });

    // Touch support
    if (APP_CONFIG.touch) {
      this.setupTouchHandlers();
    }

    // Show arrows on hover
    this.cache.modal.addEventListener('mousemove', () => this.showArrows());
  }

  setupTouchHandlers() {
    let touchStartX = 0;
    let touchEndX = 0;

    this.cache.content.addEventListener('touchstart', (e) => {
      e.preventDefault();
      touchStartX = e.changedTouches[0].screenX;
    }, false);

    this.cache.content.addEventListener('touchend', (e) => {
      touchEndX = e.changedTouches[0].screenX;
      const delta = touchEndX - touchStartX;

      if (Math.abs(delta) > 50) {
        this.navigate(delta < 0 ? 'next' : 'prev');
      }
    }, false);
  }

  open(item) {
    if (appState.isModalOpen) return;

    const itemElement = item.element || item;
    appState.currentItem = itemElement;
    appState.isModalOpen = true;

    // Mark item as showing
    document.querySelectorAll('.item').forEach(el => el.classList.remove('showing'));
    itemElement.classList.add('showing');

    document.body.classList.add('modal-open');
    //disable scrolling without overflowy = hidden

    // Populate modal content
    this.populateContent(item);

    // Show modal with animation
    this.cache.modal.style.display = 'flex';
    this.cache.modal.classList.add('show');

    // Apply smart title sizing
    this.optimizeTitleSize();

    // Update URL

    this.updateURL(item.name);

    // Update navigation arrows
    this.updateNavigationArrows();
  }

  populateContent(item) {
    const data = this.extractItemData(item.element || item);

    // Reset visibility
    ['retired', 'premium', 'untradable'].forEach(key => {
      this.cache[key].style.visibility = 'hidden';
    });

    // Set content
    this.cache.title.textContent = data.title;
    this.cache.description.textContent = data.description;
    this.cache.prc.innerHTML = `<img src="./imgs/rap.png" style="filter: drop-shadow(0px 1px 5px #49444454);height:44px;float:left;">${data.price || 0}`;

    // Handle visibility
    this.cache.prc.style.display = 'flex'

    if (data.price === 'N/A' || data.price === '0' || data.price === '') {
      this.cache.prc.style.display = 'none';
    }

    // Set badges
    if (data.isRetired) this.cache.retired.style.visibility = 'visible';
    if (data.isPremium) this.cache.premium.style.visibility = 'visible';
    if (data.isUntradable) this.cache.untradable.style.visibility = 'visible';

    // Set background color
    const categoryColor = APP_CONFIG.modalColors[data.category];
    if (categoryColor) {
      this.cache.content.style.backgroundColor = categoryColor;
    }

    // Handle images
    this.handleModalImages(data);

    // Handle prices
    this.handleModalPrices(data);
  }

  extractItemData(element) {

    return {
      title: element.getAttribute('data-title-name'),
      description: element.getAttribute('description'),
      price: element.getAttribute('price'),
      priceCodeRarity: element.getAttribute('prc'),
      image: element.dataset.image,
      svg: element.querySelector('svg')?.outerHTML || '',
      category: element.id,
      isRetired: !!element.querySelector('.retired'),
      isPremium: !!element.querySelector('.premium'),
      isUntradable: !!element.querySelector('.untradable')
    };
  }

  handleModalImages(data) {
    // Remove existing canvas and SVG
    const existingCanvas = this.cache.content.querySelector('#content-area canvas');
    if (existingCanvas) existingCanvas.remove();

    const existingSvg = this.cache.content.querySelector('#content-area .modal-svg-title');
    if (existingSvg) existingSvg.remove();

    // Remove font elements
    this.cache.content.querySelectorAll('.font').forEach(el => el.remove());

    if (data.image) {
      const canvas = document.createElement('canvas');
      canvas.style.cssText = `
      width: 100%;
      margin: -11px 0 -11px;
      place-self: center;
      display: block;
      user-select: none;
      z-index: 99;
    `;

      const contentArea = this.cache.content.querySelector('#content-area');
      contentArea.insertBefore(canvas, this.cache.description);

      const ctx = canvas.getContext('2d');
      const img = new Image();
      img.onload = () => {
        canvas.width = img.width;
        canvas.height = img.height;
        ctx.drawImage(img, 0, 0);
      };
      img.src = data.image;
    }
    // Handle SVG titles in modal
    else if (data.svg && data.category === 'titles') {
      const svgContainer = document.createElement('div');
      svgContainer.className = 'modal-svg-title';

      svgContainer.innerHTML = data.svg;

      Object.assign(svgContainer.style, {
        width: '100%',
        height: '-webkit-fill-available',
        display: 'flex',
        alignItems: 'center',
        zIndex: '22',
      });

      // Scale up the SVG for modal display
      const svg = svgContainer.querySelector('svg');
      if (svg) {
        svg.style.width = '100%';
        svg.style.overflow = 'visible';
        svg.style.textShadow = 'none';
        svg.style.height = 'auto';
        svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
      }

      const contentArea = this.cache.content.querySelector('#content-area');
      contentArea.insertBefore(svgContainer, this.cache.description);
    }
    // Handle old format titles
    else if (data.category === 'titles') {
      const itemElement = document.querySelector('.item.showing');
      if (itemElement) {
        const h3Element = itemElement.querySelector('#h3');
        if (h3Element) {
          const clone = h3Element.cloneNode(true);
          Object.assign(clone.style, {
            height: '100%',
            paddingTop: '4px',
            zoom: '2',
            width: '-webkit-fill-available',
            zIndex: '22',
            margin: '31px 0px 46px 0px',
            alignSelf: 'center',
            position: 'relative',
            alignContent: 'center'
          });
          clone.classList.add('font');

          const contentArea = this.cache.content.querySelector('#content-area');
          contentArea.insertBefore(clone, this.cache.description);
        }
      }
    }
  }

  handleModalPrices(data) {
    // Clear existing price elements
    this.cache.popo.parentElement.querySelectorAll('.price').forEach((el, idx) => {
      if (idx > 0) el.remove();
    });

    const prices = data.priceCodeRarity.split('\n').filter((line, index, self) =>
      self.findIndex(l => l.toLowerCase() === line.toLowerCase()) === index
    );

    // Set first price
    this.cache.price.src = './imgs/trs.png';
    const firstPriceText = this.cache.price.nextSibling;
    if (firstPriceText) {
      firstPriceText.textContent = prices[0] || '';
      Object.assign(firstPriceText.style, {
        color: '#e1e1e1',
        fontSize: '30px',
        fontWeight: 400,
        display: 'block'
      });
    }

    // Add additional prices
    prices.slice(1).forEach(priceText => {
      const newPriceDiv = this.cache.popo.cloneNode(true);
      newPriceDiv.childNodes[1].textContent = priceText;
      this.cache.popo.parentElement.appendChild(newPriceDiv);
    });

    // Style prices based on content
    this.stylePrices();
  }

  stylePrices() {
    this.cache.popo.parentElement.querySelectorAll('.price').forEach(priceEl => {
      const [img, text] = priceEl.children;
      if (!text || !text.textContent) {
        priceEl.style.display = 'none';
        return;
      }
      modalCache.button.style.display = '';
      const content = text.textContent;
      //clear style sheet
      Object.assign(text.style, {
        color: '',
        fontWeight: '',
        textShadow: '',
        fontFamily: '',
        fontSize: '',
        textStroke: '',
        webkitTextStroke: ''
      });

      // Apply special styling
      if (content.includes('Tokens')) {
        console.log(content);
        Object.assign(text.style, {
          fontWeight: 500,
          textStroke: '1px rgb(255, 83, 219)',
          webkitTextStroke: '1px rgb(255, 83, 219)'
        });
      }

      if (content.includes('Robux')) {
        text.style.fontWeight = '700';
      }

      // Set icon based on currency
      Object.entries(APP_CONFIG.icons).forEach(([key, src]) => {
        if (content.toLowerCase().includes(key.toLowerCase())) {
          text.textContent = content.toLowerCase().replace(` ${key.toLowerCase()}`, '');
          img.src = src;
        }
      });

      // Special cases
      if (content.includes('%')) {
        Object.assign(text.style, {
          color: 'rgb(193 68 255)',
          fontWeight: 500,
          textShadow: '0 0 6px rgb(199 0 255)'
        });
      } else if (content.includes('[EXPIRED]')) {
        Object.assign(text.style, {
          textShadow: '0 0 10px black',
          fontFamily: 'monospace',
          fontSize: '23px',
          color: '#cd1f1f'
        });
      } else if (content.includes('[ACTIVE]')) {
        Object.assign(text.style, {
          fontFamily: 'monospace',
          fontSize: '23px',
          color: 'rgb(251 255 68)'
        });
      } else if (content.includes('Unobtainable')) {
        img.src = './imgs/Red_x.png';
        text.style.color = 'rgb(255 44 44)';
      } else if (content.includes('www.')) {
        modalCache.button.style.display = 'unset';
        text.style.display = 'none';
        modalCache.button.setAttribute('onclick', `window.open('${content.includes('http') ? '' : 'https://'}${content}', '_blank')`);

      }

      priceEl.style.display = text.textContent ? 'flex' : 'none';
    });
  }

  optimizeTitleSize() {
    requestAnimationFrame(() => {
      const title = this.cache.title;
      const prc = this.cache.prc;
      if (!title || !prc) return;

      // Fixed configuration - no more dependency on char/word count
      const config = {
        maxFontSize: 50,
        minFontSize: 24,
        padding: 25,
      };

      // Set initial styles with max font size
      title.style.cssText = `
      font-size: ${config.maxFontSize}px;
      line-height: 1.15;
      font: 900 ${config.maxFontSize}px 'Source Sans Pro';
      text-shadow: 0px 1px 5px #49444499;
      z-index: 22;
      transform: translateZ(20px);
      text-align: left;
      transition: font-size 0.1s ease;
    `;

      // Calculate available space
      const container = title.parentElement;
      const containerWidth = container.offsetWidth;
      const prcWidth = prc.offsetWidth;
      const availableWidth = containerWidth - prcWidth - config.padding;

      // Binary search for optimal size based on actual width
      let low = config.minFontSize;
      let high = config.maxFontSize;
      let optimal = config.minFontSize;

      while (low <= high) {
        const mid = Math.floor((low + high) / 2);
        title.style.fontSize = `${mid}px`;

        // Force reflow to get accurate measurements
        title.offsetHeight;

        if (title.offsetWidth <= availableWidth) {
          optimal = mid;
          low = mid + 1;
        } else {
          high = mid - 1;
        }
      }

      // Apply the optimal font size
      title.style.fontSize = `${optimal}px`;

      // Width-based special handling for very short content
      // If title takes up less than 40% of available width, enhance typography
      if (title.offsetWidth < availableWidth * 0.4) {
        title.style.fontWeight = '900';
        title.style.letterSpacing = '-0.02em';
      }

      title.style.opacity = this.cache.content.querySelector('canvas') ? '1' : '0';
    });
  }

  navigate(direction) {
    if (appState.isSwiping) return;

    const current = document.querySelector('.item.showing');
    if (!current) return;

    const sibling = direction === 'next'
      ? current.nextElementSibling
      : current.previousElementSibling;

    if (!sibling || !sibling.classList.contains('item')) return;
    console.log(1);
    // Animate transition
    appState.isSwiping = true;
    this.cache.content.classList.add(direction === 'next' ? 'swipeLeft' : 'swipeRight');
    console.log(2);
    setTimeout(() => {
      document.body.classList.remove('modal-open');
      appState.isModalOpen = false;
      sibling.click();
      console.log(sibling);
    }, 140);

    setTimeout(() => {
      this.cache.content.style.transition = 'left 0s ease';
      this.cache.content.classList.remove('swipeLeft', 'swipeRight');
      this.cache.content.classList.add(direction === 'next' ? 'swipeRight' : 'swipeLeft');
    }, 100);

    setTimeout(() => {
      this.cache.content.style.transition = '';
      this.cache.content.classList.remove('swipeLeft', 'swipeRight');
      appState.isSwiping = false;
    }, 250);
  }

  updateNavigationArrows() {
    const current = document.querySelector('.item.showing');
    if (!current) return;

    this.cache.leftArrow.style.display = current.previousElementSibling ? 'block' : 'none';
    this.cache.rightArrow.style.display = current.nextElementSibling ? 'block' : 'none';
  }

  showArrows() {
    this.cache.leftArrow.classList.add('show');
    this.cache.rightArrow.classList.add('show');

    clearTimeout(this.arrowTimeout);
    this.arrowTimeout = setTimeout(() => {
      this.cache.leftArrow.classList.remove('show');
      this.cache.rightArrow.classList.remove('show');
    }, 2000);
  }

  updateURL(itemName) {
    const slug = itemName.toLowerCase().replace(/\s+/g, '-');
    const url = new URL(window.location);
    url.searchParams.set('item', slug);
    history.pushState(null, '', url.toString());
  }

  close() {
    appState.isModalOpen = false;
    appState.isSwiping = false;

    document.body.classList.remove('modal-open');
    this.cache.content.classList.remove('expand');
    this.cache.modal.classList.remove('show');

    document.documentElement.style.overflowY = 'scroll';

    // Clear URL
    const url = new URL(window.location);
    url.searchParams.delete('item');
    history.pushState(null, '', url.toString());
  }
}

// Initialize modal system
const modalSystem = new ModalSystem();

// Export for global access
window.modalCache = modalSystem.cache;
window.Modal = (event) => {
  const item = event.target.closest('.item');
  if (item) modalSystem.open({ element: item, name: item.getAttribute('data-title-name') });
};

// ============================================
// ITEM CREATION & CATALOG SYSTEM
// ============================================


class ItemFactory {
  constructor() {
    this.itemCount = 0;
  }

  create(data, color) {
    const item = document.createElement('div');
    item.classList.add('item', 'item-refresh-animate');
    item.id = this.getCategoryId(color);
    item.setAttribute('data-title-name', data.name);

    // Set outline for weekly star items
    if (data.weeklystar) {
      this.setWeeklyStarOutline(item, data['price/code/rarity']);
    }

    // Add badges
    this.addBadges(item, data, color);

    // Add content
    this.addItemContent(item, data, color);

    // Add pricing
    this.addPricing(item, data);

    // Add hidden data
    this.addHiddenData(item, data);

    // Add favorite button
    this.addFavoriteButton(item, data.name);

    // Add staff class if applicable
    if (data.from?.toLowerCase().includes('staff item')) {
      item.classList.add('staff');
    }


    return item;
  }

  getCategoryId(color) {
    const categoryMap = {
      'rgb(55, 122, 250)': 'pets',
      'rgb(255, 177, 53)': 'effects',
      'rgb(255, 122, 94)': 'deaths',
      'rgb(201, 96, 254)': 'titles',
      'rgb(91, 254, 106)': 'gears'
    };
    return categoryMap[color] || 'item';
  }

  setWeeklyStarOutline(item, priceCode) {
    const outlineColors = {
      '60': '#b31aff',
      '30': '#ff2a00',
      '15': '#fae351',
      '5': '#e0e6df'
    };

    Object.entries(outlineColors).forEach(([num, color]) => {
      if (priceCode?.toLowerCase().includes(num)) {
        item.style.outlineColor = color;
      }
    });
  }

  addBadges(item, data, color) {
    if (data.retired) {
      const retired = document.createElement('img');
      retired.className = 'retired';
      retired.style.cssText = `
        display: none;
        width: 17%;
        height: auto;
        position: sticky;
        margin-right: -73%;
        margin-top: -18px;
      `;
      retired.setAttribute('draggable', false);
      item.appendChild(retired);
    }

    if (data.premium) {
      const premium = document.createElement('img');
      premium.className = 'premium';
      premium.src = APP_CONFIG.icons.premium;
      premium.style.cssText = `
        width: 17%;
        height: auto;
        position: sticky;
        margin-right: -73%;
        margin-top: -18px;
      `;
      premium.setAttribute('draggable', false);
      item.appendChild(premium);
    }

    if (data.tradable === false) {
      const untradable = document.createElement('img');
      untradable.className = 'untradable';
      untradable.src = APP_CONFIG.icons.untradable;
      untradable.style.cssText = `
        width: 17%;
        height: auto;
        position: absolute;
        z-index: 100;
        bottom: 5px;
        ${data.premium ? 'left: 5px;' : 'right: 5px;'}
      `;
      untradable.setAttribute('draggable', false);
      item.appendChild(untradable);

      if (color === 'rgb(201, 96, 254)') {
        item.style.order = '1';
      }
    }

    if (data.new) {
      const canvas = this.createNewBadge();
      item.appendChild(canvas);
    }
  }

  createNewBadge() {
    const canvas = document.createElement('canvas');
    canvas.id = 'new-badge';
    canvas.style.cssText = `
      width: 50%;
      height: auto;
      position: absolute;
      top: 0;
      z-index: 9;
      left: 0;
      pointer-events: none;
    `;

    const ctx = canvas.getContext('2d');
    const img = new Image();
    img.onload = function () {
      canvas.width = img.width;
      canvas.height = img.height;
      ctx.drawImage(img, 0, 0);
    };
    img.src = './imgs/new.png';

    return canvas;
  }

  addItemContent(item, data, color) {
    // Add image if exists
    if (data.img) {
      const canvas = document.createElement('canvas');
      item.dataset.image = data.img;
      canvas.id = 'img';
      canvas.style.cssText = `
      max-width: 100%;
      max-height: 100%;
      display: block;
      margin: 0 auto;
      user-select: none;
      pointer-events: none;
      ${data.new ? 'padding-top: 9px;' : ''}
      ${color === 'rgb(201, 96, 254)' ? 'position: absolute;' : ''}
    `;

      const ctx = canvas.getContext('2d');
      const img = new Image();
      img.onload = function () {
        canvas.width = img.width;
        canvas.height = img.height;
        ctx.drawImage(img, 0, 0);
      };
      img.src = data.img;

      item.appendChild(canvas);
    }

    // Handle SVG titles (new format)
    if (data.svg) {
      item.innerHTML = data.svg;

      // Ensure SVG scales properly
      const svg = item.querySelector('svg');
      if (svg) {
        svg.style.width = '100%';
        svg.style.height = 'auto';
      }else {
      const name = this.createNameElement(data, color);
      item.appendChild(name);}

    }
  }

createNameElement(data, color) {
    const name = document.createElement('div');
    name.id = 'h3';
    name.innerText = data.name;

    if (data.new) {
      name.style.order = '-1';
      name.style.paddingTop = '0px';
    }

    // Hide name if has image and is title
    if (data.svg) {
      name.style.visibility = 'hidden';
    }

    return name;
  }

  addPricing(item, data) {
    const price = document.createElement('p');
    const formattedPrice = this.formatPrice(data.price);
    price.innerHTML = `<img src="./imgs/iZGLVYo.png" draggable="false">${formattedPrice}`;

    if (data.price === 'N/A' || data.price === '0' || data.price === '') price.style.display = 'none';

    item.appendChild(price);
  }

  formatPrice(price) {
    if (typeof price !== 'string' && typeof price !== 'number') return '';

    const num = parseInt(price, 10);
    if (num >= 1000) {
      return (num / 1000).toString().replace(/\.0$/, '') + 'k';
    }
    return price.toString();
  }

  addHiddenData(item, data) {
    item.setAttribute('description', data.from.replace(/<br>/g, '\n') || '');
    item.setAttribute('prc', data['price/code/rarity'].replace(/<br>/g, '\n') || '');
    item.setAttribute('price', data.price || 'N/A');
  }

  addFavoriteButton(item, itemName) {
    const heartBtn = document.createElement('div');
    heartBtn.className = 'heart-button';
    heartBtn.style.cssText = `
      position: absolute;
      top: -7px;
      right: -11px;
      z-index: 999;
      height: fit-content;
      font-size: 28px;
      font-family: Twemoji;
      cursor: pointer;
      user-select: none;
      border-radius: 50%;
      padding: 2px 6px;
      text-shadow: 0 2px 6px rgba(0,0,0,0.3);
      transition: opacity 0.2s ease, transform 0.2s ease;
    `;

    const isFavorited = appState.favorites.includes(itemName);
    if (isFavorited) {
      heartBtn.classList.add('favorited');
    }
    heartBtn.innerHTML = isFavorited ? '❤️' : '🤍';

    // Setup interaction
    if (APP_CONFIG.touch) {
      this.setupTouchFavorite(item, heartBtn, itemName);
    } else {
      this.setupClickFavorite(heartBtn, itemName);
    }

    item.appendChild(heartBtn);
  }

  setupTouchFavorite(item, button, itemName) {
    let touchTimer;
    let moved = false;
    let touchDownTime;

    item.addEventListener('touchstart', (e) => {
      moved = false;
      touchDownTime = Date.now();

      touchTimer = setTimeout(() => {
        e.stopPropagation();
        e.preventDefault();

        const isFavorited = appState.toggleFavorite(itemName);
        button.innerHTML = isFavorited ? '❤️' : '🤍';
        button.classList.toggle('favorited', isFavorited);
        button.classList.add('heart-pulsing');

        setTimeout(() => button.classList.remove('heart-pulsing'), 400);
      }, 400);
    });

    item.addEventListener('touchmove', () => {
      moved = true;
      clearTimeout(touchTimer);
    });

    item.addEventListener('touchend', (e) => {
      clearTimeout(touchTimer);

      if (moved) return;

      const duration = Date.now() - touchDownTime;
      if (duration < 400) {
        item.click();
      }

      e.stopPropagation();
      e.preventDefault();
    });
  }

  setupClickFavorite(button, itemName) {
    button.onclick = (e) => {
      e.stopPropagation();
      e.preventDefault();

      const isFavorited = appState.toggleFavorite(itemName);
      button.innerHTML = isFavorited ? '❤️' : '🤍';
      button.classList.toggle('favorited', isFavorited);
      button.classList.add('heart-pulsing');

      setTimeout(() => button.classList.remove('heart-pulsing'), 500);
    };

    button.addEventListener('mousedown', e => {
      e.stopPropagation();
      document.body.classList.add('pressing-heart');
    });

    button.addEventListener('mouseup', () => {
      document.body.classList.remove('pressing-heart');
    });

    button.addEventListener('mouseleave', () => {
      document.body.classList.remove('pressing-heart');
    });
  }
}

// ============================================
// CATALOG MANAGER
// ============================================

class CatalogManager {
  constructor(itemFactory) {
    this.itemFactory = itemFactory;
    this.grids = new Map();
  }

  populateGrid(gridId, items, limit = null) {
    const grid = document.getElementById(gridId);
    if (!grid) return;

    grid.innerHTML = '';

    const itemsToDisplay = limit ? items.slice(0, limit) : items;
    const fragment = document.createDocumentFragment();

    itemsToDisplay.forEach(item => {
      const element = this.itemFactory.create(item, item._color || APP_CONFIG.colors.gears);
      element.onclick = (event) => Modal(event);
      fragment.appendChild(element);
    });

    grid.appendChild(fragment);
    this.resizeToFit(grid);
  }

resizeToFit(grid) {
  const items = grid.querySelectorAll('.item #h3');
  
  // Prevent visual jump
  items.forEach(div => {
    if (!div) return;
    div.style.opacity = '0';
    div.style.transition = 'opacity 0.2s ease';
  });
  
  // Batch resize after next frame
  requestAnimationFrame(() => {
    items.forEach(div => {
      
      if (!div || !div.textContent) return;
      
      // Binary search (5x faster than your while loop)
      let low = 8, high = 20, optimal = 18;
      
      while (low <= high) {
        const mid = Math.floor((low + high) / 2);
        div.style.fontSize = `${mid}px`;
        console.log(optimal);
        if (div.scrollWidth <= 120) {
          
          optimal = mid;
          low = mid + 1;
        } else {
          high = mid - 1;
        }
      }
      
      div.style.fontSize = `${optimal}px`;
      div.style.opacity = '1';
    });
  });
}
  populateRandom(arr, colors) {
    const randomGrid = document.getElementById('random');
    if (!randomGrid) return;

    const categories = [
      { data: arr.gears, color: colors.gears },
      { data: arr.deaths, color: colors.deaths },
      { data: arr.titles, color: colors.titles },
      { data: arr.pets, color: colors.pets },
      { data: arr.effects, color: colors.effects }
    ];

    randomGrid.innerHTML = '';
    const fragment = document.createDocumentFragment();

    for (let i = 0; i < 4; i++) {
      const category = categories[Math.floor(Math.random() * categories.length)];
      const item = category.data[Math.floor(Math.random() * category.data.length)];

      const element = this.itemFactory.create(item, category.color);
      element.onclick = (event) => Modal(event);
      fragment.appendChild(element);
    }

    randomGrid.appendChild(fragment);
    this.resizeToFit(randomGrid);
  }

  filterFavorites() {
    const items = document.querySelectorAll('.item');
    const btn = document.getElementById('favorite-toggle');

    if (!appState.showingFavoritesOnly) {
      items.forEach(item => {
        const name = item.getAttribute('data-title-name');
        item.style.display = appState.favorites.includes(name) ? 'flex' : 'none';
      });
      if (btn) btn.textContent = '🔁 Show All';
      appState.showingFavoritesOnly = true;
    } else {
      items.forEach(item => item.style.display = 'flex');
      if (btn) btn.textContent = '❤️ Show Favorites';
      appState.showingFavoritesOnly = false;
    }
  }

  setupLazyLoading(data, colors) {
    const observer = new IntersectionObserver((entries, obs) => {
      entries.forEach(entry => {
        if (!entry.isIntersecting) return;

        const gridId = entry.target.id;
        const categoryMap = {
          gears: { data: data.gears, color: colors.gears },
          deaths: { data: data.deaths, color: colors.deaths },
          titles: { data: data.titles, color: colors.titles },
          pets: { data: data.pets, color: colors.pets },
          effects: { data: data.effects, color: colors.effects }
        };

        const page = window.location.pathname.split('/').pop() || 'index';

        if (gridId === 'random') {
          this.populateRandom(data, colors);
        } else if (gridId === 'ctlg') {
          // Handle catalog page
          let items = data;
          let color = 'rgb(0, 0, 0)';

          const pageName = page.replace('.html', '');
          if (pageName in categoryMap) {
            items = categoryMap[pageName].data;
            color = categoryMap[pageName].color;
          }

          const itemsWithColor = Array.isArray(items)
            ? items.map(item => ({ ...item, _color: color }))
            : Object.values(items).flat().map(item => ({ ...item, _color: color }));

          this.populateGrid(gridId, itemsWithColor);
        } else {
          // Handle filtered grids
          const filteredItems = Object.entries(colors).flatMap(([key, catColor]) =>
            (data[key]?.filter(item => item[gridId] === true) || [])
              .map(item => ({ ...item, _color: catColor }))
          );

          this.populateGrid(gridId, filteredItems);
        }

        if (entry.target.children.length === 0) {
          entry.target.parentElement.style.display = 'none';
        }

        obs.unobserve(entry.target);
      });
    }, { rootMargin: '100px' });

    document.querySelectorAll('.catalog-grid').forEach(grid => observer.observe(grid));
  }
}

// ============================================
// INITIALIZATION
// ============================================

const itemFactory = new ItemFactory();
const catalogManager = new CatalogManager(itemFactory);

// Export for global access
window.catalogManager = catalogManager;
window.filterFavorites = () => catalogManager.filterFavorites();


// ============================================
// SEARCH SYSTEM
// ============================================

class SearchSystem {
  constructor() {
    this.fuse = null;
    this.searchInput = null;
    this.resultsContainer = null;
    this.activeIndex = -1;
    this.itemList = [];
  }

  init(itemList, defaultColor) {
    this.itemList = itemList;
    this.searchInput = document.getElementById('search-bar');
    this.resultsContainer = document.getElementById('search-results');

    if (!this.searchInput || !this.resultsContainer) return;

    // Initialize Fuse.js
    this.fuse = new Fuse(itemList, {
      keys: ['name'],
      threshold: 0.3,
    });

    this.setupEventListeners();
  }

  setupEventListeners() {
    this.searchInput.addEventListener('input', () => this.handleSearch());
    this.searchInput.addEventListener('focus', () => this.handleSearch());
    this.searchInput.addEventListener('keydown', (e) => this.handleKeyNavigation(e));

    document.addEventListener('click', (e) => {
      if (!this.searchInput.contains(e.target) && !this.resultsContainer.contains(e.target)) {
        this.clearResults();
      }
    });
  }

  handleSearch() {
    const query = this.searchInput.value.trim();
    this.clearResults();
    this.activeIndex = -1;

    if (!query) {
      this.showSearchHistory();
      return;
    }

    const results = this.fuse.search(query).slice(0, 6);
    this.displayResults(results);
  }

  displayResults(results) {
    const fragment = document.createDocumentFragment();

    results.forEach(result => {
      const item = result.item;
      const div = this.createResultItem(item);

      div.addEventListener('click', () => {
        this.selectItem(item);
      });

      fragment.appendChild(div);
    });

    this.resultsContainer.appendChild(fragment);
  }

  createResultItem(item, isHistory = false) {
    const div = document.createElement('div');
    div.className = 'search-item';
    div.textContent = isHistory ? `↩ ${item.name}` : item.name;

    Object.assign(div.style, {
      textShadow: '-2px -2px 0 #000, 0 -2px 0 #000, 2px -2px 0 #000, 2px 0 0 #000, 2px 2px 0 #000, 0 2px 0 #000, -2px 2px 0 #000, -2px 0 0 #000',
      padding: '8px 14px',
      cursor: 'pointer',
      borderBottom: '1px solid #333',
      whiteSpace: 'nowrap',
      backgroundColor: item._color || APP_CONFIG.colors.gears
    });

    div.addEventListener('mouseenter', () => {
      const rgb = this.parseColor(item._color);
      if (rgb) {
        div.style.backgroundColor = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.8)`;
      } else {
        div.style.backgroundColor = '#444';
      }
    });

    div.addEventListener('mouseleave', () => {
      div.style.backgroundColor = item._color || APP_CONFIG.colors.gears;
    });

    return div;
  }

  parseColor(color) {
    if (!color) return null;
    const match = color.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
    if (match) {
      return { r: match[1], g: match[2], b: match[3] };
    }
    return null;
  }

  showSearchHistory() {
    const fragment = document.createDocumentFragment();

    appState.searchHistory.forEach(name => {
      const item = this.itemList.find(i => i.name === name);
      if (!item) return;

      const div = this.createResultItem(item, true);
      div.addEventListener('click', () => {
        this.selectItem(item);
      });

      fragment.appendChild(div);
    });

    this.resultsContainer.appendChild(fragment);
  }

  selectItem(item) {
    this.searchInput.value = item.name;
    this.clearResults();
    appState.saveSearchHistory(item.name);
    this.showSelectedItem(item);
  }

  showSelectedItem(item) {
    // Clear existing items
    document.querySelectorAll('#itemlist .item').forEach(el => el.remove());

    // Create and show new item
    const element = itemFactory.create(item, item._color);
    element.onclick = (event) => {
      modalSystem.open({ element, name: item.name });
    };

    const itemList = document.getElementById('itemlist');
    if (itemList) {
      itemList.appendChild(element);
      element.click();
    }
  }

  handleKeyNavigation(e) {
    const items = this.resultsContainer.querySelectorAll('.search-item');

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        this.activeIndex = (this.activeIndex + 1) % items.length;
        break;
      case 'ArrowUp':
        e.preventDefault();
        this.activeIndex = (this.activeIndex - 1 + items.length) % items.length;
        break;
      case 'Enter':
        e.preventDefault();
        if (this.searchInput.value.trim() === 'dev') {
          window.location.href = 'https://emwiki.site/admin';
          return;
        }

        if (this.activeIndex === -1 && items.length > 0) {
          this.activeIndex = 0;
        }
        items[this.activeIndex].click();

        break;
      case 'Escape':
        this.clearResults();
        this.searchInput.blur();
        return;
      default:
        return;
    }

    items.forEach((item, i) => {
      item.classList.toggle('active', i === this.activeIndex);
      if (i === this.activeIndex) {
        item.style.filter = 'brightness(0.8)';
      } else {
        item.style.filter = '';
      }
    });
  }

  clearResults() {
    this.resultsContainer.innerHTML = '';
    this.activeIndex = -1;
  }
}

// ============================================
// NAVIGATION SYSTEM
// ============================================

class NavigationSystem {
  constructor() {
    this.navButtons = [
      { id: 'gearstab', href: './gears', img: './imgs/AYUbTJv.png' },
      { id: 'deathstab', href: './deaths', img: './imgs/fADZwOh.png' },
      { id: 'petstab', href: './pets', img: './imgs/GHXB0nC.png' },
      { id: 'effectstab', href: './effects', img: './imgs/l90cgxf.png' },
      { id: 'titlestab', href: './titles', img: './imgs/ZOP8l9g.png' },
      { id: 'cheststab', href: './chests', img: './imgs/XwkWVJJ.png' },
      { id: 'scammerstab', href: './scammers', img: './imgs/SK5csOS.png' },
      { id: 'gamenightstab', href: './gamenights', img: './imgs/gn.png' }
    ];
  }

  init() {
    this.insertNavButtons();
    this.setupRefreshButton();
  }

  insertNavButtons() {
    const nav = document.querySelector('nav');
    if (!nav) return;

    let current = location.pathname.split('/').pop();
    if (!current || current === '') current = 'index';

    nav.innerHTML = this.navButtons
      .filter(btn => !btn.href.endsWith(current.replace('.html', '')))
      .map(btn => `
        <a id="${btn.id}" href="${btn.href}">
          <img src="${btn.img}" style="max-width: -webkit-fill-available;" draggable="false" onmousedown="return false">
        </a>
      `).join('\n');
  }

  setupRefreshButton() {
    const refreshBtn = document.getElementById('refresh-button');
    if (!refreshBtn) return;

    refreshBtn.onclick = () => {
      // Animate refresh icon
      const icon = refreshBtn.children[0];
      if (icon) {
        icon.style.animation = '';
        icon.style.webkitAnimation = '';

        setTimeout(() => {
          icon.style.animation = 'rotate 0.7s ease-in-out 0s 1 alternate';
          icon.style.webkitAnimation = 'rotate 0.7s ease-in-out 0s 1 alternate';
        }, 50);
      }

      // Refresh random grid
      if (window._randomArr && window._randomCategoryColors) {
        catalogManager.populateRandom(window._randomArr, window._randomCategoryColors);
      }
    };
  }
}

// ============================================
// INTRO ANIMATION SYSTEM
// ============================================

class IntroAnimationSystem {
  constructor() {
    this.hasShownToday = false;
  }

  init() {
    const today = new Date().toISOString().split('T')[0];
    const lastShown = localStorage.getItem('lastShownDate');
    this.hasShownToday = lastShown === today;

    if (this.hasShownToday) {
      this.skipIntro();
    } else {
      this.playIntro();
      localStorage.setItem('lastShownDate', today);
    }

    this.setupRandomLogo();
  }

  skipIntro() {
    const intro = document.querySelector('.intro');
    const header = document.querySelector('.headersheet');
    const main = document.querySelector('main');

    if (!intro || !header || !main) return;

    window.scrollTo(0, 0);
    document.body.classList.add('fonts-loaded');

    intro.style.transition = '0.5s';
    intro.style.backdropFilter = 'blur(0px)';
    intro.style.filter = 'opacity(0) blur(9px)';
    intro.style.top = '-100vh';

    header.style.opacity = '1';
    main.style.scale = '1';
    main.style.filter = 'opacity(1)';

    document.documentElement.style.overflow = 'scroll';
    document.documentElement.style.overflowX = 'hidden';

    const parallaxBg = document.querySelector('.parallax-bg');
    if (parallaxBg) {
      parallaxBg.style.transition = APP_CONFIG.touch
        ? 'transform 0.1s ease-out, opacity 0.2s ease'
        : 'none';
      parallaxBg.style.backgroundSize = 'cover';
    }
  }

  playIntro() {
    const intro = document.querySelector('.intro');
    const logoSpans = document.querySelectorAll('.logo');
    const logo3 = document.querySelector('.logo3');
    const header = document.querySelector('.headersheet');
    const main = document.querySelector('main');
    const credit = document.querySelector('.credit');

    if (!intro || !header || !main) return;

    window.scrollTo(0, 0);

    document.fonts.ready.then(() => {
      if (credit) credit.style.color = '#ffffffb0';

      setTimeout(() => {
        window.scrollTo(0, 0);

        // Activate logos
        logoSpans.forEach((span, idx) => {
          setTimeout(() => {
            span.classList.add('active');
            if (logo3) logo3.classList.add('active');
            document.body.classList.add('fonts-loaded');
          }, (idx + 1) * 400);
        });

        if (credit) credit.style.color = '#000000b0';

        // Fade logos
        setTimeout(() => {
          logoSpans.forEach((span, idx) => {
            setTimeout(() => {
              span.classList.remove('active');
              span.classList.add('fade');
              if (logo3) {
                logo3.classList.remove('active');
                logo3.classList.add('fade');
              }
            }, (idx + 1) * 20);
          });
        }, 2100);

        // Complete animation
        setTimeout(() => {
          intro.style.transition = '0.5s';
          intro.style.backdropFilter = 'blur(0px)';
          intro.style.filter = 'opacity(0) blur(9px)';
          document.documentElement.style.overflow = 'scroll';
          document.documentElement.style.overflowX = 'hidden';
          if (credit) credit.style.color = '#ffffffb0';
        }, 2440);

        setTimeout(() => {
          intro.style.top = '-100vh';
          header.style.opacity = '1';
          main.style.scale = '1';
          main.style.filter = 'opacity(1)';
        }, 2800);

        // Setup parallax
        setTimeout(() => {
          const parallaxBg = document.querySelector('.parallax-bg');
          if (parallaxBg) {
            parallaxBg.style.transition = APP_CONFIG.touch
              ? 'transform 0.1s ease-out, opacity 0.2s ease'
              : 'none';
          }
        }, 3700);
      });
    });
  }

  setupRandomLogo() {
    const logos = [document.querySelector('.logo3'), document.querySelector('.logo4')];
    const random = Math.random();

    let imgSrc = './imgs/XRmpB1c.png';
    if (random > 0.97) imgSrc = './imgs/burrito.png';
    else if (random > 0.93) imgSrc = './imgs/tran.webp';
    else if (random > 0.87) imgSrc = './imgs/o7IJiwl.png';

    logos.forEach(logo => {
      if (logo) logo.src = imgSrc;
    });

    localStorage.setItem('ranimg', imgSrc);
  }
}

// ============================================
// UTILITIES
// ============================================

function slugify(text) {
  return text.toLowerCase().replace(/\s+/g, '-');
}

function openModalFromURL(itemList) {
  const params = new URLSearchParams(window.location.search);
  let itemSlug = params.get('item');
  if (!itemSlug) return;

  itemSlug = decodeURIComponent(decodeURIComponent(itemSlug));

  const foundItem = itemList.find(item => {
    const name = item.name || '';
    return slugify(name) === itemSlug;
  });

  if (foundItem) {
    searchSystem.showSelectedItem(foundItem);
  }
}

async function fetchData() {
  try {
    const res = await fetch('https://emwiki.site/api/gist-version');
    if (!res.ok) throw new Error('Failed to fetch data');
    const data = await res.json();
    return JSON.parse(data.files?.['auto.json']?.content);
  } catch (error) {
    console.error('Error fetching data:', error);
    return null;
  }
}


// ============================================
// MAIN APPLICATION INITIALIZATION
// ============================================

const searchSystem = new SearchSystem();
const navigationSystem = new NavigationSystem();
const introAnimation = new IntroAnimationSystem();

async function initializeApp() {
  try {
    // Initialize navigation
    navigationSystem.init();

    // Initialize intro animation
    introAnimation.init();

    // Fetch data
    const data = await fetchData();
    if (!data) return;

    window._randomArr = data;
    window._randomCategoryColors = APP_CONFIG.colors;

    // Prepare flat item list
    const flatItemList = Object.entries(APP_CONFIG.colors).flatMap(([key, color]) =>
      (data[key] || []).map(item => ({ ...item, _color: color }))
    );

    // Initialize search
    searchSystem.init(flatItemList, APP_CONFIG.colors.gears);

    // Setup lazy loading
    catalogManager.setupLazyLoading(data, APP_CONFIG.colors);

    // Handle URL parameters
    window.addEventListener('popstate', () => {
      openModalFromURL(flatItemList);
    });

    // Check for initial URL item
    openModalFromURL(flatItemList);

    // Add touch class if needed
    if (APP_CONFIG.touch) {
      document.body.classList.add('is-touch');
    }

    // Setup item count display
    const itemCount = document.getElementById('zd');
    if (itemCount) {
      const observer = new MutationObserver(() => {
        const count = document.querySelectorAll('#ctlg .item').length;
        itemCount.textContent = `${count} item${count === 1 ? '' : 's'}`;
      });

      const catalog = document.getElementById('ctlg');
      if (catalog) {
        observer.observe(catalog, { childList: true, subtree: true });
      }
    }

  } catch (error) {
    console.error('Failed to initialize app:', error);
  }
}

// Start the application
document.addEventListener('DOMContentLoaded', initializeApp);

// Export necessary functions for global access
window.slugify = slugify;
window.searchSystem = searchSystem;