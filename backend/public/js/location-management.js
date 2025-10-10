/**
 * Location Management System for Inventory
 * Handles moving items between locations and multi-location tracking
 */

class LocationManager {
    constructor() {
        this.locations = [];
        this.inventoryItems = [];
        this.init();
    }

    async init() {
        await this.loadLocations();
        await this.loadInventory();
        this.setupEventListeners();
    }

    async loadLocations() {
        try {
            const token = localStorage.getItem('token');
            const response = await fetch('/api/locations', {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            if (response.ok) {
                const data = await response.json();
                this.locations = data.locations || [];
                console.log('Locations loaded:', this.locations);
            }
        } catch (error) {
            console.error('Error loading locations:', error);
        }
    }

    async loadInventory() {
        try {
            const token = localStorage.getItem('token');
            const response = await fetch('/api/inventory', {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            if (response.ok) {
                const data = await response.json();
                this.inventoryItems = data.items || [];
            }
        } catch (error) {
            console.error('Error loading inventory:', error);
        }
    }

    setupEventListeners() {
        // Listen for move location button clicks
        document.addEventListener('click', (e) => {
            if (e.target.classList.contains('move-location-btn')) {
                const itemCode = e.target.dataset.itemCode;
                const currentLocation = e.target.dataset.currentLocation;
                this.showMoveDialog(itemCode, currentLocation);
            }

            if (e.target.classList.contains('split-location-btn')) {
                const itemCode = e.target.dataset.itemCode;
                this.showSplitDialog(itemCode);
            }
        });
    }

    showMoveDialog(itemCode, currentLocation) {
        const item = this.inventoryItems.find(i => i.itemCode === itemCode);
        if (!item) return;

        const modal = document.createElement('div');
        modal.className = 'location-modal';
        modal.innerHTML = `
            <div class="modal-content">
                <div class="modal-header">
                    <h3>Move Item to Location</h3>
                    <button class="close-modal">&times;</button>
                </div>
                <div class="modal-body">
                    <div class="item-info">
                        <h4>${item.description}</h4>
                        <p>Item Code: ${itemCode}</p>
                        <p>Current Location: ${currentLocation || 'Unassigned'}</p>
                        <p>Quantity: ${item.quantity} ${item.unitOfMeasure || 'units'}</p>
                    </div>

                    <div class="location-form">
                        <label for="new-location">Select New Location:</label>
                        <select id="new-location" class="location-select">
                            <option value="">-- Select Location --</option>
                            ${this.locations.map(loc => `
                                <option value="${loc.locationId}"
                                    ${loc.locationId === currentLocation ? 'disabled' : ''}
                                    data-capacity="${loc.capacity}"
                                    data-type="${loc.type}">
                                    ${loc.name} (${loc.type}) - Available: ${loc.capacity - loc.currentStock}
                                </option>
                            `).join('')}
                        </select>

                        <div class="move-options">
                            <label>
                                <input type="radio" name="move-type" value="all" checked>
                                Move all ${item.quantity} ${item.unitOfMeasure || 'units'}
                            </label>
                            <label>
                                <input type="radio" name="move-type" value="partial">
                                Move partial quantity
                            </label>
                        </div>

                        <div id="partial-quantity" style="display: none;">
                            <label for="move-quantity">Quantity to move:</label>
                            <input type="number" id="move-quantity" min="1" max="${item.quantity}" value="1">
                        </div>

                        <div class="location-notes">
                            <label for="move-notes">Notes (optional):</label>
                            <textarea id="move-notes" rows="2"></textarea>
                        </div>
                    </div>
                </div>
                <div class="modal-footer">
                    <button class="btn btn-cancel">Cancel</button>
                    <button class="btn btn-primary" id="confirm-move">Move Item</button>
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        // Handle move type selection
        modal.querySelectorAll('input[name="move-type"]').forEach(radio => {
            radio.addEventListener('change', (e) => {
                const partialDiv = modal.querySelector('#partial-quantity');
                partialDiv.style.display = e.target.value === 'partial' ? 'block' : 'none';
            });
        });

        // Handle close
        modal.querySelector('.close-modal').addEventListener('click', () => {
            document.body.removeChild(modal);
        });

        modal.querySelector('.btn-cancel').addEventListener('click', () => {
            document.body.removeChild(modal);
        });

        // Handle confirm move
        modal.querySelector('#confirm-move').addEventListener('click', async () => {
            const newLocation = modal.querySelector('#new-location').value;
            const moveType = modal.querySelector('input[name="move-type"]:checked').value;
            const quantity = moveType === 'all' ? item.quantity :
                            parseInt(modal.querySelector('#move-quantity').value);
            const notes = modal.querySelector('#move-notes').value;

            if (!newLocation) {
                alert('Please select a destination location');
                return;
            }

            await this.moveItem(itemCode, currentLocation, newLocation, quantity, notes);
            document.body.removeChild(modal);
        });
    }

    showSplitDialog(itemCode) {
        const item = this.inventoryItems.find(i => i.itemCode === itemCode);
        if (!item) return;

        const modal = document.createElement('div');
        modal.className = 'location-modal';
        modal.innerHTML = `
            <div class="modal-content">
                <div class="modal-header">
                    <h3>Split Item Across Locations</h3>
                    <button class="close-modal">&times;</button>
                </div>
                <div class="modal-body">
                    <div class="item-info">
                        <h4>${item.description}</h4>
                        <p>Item Code: ${itemCode}</p>
                        <p>Total Quantity: ${item.quantity} ${item.unitOfMeasure || 'units'}</p>
                    </div>

                    <div class="split-form">
                        <div id="location-splits">
                            <div class="split-row">
                                <select class="location-select">
                                    <option value="">-- Select Location --</option>
                                    ${this.locations.map(loc => `
                                        <option value="${loc.locationId}">
                                            ${loc.name} (${loc.type})
                                        </option>
                                    `).join('')}
                                </select>
                                <input type="number" class="split-quantity" min="1" placeholder="Quantity">
                                <button class="remove-split" style="display: none;">Remove</button>
                            </div>
                        </div>

                        <button class="btn btn-secondary" id="add-split">+ Add Another Location</button>

                        <div class="split-summary">
                            <p>Total allocated: <span id="total-allocated">0</span> / ${item.quantity}</p>
                            <p class="warning" id="split-warning" style="display: none;">
                                Total allocation must equal ${item.quantity}
                            </p>
                        </div>
                    </div>
                </div>
                <div class="modal-footer">
                    <button class="btn btn-cancel">Cancel</button>
                    <button class="btn btn-primary" id="confirm-split">Split Item</button>
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        // Handle add split
        modal.querySelector('#add-split').addEventListener('click', () => {
            const splitsContainer = modal.querySelector('#location-splits');
            const newRow = splitsContainer.querySelector('.split-row').cloneNode(true);
            newRow.querySelector('.split-quantity').value = '';
            newRow.querySelector('.remove-split').style.display = 'inline-block';
            splitsContainer.appendChild(newRow);

            this.updateSplitTotal(modal, item.quantity);
        });

        // Handle remove split
        modal.addEventListener('click', (e) => {
            if (e.target.classList.contains('remove-split')) {
                e.target.parentElement.remove();
                this.updateSplitTotal(modal, item.quantity);
            }
        });

        // Handle quantity changes
        modal.addEventListener('input', (e) => {
            if (e.target.classList.contains('split-quantity')) {
                this.updateSplitTotal(modal, item.quantity);
            }
        });

        // Handle close
        modal.querySelector('.close-modal').addEventListener('click', () => {
            document.body.removeChild(modal);
        });

        modal.querySelector('.btn-cancel').addEventListener('click', () => {
            document.body.removeChild(modal);
        });

        // Handle confirm split
        modal.querySelector('#confirm-split').addEventListener('click', async () => {
            const splits = [];
            modal.querySelectorAll('.split-row').forEach(row => {
                const location = row.querySelector('.location-select').value;
                const quantity = parseInt(row.querySelector('.split-quantity').value) || 0;
                if (location && quantity > 0) {
                    splits.push({ location, quantity });
                }
            });

            const totalAllocated = splits.reduce((sum, s) => sum + s.quantity, 0);
            if (totalAllocated !== item.quantity) {
                modal.querySelector('#split-warning').style.display = 'block';
                return;
            }

            await this.splitItem(itemCode, splits);
            document.body.removeChild(modal);
        });
    }

    updateSplitTotal(modal, maxQuantity) {
        const quantities = Array.from(modal.querySelectorAll('.split-quantity'))
            .map(input => parseInt(input.value) || 0);
        const total = quantities.reduce((sum, q) => sum + q, 0);

        modal.querySelector('#total-allocated').textContent = total;
        const warning = modal.querySelector('#split-warning');
        warning.style.display = total !== maxQuantity ? 'block' : 'none';
    }

    async moveItem(itemCode, fromLocation, toLocation, quantity, notes) {
        try {
            const token = localStorage.getItem('token');
            const response = await fetch('/api/inventory/move', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    itemCode,
                    fromLocation,
                    toLocation,
                    quantity,
                    notes
                })
            });

            if (response.ok) {
                this.showNotification('Item moved successfully', 'success');
                await this.loadInventory();
                // Refresh the inventory display
                if (window.loadInventory) {
                    window.loadInventory();
                }
            } else {
                const error = await response.json();
                this.showNotification(error.message || 'Failed to move item', 'error');
            }
        } catch (error) {
            console.error('Error moving item:', error);
            this.showNotification('Failed to move item', 'error');
        }
    }

    async splitItem(itemCode, splits) {
        try {
            const token = localStorage.getItem('token');
            const response = await fetch('/api/inventory/split', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    itemCode,
                    splits
                })
            });

            if (response.ok) {
                this.showNotification('Item split across locations successfully', 'success');
                await this.loadInventory();
                // Refresh the inventory display
                if (window.loadInventory) {
                    window.loadInventory();
                }
            } else {
                const error = await response.json();
                this.showNotification(error.message || 'Failed to split item', 'error');
            }
        } catch (error) {
            console.error('Error splitting item:', error);
            this.showNotification('Failed to split item', 'error');
        }
    }

    showNotification(message, type) {
        const notification = document.createElement('div');
        notification.className = `notification ${type}`;
        notification.textContent = message;
        document.body.appendChild(notification);

        setTimeout(() => {
            notification.classList.add('show');
        }, 10);

        setTimeout(() => {
            notification.classList.remove('show');
            setTimeout(() => {
                document.body.removeChild(notification);
            }, 300);
        }, 3000);
    }
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    window.locationManager = new LocationManager();
});

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = LocationManager;
}