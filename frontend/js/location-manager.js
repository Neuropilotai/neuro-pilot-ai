/**
 * Location Manager Frontend Component
 * Bilingual support with stock number lookup and sequencing
 */

import { getLang, t } from './i18n.js';

// Extended translations for location manager
const LOCATION_I18N = {
  en: {
    location_manager: 'Location Manager',
    add_by_stock: 'Add by Stock Number',
    stock_number: 'Stock Number',
    location: 'Location',
    sequence: 'Sequence',
    quantity: 'Quantity',
    add_item: 'Add Item',
    search_placeholder: 'Enter stock number or name...',
    bulk_assign: 'Bulk Assign',
    items_in_location: 'Items in Location',
    no_items: 'No items in this location',
    update_sequence: 'Update Sequence',
    remove_from_location: 'Remove from Location',
    select_locations: 'Select Locations',
    apply_to_all: 'Apply to All Selected',
    item_added: 'Item added successfully',
    item_removed: 'Item removed successfully',
    sequence_updated: 'Sequence updated successfully',
    error_adding: 'Error adding item',
    error_removing: 'Error removing item',
    loading: 'Loading...',
    select_multiple: 'Select multiple locations (Ctrl+Click)',
    auto_sequence: 'Auto-sequence items',
    sequence_by_category: 'Sequence by Category',
    sequence_by_name: 'Sequence by Name',
    print_location: 'Print Location List',
    export_csv: 'Export to CSV'
  },
  fr: {
    location_manager: 'Gestionnaire d\'emplacements',
    add_by_stock: 'Ajouter par numéro de stock',
    stock_number: 'Numéro de stock',
    location: 'Emplacement',
    sequence: 'Séquence',
    quantity: 'Quantité',
    add_item: 'Ajouter l\'article',
    search_placeholder: 'Entrez le numéro de stock ou le nom...',
    bulk_assign: 'Attribution en masse',
    items_in_location: 'Articles dans l\'emplacement',
    no_items: 'Aucun article dans cet emplacement',
    update_sequence: 'Mettre à jour la séquence',
    remove_from_location: 'Retirer de l\'emplacement',
    select_locations: 'Sélectionner les emplacements',
    apply_to_all: 'Appliquer à tous les sélectionnés',
    item_added: 'Article ajouté avec succès',
    item_removed: 'Article retiré avec succès',
    sequence_updated: 'Séquence mise à jour avec succès',
    error_adding: 'Erreur lors de l\'ajout de l\'article',
    error_removing: 'Erreur lors du retrait de l\'article',
    loading: 'Chargement...',
    select_multiple: 'Sélectionner plusieurs emplacements (Ctrl+Clic)',
    auto_sequence: 'Séquencer automatiquement',
    sequence_by_category: 'Séquencer par catégorie',
    sequence_by_name: 'Séquencer par nom',
    print_location: 'Imprimer la liste',
    export_csv: 'Exporter en CSV'
  }
};

// Get localized text
function lt(key) {
  const lang = getLang();
  return LOCATION_I18N[lang]?.[key] || LOCATION_I18N.en[key] || key;
}

class LocationManager {
  constructor(containerEl) {
    this.container = containerEl;
    this.currentLocation = null;
    this.searchResults = [];
    this.selectedLocations = new Set();
    this.locationItems = [];
    this.init();
  }

  init() {
    this.render();
    this.attachEventListeners();
    this.loadLocations();
  }

