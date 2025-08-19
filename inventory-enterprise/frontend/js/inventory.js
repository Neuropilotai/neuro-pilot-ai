// Inventory Management Functions

let currentInventoryData = [];
let currentPage = 1;
let itemsPerPage = 20;
let activeFilters = {};

// Initialize inventory form handlers
document.addEventListener('DOMContentLoaded', function() {
    const itemForm = document.getElementById('itemForm');
    const transferForm = document.getElementById('transferForm');
    
    if (itemForm) {
        itemForm.addEventListener('submit', handleItemSubmit);
    }
    
    if (transferForm) {
        transferForm.addEventListener('submit', handleTransferSubmit);
    }
});

// Load inventory data with filters and pagination
async function loadInventoryData(page = 1, filters = {}) {
    try {
        showLoading();
        
        // Build query parameters
        const params = new URLSearchParams({
            page: page.toString(),
            limit: itemsPerPage.toString(),
            ...filters
        });
        
        const response = await APP.apiRequest(`/inventory/items?${params}`);
        const data = response.data || response;
        
        currentInventoryData = data.items || [];
        currentPage = page;
        activeFilters = filters;
        
        displayInventoryTable(currentInventoryData);
        updateInventoryPagination(data.pagination || {});
        loadFilterOptions(currentInventoryData);
        
        hideLoading();
        
    } catch (error) {
        console.error('Failed to load inventory:', error);
        APP.showToast('Failed to load inventory data', 'error');
        hideLoading();
    }
}

// Display inventory in table format
function displayInventoryTable(items) {
    const tbody = document.getElementById('inventoryTableBody');
    if (!tbody) return;
    
    tbody.innerHTML = '';
    
    if (!items || items.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="7" class="text-center text-muted">
                    <i class="fas fa-inbox"></i><br>
                    No inventory items found
                </td>
            </tr>
        `;
        return;
    }
    
    items.forEach(item => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>
                <div class="item-info">
                    <div class="item-name">${APP.escapeHtml(item.name)}</div>
                    <div class="item-code text-muted">${APP.escapeHtml(item.supplierCode || '')}</div>
                </div>
            </td>
            <td>
                <span class="category-tag">${APP.escapeHtml(item.category)}</span>
            </td>
            <td>
                <div class="quantity-info">
                    <span class="quantity">${item.quantity} ${APP.escapeHtml(item.unit)}</span>
                    ${item.minQuantity ? `<br><small class="text-muted">Min: ${item.minQuantity}</small>` : ''}
                    ${item.maxQuantity ? `<br><small class="text-muted">Max: ${item.maxQuantity}</small>` : ''}
                </div>
            </td>
            <td>
                <div class="location-info">
                    <div class="location-name">${APP.escapeHtml(item.locationDetails?.name || item.location)}</div>
                    <small class="text-muted">${APP.escapeHtml(item.locationDetails?.type || '')}</small>
                </div>
            </td>
            <td class="value-cell">${APP.formatCurrency(item.totalValue || 0)}</td>
            <td>
                <span class="status-badge status-${getStatusClass(item.stockStatus)}">
                    ${getStatusLabel(item.stockStatus)}
                </span>
                ${item.daysUntilExpiry !== null && item.daysUntilExpiry <= 7 ? 
                    `<br><small class="text-danger">Expires in ${item.daysUntilExpiry} days</small>` : ''}
            </td>
            <td>
                <div class="action-buttons">
                    <button class="action-btn" onclick="editItem('${item.id}')" title="Edit Item">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button class="action-btn" onclick="showTransferModal('${item.id}')" title="Transfer Item">
                        <i class="fas fa-exchange-alt"></i>
                    </button>
                    <button class="action-btn" onclick="adjustQuantity('${item.id}')" title="Adjust Quantity">
                        <i class="fas fa-calculator"></i>
                    </button>
                    <button class="action-btn danger" onclick="deleteItem('${item.id}')" title="Delete Item">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </td>
        `;
        tbody.appendChild(row);
    });
}

