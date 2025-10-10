const fs = require('fs');
const path = require('path');

// Read the current file
const currentFile = path.join(__dirname, 'data', 'storage_locations.json');
const data = JSON.parse(fs.readFileSync(currentFile, 'utf8'));

// Convert to the format expected by enterprise-secure-inventory.js
const converted = {};
data.locations.forEach(loc => {
  converted[loc.id] = {
    id: loc.id,
    name: loc.name,
    type: loc.type,
    tempRange: loc.type === 'freezer' ? { min: -20, max: -15 } :
                loc.type === 'cooler' ? { min: 0, max: 5 } :
                { min: 15, max: 25 },
    humidity: loc.type === 'freezer' ? { min: 30, max: 50 } :
              loc.type === 'cooler' ? { min: 40, max: 60 } :
              { min: 30, max: 60 },
    capacity: loc.capacity,
    currentOccupancy: loc.currentStock || 0,
    items: [],
    temperatureLog: [],
    alerts: [],
    lastInspection: new Date().toISOString(),
    createdAt: loc.lastUpdated || new Date().toISOString()
  };
});

// Write to the expected file
const targetFile = path.join(__dirname, 'data', 'storage-locations.json');
fs.writeFileSync(targetFile, JSON.stringify(converted, null, 2));

console.log(`✅ Converted ${Object.keys(converted).length} locations to correct format`);
console.log('📁 Saved to:', targetFile);