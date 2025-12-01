/**
 * NeuroPilot AI Enterprise - Vendor Data Ingestion Script
 * V22.2 - Processes extracted invoice/order data into PostgreSQL
 *
 * Usage:
 *   node scripts/ingestVendorData.js <json_file>
 *   node scripts/ingestVendorData.js --stdin < data.json
 *
 * Expected JSON format:
 * {
 *   "vendor_orders": [...],
 *   "order_lines": [...],
 *   "inventory_counts": [...]
 * }
 */

const fs = require('fs');
const path = require('path');

// Database connection (uses existing pool)
let db;
try {
  db = require('../config/db');
} catch (e) {
  console.error('Database module not found, using mock mode');
  db = null;
}

// ============================================================================
// DATA VALIDATION SCHEMAS
// ============================================================================

const VALID_UOMS = ['KG', 'L', 'EA', 'CS', 'LB', 'GAL', 'OZ', 'PKG', 'BAG', 'BOX'];

const VENDOR_ALIASES = {
  'sysco': 'SYSCO',
  'gfs': 'GFS',
  'gordon food service': 'GFS',
  'us foods': 'US FOODS',
  'usfoods': 'US FOODS',
  'performance food': 'PERFORMANCE FOOD GROUP',
  'pfg': 'PERFORMANCE FOOD GROUP',
  'restaurant depot': 'RESTAURANT DEPOT',
  'costco': 'COSTCO BUSINESS',
};

// ============================================================================
// DATA CLEANING FUNCTIONS
// ============================================================================

/**
 * Normalize vendor name
 */
function normalizeVendor(vendor) {
  if (!vendor) return 'UNKNOWN';
  const lower = vendor.toLowerCase().trim();
  return VENDOR_ALIASES[lower] || vendor.toUpperCase().trim();
}

/**
 * Normalize unit of measure
 */
function normalizeUOM(uom) {
  if (!uom) return 'EA';
  const upper = uom.toUpperCase().trim();

  // Common OCR fixes
  const fixes = {
    'CASE': 'CS',
    'CASES': 'CS',
    'EACH': 'EA',
    'POUND': 'LB',
    'POUNDS': 'LB',
    'KILO': 'KG',
    'KILOGRAM': 'KG',
    'KILOGRAMS': 'KG',
    'LITER': 'L',
    'LITERS': 'L',
    'LITRE': 'L',
    'LITRES': 'L',
    'GALLON': 'GAL',
    'GALLONS': 'GAL',
    'OUNCE': 'OZ',
    'OUNCES': 'OZ',
    'PACKAGE': 'PKG',
    'PACKAGES': 'PKG',
  };

  return fixes[upper] || upper;
}

/**
 * Fix common OCR errors in text
 */
function fixOCRErrors(text) {
  if (!text) return text;

  return text
    // Common character substitutions
    .replace(/[Oo](?=\d)/g, '0')  // O before digit -> 0
    .replace(/(?<=\d)[Oo]/g, '0')  // O after digit -> 0
    .replace(/[Il](?=\d)/g, '1')   // I or l before digit -> 1
    .replace(/(?<=\d)[Il]/g, '1')  // I or l after digit -> 1
    .replace(/\$\s+/g, '$')        // Remove space after $
    .replace(/,\s*(?=\d{3})/g, '') // Remove commas in numbers
    .trim();
}

/**
 * Parse price string to number
 */
function parsePrice(price) {
  if (typeof price === 'number') return price;
  if (!price) return null;

  const cleaned = fixOCRErrors(String(price))
    .replace(/[$,]/g, '')
    .trim();

  const num = parseFloat(cleaned);
  return isNaN(num) ? null : Math.round(num * 100) / 100;
}

/**
 * Parse quantity string to number
 */
function parseQuantity(qty) {
  if (typeof qty === 'number') return qty;
  if (!qty) return null;

  const cleaned = fixOCRErrors(String(qty))
    .replace(/,/g, '')
    .trim();

  const num = parseFloat(cleaned);
  return isNaN(num) ? null : num;
}

/**
 * Parse date string to ISO format
 */
