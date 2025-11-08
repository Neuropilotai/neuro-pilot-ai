/**
 * Costing Engine - Shared pricing and recipe costing logic
 * Resolves effective vendor prices with org preferences and fallback logic
 */

const db = require('../config/database');

/**
 * Resolve effective price for an item at a given date
 * @param {number} org_id - Organization ID
 * @param {string} item_sku - Item SKU
 * @param {string} atDate - Date string (YYYY-MM-DD)
 * @returns {Promise<{price: number, vendor_id: number, source: string, currency: string}>}
 */
async function resolveEffectivePrice(org_id, item_sku, atDate = null) {
  const targetDate = atDate || new Date().toISOString().split('T')[0];

  // Step 1: Get org's preferred vendor
  const preferredVendor = await db.query(
    'SELECT preferred_vendor_id FROM org_vendor_defaults WHERE org_id = $1',
    [org_id]
  );

  const preferredVendorId = preferredVendor.rows[0]?.preferred_vendor_id;

  // Step 2: Try to get price from preferred vendor
  if (preferredVendorId) {
    const preferredPrice = await db.query(`
      SELECT vp.price, vp.currency, vp.vendor_item_id, vi.vendor_id
      FROM vendor_prices vp
      JOIN vendor_items vi ON vp.vendor_item_id = vi.id
      WHERE vi.vendor_id = $1
        AND vi.item_sku = $2
        AND vp.effective_from <= $3
        AND (vp.effective_to IS NULL OR vp.effective_to >= $3)
      ORDER BY vp.effective_from DESC
      LIMIT 1
    `, [preferredVendorId, item_sku, targetDate]);

    if (preferredPrice.rows.length > 0) {
      const row = preferredPrice.rows[0];
      return {
        price: parseFloat(row.price),
        vendor_id: row.vendor_id,
        source: 'preferred_vendor',
        currency: row.currency
      };
    }
  }

  // Step 3: Fallback to any vendor with latest effective price
  const fallbackPrice = await db.query(`
    SELECT vp.price, vp.currency, vi.vendor_id
    FROM vendor_prices vp
    JOIN vendor_items vi ON vp.vendor_item_id = vi.id
    WHERE vi.item_sku = $1
      AND vp.effective_from <= $2
      AND (vp.effective_to IS NULL OR vp.effective_to >= $2)
    ORDER BY vp.effective_from DESC
    LIMIT 1
  `, [item_sku, targetDate]);

  if (fallbackPrice.rows.length > 0) {
    const row = fallbackPrice.rows[0];
    return {
      price: parseFloat(row.price),
      vendor_id: row.vendor_id,
      source: 'fallback_vendor',
      currency: row.currency
    };
  }

  // Step 4: No price found
  throw new Error(`No price found for item ${item_sku} at date ${targetDate}`);
}

/**
 * Compute recipe cost with prep loss
 * @param {number} org_id - Organization ID
 * @param {number} recipe_id - Recipe ID
 * @param {string} atDate - Date string (YYYY-MM-DD)
 * @returns {Promise<{unit_cost: number, total_cost: number, currency: string, breakdown: Array}>}
 */
async function computeRecipeCost(org_id, recipe_id, atDate = null) {
  const targetDate = atDate || new Date().toISOString().split('T')[0];

  // Get recipe metadata
  const recipeQuery = await db.query(
    'SELECT yield_qty, yield_uom, prep_loss_pct FROM recipes WHERE id = $1 AND org_id = $2',
    [recipe_id, org_id]
  );

  if (recipeQuery.rows.length === 0) {
    throw new Error(`Recipe ${recipe_id} not found`);
  }

  const recipe = recipeQuery.rows[0];
  const yieldQty = parseFloat(recipe.yield_qty);
  const prepLossPct = parseFloat(recipe.prep_loss_pct) || 0;
  const lossMultiplier = 1 + (prepLossPct / 100);

  // Get recipe ingredients
  const ingredientsQuery = await db.query(
    'SELECT item_sku, qty, uom FROM recipe_ingredients WHERE recipe_id = $1',
    [recipe_id]
  );

  if (ingredientsQuery.rows.length === 0) {
    return {
      unit_cost: 0,
      total_cost: 0,
      currency: 'USD',
      breakdown: []
    };
  }

  // Calculate cost for each ingredient
  const breakdown = [];
  let totalCost = 0;

  for (const ingredient of ingredientsQuery.rows) {
    try {
      const priceInfo = await resolveEffectivePrice(org_id, ingredient.item_sku, targetDate);
      const ingredientQty = parseFloat(ingredient.qty);
      const ingredientCost = ingredientQty * priceInfo.price;

      breakdown.push({
        item_sku: ingredient.item_sku,
        qty: ingredientQty,
        uom: ingredient.uom,
        unit_price: priceInfo.price,
        total_price: ingredientCost,
        vendor_id: priceInfo.vendor_id,
        source: priceInfo.source
      });

      totalCost += ingredientCost;
    } catch (err) {
      // Ingredient has no price - log warning but continue
      console.warn(`No price for ingredient ${ingredient.item_sku}:`, err.message);
      breakdown.push({
        item_sku: ingredient.item_sku,
        qty: parseFloat(ingredient.qty),
        uom: ingredient.uom,
        unit_price: 0,
        total_price: 0,
        vendor_id: null,
        source: 'missing_price',
        error: err.message
      });
    }
  }

  // Apply prep loss and compute unit cost
  const totalCostWithLoss = totalCost * lossMultiplier;
  const unitCost = yieldQty > 0 ? totalCostWithLoss / yieldQty : 0;

  return {
    unit_cost: parseFloat(unitCost.toFixed(4)),
    total_cost: parseFloat(totalCostWithLoss.toFixed(2)),
    currency: 'USD',
    yield_qty: yieldQty,
    yield_uom: recipe.yield_uom,
    prep_loss_pct: prepLossPct,
    breakdown
  };
}

/**
 * Compute cost for a waste event
 * @param {number} org_id - Organization ID
 * @param {string} item_sku - Item SKU (if item waste)
 * @param {string} recipe_code - Recipe code (if recipe waste)
 * @param {number} qty - Quantity wasted
 * @param {string} atDate - Date string (YYYY-MM-DD)
 * @returns {Promise<number>} Cost of wasted item/recipe
 */
async function computeWasteCost(org_id, item_sku, recipe_code, qty, atDate = null) {
  const targetDate = atDate || new Date().toISOString().split('T')[0];

  if (item_sku) {
    // Direct item waste
    try {
      const priceInfo = await resolveEffectivePrice(org_id, item_sku, targetDate);
      return parseFloat((qty * priceInfo.price).toFixed(2));
    } catch (err) {
      console.warn(`No price for wasted item ${item_sku}:`, err.message);
      return 0;
    }
  } else if (recipe_code) {
    // Recipe waste - get recipe ID and compute cost
    const recipeQuery = await db.query(
      'SELECT id FROM recipes WHERE org_id = $1 AND code = $2',
      [org_id, recipe_code]
    );

    if (recipeQuery.rows.length === 0) {
      console.warn(`Recipe ${recipe_code} not found for waste costing`);
      return 0;
    }

    try {
      const costInfo = await computeRecipeCost(org_id, recipeQuery.rows[0].id, targetDate);
      return parseFloat((qty * costInfo.unit_cost).toFixed(2));
    } catch (err) {
      console.warn(`Could not compute cost for recipe ${recipe_code}:`, err.message);
      return 0;
    }
  }

  return 0;
}

module.exports = {
  resolveEffectivePrice,
  computeRecipeCost,
  computeWasteCost
};
