# Owner Console V21.0 Frontend Upgrade Guide

## New Tabs to Add

Add these tabs to `owner-super-console-enterprise.html`:

### 1. Vendors & Pricing Tab

```html
<!-- Vendors Tab -->
<div id="vendorsPanel" class="hidden">
  <div class="mb-6">
    <h2 class="text-2xl font-bold">Vendors & Pricing</h2>
  </div>

  <!-- Preferred Vendor Selection -->
  <div class="bg-white dark:bg-slate-800 rounded-lg shadow p-6 mb-6">
    <h3 class="text-lg font-semibold mb-4">Preferred Vendor</h3>
    <select id="preferredVendor" class="w-full px-4 py-2 rounded border">
      <option value="">Select preferred vendor...</option>
    </select>
    <button onclick="APP.savePreferredVendor()" class="mt-4 px-4 py-2 bg-blue-600 text-white rounded">
      Save Preference
    </button>
  </div>

  <!-- Price Import -->
  <div class="bg-white dark:bg-slate-800 rounded-lg shadow p-6 mb-6">
    <h3 class="text-lg font-semibold mb-4">Import Vendor Prices (CSV)</h3>
    <p class="text-sm text-slate-600 mb-4">
      Headers: vendor, item_sku, price, currency, effective_from, vendor_sku, pack_size, uom
    </p>
    <input type="file" id="vendorPriceFile" accept=".csv" class="mb-4">
    <button onclick="APP.importVendorPrices()" class="px-4 py-2 bg-green-600 text-white rounded">
      Import Prices
    </button>
  </div>

  <!-- Price Lookup Tool -->
  <div class="bg-white dark:bg-slate-800 rounded-lg shadow p-6">
    <h3 class="text-lg font-semibold mb-4">Price Lookup</h3>
    <div class="grid grid-cols-2 gap-4 mb-4">
      <input type="text" id="priceLookupSKU" placeholder="Item SKU" class="px-4 py-2 rounded border">
      <input type="date" id="priceLookupDate" class="px-4 py-2 rounded border">
    </div>
    <button onclick="APP.lookupPrice()" class="px-4 py-2 bg-blue-600 text-white rounded">
      Lookup Price
    </button>
    <div id="priceResult" class="mt-4"></div>
  </div>
</div>
```

### 2. Recipes Tab