  render() {
    this.container.innerHTML = `
      <div class="location-manager">
        <h2>${lt('location_manager')}</h2>
        
        <!-- Add Item Section -->
        <div class="add-item-section card">
          <h3>${lt('add_by_stock')}</h3>
          <div class="form-row">
            <div class="form-group">
              <label>${lt('stock_number')}</label>
              <input type="text" id="stock-search" placeholder="${lt('search_placeholder')}" autocomplete="off">
              <div id="search-results" class="search-dropdown"></div>
            </div>
            <div class="form-group">
              <label>${lt('location')}</label>
              <select id="location-select">
                <option value="">-- ${lt('location')} --</option>
              </select>
            </div>
            <div class="form-group small">
              <label>${lt('sequence')}</label>
              <input type="number" id="sequence-input" value="999" min="1">
            </div>
            <div class="form-group small">
              <label>${lt('quantity')}</label>
              <input type="number" id="quantity-input" value="1" min="1">
            </div>
            <button id="add-item-btn" class="btn btn-primary">${lt('add_item')}</button>
          </div>
        </div>

        <!-- Bulk Operations -->
        <div class="bulk-operations card">
          <h3>${lt('bulk_assign')}</h3>
          <div class="form-row">
            <div class="form-group">
              <label>${lt('select_locations')}</label>
              <select id="bulk-locations" multiple size="5">
              </select>
              <small>${lt('select_multiple')}</small>
            </div>
            <div class="form-group">
              <button id="bulk-add-btn" class="btn btn-secondary">${lt('apply_to_all')}</button>
              <button id="auto-sequence-btn" class="btn btn-secondary">${lt('auto_sequence')}</button>
            </div>
          </div>
        </div>

        <!-- Current Location Items -->
        <div class="location-items card">
          <div class="card-header">
            <h3>${lt('items_in_location')}: <span id="current-location-name">--</span></h3>
            <div class="actions">
              <button id="print-location-btn" class="btn btn-small">${lt('print_location')}</button>
              <button id="export-csv-btn" class="btn btn-small">${lt('export_csv')}</button>
            </div>
          </div>
          <div id="location-items-list" class="items-list">
            <div class="empty-state">${lt('no_items')}</div>
          </div>
        </div>
      </div>

      <style>
        .location-manager {
          padding: 20px;
          max-width: 1400px;
          margin: 0 auto;
        }
        .card {
          background: white;
          border-radius: 8px;
          padding: 20px;
          margin-bottom: 20px;
          box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }
        .card-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 15px;
        }
        .form-row {
          display: flex;
          gap: 15px;
          align-items: flex-end;
          flex-wrap: wrap;
        }
        .form-group {
          flex: 1;
          min-width: 150px;
        }
        .form-group.small {
          flex: 0.5;
          min-width: 80px;
        }
        .form-group label {
          display: block;
          margin-bottom: 5px;
          font-weight: 500;
          color: #333;
        }
        .form-group input,
        .form-group select {
          width: 100%;
          padding: 8px;
          border: 1px solid #ddd;
          border-radius: 4px;
          font-size: 14px;
        }
        .form-group select[multiple] {
          padding: 4px;
        }
        .form-group small {
          display: block;
          margin-top: 4px;
          color: #666;
          font-size: 12px;
        }
        .search-dropdown {
          position: absolute;
          top: 100%;
          left: 0;
          right: 0;
          background: white;
          border: 1px solid #ddd;
          border-top: none;
          border-radius: 0 0 4px 4px;
          max-height: 200px;
          overflow-y: auto;
          display: none;
          z-index: 1000;
        }
        .search-dropdown.active {
          display: block;
        }
        .search-item {
          padding: 8px 12px;
          cursor: pointer;
          border-bottom: 1px solid #f0f0f0;
        }
        .search-item:hover {
          background: #f5f5f5;
        }
        .search-item .item-name {
          font-weight: 500;
        }
        .search-item .item-details {
          font-size: 12px;
          color: #666;
        }
        .btn {
          padding: 8px 16px;
          border: none;
          border-radius: 4px;
          cursor: pointer;
          font-size: 14px;
          transition: background 0.2s;
        }
        .btn-primary {
          background: #007bff;
          color: white;
        }
        .btn-primary:hover {
          background: #0056b3;
        }
        .btn-secondary {
          background: #6c757d;
          color: white;
        }
        .btn-secondary:hover {
          background: #545b62;
        }
        .btn-small {
          padding: 4px 8px;
          font-size: 12px;
        }
        .items-list {
          min-height: 200px;
        }
        .item-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 12px;
          border-bottom: 1px solid #f0f0f0;
          transition: background 0.2s;
        }
        .item-row:hover {
          background: #f9f9f9;
        }
        .item-info {
          flex: 1;
        }
        .item-name {
          font-weight: 500;
          margin-bottom: 4px;
        }
        .item-details {
          font-size: 12px;
          color: #666;
        }
        .item-actions {
          display: flex;
          gap: 10px;
          align-items: center;
        }
        .sequence-input-inline {
          width: 60px;
          padding: 4px;
          border: 1px solid #ddd;
          border-radius: 3px;
          text-align: center;
        }
        .empty-state {
          text-align: center;
          padding: 40px;
          color: #999;
        }
        .actions {
          display: flex;
          gap: 10px;
        }
      </style>
    `;
  }

