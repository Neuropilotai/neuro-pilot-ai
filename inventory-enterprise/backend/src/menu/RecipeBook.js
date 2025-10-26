/**
 * RecipeBook - Recipe CRUD and item code mapping
 *
 * @module menu/Planner
 * @version 14.4.2
 */

const { v4: uuidv4 } = require('uuid');
const Quantizer = require('./Quantizer');
const { logger } = require('../../config/logger');

// In-memory storage (MVP - move to DB later)
const recipes = new Map();
const dayLineups = new Map(); // isoDate -> recipe IDs[]
let currentHeadcount = 280;

// Policy storage
const policy = {
  population: 280,
  takeoutLockTime: '19:30',
  currentWeek: 2,
  currentDay: 'Wednesday',
  cycleStartDate: new Date('2025-01-01') // Anchor date for calculations
};

// Seed recipes - Load from JSON file if exists, or use defaults
function seedRecipes() {
  const fs = require('fs');
  const path = require('path');

  let seedData = [];
  const jsonPath = path.join(__dirname, '../../data/menu_seed.json');

  try {
    if (fs.existsSync(jsonPath)) {
      const fileData = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
      seedData = fileData.recipes || [];
      logger.info(`Loaded ${seedData.length} recipes from menu_seed.json`);
    }
  } catch (error) {
    logger.warn('Could not load menu_seed.json, using default recipes:', error.message);
  }

  // If no JSON or empty, generate default recipes for all 4 weeks
  if (seedData.length === 0) {
    seedData = generateDefaultRecipes();
  }

  seedData.forEach(recipe => {
    if (!recipe.createdAt) recipe.createdAt = new Date().toISOString();
    if (!recipe.updatedAt) recipe.updatedAt = new Date().toISOString();
    recipes.set(recipe.id, recipe);
  });

  logger.info(`Seeded ${recipes.size} total recipes for menu system`);
}

// Generate 84 default recipes (4 weeks × 7 days × 3 meals)
function generateDefaultRecipes() {
  const meals = ['Breakfast', 'Lunch', 'Dinner'];
  const days = ['Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday', 'Monday', 'Tuesday'];
  const recipes = [];

  const breakfastNames = ['Scrambled Eggs & Toast', 'Pancakes & Syrup', 'Oatmeal Bar', 'French Toast',
    'Bagels & Cream Cheese', 'Breakfast Burrito', 'Cereal Bar'];
  const lunchNames = ['Chicken Biryani', 'Pasta Bolognese', 'Grilled Cheese & Soup', 'Stir Fry',
    'Fish & Chips', 'Tacos', 'Pizza'];
  const dinnerNames = ['Beef Stew', 'Baked Salmon', 'Roast Chicken', 'Meatloaf', 'Pork Chops',
    'Lamb Curry', 'Beef Stroganoff'];

  let recipeId = 0;
  for (let week = 1; week <= 4; week++) {
    for (let dayIdx = 0; dayIdx < 7; dayIdx++) {
      for (let mealIdx = 0; mealIdx < 3; mealIdx++) {
        const meal = meals[mealIdx];
        const day = days[dayIdx];
        let mealName;

        if (meal === 'Breakfast') {
          mealName = breakfastNames[recipeId % breakfastNames.length];
        } else if (meal === 'Lunch') {
          mealName = lunchNames[recipeId % lunchNames.length];
        } else {
          mealName = dinnerNames[recipeId % dinnerNames.length];
        }

        recipes.push({
          id: `RCP-W${week}-${day.substring(0,3).toUpperCase()}-${meal.substring(0,2).toUpperCase()}-${recipeId}`,
          name: `${mealName} (Week ${week})`,
          meal: meal,
          week: week,
          day: day,
          cuisine: 'International',
          allergens: [],
          basePortions: [
            {
              itemCode: `MAIN-${recipeId}`,
              description: `Main ingredient for ${mealName}`,
              unit: 'g',
              basePerPerson: 180,
              packSize: { qty: 5000, unit: 'g' }
            },
            {
              itemCode: `SIDE-${recipeId}`,
              description: `Side for ${mealName}`,
              unit: 'g',
              basePerPerson: 120,
              packSize: { qty: 5000, unit: 'g' }
            }
          ],
          notes: `Prepared for Week ${week}, ${day} ${meal}`
        });
        recipeId++;
      }
    }
  }

  return recipes;
}

// Initialize seed data
seedRecipes();

/**
 * Auto-populate day lineups for 4-week cycle
 * Assigns 3 recipes per day (breakfast, lunch, dinner) based on metadata
 */