```html
<!-- Recipes Tab -->
<div id="recipesPanel" class="hidden">
  <div class="mb-6 flex justify-between items-center">
    <h2 class="text-2xl font-bold">Recipes</h2>
    <button onclick="APP.showRecipeEditor(null)" class="px-4 py-2 bg-green-600 text-white rounded">
      + New Recipe
    </button>
  </div>

  <!-- Recipe List -->
  <div id="recipesList" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4"></div>

  <!-- Recipe Editor Modal -->
  <div id="recipeEditorModal" class="hidden fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
    <div class="bg-white dark:bg-slate-800 rounded-lg p-6 max-w-4xl w-full max-h-[90vh] overflow-y-auto">
      <div class="flex justify-between items-center mb-6">
        <h3 class="text-xl font-bold">Recipe Editor</h3>
        <button onclick="APP.closeModal('recipeEditorModal')" class="text-slate-400 hover:text-slate-600">✕</button>
      </div>

      <div class="grid grid-cols-2 gap-6">
        <!-- Left: Recipe Meta -->
        <div>
          <h4 class="font-semibold mb-4">Recipe Details</h4>
          <div class="space-y-4">
            <input type="text" id="recipeCode" placeholder="Code (e.g., CHILI001)" class="w-full px-4 py-2 rounded border">
            <input type="text" id="recipeName" placeholder="Name" class="w-full px-4 py-2 rounded border">
            <div class="grid grid-cols-2 gap-2">
              <input type="number" id="recipeYieldQty" placeholder="Yield Qty" step="0.1" class="px-4 py-2 rounded border">
              <input type="text" id="recipeYieldUOM" placeholder="UOM" class="px-4 py-2 rounded border">
            </div>
            <input type="number" id="recipeLossPct" placeholder="Prep Loss %" step="0.1" class="w-full px-4 py-2 rounded border">
            <input type="text" id="recipeAllergens" placeholder="Allergens (comma separated)" class="w-full px-4 py-2 rounded border">
          </div>

          <div class="mt-6 p-4 bg-blue-50 dark:bg-slate-700 rounded">
            <h5 class="font-semibold mb-2">Recipe Cost</h5>
            <div id="recipeCostDisplay" class="text-2xl font-bold text-blue-600"></div>
            <button onclick="APP.updateRecipeCost()" class="mt-2 px-4 py-2 bg-blue-600 text-white rounded text-sm">
              Calculate Cost
            </button>
          </div>
        </div>

        <!-- Right: Ingredients -->
        <div>
          <h4 class="font-semibold mb-4">Ingredients</h4>
          <div class="flex gap-2 mb-4">
            <input type="text" id="newIngSKU" placeholder="Item SKU" class="flex-1 px-4 py-2 rounded border">
            <input type="number" id="newIngQty" placeholder="Qty" step="0.01" class="w-20 px-2 py-2 rounded border">
            <input type="text" id="newIngUOM" placeholder="UOM" class="w-20 px-2 py-2 rounded border">
            <button onclick="APP.addIngredient()" class="px-4 py-2 bg-green-600 text-white rounded">+</button>
          </div>
          <div id="ingredientsList" class="space-y-2"></div>
        </div>
      </div>

      <div class="mt-6 flex justify-end gap-2">
        <button onclick="APP.closeModal('recipeEditorModal')" class="px-4 py-2 bg-slate-200 rounded">Cancel</button>
        <button onclick="APP.saveRecipe()" class="px-4 py-2 bg-blue-600 text-white rounded">Save Recipe</button>
      </div>
    </div>
  </div>
</div>
```

### 3. Menu Tab

```html
<!-- Menu Tab -->
<div id="menuPanel" class="hidden">
  <div class="mb-6">
    <h2 class="text-2xl font-bold">Menu Planning</h2>
    <div class="flex gap-4 mt-4">
      <select id="menuWeek" onchange="APP.loadMenuWeek()" class="px-4 py-2 rounded border">
        <option value="1">Week 1</option>
        <option value="2">Week 2</option>
        <option value="3">Week 3</option>
        <option value="4">Week 4</option>
      </select>
    </div>
  </div>

  <div id="menuGrid" class="grid grid-cols-7 gap-2">
    <!-- Days: Mon-Sun, Services: B/L/D -->
  </div>

  <!-- Menu Forecast Cost -->
  <div class="mt-6 bg-white dark:bg-slate-800 rounded-lg shadow p-6">
    <h3 class="text-lg font-semibold mb-4">Week Cost Forecast</h3>
    <div class="text-3xl font-bold text-green-600" id="weekCostForecast">$0.00</div>
    <button onclick="APP.updateMenuForecast()" class="mt-4 px-4 py-2 bg-blue-600 text-white rounded">
      Refresh Forecast
    </button>
  </div>
</div>
```

### 4. Population Tab

