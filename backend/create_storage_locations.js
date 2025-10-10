const fs = require('fs');
const path = require('path');

// Define all 24 storage locations
const storageLocations = [
  { id: 'freezer-main', name: 'Main Freezer', type: 'freezer', temp: -18, capacity: 1000 },
  { id: 'freezer-backup', name: 'Backup Freezer', type: 'freezer', temp: -18, capacity: 800 },
  { id: 'freezer-seafood', name: 'Seafood Freezer', type: 'freezer', temp: -20, capacity: 500 },
  { id: 'freezer-meat', name: 'Meat Freezer', type: 'freezer', temp: -18, capacity: 1200 },
  { id: 'cooler-dairy', name: 'Dairy Cooler', type: 'cooler', temp: 2, capacity: 600 },
  { id: 'cooler-produce', name: 'Produce Cooler', type: 'cooler', temp: 4, capacity: 800 },
  { id: 'cooler-meat', name: 'Meat Cooler', type: 'cooler', temp: 1, capacity: 700 },
  { id: 'cooler-prep', name: 'Prep Cooler', type: 'cooler', temp: 3, capacity: 400 },
  { id: 'cooler-beverage', name: 'Beverage Cooler', type: 'cooler', temp: 3, capacity: 500 },
  { id: 'cooler-deli', name: 'Deli Cooler', type: 'cooler', temp: 2, capacity: 300 },
  { id: 'pantry-main', name: 'Main Pantry', type: 'dry', temp: 20, capacity: 1500 },
  { id: 'pantry-baking', name: 'Baking Pantry', type: 'dry', temp: 20, capacity: 400 },
  { id: 'pantry-spices', name: 'Spice Pantry', type: 'dry', temp: 18, capacity: 200 },
  { id: 'pantry-canned', name: 'Canned Goods', type: 'dry', temp: 20, capacity: 800 },
  { id: 'storage-paper', name: 'Paper Products', type: 'dry', temp: 20, capacity: 600 },
  { id: 'storage-cleaning', name: 'Cleaning Supplies', type: 'dry', temp: 20, capacity: 300 },
  { id: 'storage-disposables', name: 'Disposables', type: 'dry', temp: 20, capacity: 500 },
  { id: 'storage-equipment', name: 'Equipment Storage', type: 'dry', temp: 20, capacity: 400 },
  { id: 'wine-cellar', name: 'Wine Cellar', type: 'cooler', temp: 12, capacity: 300 },
  { id: 'prep-station-1', name: 'Prep Station 1', type: 'prep', temp: 20, capacity: 100 },
  { id: 'prep-station-2', name: 'Prep Station 2', type: 'prep', temp: 20, capacity: 100 },
  { id: 'line-cooler-1', name: 'Line Cooler 1', type: 'cooler', temp: 3, capacity: 50 },
  { id: 'line-cooler-2', name: 'Line Cooler 2', type: 'cooler', temp: 3, capacity: 50 },
  { id: 'receiving-area', name: 'Receiving Area', type: 'staging', temp: 20, capacity: 200 }
];

// Create detailed location data with items
const locationData = {
  locations: storageLocations.map(loc => ({
    ...loc,
    currentStock: Math.floor(loc.capacity * 0.7), // 70% capacity
    items: [],
    lastUpdated: new Date().toISOString()
  })),
  summary: {
    totalLocations: 24,
    totalCapacity: storageLocations.reduce((sum, loc) => sum + loc.capacity, 0),
    byType: {
      freezer: storageLocations.filter(l => l.type === 'freezer').length,
      cooler: storageLocations.filter(l => l.type === 'cooler').length,
      dry: storageLocations.filter(l => l.type === 'dry').length,
      prep: storageLocations.filter(l => l.type === 'prep').length,
      staging: storageLocations.filter(l => l.type === 'staging').length
    }
  },
  lastUpdated: new Date().toISOString()
};

// Save to multiple location files
const files = [
  'data/locations.json',
  'data/storage-locations.json',
  'data/storage_locations.json'
];

files.forEach(file => {
  fs.writeFileSync(file, JSON.stringify(locationData, null, 2));
  console.log(`✅ Created ${file} with ${locationData.locations.length} locations`);
});

console.log(`
📦 Storage Locations Created:
- Total Locations: ${locationData.summary.totalLocations}
- Total Capacity: ${locationData.summary.totalCapacity} units
- Freezers: ${locationData.summary.byType.freezer}
- Coolers: ${locationData.summary.byType.cooler}
- Dry Storage: ${locationData.summary.byType.dry}
- Prep Stations: ${locationData.summary.byType.prep}
- Staging: ${locationData.summary.byType.staging}
`);