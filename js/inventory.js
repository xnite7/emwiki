// Inventory Manager
class InventoryManager {
    constructor() {
        this.inventory = [];
        this.apiBase = 'https://emwiki.com/api/trades';
        this.currentUser = null;
        this.init();
    }

    async init() {
        // Check if user is logged in
        const sessionToken = localStorage.getItem('sessionToken');
        if (!sessionToken) {
            window.location.href = '/trading';
            return;
        }

        if (window.Auth) {
            this.currentUser = await window.Auth.checkAuth();
        }

        if (!this.currentUser) {
            window.location.href = '/trading';
            return;
        }

        await this.loadInventory();
        this.renderInventory();
    }

    async loadInventory() {
        try {
            const headers = await this.getAuthHeaders();
            const response = await fetch(`${this.apiBase}/inventory`, { headers });

            if (!response.ok) throw new Error('Failed to load inventory');

            const data = await response.json();
            this.inventory = data.inventory || [];
        } catch (error) {
            console.error('Error loading inventory:', error);
            if (window.Utils) {
                Utils.showToast('Error', 'Failed to load inventory', 'error');
            }
        }
    }

    renderInventory() {
        const grid = document.getElementById('inventory-grid');
        if (!grid) return;

        if (this.inventory.length === 0) {
            grid.innerHTML = `
                <div class="empty-state">
                    <div class="empty-state-icon">📦</div>
                    <h2>No Items Yet</h2>
                    <p>Add items to your inventory to start trading!</p>
                    <button class="add-item-btn" onclick="inventoryManager.openAddItemModal()">
                        Add Your First Item
                    </button>
                </div>
            `;
            return;
        }

        grid.innerHTML = '';
        this.inventory.forEach(item => {
            grid.appendChild(this.createInventoryCard(item));
        });
    }

    createInventoryCard(item) {
        const card = document.createElement('div');
        card.className = 'inventory-item';
        card.innerHTML = `
            <img class="item-image" src="${item.item_image || './imgs/placeholder.png'}" alt="${item.item_name}">
            <div class="item-info">
                <h3>${item.item_name}</h3>
                <div class="item-meta">
                    <span class="item-quantity">Quantity: ${item.quantity || 1}</span>
                    <div class="trade-toggle">
                        <label class="toggle-switch">
                            <input type="checkbox" ${item.for_trade ? 'checked' : ''} onchange="inventoryManager.toggleForTrade(${item.id}, this.checked)">
                            <span class="toggle-slider"></span>
                        </label>
                        <label>For Trade</label>
                    </div>
                </div>
                <div class="item-actions">
                    <button class="item-action-btn btn-edit" onclick="inventoryManager.editItem(${item.id})">Edit</button>
                    <button class="item-action-btn btn-delete" onclick="inventoryManager.deleteItem(${item.id})">Delete</button>
                </div>
            </div>
        `;
        return card;
    }

    async toggleForTrade(itemId, forTrade) {
        try {
            const headers = await this.getAuthHeaders();
            const response = await fetch(`${this.apiBase}/inventory/${itemId}`, {
                method: 'PUT',
                headers,
                body: JSON.stringify({ for_trade: forTrade })
            });

            if (!response.ok) throw new Error('Failed to update item');

            if (window.Utils) {
                Utils.showToast('Success', forTrade ? 'Item marked for trade' : 'Item unmarked for trade', 'success');
            }

            await this.loadInventory();
        } catch (error) {
            console.error('Error updating item:', error);
            if (window.Utils) {
                Utils.showToast('Error', 'Failed to update item', 'error');
            }
        }
    }