```html
<!-- Population Tab -->
<div id="populationPanel" class="hidden">
  <div class="mb-6">
    <h2 class="text-2xl font-bold">Daily Population</h2>
  </div>

  <!-- Population Table -->
  <div class="bg-white dark:bg-slate-800 rounded-lg shadow overflow-hidden">
    <table class="w-full">
      <thead class="bg-slate-100 dark:bg-slate-700">
        <tr>
          <th class="px-4 py-2 text-left">Date</th>
          <th class="px-4 py-2">Breakfast</th>
          <th class="px-4 py-2">Lunch</th>
          <th class="px-4 py-2">Dinner</th>
          <th class="px-4 py-2">Actions</th>
        </tr>
      </thead>
      <tbody id="populationTable"></tbody>
    </table>
  </div>

  <!-- Add Population -->
  <div class="mt-6 bg-white dark:bg-slate-800 rounded-lg shadow p-6">
    <h3 class="text-lg font-semibold mb-4">Add/Update Population</h3>
    <div class="grid grid-cols-4 gap-4">
      <input type="date" id="popDate" class="px-4 py-2 rounded border">
      <input type="number" id="popBreakfast" placeholder="Breakfast" class="px-4 py-2 rounded border">
      <input type="number" id="popLunch" placeholder="Lunch" class="px-4 py-2 rounded border">
      <input type="number" id="popDinner" placeholder="Dinner" class="px-4 py-2 rounded border">
    </div>
    <button onclick="APP.savePopulation()" class="mt-4 px-4 py-2 bg-green-600 text-white rounded">
      Save
    </button>
  </div>
</div>
```

### 5. Waste Tab

```html
<!-- Waste Tab -->
<div id="wastePanel" class="hidden">
  <div class="mb-6">
    <h2 class="text-2xl font-bold">Waste Tracking</h2>
  </div>

  <!-- Quick Add Waste -->
  <div class="bg-white dark:bg-slate-800 rounded-lg shadow p-6 mb-6">
    <h3 class="text-lg font-semibold mb-4">Quick Add Waste Event</h3>
    <div class="grid grid-cols-2 gap-4">
      <input type="datetime-local" id="wasteTS" class="px-4 py-2 rounded border">
      <input type="text" id="wasteItemSKU" placeholder="Item SKU or Recipe Code" class="px-4 py-2 rounded border">
      <input type="number" id="wasteQty" placeholder="Quantity" step="0.01" class="px-4 py-2 rounded border">
      <input type="text" id="wasteUOM" placeholder="UOM" class="px-4 py-2 rounded border">
      <select id="wasteReason" class="px-4 py-2 rounded border">
        <option value="">Select reason...</option>
        <option value="spoilage">Spoilage</option>
        <option value="overprep">Overprep</option>
        <option value="trim">Trim</option>
        <option value="plate_return">Plate Return</option>
        <option value="expired">Expired</option>
        <option value="damage">Damage</option>
        <option value="mispick">Mispick</option>
        <option value="other">Other</option>
      </select>
      <input type="text" id="wasteSubreason" placeholder="Subreason (optional)" class="px-4 py-2 rounded border">
    </div>
    <textarea id="wasteNotes" placeholder="Notes" rows="2" class="w-full mt-4 px-4 py-2 rounded border"></textarea>
    <button onclick="APP.saveWasteEvent()" class="mt-4 px-4 py-2 bg-red-600 text-white rounded">
      Record Waste
    </button>
  </div>

  <!-- Waste Summary Cards -->
  <div class="grid grid-cols-4 gap-4 mb-6">
    <div class="bg-white dark:bg-slate-800 rounded-lg shadow p-6">
      <div class="text-sm text-slate-600 dark:text-slate-400">Total Cost</div>
      <div class="text-2xl font-bold text-red-600" id="wasteTotalCost">$0.00</div>
    </div>
    <div class="bg-white dark:bg-slate-800 rounded-lg shadow p-6">
      <div class="text-sm text-slate-600 dark:text-slate-400">Events</div>
      <div class="text-2xl font-bold" id="wasteTotalEvents">0</div>
    </div>
    <div class="bg-white dark:bg-slate-800 rounded-lg shadow p-6">
      <div class="text-sm text-slate-600 dark:text-slate-400">Top Reason</div>
      <div class="text-lg font-semibold" id="wasteTopReason">-</div>
    </div>
    <div class="bg-white dark:bg-slate-800 rounded-lg shadow p-6">
      <div class="text-sm text-slate-600 dark:text-slate-400">Top Item</div>
      <div class="text-lg font-semibold" id="wasteTopItem">-</div>
    </div>
  </div>

  <!-- Waste Table -->
  <div class="bg-white dark:bg-slate-800 rounded-lg shadow overflow-hidden">
    <table class="w-full">
      <thead class="bg-slate-100 dark:bg-slate-700">
        <tr>
          <th class="px-4 py-2 text-left">Date</th>
          <th class="px-4 py-2 text-left">Item/Recipe</th>
          <th class="px-4 py-2">Qty</th>
          <th class="px-4 py-2 text-left">Reason</th>
          <th class="px-4 py-2">Cost</th>
        </tr>
      </thead>
      <tbody id="wasteTable"></tbody>
    </table>
  </div>
</div>
```