function parseDate(dateStr) {
  if (!dateStr) return null;

  // Try various date formats
  const formats = [
    // MM/DD/YYYY
    /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/,
    // YYYY-MM-DD
    /^(\d{4})-(\d{2})-(\d{2})$/,
    // MM-DD-YYYY
    /^(\d{1,2})-(\d{1,2})-(\d{4})$/,
  ];

  const cleaned = fixOCRErrors(String(dateStr)).trim();

  for (const format of formats) {
    const match = cleaned.match(format);
    if (match) {
      let year, month, day;
      if (format.source.startsWith('^(\\d{4})')) {
        [, year, month, day] = match;
      } else {
        [, month, day, year] = match;
      }
      return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
    }
  }

  // Try native Date parsing
  const date = new Date(cleaned);
  if (!isNaN(date.getTime())) {
    return date.toISOString().split('T')[0];
  }

  return null;
}

/**
 * Generate item code from name
 */
function generateItemCode(name, vendor) {
  if (!name) return 'UNKNOWN';

  const prefix = (vendor || 'UNK').substring(0, 3).toUpperCase();
  const normalized = name
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .substring(0, 10);

  return `${prefix}-${normalized}`;
}

// ============================================================================
// VALIDATION FUNCTIONS
// ============================================================================

/**
 * Validate a vendor order record
 */
function validateVendorOrder(order) {
  const errors = [];
  const warnings = [];

  if (!order.vendor) {
    errors.push('Missing vendor name');
  }

  if (!order.order_date && !order.delivery_date) {
    warnings.push('No dates provided');
  }

  if (order.order_date && !parseDate(order.order_date)) {
    errors.push(`Invalid order_date: ${order.order_date}`);
  }

  if (order.delivery_date && !parseDate(order.delivery_date)) {
    errors.push(`Invalid delivery_date: ${order.delivery_date}`);
  }

  return { valid: errors.length === 0, errors, warnings };
}

/**
 * Validate an order line record
 */
function validateOrderLine(line) {
  const errors = [];
  const warnings = [];

  if (!line.item_name) {
    errors.push('Missing item_name');
  }

  if (!line.quantity && line.quantity !== 0) {
    errors.push('Missing quantity');
  } else if (parseQuantity(line.quantity) === null) {
    errors.push(`Invalid quantity: ${line.quantity}`);
  }

  if (!line.uom) {
    warnings.push('Missing UOM, defaulting to EA');
  } else if (!VALID_UOMS.includes(normalizeUOM(line.uom))) {
    warnings.push(`Unknown UOM: ${line.uom}`);
  }

  if (line.price_each && parsePrice(line.price_each) === null) {
    warnings.push(`Invalid price_each: ${line.price_each}`);
  }

  if (line.price_case && parsePrice(line.price_case) === null) {
    warnings.push(`Invalid price_case: ${line.price_case}`);
  }

  return { valid: errors.length === 0, errors, warnings };
}

/**
 * Detect anomalies in order lines
 */
function detectAnomalies(lines) {
  const anomalies = [];
  const itemPrices = {};

  for (const line of lines) {
    const itemKey = line.item_name?.toLowerCase();
    if (!itemKey) continue;

    const price = parsePrice(line.price_each) || parsePrice(line.price_case);
    if (price === null) continue;

    if (!itemPrices[itemKey]) {
      itemPrices[itemKey] = [];
    }
    itemPrices[itemKey].push({ price, line });
  }

  // Check for price spikes (>50% change)
  for (const [item, prices] of Object.entries(itemPrices)) {
    if (prices.length < 2) continue;

    const avg = prices.reduce((sum, p) => sum + p.price, 0) / prices.length;
    for (const { price, line } of prices) {
      const deviation = Math.abs(price - avg) / avg;
      if (deviation > 0.5) {
        anomalies.push({
          type: 'price_spike',
          item: line.item_name,
          expected: avg.toFixed(2),
          actual: price.toFixed(2),
          deviation: (deviation * 100).toFixed(1) + '%',
          source: line.source_file || 'unknown',
        });
      }
    }
  }

  return anomalies;
}

// ============================================================================
// DATA TRANSFORMATION
// ============================================================================

/**
 * Transform raw data into PostgreSQL-ready format
 */