    openAddItemModal() {
        const modal = this.createModal('Add Item to Inventory', `
            <form id="add-item-form" class="trade-form">
                <div class="form-group">
                    <label>Item Name</label>
                    <input type="text" name="item_name" placeholder="e.g., Omega Sword" required>
                </div>

                <div class="form-group">
                    <label>Item Image URL (Optional)</label>
                    <input type="text" name="item_image" placeholder="https://...">
                </div>

                <div class="form-group">
                    <label>Quantity</label>
                    <input type="number" name="quantity" value="1" min="1" required>
                </div>

                <div class="form-group">
                    <label class="checkbox-label">
                        <input type="checkbox" name="for_trade" checked>
                        <span>Available for trading</span>
                    </label>
                </div>

                <div class="form-actions">
                    <button type="button" class="btn-secondary" onclick="inventoryManager.closeModal()">Cancel</button>
                    <button type="submit" class="btn-primary">Add Item</button>
                </div>
            </form>
        `);

        document.body.appendChild(modal);

        const form = document.getElementById('add-item-form');
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            await this.handleAddItem(form);
        });
    }

    async handleAddItem(form) {
        const formData = new FormData(form);
        const itemData = {
            item_name: formData.get('item_name'),
            item_image: formData.get('item_image') || null,
            quantity: parseInt(formData.get('quantity')),
            for_trade: formData.get('for_trade') === 'on'
        };

        try {
            const headers = await this.getAuthHeaders();
            const response = await fetch(`${this.apiBase}/inventory`, {
                method: 'POST',
                headers,
                body: JSON.stringify(itemData)
            });

            if (!response.ok) throw new Error('Failed to add item');

            if (window.Utils) {
                Utils.showToast('Success', 'Item added to inventory!', 'success');
            }

            this.closeModal();
            await this.loadInventory();
            this.renderInventory();
        } catch (error) {
            console.error('Error adding item:', error);
            if (window.Utils) {
                Utils.showToast('Error', error.message, 'error');
            }
        }
    }

    async editItem(itemId) {
        const item = this.inventory.find(i => i.id === itemId);
        if (!item) return;

        const modal = this.createModal('Edit Item', `
            <form id="edit-item-form" class="trade-form">
                <div class="form-group">
                    <label>Item Name</label>
                    <input type="text" name="item_name" value="${item.item_name}" required>
                </div>

                <div class="form-group">
                    <label>Item Image URL (Optional)</label>
                    <input type="text" name="item_image" value="${item.item_image || ''}">
                </div>

                <div class="form-group">
                    <label>Quantity</label>
                    <input type="number" name="quantity" value="${item.quantity}" min="1" required>
                </div>

                <div class="form-group">
                    <label class="checkbox-label">
                        <input type="checkbox" name="for_trade" ${item.for_trade ? 'checked' : ''}>
                        <span>Available for trading</span>
                    </label>
                </div>

                <div class="form-actions">
                    <button type="button" class="btn-secondary" onclick="inventoryManager.closeModal()">Cancel</button>
                    <button type="submit" class="btn-primary">Update Item</button>
                </div>
            </form>
        `);

        document.body.appendChild(modal);

        const form = document.getElementById('edit-item-form');
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            await this.handleEditItem(itemId, form);
        });
    }

    async handleEditItem(itemId, form) {
        const formData = new FormData(form);
        const itemData = {
            item_name: formData.get('item_name'),
            item_image: formData.get('item_image') || null,
            quantity: parseInt(formData.get('quantity')),
            for_trade: formData.get('for_trade') === 'on'
        };

        try {
            const headers = await this.getAuthHeaders();
            const response = await fetch(`${this.apiBase}/inventory/${itemId}`, {
                method: 'PUT',
                headers,
                body: JSON.stringify(itemData)
            });

            if (!response.ok) throw new Error('Failed to update item');

            if (window.Utils) {
                Utils.showToast('Success', 'Item updated!', 'success');
            }

            this.closeModal();
            await this.loadInventory();
            this.renderInventory();
        } catch (error) {
            console.error('Error updating item:', error);
            if (window.Utils) {
                Utils.showToast('Error', error.message, 'error');
            }
        }
    }

    async deleteItem(itemId) {
        if (!confirm('Are you sure you want to delete this item?')) return;

        try {
            const headers = await this.getAuthHeaders();
            const response = await fetch(`${this.apiBase}/inventory/${itemId}`, {
                method: 'DELETE',
                headers
            });

            if (!response.ok) throw new Error('Failed to delete item');

            if (window.Utils) {
                Utils.showToast('Success', 'Item deleted', 'success');
            }

            await this.loadInventory();
            this.renderInventory();
        } catch (error) {
            console.error('Error deleting item:', error);
            if (window.Utils) {
                Utils.showToast('Error', 'Failed to delete item', 'error');
            }
        }
    }

    async getAuthHeaders() {
        const sessionToken = localStorage.getItem('sessionToken');
        return {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${sessionToken}`
        };
    }

    createModal(title, content) {
        const modal = document.createElement('div');
        modal.className = 'modal-overlay';
        modal.innerHTML = `
            <div class="modal-content">
                <div class="modal-header">
                    <h2>${title}</h2>
                    <button class="modal-close" onclick="inventoryManager.closeModal()">×</button>
                </div>
                <div class="modal-body">
                    ${content}
                </div>
            </div>
        `;

        modal.addEventListener('click', (e) => {
            if (e.target === modal) this.closeModal();
        });

        return modal;
    }

    closeModal() {
        const modal = document.querySelector('.modal-overlay');
        if (modal) modal.remove();
    }
}

// Initialize
const inventoryManager = new InventoryManager();
