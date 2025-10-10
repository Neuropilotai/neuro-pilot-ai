/**
 * Inventory Count Manager
 * Handles location sequencing and inventory counting workflows
 */

class InventoryCountManager {
    constructor() {
        this.locations = [];
        this.currentCount = null;
        this.countSequence = [];
        this.init();
    }

    async init() {
        await this.loadLocations();
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
                // Sort locations by sequence number
                this.locations.sort((a, b) => (a.sequence || 999) - (b.sequence || 999));
            }
        } catch (error) {
            console.error('Error loading locations:', error);
        }
    }

    setupEventListeners() {
        // Listen for sequence management buttons
        document.addEventListener('click', (e) => {
            if (e.target.classList.contains('manage-sequence-btn')) {
                this.showSequenceManager();
            }

            if (e.target.classList.contains('start-count-btn')) {
                this.startInventoryCount();
            }

            if (e.target.classList.contains('location-sequence-btn')) {
                const locationId = e.target.dataset.locationId;
                this.editLocationSequence(locationId);
            }
        });
    }

    showSequenceManager() {
        const modal = document.createElement('div');
        modal.className = 'sequence-modal';
        modal.innerHTML = `
            <div class="modal-content large">
                <div class="modal-header">
                    <h3>Location Sequence Manager</h3>
                    <button class="close-modal">&times;</button>
                </div>
                <div class="modal-body">
                    <div class="sequence-info">
                        <p>Drag and drop locations to reorder them for efficient inventory counting.</p>
                        <p>The sequence determines the order locations appear during inventory counts.</p>
                    </div>

                    <div class="sequence-container">
                        <div class="sequence-list" id="sequenceList">
                            ${this.locations.map((loc, index) => `
                                <div class="sequence-item"
                                     draggable="true"
                                     data-location-id="${loc.locationId}"
                                     data-sequence="${loc.sequence || index}">
                                    <div class="drag-handle">
                                        <i class="fas fa-grip-vertical"></i>
                                    </div>
                                    <div class="sequence-number">${index + 1}</div>
                                    <div class="location-details">
                                        <div class="location-name">${loc.name}</div>
                                        <div class="location-meta">
                                            <span class="location-type">${loc.type}</span>
                                            <span class="location-zone">Zone: ${loc.zone || 'N/A'}</span>
                                            <span class="location-aisle">Aisle: ${loc.aisle || 'N/A'}</span>
                                            <span class="location-shelf">Shelf: ${loc.shelf || 'N/A'}</span>
                                        </div>
                                    </div>
                                    <div class="location-stats">
                                        <div class="stat-item">
                                            <span class="stat-label">Items:</span>
                                            <span class="stat-value">${loc.itemCount || 0}</span>
                                        </div>
                                        <div class="stat-item">
                                            <span class="stat-label">Capacity:</span>
                                            <span class="stat-value">${loc.currentStock || 0}/${loc.capacity || 100}</span>
                                        </div>
                                    </div>
                                    <div class="location-actions">
                                        <button class="btn-icon edit-location" data-location-id="${loc.locationId}">
                                            <i class="fas fa-edit"></i>
                                        </button>
                                    </div>
                                </div>
                            `).join('')}
                        </div>

                        <div class="sequence-sidebar">
                            <h4>Quick Actions</h4>
                            <button class="btn btn-secondary" id="sortByZone">
                                <i class="fas fa-layer-group"></i> Sort by Zone
                            </button>
                            <button class="btn btn-secondary" id="sortByType">
                                <i class="fas fa-warehouse"></i> Sort by Type
                            </button>
                            <button class="btn btn-secondary" id="sortByAisle">
                                <i class="fas fa-road"></i> Sort by Aisle
                            </button>
                            <button class="btn btn-secondary" id="reverseOrder">
                                <i class="fas fa-exchange-alt"></i> Reverse Order
                            </button>

                            <hr>

                            <h4>Grouping Options</h4>
                            <div class="grouping-options">
                                <label>
                                    <input type="checkbox" id="groupByZone"> Group by Zone
                                </label>
                                <label>
                                    <input type="checkbox" id="groupByType"> Group by Type
                                </label>
                                <label>
                                    <input type="checkbox" id="groupByAisle"> Group by Aisle
                                </label>
                            </div>

                            <hr>

                            <h4>Count Path Preview</h4>
                            <div class="path-preview" id="pathPreview">
                                <canvas id="pathCanvas" width="200" height="200"></canvas>
                            </div>
                        </div>
                    </div>
                </div>
                <div class="modal-footer">
                    <button class="btn btn-cancel">Cancel</button>
                    <button class="btn btn-primary" id="saveSequence">Save Sequence</button>
                </div>
            </div>
        `;

        document.body.appendChild(modal);
        this.initializeDragAndDrop(modal);
        this.setupSequenceActions(modal);
        this.drawPathPreview(modal);

        // Handle close
        modal.querySelector('.close-modal').addEventListener('click', () => {
            document.body.removeChild(modal);
        });

        modal.querySelector('.btn-cancel').addEventListener('click', () => {
            document.body.removeChild(modal);
        });

        // Handle save
        modal.querySelector('#saveSequence').addEventListener('click', async () => {
            await this.saveSequence(modal);
            document.body.removeChild(modal);
        });
    }

    initializeDragAndDrop(modal) {
        const list = modal.querySelector('#sequenceList');
        let draggedElement = null;

        list.addEventListener('dragstart', (e) => {
            if (e.target.classList.contains('sequence-item')) {
                draggedElement = e.target;
                e.target.classList.add('dragging');
                e.dataTransfer.effectAllowed = 'move';
            }
        });

        list.addEventListener('dragend', (e) => {
            if (e.target.classList.contains('sequence-item')) {
                e.target.classList.remove('dragging');
            }
        });

        list.addEventListener('dragover', (e) => {
            e.preventDefault();
            const afterElement = this.getDragAfterElement(list, e.clientY);
            if (afterElement == null) {
                list.appendChild(draggedElement);
            } else {
                list.insertBefore(draggedElement, afterElement);
            }
            this.updateSequenceNumbers(modal);
            this.drawPathPreview(modal);
        });
    }

    getDragAfterElement(container, y) {
        const draggableElements = [...container.querySelectorAll('.sequence-item:not(.dragging)')];

        return draggableElements.reduce((closest, child) => {
            const box = child.getBoundingClientRect();
            const offset = y - box.top - box.height / 2;

            if (offset < 0 && offset > closest.offset) {
                return { offset: offset, element: child };
            } else {
                return closest;
            }
        }, { offset: Number.NEGATIVE_INFINITY }).element;
    }

    updateSequenceNumbers(modal) {
        const items = modal.querySelectorAll('.sequence-item');
        items.forEach((item, index) => {
            item.querySelector('.sequence-number').textContent = index + 1;
            item.dataset.sequence = index;
        });
    }

    setupSequenceActions(modal) {
        // Sort by Zone
        modal.querySelector('#sortByZone').addEventListener('click', () => {
            this.sortLocations(modal, 'zone');
        });

        // Sort by Type
        modal.querySelector('#sortByType').addEventListener('click', () => {
            this.sortLocations(modal, 'type');
        });

        // Sort by Aisle
        modal.querySelector('#sortByAisle').addEventListener('click', () => {
            this.sortLocations(modal, 'aisle');
        });

        // Reverse Order
        modal.querySelector('#reverseOrder').addEventListener('click', () => {
            const list = modal.querySelector('#sequenceList');
            const items = Array.from(list.children);
            items.reverse();
            list.innerHTML = '';
            items.forEach(item => list.appendChild(item));
            this.updateSequenceNumbers(modal);
            this.drawPathPreview(modal);
        });

        // Edit location details
        modal.addEventListener('click', (e) => {
            if (e.target.closest('.edit-location')) {
                const locationId = e.target.closest('.edit-location').dataset.locationId;
                this.editLocationDetails(locationId);
            }
        });
    }

    sortLocations(modal, sortBy) {
        const list = modal.querySelector('#sequenceList');
        const items = Array.from(list.children);

        items.sort((a, b) => {
            const aLoc = this.locations.find(l => l.locationId === a.dataset.locationId);
            const bLoc = this.locations.find(l => l.locationId === b.dataset.locationId);

            let aValue = aLoc[sortBy] || '';
            let bValue = bLoc[sortBy] || '';

            // Secondary sort by name if primary values are equal
            if (aValue === bValue) {
                return aLoc.name.localeCompare(bLoc.name);
            }

            return aValue.toString().localeCompare(bValue.toString());
        });

        list.innerHTML = '';
        items.forEach(item => list.appendChild(item));
        this.updateSequenceNumbers(modal);
        this.drawPathPreview(modal);
    }

    drawPathPreview(modal) {
        const canvas = modal.querySelector('#pathCanvas');
        if (!canvas) return;

        const ctx = canvas.getContext('2d');
        const items = modal.querySelectorAll('.sequence-item');

        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // Draw warehouse layout grid
        ctx.strokeStyle = '#333';
        ctx.lineWidth = 0.5;
        for (let i = 0; i <= 10; i++) {
            const x = (canvas.width / 10) * i;
            const y = (canvas.height / 10) * i;
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x, canvas.height);
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(canvas.width, y);
            ctx.stroke();
        }

        // Draw path between locations
        ctx.strokeStyle = '#667eea';
        ctx.lineWidth = 2;
        ctx.setLineDash([5, 3]);
        ctx.beginPath();

        items.forEach((item, index) => {
            const loc = this.locations.find(l => l.locationId === item.dataset.locationId);
            if (loc) {
                // Simple positioning based on zone/aisle
                const x = ((index % 5) + 1) * (canvas.width / 6);
                const y = (Math.floor(index / 5) + 1) * (canvas.height / 6);

                if (index === 0) {
                    ctx.moveTo(x, y);
                } else {
                    ctx.lineTo(x, y);
                }

                // Draw location dot
                ctx.save();
                ctx.fillStyle = index === 0 ? '#43e97b' : '#667eea';
                ctx.beginPath();
                ctx.arc(x, y, 4, 0, Math.PI * 2);
                ctx.fill();
                ctx.restore();
            }
        });

        ctx.stroke();
        ctx.setLineDash([]);
    }

    editLocationDetails(locationId) {
        const location = this.locations.find(l => l.locationId === locationId);
        if (!location) return;

        const editModal = document.createElement('div');
        editModal.className = 'sequence-modal';
        editModal.innerHTML = `
            <div class="modal-content">
                <div class="modal-header">
                    <h3>Edit Location Details: ${location.name}</h3>
                    <button class="close-modal">&times;</button>
                </div>
                <div class="modal-body">
                    <div class="form-group">
                        <label for="locZone">Zone:</label>
                        <input type="text" id="locZone" value="${location.zone || ''}" placeholder="e.g., A, B, C">
                    </div>
                    <div class="form-group">
                        <label for="locAisle">Aisle:</label>
                        <input type="text" id="locAisle" value="${location.aisle || ''}" placeholder="e.g., 1, 2, 3">
                    </div>
                    <div class="form-group">
                        <label for="locShelf">Shelf:</label>
                        <input type="text" id="locShelf" value="${location.shelf || ''}" placeholder="e.g., Top, Middle, Bottom">
                    </div>
                    <div class="form-group">
                        <label for="locBin">Bin/Position:</label>
                        <input type="text" id="locBin" value="${location.bin || ''}" placeholder="e.g., A1, B2, C3">
                    </div>
                    <div class="form-group">
                        <label for="locNotes">Notes:</label>
                        <textarea id="locNotes" rows="3">${location.notes || ''}</textarea>
                    </div>
                </div>
                <div class="modal-footer">
                    <button class="btn btn-cancel">Cancel</button>
                    <button class="btn btn-primary" id="saveLocationDetails">Save</button>
                </div>
            </div>
        `;

        document.body.appendChild(editModal);

        // Handle close
        editModal.querySelector('.close-modal').addEventListener('click', () => {
            document.body.removeChild(editModal);
        });

        editModal.querySelector('.btn-cancel').addEventListener('click', () => {
            document.body.removeChild(editModal);
        });

        // Handle save
        editModal.querySelector('#saveLocationDetails').addEventListener('click', async () => {
            location.zone = editModal.querySelector('#locZone').value;
            location.aisle = editModal.querySelector('#locAisle').value;
            location.shelf = editModal.querySelector('#locShelf').value;
            location.bin = editModal.querySelector('#locBin').value;
            location.notes = editModal.querySelector('#locNotes').value;

            await this.updateLocationDetails(location);
            document.body.removeChild(editModal);

            // Refresh the sequence manager if it's open
            const sequenceModal = document.querySelector('.sequence-modal');
            if (sequenceModal && !sequenceModal.contains(editModal)) {
                document.body.removeChild(sequenceModal);
                this.showSequenceManager();
            }
        });
    }

    async updateLocationDetails(location) {
        try {
            const token = localStorage.getItem('token');
            const response = await fetch(`/api/locations/${location.locationId}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify(location)
            });

            if (response.ok) {
                this.showNotification('Location details updated', 'success');
                await this.loadLocations();
            }
        } catch (error) {
            console.error('Error updating location:', error);
            this.showNotification('Failed to update location', 'error');
        }
    }

    async saveSequence(modal) {
        const items = modal.querySelectorAll('.sequence-item');
        const sequence = Array.from(items).map((item, index) => ({
            locationId: item.dataset.locationId,
            sequence: index
        }));

        try {
            const token = localStorage.getItem('token');
            const response = await fetch('/api/locations/sequence', {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ sequence })
            });

            if (response.ok) {
                this.showNotification('Location sequence updated successfully', 'success');
                await this.loadLocations();
            }
        } catch (error) {
            console.error('Error saving sequence:', error);
            this.showNotification('Failed to save sequence', 'error');
        }
    }

    startInventoryCount() {
        const modal = document.createElement('div');
        modal.className = 'count-modal';
        modal.innerHTML = `
            <div class="modal-content large">
                <div class="modal-header">
                    <h3>Start Inventory Count</h3>
                    <button class="close-modal">&times;</button>
                </div>
                <div class="modal-body">
                    <div class="count-options">
                        <h4>Select Count Type:</h4>
                        <div class="count-type-grid">
                            <div class="count-type-card" data-type="full">
                                <i class="fas fa-clipboard-check"></i>
                                <h5>Full Count</h5>
                                <p>Count all items in all locations</p>
                            </div>
                            <div class="count-type-card" data-type="cycle">
                                <i class="fas fa-sync"></i>
                                <h5>Cycle Count</h5>
                                <p>Count selected locations or categories</p>
                            </div>
                            <div class="count-type-card" data-type="spot">
                                <i class="fas fa-search-location"></i>
                                <h5>Spot Check</h5>
                                <p>Quick verification of specific items</p>
                            </div>
                        </div>
                    </div>

                    <div class="count-settings" style="display: none;">
                        <h4>Count Settings:</h4>
                        <div class="form-group">
                            <label>
                                <input type="checkbox" id="followSequence" checked>
                                Follow location sequence
                            </label>
                        </div>
                        <div class="form-group">
                            <label>
                                <input type="checkbox" id="blindCount">
                                Blind count (hide current quantities)
                            </label>
                        </div>
                        <div class="form-group">
                            <label>
                                <input type="checkbox" id="requireVerification">
                                Require verification for discrepancies
                            </label>
                        </div>
                        <div class="form-group">
                            <label for="countTeam">Count Team:</label>
                            <input type="text" id="countTeam" placeholder="Enter team member names">
                        </div>
                    </div>

                    <div class="location-selection" style="display: none;">
                        <h4>Select Locations to Count:</h4>
                        <div class="location-checklist">
                            ${this.locations.map(loc => `
                                <label class="location-check">
                                    <input type="checkbox" value="${loc.locationId}" checked>
                                    <span>${loc.name} (${loc.type})</span>
                                </label>
                            `).join('')}
                        </div>
                    </div>
                </div>
                <div class="modal-footer">
                    <button class="btn btn-cancel">Cancel</button>
                    <button class="btn btn-primary" id="beginCount" style="display: none;">Begin Count</button>
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        // Handle count type selection
        modal.querySelectorAll('.count-type-card').forEach(card => {
            card.addEventListener('click', () => {
                modal.querySelectorAll('.count-type-card').forEach(c => c.classList.remove('selected'));
                card.classList.add('selected');

                const type = card.dataset.type;
                modal.querySelector('.count-settings').style.display = 'block';

                if (type === 'cycle' || type === 'spot') {
                    modal.querySelector('.location-selection').style.display = 'block';
                } else {
                    modal.querySelector('.location-selection').style.display = 'none';
                }

                modal.querySelector('#beginCount').style.display = 'inline-block';
            });
        });

        // Handle close
        modal.querySelector('.close-modal').addEventListener('click', () => {
            document.body.removeChild(modal);
        });

        modal.querySelector('.btn-cancel').addEventListener('click', () => {
            document.body.removeChild(modal);
        });

        // Handle begin count
        modal.querySelector('#beginCount').addEventListener('click', () => {
            const countType = modal.querySelector('.count-type-card.selected').dataset.type;
            const settings = {
                type: countType,
                followSequence: modal.querySelector('#followSequence').checked,
                blindCount: modal.querySelector('#blindCount').checked,
                requireVerification: modal.querySelector('#requireVerification').checked,
                team: modal.querySelector('#countTeam').value,
                locations: []
            };

            if (countType === 'cycle' || countType === 'spot') {
                modal.querySelectorAll('.location-check input:checked').forEach(checkbox => {
                    settings.locations.push(checkbox.value);
                });
            } else {
                settings.locations = this.locations.map(l => l.locationId);
            }

            document.body.removeChild(modal);
            this.beginInventoryCount(settings);
        });
    }

    beginInventoryCount(settings) {
        // Store count settings
        this.currentCount = {
            ...settings,
            startTime: new Date(),
            currentIndex: 0,
            counts: {},
            discrepancies: []
        };

        // Open count interface
        this.openCountInterface();
    }

    openCountInterface() {
        // This would open a dedicated counting interface
        // For now, showing a notification
        this.showNotification('Inventory count started', 'success');

        // In a complete implementation, this would:
        // 1. Show a dedicated counting UI
        // 2. Guide through each location in sequence
        // 3. Allow quantity entry for each item
        // 4. Track discrepancies
        // 5. Generate count report
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
    window.inventoryCountManager = new InventoryCountManager();
});

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = InventoryCountManager;
}