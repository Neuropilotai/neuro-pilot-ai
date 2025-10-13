/**
 * Quantizer - Quantity scaling and pack math for menu planning
 * Handles unit conversions, rounding, and pack calculations
 *
 * @module menu/Quantizer
 * @version 14.4.2
 */

/**
 * Convert between units
 * @param {number} qty - Quantity in source unit
 * @param {string} fromUnit - Source unit
 * @param {string} toUnit - Target unit
 * @returns {number} Converted quantity
 */
function convertUnit(qty, fromUnit, toUnit) {
  // Normalize units
  const from = fromUnit.toLowerCase();
  const to = toUnit.toLowerCase();

  if (from === to) return qty;

  // Weight conversions
  const weightConversions = {
    'g_kg': 0.001,
    'kg_g': 1000,
    'g_lb': 0.00220462,
    'lb_g': 453.592,
    'kg_lb': 2.20462,
    'lb_kg': 0.453592
  };

  // Volume conversions
  const volumeConversions = {
    'ml_l': 0.001,
    'l_ml': 1000
  };

  const key = `${from}_${to}`;

  if (weightConversions[key]) {
    return qty * weightConversions[key];
  }

  if (volumeConversions[key]) {
    return qty * volumeConversions[key];
  }

  // If no conversion found, return as-is
  return qty;
}

/**
 * Round quantity to operational units
 * - kg: 0.1 kg precision
 * - L: 0.5 L precision
 * - each: 1 unit precision
 *
 * @param {number} qty - Raw quantity
 * @param {string} unit - Unit type
 * @returns {number} Rounded quantity
 */
function roundToOperational(qty, unit) {
  const u = unit.toLowerCase();

  if (u === 'kg') {
    return Math.ceil(qty * 10) / 10; // 0.1 kg precision
  }

  if (u === 'l') {
    return Math.ceil(qty * 2) / 2; // 0.5 L precision
  }

  if (u === 'each' || u === 'unit' || u === 'pcs') {
    return Math.ceil(qty); // Whole units
  }

  // Default: round to 2 decimals
  return Math.round(qty * 100) / 100;
}

/**
 * Calculate required quantity for headcount
 *
 * @param {Object} portion - Portion definition
 * @param {string} portion.unit - Unit of measurement
 * @param {number} portion.basePerPerson - Base amount per person
 * @param {Object} [portion.packSize] - Pack size info
 * @param {number} headcount - Number of people
 * @returns {Object} Calculated quantities
 */
function calculateQuantity(portion, headcount) {
  const { unit, basePerPerson, packSize } = portion;

  // Calculate raw quantity
  const rawQty = basePerPerson * headcount;

  // Convert to operational unit if needed
  let issueUnit = unit;
  let issueQty = rawQty;

  // Convert grams to kg for large quantities
  if (unit.toLowerCase() === 'g' && rawQty >= 1000) {
    issueUnit = 'kg';
    issueQty = convertUnit(rawQty, 'g', 'kg');
  }

  // Convert ml to L for large quantities
  if (unit.toLowerCase() === 'ml' && rawQty >= 1000) {
    issueUnit = 'L';
    issueQty = convertUnit(rawQty, 'ml', 'L');
  }

  // Round to operational precision
  issueQty = roundToOperational(issueQty, issueUnit);

  // Calculate pack count if packSize is known
  let packCount = null;
  let packUnit = null;

  if (packSize && packSize.qty && packSize.unit) {
    // Convert issueQty to pack unit for comparison
    const qtyInPackUnit = convertUnit(issueQty, issueUnit, packSize.unit);

    // Calculate packs needed (round up for safety)
    packCount = Math.ceil(qtyInPackUnit / packSize.qty);
    packUnit = packSize.unit;
  }

  return {
    rawQty,
    rawUnit: unit,
    issueQty,
    issueUnit,
    packCount,
    packSize: packSize ? { qty: packSize.qty, unit: packSize.unit } : null
  };
}

/**
 * Scale all portions in a recipe for headcount
 *
 * @param {Object} recipe - Recipe with basePortions
 * @param {number} headcount - Number of people
 * @returns {Array} Calculated lines
 */
function scaleRecipe(recipe, headcount) {
  if (!recipe.basePortions || !Array.isArray(recipe.basePortions)) {
    return [];
  }

  return recipe.basePortions.map(portion => {
    const calc = calculateQuantity(portion, headcount);

    return {
      itemCode: portion.itemCode,
      description: portion.description,
      unit: calc.issueUnit,
      rawQty: calc.rawQty,
      rawUnit: calc.rawUnit,
      issueQty: calc.issueQty,
      packCount: calc.packCount,
      packSize: calc.packSize,
      resolution: 'ok' // Will be updated by RecipeBook if item not found
    };
  });
}

/**
 * Aggregate quantities from multiple calc lines
 * Used for shopping list generation
 *
 * @param {Array} calcLines - Array of calculated lines
 * @returns {Map} Map of itemCode -> aggregated totals
 */
function aggregateQuantities(calcLines) {
  const aggregated = new Map();

  for (const line of calcLines) {
    const key = line.itemCode;

    if (!aggregated.has(key)) {
      aggregated.set(key, {
        itemCode: line.itemCode,
        description: line.description,
        unit: line.unit,
        totalIssueQty: 0,
        totalPacks: 0,
        packSize: line.packSize
      });
    }

    const agg = aggregated.get(key);
    agg.totalIssueQty += line.issueQty;

    if (line.packCount) {
      agg.totalPacks += line.packCount;
    }
  }

  // Round aggregated quantities
  for (const [key, agg] of aggregated) {
    agg.totalIssueQty = roundToOperational(agg.totalIssueQty, agg.unit);

    // Recalculate total packs if packSize is known
    if (agg.packSize && agg.packSize.qty) {
      const qtyInPackUnit = convertUnit(agg.totalIssueQty, agg.unit, agg.packSize.unit);
      agg.totalPacks = Math.ceil(qtyInPackUnit / agg.packSize.qty);
    }
  }

  return aggregated;
}

module.exports = {
  convertUnit,
  roundToOperational,
  calculateQuantity,
  scaleRecipe,
  aggregateQuantities
};
