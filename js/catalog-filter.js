// ============================================
// UNIFIED CATALOG FILTERING SYSTEM
// ============================================

class UnifiedCatalogManager {
  constructor() {
    this.allItems = [];
    this.filteredItems = [];
    this.currentCategory = 'all';
    this.searchTerm = '';
    this.itemFactory = null;
    this.fuse = null;
  }

  async init() {
    try {
      // Initialize item factory (reuse existing)
      this.itemFactory = window.itemFactory || new ItemFactory();
      
      // Load data
      await this.loadData();
      
      // Setup event listeners
      this.setupEventListeners();
      
      // Initial render
      this.filterAndRender();
      
    } catch (error) {
      console.error('Failed to initialize unified catalog:', error);
    }
  }

  async loadData() {
    try {
      // Try local data first for development
      try {
        const localResponse = await fetch('./items.json');
        if (localResponse.ok) {
          const data = await localResponse.json();
          this.processData(data);
          return;
        }
      } catch (localError) {
        console.log('Local data not available, trying remote...');
      }

      // Fallback to remote API
      const response = await fetch('https://emwiki.site/api/gist-version');
      if (!response.ok) throw new Error('Remote API failed');
      
      const data = await response.json();
      const itemsData = JSON.parse(data.files?.['auto.json']?.content);
      this.processData(itemsData);
      
    } catch (error) {
      console.error('Error loading data:', error);
      // Show error message to user
      const container = document.getElementById('itemlist');
      if (container) {
        container.innerHTML = '<div style="text-align: center; padding: 40px; color: #666;">Failed to load items. Please check your connection and try again.</div>';
      }
    }
  }

  processData(data) {
    // Convert categorized data to flat array with category info
    this.allItems = [];
    
    const categoryColors = {
      gears: "rgb(91, 254, 106)",
      deaths: "rgb(255, 122, 94)", 
      pets: "rgb(55, 122, 250)",
      effects: "rgb(255, 177, 53)",
      titles: "rgb(201, 96, 254)"
    };

    Object.entries(data).forEach(([category, items]) => {
      if (Array.isArray(items)) {
        items.forEach(item => {
          this.allItems.push({
            ...item,
            category: category,
            _color: categoryColors[category] || "rgb(91, 254, 106)"
          });
        });
      }
    });

    // Initialize search functionality (fallback if Fuse.js not available)
    if (window.Fuse) {
      this.fuse = new Fuse(this.allItems, {
        keys: ['name', 'from'],
        threshold: 0.3,
        includeScore: true
      });
    } else {
      // Simple search fallback
      this.fuse = {
        search: (term) => {
          const lowercaseTerm = term.toLowerCase();
          return this.allItems
            .filter(item => 
              item.name.toLowerCase().includes(lowercaseTerm) ||
              (item.from && item.from.toLowerCase().includes(lowercaseTerm))
            )
            .map(item => ({ item }));
        }
      };
    }

    console.log(`Loaded ${this.allItems.length} items across ${Object.keys(data).length} categories`);
  }

  setupEventListeners() {
    // Category filter
    const categoryFilter = document.getElementById('category-filter');
    if (categoryFilter) {
      categoryFilter.addEventListener('change', (e) => {
        this.currentCategory = e.target.value;
        this.filterAndRender();
      });
    }

    // Search functionality
    const searchBar = document.getElementById('search-bar');
    if (searchBar) {
      searchBar.addEventListener('input', (e) => {
        this.searchTerm = e.target.value.trim();
        this.filterAndRender();
      });
    }
  }

  filterAndRender() {
    // Start with all items
    let filtered = [...this.allItems];

    // Apply category filter
    if (this.currentCategory !== 'all') {
      filtered = filtered.filter(item => item.category === this.currentCategory);
    }

    // Apply search filter
    if (this.searchTerm) {
      const searchResults = this.fuse.search(this.searchTerm);
      const searchItemNames = new Set(searchResults.map(result => result.item.name));
      filtered = filtered.filter(item => searchItemNames.has(item.name));
    }

    this.filteredItems = filtered;
    this.renderItems();
    this.updateItemCount();
  }

  renderItems() {
    const container = document.getElementById('itemlist');
    if (!container) return;

    // Clear existing items
    container.innerHTML = '';

    // Create document fragment for better performance
    const fragment = document.createDocumentFragment();

    this.filteredItems.forEach(item => {
      const element = this.itemFactory.create(item, item._color);
      element.onclick = (event) => {
        if (window.Modal) {
          window.Modal(event);
        }
      };
      fragment.appendChild(element);
    });

    container.appendChild(fragment);

    // Apply tilt effects if available
    if (window.VanillaTilt && !APP_CONFIG?.touch) {
      VanillaTilt.init(container.querySelectorAll(".item"), {
        max: 10,
        speed: 500,
        perspective: 1800,
        glare: true,
        "max-glare": 0.1,
        scale: 1.03,
        reset: true
      });
    }
  }

  updateItemCount() {
    const countElement = document.getElementById('zd');
    if (countElement) {
      const count = this.filteredItems.length;
      countElement.textContent = `${count} item${count === 1 ? '' : 's'}`;
    }
  }

  // Method to get items by category (for backwards compatibility)
  getItemsByCategory(category) {
    return this.allItems.filter(item => item.category === category);
  }
}

// Initialize when DOM is ready
let unifiedCatalog = null;

document.addEventListener('DOMContentLoaded', async () => {
  // Only initialize on catalog page
  if (window.location.pathname.includes('catalog') || document.getElementById('category-filter')) {
    unifiedCatalog = new UnifiedCatalogManager();
    await unifiedCatalog.init();
  }
});

// Export for global access
window.unifiedCatalog = unifiedCatalog;

// Legacy function for backwards compatibility
window.filterItems = function() {
  if (unifiedCatalog) {
    const searchBar = document.getElementById('search-bar');
    if (searchBar) {
      unifiedCatalog.searchTerm = searchBar.value.trim();
      unifiedCatalog.filterAndRender();
    }
  }
};