function transformData(rawData) {
  const result = {
    vendor_orders: [],
    order_lines: [],
    inventory_counts: [],
    validation: {
      errors: [],
      warnings: [],
      anomalies: [],
    },
    stats: {
      orders_processed: 0,
      lines_processed: 0,
      counts_processed: 0,
    },
  };

  // Process vendor orders
  if (rawData.vendor_orders) {
    for (const order of rawData.vendor_orders) {
      const validation = validateVendorOrder(order);

      if (!validation.valid) {
        result.validation.errors.push({
          type: 'vendor_order',
          source: order.source_file,
          errors: validation.errors,
        });
        continue;
      }

      if (validation.warnings.length > 0) {
        result.validation.warnings.push({
          type: 'vendor_order',
          source: order.source_file,
          warnings: validation.warnings,
        });
      }

      result.vendor_orders.push({
        vendor: normalizeVendor(order.vendor),
        order_date: parseDate(order.order_date),
        delivery_date: parseDate(order.delivery_date),
        invoice_number: fixOCRErrors(order.invoice_number),
        org_id: order.org_id || 'default',
        source_file: order.source_file,
        notes: order.notes,
        created_at: new Date().toISOString(),
      });

      result.stats.orders_processed++;
    }
  }

  // Process order lines
  if (rawData.order_lines) {
    for (const line of rawData.order_lines) {
      const validation = validateOrderLine(line);

      if (!validation.valid) {
        result.validation.errors.push({
          type: 'order_line',
          item: line.item_name,
          source: line.source_file,
          errors: validation.errors,
        });
        continue;
      }

      if (validation.warnings.length > 0) {
        result.validation.warnings.push({
          type: 'order_line',
          item: line.item_name,
          source: line.source_file,
          warnings: validation.warnings,
        });
      }

      const itemCode = line.item_code || generateItemCode(line.item_name, line.vendor);

      result.order_lines.push({
        invoice_number: fixOCRErrors(line.invoice_number),
        item_name: fixOCRErrors(line.item_name),
        item_code: itemCode,
        quantity: parseQuantity(line.quantity),
        uom: normalizeUOM(line.uom || 'EA'),
        price_each: parsePrice(line.price_each),
        price_case: parsePrice(line.price_case),
        extended_cost: parsePrice(line.extended_cost),
        vendor: normalizeVendor(line.vendor),
        org_id: line.org_id || 'default',
        source_file: line.source_file,
        created_at: new Date().toISOString(),
      });

      result.stats.lines_processed++;
    }
  }

  // Process inventory counts
  if (rawData.inventory_counts) {
    for (const count of rawData.inventory_counts) {
      result.inventory_counts.push({
        location: count.location,
        item_name: fixOCRErrors(count.item_name),
        count_on_hand: parseQuantity(count.count_on_hand),
        count_date: parseDate(count.count_date),
        source_file: count.source_file,
        org_id: count.org_id || 'default',
        created_at: new Date().toISOString(),
      });

      result.stats.counts_processed++;
    }
  }

  // Detect anomalies
  result.validation.anomalies = detectAnomalies(result.order_lines);

  return result;
}

// ============================================================================
// DATABASE INGESTION
// ============================================================================

/**
 * Insert data into PostgreSQL
 */
async function ingestToDatabase(data, orgId = 'default') {
  if (!db) {
    console.log('Database not available, returning transformed data only');
    return { success: false, reason: 'no_database', data };
  }

  const results = {
    orders_inserted: 0,
    lines_inserted: 0,
    counts_inserted: 0,
    errors: [],
  };

  try {
    // Insert vendor orders
    for (const order of data.vendor_orders) {
      try {
        await db.query(`
          INSERT INTO vendor_orders (vendor, order_date, delivery_date, invoice_number, org_id, source_file, notes, created_at)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
          ON CONFLICT (invoice_number, org_id) DO UPDATE SET
            delivery_date = COALESCE(EXCLUDED.delivery_date, vendor_orders.delivery_date),
            notes = COALESCE(EXCLUDED.notes, vendor_orders.notes)
        `, [
          order.vendor,
          order.order_date,
          order.delivery_date,
          order.invoice_number,
          orgId,
          order.source_file,
          order.notes,
          order.created_at,
        ]);
        results.orders_inserted++;
      } catch (err) {
        results.errors.push({ type: 'order', data: order, error: err.message });
      }
    }

    // Insert order lines
    for (const line of data.order_lines) {
      try {
        await db.query(`
          INSERT INTO order_lines (invoice_number, item_name, item_code, quantity, uom, price_each, price_case, extended_cost, vendor, org_id, source_file, created_at)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
        `, [
          line.invoice_number,
          line.item_name,
          line.item_code,
          line.quantity,
          line.uom,
          line.price_each,
          line.price_case,
          line.extended_cost,
          line.vendor,
          orgId,
          line.source_file,
          line.created_at,
        ]);
        results.lines_inserted++;
      } catch (err) {
        results.errors.push({ type: 'line', data: line, error: err.message });
      }
    }

    // Insert inventory counts as movements
    for (const count of data.inventory_counts) {
      try {
        await db.query(`
          INSERT INTO inventory_movements (item_code, location_id, movement_type, quantity, movement_date, org_id, notes, created_at)
          VALUES ($1, $2, 'count', $3, $4, $5, $6, $7)
        `, [
          generateItemCode(count.item_name, 'COUNT'),
          count.location,
          count.count_on_hand,
          count.count_date,
          orgId,
          `From file: ${count.source_file}`,
          count.created_at,
        ]);
        results.counts_inserted++;
      } catch (err) {
        results.errors.push({ type: 'count', data: count, error: err.message });
      }
    }

    return { success: true, results };
  } catch (err) {
    return { success: false, error: err.message, results };
  }
}