// Update pagination controls
function updateInventoryPagination(pagination) {
    const paginationContainer = document.getElementById('inventoryPagination');
    if (!paginationContainer) return;
    
    const { currentPage = 1, totalPages = 1, totalItems = 0 } = pagination;
    
    if (totalPages <= 1) {
        paginationContainer.innerHTML = '';
        return;
    }
    
    let paginationHTML = `
        <button onclick="loadInventoryData(1, activeFilters)" ${currentPage === 1 ? 'disabled' : ''}>
            <i class="fas fa-angle-double-left"></i>
        </button>
        <button onclick="loadInventoryData(${currentPage - 1}, activeFilters)" ${currentPage === 1 ? 'disabled' : ''}>
            <i class="fas fa-angle-left"></i>
        </button>
    `;
    
    // Show page numbers (max 5)
    const startPage = Math.max(1, currentPage - 2);
    const endPage = Math.min(totalPages, startPage + 4);
    
    for (let i = startPage; i <= endPage; i++) {
        paginationHTML += `
            <button onclick="loadInventoryData(${i}, activeFilters)" ${i === currentPage ? 'class="active"' : ''}>
                ${i}
            </button>
        `;
    }
    
    paginationHTML += `
        <button onclick="loadInventoryData(${currentPage + 1}, activeFilters)" ${currentPage === totalPages ? 'disabled' : ''}>
            <i class="fas fa-angle-right"></i>
        </button>
        <button onclick="loadInventoryData(${totalPages}, activeFilters)" ${currentPage === totalPages ? 'disabled' : ''}>
            <i class="fas fa-angle-double-right"></i>
        </button>
    `;
    
    paginationContainer.innerHTML = paginationHTML;
}

// Apply filters
function applyFilters() {
    const filters = {};
    
    const category = document.getElementById('categoryFilter')?.value;
    const location = document.getElementById('locationFilter')?.value;
    const stock = document.getElementById('stockFilter')?.value;
    
    if (category) filters.category = category;
    if (location) filters.location = location;
    if (stock === 'low') filters.lowStock = 'true';
    
    loadInventoryData(1, filters);
}

// Clear filters
function clearFilters() {
    document.getElementById('categoryFilter').value = '';
    document.getElementById('locationFilter').value = '';
    document.getElementById('stockFilter').value = '';
    loadInventoryData(1, {});
}

// Item form submission
async function handleItemSubmit(event) {
    event.preventDefault();
    
    const formData = new FormData(event.target);
    const itemData = {
        name: formData.get('name')?.trim(),
        category: formData.get('category')?.trim(),
        quantity: parseFloat(formData.get('quantity')),
        unit: formData.get('unit')?.trim(),
        location: formData.get('location'),
        unitPrice: parseFloat(formData.get('unitPrice')) || 0,
        supplier: formData.get('supplier')?.trim(),
        minQuantity: parseFloat(formData.get('minQuantity')) || 0,
        maxQuantity: parseFloat(formData.get('maxQuantity')) || 0,
        expiryDate: formData.get('expiryDate') || null
    };
    
    // Validation
    if (!itemData.name || !itemData.category || !itemData.unit || !itemData.location) {
        APP.showToast('Please fill in all required fields', 'error');
        return;
    }
    
    if (isNaN(itemData.quantity) || itemData.quantity < 0) {
        APP.showToast('Please enter a valid quantity', 'error');
        return;
    }
    
    try {
        showLoading();
        
        const itemId = event.target.dataset.itemId;
        const method = itemId ? 'PUT' : 'POST';
        const endpoint = itemId ? `/inventory/items/${itemId}` : '/inventory/items';
        
        const response = await APP.apiRequest(endpoint, {
            method,
            body: JSON.stringify(itemData)
        });
        
        APP.closeModal();
        APP.showToast(itemId ? 'Item updated successfully' : 'Item created successfully', 'success');
        
        // Reload inventory data
        await loadInventoryData(currentPage, activeFilters);
        
    } catch (error) {
        console.error('Failed to save item:', error);
        APP.showToast(error.message || 'Failed to save item', 'error');
    } finally {
        hideLoading();
    }
}

// Edit item
async function editItem(itemId) {
    try {
        showLoading();
        
        // Find item in current data or fetch from API
        let item = currentInventoryData.find(i => i.id === itemId);
        
        if (!item) {
            const response = await APP.apiRequest(`/inventory/items/${itemId}`);
            item = response.item || response;
        }
        
        // Populate form
        document.getElementById('itemModalTitle').textContent = 'Edit Item';
        document.getElementById('itemName').value = item.name || '';
        document.getElementById('itemCategory').value = item.category || '';
        document.getElementById('itemQuantity').value = item.quantity || '';
        document.getElementById('itemUnit').value = item.unit || '';
        document.getElementById('itemLocation').value = item.location || '';
        document.getElementById('itemUnitPrice').value = item.unitPrice || '';
        document.getElementById('itemSupplier').value = item.supplier || '';
        document.getElementById('itemMinQuantity').value = item.minQuantity || '';
        document.getElementById('itemMaxQuantity').value = item.maxQuantity || '';
        document.getElementById('itemExpiryDate').value = item.expiryDate || '';
        
        // Set item ID for update
        document.getElementById('itemForm').dataset.itemId = itemId;
        
        await loadLocationOptions();
        APP.showModal('itemModal');
        
    } catch (error) {
        console.error('Failed to load item:', error);
        APP.showToast('Failed to load item details', 'error');
    } finally {
        hideLoading();
    }
}