### 6. PDF Hub Tab

```html
<!-- PDF Hub Tab -->
<div id="pdfPanel" class="hidden">
  <div class="mb-6">
    <h2 class="text-2xl font-bold">PDF Reports</h2>
  </div>

  <div class="grid grid-cols-2 gap-6">
    <!-- Count Sheet -->
    <div class="bg-white dark:bg-slate-800 rounded-lg shadow p-6">
      <h3 class="text-lg font-semibold mb-4">Count Sheet</h3>
      <input type="date" id="pdfCountDate" class="w-full px-4 py-2 rounded border mb-4">
      <button onclick="APP.generatePDF('count')" class="w-full px-4 py-2 bg-blue-600 text-white rounded">
        Generate Count Sheet
      </button>
    </div>

    <!-- Menu Pack -->
    <div class="bg-white dark:bg-slate-800 rounded-lg shadow p-6">
      <h3 class="text-lg font-semibold mb-4">Menu Pack</h3>
      <select id="pdfMenuWeek" class="w-full px-4 py-2 rounded border mb-4">
        <option value="1">Week 1</option>
        <option value="2">Week 2</option>
        <option value="3">Week 3</option>
        <option value="4">Week 4</option>
      </select>
      <button onclick="APP.generatePDF('menu')" class="w-full px-4 py-2 bg-blue-600 text-white rounded">
        Generate Menu Pack
      </button>
    </div>

    <!-- Waste Summary -->
    <div class="bg-white dark:bg-slate-800 rounded-lg shadow p-6">
      <h3 class="text-lg font-semibold mb-4">Waste Summary</h3>
      <div class="space-y-2 mb-4">
        <input type="date" id="pdfWasteFrom" class="w-full px-4 py-2 rounded border">
        <input type="date" id="pdfWasteTo" class="w-full px-4 py-2 rounded border">
      </div>
      <button onclick="APP.generatePDF('waste')" class="w-full px-4 py-2 bg-blue-600 text-white rounded">
        Generate Waste Report
      </button>
    </div>

    <!-- Daily Ops -->
    <div class="bg-white dark:bg-slate-800 rounded-lg shadow p-6">
      <h3 class="text-lg font-semibold mb-4">Daily Ops Sheet</h3>
      <input type="date" id="pdfOpsDate" class="w-full px-4 py-2 rounded border mb-4">
      <button onclick="APP.generatePDF('ops')" class="w-full px-4 py-2 bg-blue-600 text-white rounded">
        Generate Ops Sheet
      </button>
    </div>
  </div>
</div>
```

## JavaScript Functions to Add

Add these to the APP object in the script section:

```javascript
// Vendors
loadVendors: async function() {
  const res = await this.apiCall('/api/vendors');
  if (res.success) {
    const select = document.getElementById('preferredVendor');
    res.vendors.forEach(v => {
      const opt = document.createElement('option');
      opt.value = v.id;
      opt.textContent = v.name;
      select.appendChild(opt);
    });
  }
},

savePreferredVendor: async function() {
  const vendorId = document.getElementById('preferredVendor').value;
  const res = await this.apiCall('/api/vendors/org/vendor-default', 'PUT', { vendor_id: parseInt(vendorId) });
  if (res.success) this.toast('Preferred vendor saved', 'success');
},

importVendorPrices: async function() {
  const file = document.getElementById('vendorPriceFile').files[0];
  if (!file) return this.toast('Select a CSV file', 'error');

  const text = await file.text();
  const rows = Papa.parse(text, { header: true }).data;

  const res = await this.apiCall('/api/vendors/prices/import', 'POST', { rows });
  if (res.success) {
    this.toast(`Imported ${res.imported} prices, ${res.errors} errors`, 'success');
  }
},

lookupPrice: async function() {
  const sku = document.getElementById('priceLookupSKU').value;
  const date = document.getElementById('priceLookupDate').value;

  const res = await this.apiCall(`/api/vendors/prices?item_sku=${sku}&at=${date}`);
  if (res.success) {
    document.getElementById('priceResult').innerHTML = `
      <div class="p-4 bg-green-50 rounded">
        <div class="font-semibold">${sku}</div>
        <div class="text-2xl text-green-600">$${res.price}</div>
        <div class="text-sm">${res.vendor_name} (${res.source})</div>
      </div>
    `;
  }
},

// Recipes
loadRecipes: async function() {
  const res = await this.apiCall('/api/recipes?active=true');
  if (res.success) {
    const list = document.getElementById('recipesList');
    list.innerHTML = res.recipes.map(r => `
      <div class="bg-white dark:bg-slate-800 rounded-lg shadow p-4 cursor-pointer hover:shadow-lg" onclick="APP.showRecipeEditor(${r.id})">
        <div class="font-semibold">${r.name}</div>
        <div class="text-sm text-slate-600">${r.code}</div>
        <div class="text-sm">Yield: ${r.yield_qty} ${r.yield_uom}</div>
      </div>
    `).join('');
  }
},

// Waste
saveWasteEvent: async function() {
  const data = {
    ts: document.getElementById('wasteTS').value,
    item_sku: document.getElementById('wasteItemSKU').value,
    qty: parseFloat(document.getElementById('wasteQty').value),
    uom: document.getElementById('wasteUOM').value,
    reason: document.getElementById('wasteReason').value,
    subreason: document.getElementById('wasteSubreason').value,
    notes: document.getElementById('wasteNotes').value
  };

  const res = await this.apiCall('/api/waste', 'POST', data);
  if (res.success) {
    this.toast('Waste event recorded', 'success');
    this.loadWasteSummary();
  }
},

// PDFs
generatePDF: async function(type) {
  let params = {};

  switch (type) {
    case 'count':
      params = { date: document.getElementById('pdfCountDate').value };
      break;
    case 'menu':
      params = { week: document.getElementById('pdfMenuWeek').value, at: new Date().toISOString().split('T')[0] };
      break;
    case 'waste':
      params = { from: document.getElementById('pdfWasteFrom').value, to: document.getElementById('pdfWasteTo').value };
      break;
    case 'ops':
      params = { date: document.getElementById('pdfOpsDate').value };
      break;
  }

  try {
    const response = await fetch(`${this.config.apiUrl}/api/pdfs/generate`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.config.token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ type, params })
    });

    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${type}_report.txt`;
    a.click();

    this.toast('PDF generated', 'success');
  } catch (err) {
    this.toast('PDF generation failed', 'error');
  }
}
```

## Keyboard Shortcuts

Add to keyboard handler:
```javascript
case 'v': this.navigate('vendors'); break;
case 'r': this.navigate('recipes'); break;
case 'm': this.navigate('menu'); break;
case 'p': this.navigate('population'); break;
case 'w': this.navigate('waste'); break;
case 'd': this.navigate('pdf'); break;
```

## Navigation

Add menu items:
```html
<button onclick="APP.navigate('vendors')">Vendors & Pricing</button>
<button onclick="APP.navigate('recipes')">Recipes</button>
<button onclick="APP.navigate('menu')">Menu</button>
<button onclick="APP.navigate('population')">Population</button>
<button onclick="APP.navigate('waste')">Waste</button>
<button onclick="APP.navigate('pdf')">PDFs</button>
```