function autoPopulateDayLineups() {
  const Planner = require('./Planner');
  const weeks = Planner.buildWeeksStructure();
  const recipeArray = Array.from(recipes.values());

  let assignedCount = 0;

  for (let weekIdx = 0; weekIdx < weeks.length; weekIdx++) {
    const week = weeks[weekIdx];
    const weekNumber = weekIdx + 1;

    for (let dayIdx = 0; dayIdx < week.days.length; dayIdx++) {
      const day = week.days[dayIdx];
      const dayName = day.dayName;

      // Find recipes matching this week and day
      const dayRecipes = recipeArray.filter(r =>
        r.week === weekNumber && r.day === dayName
      );

      // If we have week/day specific recipes, use them
      if (dayRecipes.length > 0) {
        // Sort by meal order: Breakfast, Lunch, Dinner
        const mealOrder = { 'Breakfast': 0, 'Lunch': 1, 'Dinner': 2 };
        dayRecipes.sort((a, b) => (mealOrder[a.meal] || 99) - (mealOrder[b.meal] || 99));

        setDayRecipes(day.isoDate, dayRecipes.map(r => r.id));
        assignedCount += dayRecipes.length;
      } else {
        // Fallback: assign any 3 recipes for variety
        const startIdx = (weekIdx * 7 + dayIdx) * 3;
        const fallbackRecipes = [
          recipeArray[startIdx % recipeArray.length]?.id,
          recipeArray[(startIdx + 1) % recipeArray.length]?.id,
          recipeArray[(startIdx + 2) % recipeArray.length]?.id
        ].filter(Boolean);

        setDayRecipes(day.isoDate, fallbackRecipes);
        assignedCount += fallbackRecipes.length;
      }
    }
  }

  logger.info(`Auto-populated ${weeks.length * 7} days with ${assignedCount} recipe assignments`);
}

// Auto-populate on startup
autoPopulateDayLineups();

/**
 * Get all recipes
 */
function getAllRecipes() {
  return Array.from(recipes.values());
}

/**
 * Get recipe by ID
 */
function getRecipeById(id) {
  return recipes.get(id) || null;
}

/**
 * Create new recipe
 */
function createRecipe(recipeData) {
  const id = recipeData.id || `RCP-${uuidv4().substring(0, 8).toUpperCase()}`;
  const recipe = {
    ...recipeData,
    id,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  recipes.set(id, recipe);
  return recipe;
}

/**
 * Update recipe
 */
function updateRecipe(id, updates) {
  const recipe = recipes.get(id);
  if (!recipe) return null;

  const updated = {
    ...recipe,
    ...updates,
    id, // Preserve ID
    createdAt: recipe.createdAt, // Preserve creation date
    updatedAt: new Date().toISOString()
  };

  recipes.set(id, updated);
  return updated;
}

/**
 * Delete recipe
 */
function deleteRecipe(id) {
  return recipes.delete(id);
}

/**
 * Get recipes for day
 */
function getDayRecipes(isoDate) {
  const recipeIds = dayLineups.get(isoDate) || [];
  return recipeIds.map(id => recipes.get(id)).filter(Boolean);
}

/**
 * Set recipes for day
 */
function setDayRecipes(isoDate, recipeIds) {
  dayLineups.set(isoDate, recipeIds);
}

/**
 * Get/set headcount
 */
function getHeadcount() {
  return currentHeadcount;
}

function setHeadcount(count) {
  if (count < 1 || count > 10000) {
    throw new Error('Headcount must be between 1 and 10000');
  }
  currentHeadcount = count;
  return currentHeadcount;
}

/**
 * Scale recipe for current headcount
 */
function scaleRecipeForHeadcount(recipeId) {
  const recipe = recipes.get(recipeId);
  if (!recipe) return null;

  const scaled = Quantizer.scaleRecipe(recipe, currentHeadcount);

  return {
    ...recipe,
    calculatedLines: scaled,
    headcount: currentHeadcount
  };
}

/**
 * Get/set policy
 */
function getPolicy() {
  return { ...policy };
}

function updatePolicy(updates) {
  Object.assign(policy, updates);
  logger.info('Policy updated:', updates);
  return { ...policy };
}

module.exports = {
  getAllRecipes,
  getRecipeById,
  createRecipe,
  updateRecipe,
  deleteRecipe,
  getDayRecipes,
  setDayRecipes,
  getHeadcount,
  setHeadcount,
  scaleRecipeForHeadcount,
  getPolicy,
  updatePolicy,
  seedRecipes
};