// Delete item
async function deleteItem(itemId) {
    const item = currentInventoryData.find(i => i.id === itemId);
    if (!item) return;
    
    if (!confirm(`Are you sure you want to delete "${item.name}"? This action cannot be undone.`)) {
        return;
    }
    
    try {
        showLoading();
        
        await APP.apiRequest(`/inventory/items/${itemId}`, {
            method: 'DELETE'
        });
        
        APP.showToast('Item deleted successfully', 'success');
        
        // Reload inventory data
        await loadInventoryData(currentPage, activeFilters);
        
    } catch (error) {
        console.error('Failed to delete item:', error);
        APP.showToast(error.message || 'Failed to delete item', 'error');
    } finally {
        hideLoading();
    }
}

// Show transfer modal
async function showTransferModal(itemId) {
    try {
        showLoading();
        
        const item = currentInventoryData.find(i => i.id === itemId);
        if (!item) return;
        
        // Populate transfer form
        document.getElementById('transferItemId').value = itemId;
        document.getElementById('transferItemInfo').innerHTML = `
            <strong>${APP.escapeHtml(item.name)}</strong><br>
            <small>Current: ${item.quantity} ${APP.escapeHtml(item.unit)} in ${APP.escapeHtml(item.locationDetails?.name || item.location)}</small>
        `;
        
        document.getElementById('fromLocation').value = item.location;
        document.getElementById('transferQuantity').max = item.quantity;
        document.getElementById('availableQuantity').textContent = `Available: ${item.quantity} ${item.unit}`;
        
        await loadLocationOptions();
        APP.showModal('transferModal');
        
    } catch (error) {
        console.error('Failed to setup transfer:', error);
        APP.showToast('Failed to setup transfer', 'error');
    } finally {
        hideLoading();
    }
}

// Handle transfer submission
async function handleTransferSubmit(event) {
    event.preventDefault();
    
    const formData = new FormData(event.target);
    const transferData = {
        itemId: formData.get('itemId') || document.getElementById('transferItemId').value,
        fromLocation: formData.get('fromLocation'),
        toLocation: formData.get('toLocation'),
        quantity: parseFloat(formData.get('quantity')),
        reason: formData.get('reason')?.trim()
    };
    
    // Validation
    if (!transferData.toLocation) {
        APP.showToast('Please select a destination location', 'error');
        return;
    }
    
    if (transferData.fromLocation === transferData.toLocation) {
        APP.showToast('Source and destination locations cannot be the same', 'error');
        return;
    }
    
    if (isNaN(transferData.quantity) || transferData.quantity <= 0) {
        APP.showToast('Please enter a valid quantity to transfer', 'error');
        return;
    }
    
    try {
        showLoading();
        
        await APP.apiRequest('/inventory/transfer', {
            method: 'POST',
            body: JSON.stringify(transferData)
        });
        
        APP.closeModal();
        APP.showToast('Item transferred successfully', 'success');
        
        // Reload inventory data
        await loadInventoryData(currentPage, activeFilters);
        
    } catch (error) {
        console.error('Failed to transfer item:', error);
        APP.showToast(error.message || 'Failed to transfer item', 'error');
    } finally {
        hideLoading();
    }
}

// Adjust quantity (zero-out feature)
async function adjustQuantity(itemId) {
    const item = currentInventoryData.find(i => i.id === itemId);
    if (!item) return;
    
    const newQuantity = prompt(`Adjust quantity for "${item.name}"\nCurrent: ${item.quantity} ${item.unit}`, item.quantity);
    
    if (newQuantity === null) return; // User cancelled
    
    const quantity = parseFloat(newQuantity);
    if (isNaN(quantity) || quantity < 0) {
        APP.showToast('Please enter a valid quantity', 'error');
        return;
    }
    
    let reason = '';
    if (quantity === 0) {
        reason = prompt('Reason for setting quantity to zero:') || 'Stock adjustment';
    }
    
    try {
        showLoading();
        
        await APP.apiRequest(`/inventory/items/${itemId}`, {
            method: 'PUT',
            body: JSON.stringify({
                ...item,
                quantity: quantity
            })
        });
        
        APP.showToast('Quantity adjusted successfully', 'success');
        
        // Reload inventory data
        await loadInventoryData(currentPage, activeFilters);
        
    } catch (error) {
        console.error('Failed to adjust quantity:', error);
        APP.showToast(error.message || 'Failed to adjust quantity', 'error');
    } finally {
        hideLoading();
    }
}