// ============================================================================
// MAIN EXECUTION
// ============================================================================

async function main() {
  const args = process.argv.slice(2);

  let inputData;

  if (args.includes('--stdin')) {
    // Read from stdin
    const chunks = [];
    for await (const chunk of process.stdin) {
      chunks.push(chunk);
    }
    const input = Buffer.concat(chunks).toString('utf8');
    inputData = JSON.parse(input);
  } else if (args[0]) {
    // Read from file
    const filePath = path.resolve(args[0]);
    const content = fs.readFileSync(filePath, 'utf8');
    inputData = JSON.parse(content);
  } else {
    console.error('Usage: node ingestVendorData.js <json_file>');
    console.error('       node ingestVendorData.js --stdin < data.json');
    process.exit(1);
  }

  console.log('\n====================================');
  console.log('NeuroPilot AI - Vendor Data Ingestion');
  console.log('====================================\n');

  // Transform data
  console.log('Transforming data...');
  const transformed = transformData(inputData);

  // Print stats
  console.log('\n📊 Processing Statistics:');
  console.log(`   Orders processed: ${transformed.stats.orders_processed}`);
  console.log(`   Lines processed: ${transformed.stats.lines_processed}`);
  console.log(`   Counts processed: ${transformed.stats.counts_processed}`);

  // Print validation issues
  if (transformed.validation.errors.length > 0) {
    console.log('\n❌ Validation Errors:');
    for (const err of transformed.validation.errors.slice(0, 10)) {
      console.log(`   - ${err.type}: ${err.errors.join(', ')}`);
    }
    if (transformed.validation.errors.length > 10) {
      console.log(`   ... and ${transformed.validation.errors.length - 10} more`);
    }
  }

  if (transformed.validation.warnings.length > 0) {
    console.log('\n⚠️  Validation Warnings:');
    for (const warn of transformed.validation.warnings.slice(0, 10)) {
      console.log(`   - ${warn.type}: ${warn.warnings.join(', ')}`);
    }
    if (transformed.validation.warnings.length > 10) {
      console.log(`   ... and ${transformed.validation.warnings.length - 10} more`);
    }
  }

  if (transformed.validation.anomalies.length > 0) {
    console.log('\n🔍 Anomalies Detected:');
    for (const anomaly of transformed.validation.anomalies) {
      console.log(`   - ${anomaly.type}: ${anomaly.item}`);
      console.log(`     Expected: $${anomaly.expected}, Actual: $${anomaly.actual} (${anomaly.deviation})`);
    }
  }

  // Output transformed data
  const outputPath = args[1] || 'transformed_data.json';
  fs.writeFileSync(outputPath, JSON.stringify(transformed, null, 2));
  console.log(`\n✅ Transformed data written to: ${outputPath}`);

  // Attempt database ingestion if available
  if (db && args.includes('--ingest')) {
    console.log('\nIngesting to database...');
    const result = await ingestToDatabase(transformed);
    if (result.success) {
      console.log('✅ Database ingestion complete');
      console.log(`   Orders: ${result.results.orders_inserted}`);
      console.log(`   Lines: ${result.results.lines_inserted}`);
      console.log(`   Counts: ${result.results.counts_inserted}`);
    } else {
      console.log('❌ Database ingestion failed:', result.error || result.reason);
    }
  }

  console.log('\n====================================\n');
}

// Run if called directly
if (require.main === module) {
  main().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
}

module.exports = {
  transformData,
  ingestToDatabase,
  normalizeVendor,
  normalizeUOM,
  fixOCRErrors,
  parsePrice,
  parseQuantity,
  parseDate,
  validateVendorOrder,
  validateOrderLine,
  detectAnomalies,
};
