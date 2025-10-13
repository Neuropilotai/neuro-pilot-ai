/**
 * ShoppingList - Aggregate quantities by item code
 *
 * @module menu/ShoppingList
 * @version 14.4.2
 */

const Quantizer = require('./Quantizer');
const RecipeBook = require('./RecipeBook');
const Planner = require('./Planner');

/**
 * Generate shopping list for a week
 *
 * @param {number} weekNumber - Week number (1-4)
 * @returns {Array} Shopping list items
 */
function generateWeeklyShoppingList(weekNumber) {
  const weekStart = Planner.getWeekStartDate(weekNumber);
  const days = Planner.getWeekDays(weekStart);
  const headcount = RecipeBook.getHeadcount();

  // Collect all calc lines from all recipes in the week
  const allCalcLines = [];

  for (const isoDate of days) {
    const dayRecipes = RecipeBook.getDayRecipes(isoDate);

    for (const recipe of dayRecipes) {
      const scaledLines = Quantizer.scaleRecipe(recipe, headcount);
      allCalcLines.push(...scaledLines);
    }
  }

  // Aggregate by item code
  const aggregated = Quantizer.aggregateQuantities(allCalcLines);

  // Convert to array and sort by description
  const shoppingList = Array.from(aggregated.values()).sort((a, b) =>
    a.description.localeCompare(b.description)
  );

  return shoppingList;
}

/**
 * Export shopping list as CSV
 *
 * @param {Array} shoppingList - Shopping list items
 * @param {number} weekNumber - Week number
 * @returns {string} CSV content
 */
function exportAsCSV(shoppingList, weekNumber) {
  const headers = [
    'itemCode',
    'description',
    'unit',
    'totalIssueQty',
    'packSizeQty',
    'packSizeUnit',
    'totalPacks',
    'week'
  ];

  const rows = shoppingList.map(item => [
    item.itemCode,
    `"${item.description}"`, // Quote for CSV safety
    item.unit,
    item.totalIssueQty,
    item.packSize ? item.packSize.qty : '',
    item.packSize ? item.packSize.unit : '',
    item.totalPacks || '',
    weekNumber
  ]);

  const csvContent = [
    headers.join(','),
    ...rows.map(row => row.join(','))
  ].join('\n');

  return csvContent;
}

module.exports = {
  generateWeeklyShoppingList,
  exportAsCSV
};