  attachEventListeners() {
    // Stock search
    const searchInput = document.getElementById('stock-search');
    searchInput.addEventListener('input', (e) => this.handleSearch(e.target.value));
    
    // Add item button
    document.getElementById('add-item-btn').addEventListener('click', () => this.addItem());
    
    // Location select
    document.getElementById('location-select').addEventListener('change', (e) => {
      this.currentLocation = e.target.value;
      this.loadLocationItems();
    });
    
    // Bulk operations
    document.getElementById('bulk-add-btn').addEventListener('click', () => this.bulkAddItems());
    document.getElementById('auto-sequence-btn').addEventListener('click', () => this.autoSequence());
    
    // Export buttons
    document.getElementById('print-location-btn').addEventListener('click', () => this.printLocation());
    document.getElementById('export-csv-btn').addEventListener('click', () => this.exportCSV());
  }

  async handleSearch(query) {
    if (!query || query.length < 2) {
      document.getElementById('search-results').classList.remove('active');
      return;
    }

    try {
      const response = await fetch(`/api/location/search/${encodeURIComponent(query)}`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });
      
      const data = await response.json();
      if (data.success) {
        this.displaySearchResults(data.results);
      }
    } catch (error) {
      console.error('Search error:', error);
    }
  }

  displaySearchResults(results) {
    const dropdown = document.getElementById('search-results');
    
    if (results.length === 0) {
      dropdown.innerHTML = `<div class="search-item">${lt('no_items')}</div>`;
    } else {
      dropdown.innerHTML = results.map(item => `
        <div class="search-item" data-stock="${item.stockNumber}" data-name="${item.name}">
          <div class="item-name">${item.name}</div>
          <div class="item-details">
            ${lt('stock_number')}: ${item.stockNumber} | 
            ${item.category} | 
            ${item.currentQuantity} ${item.unit}
          </div>
        </div>
      `).join('');
      
      // Add click handlers
      dropdown.querySelectorAll('.search-item').forEach(el => {
        el.addEventListener('click', () => {
          document.getElementById('stock-search').value = el.dataset.stock;
          dropdown.classList.remove('active');
        });
      });
    }
    
    dropdown.classList.add('active');
  }

  async addItem() {
    const stockNumber = document.getElementById('stock-search').value;
    const locationId = document.getElementById('location-select').value;
    const sequence = parseInt(document.getElementById('sequence-input').value) || 999;
    const quantity = parseInt(document.getElementById('quantity-input').value) || 1;

    if (!stockNumber || !locationId) {
      alert(lt('error_adding'));
      return;
    }

    try {
      const response = await fetch('/api/location/add-by-stock-number', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({ stockNumber, locationId, sequence, quantity })
      });

      const data = await response.json();
      if (data.success) {
        this.showMessage(lt('item_added'), 'success');
        this.loadLocationItems();
        // Clear form
        document.getElementById('stock-search').value = '';
        document.getElementById('sequence-input').value = '999';
        document.getElementById('quantity-input').value = '1';
      } else {
        this.showMessage(data.error || lt('error_adding'), 'error');
      }
    } catch (error) {
      console.error('Error adding item:', error);
      this.showMessage(lt('error_adding'), 'error');
    }
  }

  async loadLocations() {
    try {
      const response = await fetch('/api/location/locations/summary', {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });
      
      const data = await response.json();
      if (data.success) {
        this.updateLocationSelects(data.locations);
      }
    } catch (error) {
      console.error('Error loading locations:', error);
    }
  }

  updateLocationSelects(locations) {
    const singleSelect = document.getElementById('location-select');
    const multiSelect = document.getElementById('bulk-locations');
    
    // Add default locations if none exist
    const defaultLocations = [
      'freezer-1', 'freezer-2', 'cooler-1', 'cooler-2', 
      'dry-storage-1', 'dry-storage-2', 'prep-area'
    ];
    
    const allLocations = [...new Set([
      ...locations.map(l => l.locationId),
      ...defaultLocations
    ])];
    
    singleSelect.innerHTML = `<option value="">-- ${lt('location')} --</option>` +
      allLocations.map(loc => `<option value="${loc}">${loc}</option>`).join('');
    
    multiSelect.innerHTML = allLocations.map(loc => 
      `<option value="${loc}">${loc}</option>`
    ).join('');
  }

  async loadLocationItems() {
    if (!this.currentLocation) return;
    
    try {
      const response = await fetch(`/api/location/location/${encodeURIComponent(this.currentLocation)}`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });
      
      const data = await response.json();
      if (data.success) {
        this.displayLocationItems(data.items);
      }
    } catch (error) {
      console.error('Error loading location items:', error);
    }
  }

  displayLocationItems(items) {
    const container = document.getElementById('location-items-list');
    document.getElementById('current-location-name').textContent = this.currentLocation || '--';
    
    if (!items || items.length === 0) {
      container.innerHTML = `<div class="empty-state">${lt('no_items')}</div>`;
      return;
    }
    
    container.innerHTML = items.map(item => `
      <div class="item-row" data-item-id="${item.itemId}">
        <div class="item-info">
          <div class="item-name">${item.name}</div>
          <div class="item-details">
            ${lt('stock_number')}: ${item.stockNumber} | 
            ${lt('quantity')}: ${item.quantity} | 
            ${item.category}
          </div>
        </div>
        <div class="item-actions">
          <label>${lt('sequence')}:</label>
          <input type="number" class="sequence-input-inline" 
                 value="${item.sequence}" 
                 data-item-id="${item.itemId}"
                 onchange="locationManager.updateSequence('${item.itemId}', this.value)">
          <button class="btn btn-small" onclick="locationManager.removeItem('${item.itemId}')">
            ${lt('remove_from_location')}
          </button>
        </div>
      </div>
    `).join('');
    
    this.locationItems = items;
  }

  async updateSequence(itemId, newSequence) {
    try {
      const response = await fetch('/api/location/update-sequence', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({
          locationId: this.currentLocation,
          itemId,
          sequence: parseInt(newSequence)
        })
      });
      
      const data = await response.json();
      if (data.success) {
        this.showMessage(lt('sequence_updated'), 'success');
        this.loadLocationItems();
      }
    } catch (error) {
      console.error('Error updating sequence:', error);
    }
  }

  async autoSequence() {
    if (!this.currentLocation || !this.locationItems.length) return;
    
    // Sort items by category then by name
    const sorted = [...this.locationItems].sort((a, b) => {
      if (a.category !== b.category) {
        return a.category.localeCompare(b.category);
      }
      return a.name.localeCompare(b.name);
    });
    
    // Update sequences
    for (let i = 0; i < sorted.length; i++) {
      await this.updateSequence(sorted[i].itemId, (i + 1) * 10);
    }
    
    this.loadLocationItems();
  }

  exportCSV() {
    if (!this.locationItems.length) return;
    
    const csv = [
      ['Stock Number', 'Name', 'Category', 'Quantity', 'Sequence'].join(','),
      ...this.locationItems.map(item => [
        item.stockNumber,
        `"${item.name}"`,
        item.category,
        item.quantity,
        item.sequence
      ].join(','))
    ].join('\n');
    
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `location_${this.currentLocation}_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
  }

  printLocation() {
    if (!this.locationItems.length) return;
    
    const printWindow = window.open('', '_blank');
    printWindow.document.write(`
      <html>
        <head>
          <title>${lt('location')}: ${this.currentLocation}</title>
          <style>
            body { font-family: Arial, sans-serif; }
            h1 { color: #333; }
            table { width: 100%; border-collapse: collapse; margin-top: 20px; }
            th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
            th { background-color: #f2f2f2; }
            .sequence { text-align: center; font-weight: bold; }
          </style>
        </head>
        <body>
          <h1>${lt('location')}: ${this.currentLocation}</h1>
          <p>${new Date().toLocaleString()}</p>
          <table>
            <thead>
              <tr>
                <th class="sequence">${lt('sequence')}</th>
                <th>${lt('stock_number')}</th>
                <th>${lt('name')}</th>
                <th>${lt('category')}</th>
                <th>${lt('quantity')}</th>
              </tr>
            </thead>
            <tbody>
              ${this.locationItems.map(item => `
                <tr>
                  <td class="sequence">${item.sequence}</td>
                  <td>${item.stockNumber}</td>
                  <td>${item.name}</td>
                  <td>${item.category}</td>
                  <td>${item.quantity}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </body>
      </html>
    `);
    printWindow.document.close();
    printWindow.print();
  }

  showMessage(message, type = 'info') {
    // You can implement a toast notification system here
    console.log(`[${type}] ${message}`);
    // For now, using a simple alert
    if (type === 'error') {
      alert(message);
    }
  }
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    const container = document.getElementById('location-manager-container');
    if (container) {
      window.locationManager = new LocationManager(container);
    }
  });
} else {
  const container = document.getElementById('location-manager-container');
  if (container) {
    window.locationManager = new LocationManager(container);
  }
}

export default LocationManager;