// Export inventory data
async function exportInventory() {
    try {
        showLoading();
        
        // Get all inventory data (without pagination)
        const response = await APP.apiRequest('/inventory/items?limit=10000');
        const items = response.items || [];
        
        // Convert to CSV
        const csv = convertToCSV(items);
        
        // Download file
        downloadCSV(csv, `inventory_export_${new Date().toISOString().split('T')[0]}.csv`);
        
        APP.showToast('Inventory exported successfully', 'success');
        
    } catch (error) {
        console.error('Failed to export inventory:', error);
        APP.showToast('Failed to export inventory', 'error');
    } finally {
        hideLoading();
    }
}

// Convert array to CSV
function convertToCSV(items) {
    if (!items || items.length === 0) return '';
    
    const headers = [
        'Name', 'Category', 'Quantity', 'Unit', 'Location', 
        'Unit Price', 'Total Value', 'Supplier', 'Supplier Code',
        'Min Quantity', 'Max Quantity', 'Expiry Date', 'Status'
    ];
    
    const rows = items.map(item => [
        item.name || '',
        item.category || '',
        item.quantity || 0,
        item.unit || '',
        item.locationDetails?.name || item.location || '',
        item.unitPrice || 0,
        item.totalValue || 0,
        item.supplier || '',
        item.supplierCode || '',
        item.minQuantity || '',
        item.maxQuantity || '',
        item.expiryDate || '',
        getStatusLabel(item.stockStatus)
    ]);
    
    const csvContent = [
        headers.join(','),
        ...rows.map(row => row.map(cell => 
            typeof cell === 'string' && cell.includes(',') ? `"${cell}"` : cell
        ).join(','))
    ].join('\n');
    
    return csvContent;
}

// Download CSV file
function downloadCSV(csv, filename) {
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
}

// Load filter options from current data
function loadFilterOptions(items) {
    if (!items) return;
    
    // Load categories
    const categories = [...new Set(items.map(item => item.category))].sort();
    const categorySelect = document.getElementById('categoryFilter');
    if (categorySelect) {
        const currentValue = categorySelect.value;
        categorySelect.innerHTML = '<option value="">All Categories</option>';
        categories.forEach(category => {
            const option = document.createElement('option');
            option.value = category;
            option.textContent = category;
            categorySelect.appendChild(option);
        });
        categorySelect.value = currentValue;
    }
    
    // Load locations
    const locations = [...new Set(items.map(item => item.locationDetails?.name || item.location))].sort();
    const locationSelect = document.getElementById('locationFilter');
    if (locationSelect) {
        const currentValue = locationSelect.value;
        locationSelect.innerHTML = '<option value="">All Locations</option>';
        locations.forEach(location => {
            const option = document.createElement('option');
            option.value = location;
            option.textContent = location;
            locationSelect.appendChild(option);
        });
        locationSelect.value = currentValue;
    }
}

// Load location options for forms
async function loadLocationOptions() {
    try {
        const response = await APP.apiRequest('/inventory/locations');
        const locations = response.locations || [];
        
        const selects = ['itemLocation', 'fromLocation', 'toLocation'];
        selects.forEach(selectId => {
            const select = document.getElementById(selectId);
            if (select) {
                const currentValue = select.value;
                select.innerHTML = '<option value="">Select Location</option>';
                locations.forEach(location => {
                    const option = document.createElement('option');
                    option.value = location.id;
                    option.textContent = `${location.name} (${location.type})`;
                    select.appendChild(option);
                });
                select.value = currentValue;
            }
        });
    } catch (error) {
        console.error('Failed to load locations:', error);
    }
}

// Utility functions
function getStatusClass(status) {
    const statusMap = {
        'normal': 'normal',
        'low_stock': 'low',
        'out_of_stock': 'out'
    };
    return statusMap[status] || 'normal';
}

function getStatusLabel(status) {
    const labelMap = {
        'normal': 'Normal',
        'low_stock': 'Low Stock',
        'out_of_stock': 'Out of Stock'
    };
    return labelMap[status] || 'Normal';
}

// Export inventory functions
window.INVENTORY = {
    loadInventoryData,
    displayInventoryTable,
    editItem,
    deleteItem,
    adjustQuantity,
    exportInventory,
    showTransferModal,
    applyFilters,
    clearFilters,
    loadLocationOptions
};