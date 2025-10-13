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

// Seed recipes (plausible item codes)
function seedRecipes() {
  const seedData = [
    {
      id: 'RCP-CHICK-BIRYANI',
      name: 'Chicken Biryani',
      cuisine: 'South Asian',
      allergens: ['dairy'],
      basePortions: [
        { itemCode: 'RICE-BASM-20KG', description: 'Basmati Rice 20kg', unit: 'g', basePerPerson: 160, packSize: { qty: 20000, unit: 'g' } },
        { itemCode: 'CHICK-BRST-5KG', description: 'Chicken Breast', unit: 'g', basePerPerson: 180, packSize: { qty: 5000, unit: 'g' } },
        { itemCode: 'ONION-YELLOW-10KG', description: 'Yellow Onion', unit: 'g', basePerPerson: 25, packSize: { qty: 10000, unit: 'g' } },
        { itemCode: 'SPICE-BIRYANI-1KG', description: 'Biryani Spice Mix', unit: 'g', basePerPerson: 3, packSize: { qty: 1000, unit: 'g' } },
        { itemCode: 'OIL-VEG-20L', description: 'Vegetable Oil', unit: 'ml', basePerPerson: 6, packSize: { qty: 20000, unit: 'ml' } }
      ],
      notes: 'Hold back 10% rice for service wave 2; finish with fried onions + yogurt raita.'
    },
    {
      id: 'RCP-PANEER-BUTTER',
      name: 'Paneer Butter Masala',
      cuisine: 'South Asian',
      allergens: ['dairy'],
      basePortions: [
        { itemCode: 'PANEER-5KG', description: 'Paneer Cubes', unit: 'g', basePerPerson: 120, packSize: { qty: 5000, unit: 'g' } },
        { itemCode: 'TOMATO-PASTE-5KG', description: 'Tomato Paste', unit: 'g', basePerPerson: 90, packSize: { qty: 5000, unit: 'g' } },
        { itemCode: 'CREAM-35-1L', description: 'Cream 35%', unit: 'ml', basePerPerson: 20, packSize: { qty: 1000, unit: 'ml' } },
        { itemCode: 'BUTTER-UNSALTED-1KG', description: 'Unsalted Butter', unit: 'g', basePerPerson: 10, packSize: { qty: 1000, unit: 'g' } },
        { itemCode: 'SPICE-GARAM-500G', description: 'Garam Masala', unit: 'g', basePerPerson: 2, packSize: { qty: 500, unit: 'g' } }
      ],
      notes: 'Vegetarian option; garnish with fresh coriander.'
    },
    {
      id: 'RCP-NAAN',
      name: 'Naan Bread',
      cuisine: 'South Asian',
      allergens: ['gluten', 'dairy'],
      basePortions: [
        { itemCode: 'NAAN-12PK', description: 'Naan 12-pack', unit: 'each', basePerPerson: 1.2, packSize: { qty: 12, unit: 'each' } }
      ],
      notes: 'Warm before serving.'
    },
    {
      id: 'RCP-SALAD-MIX',
      name: 'Mixed Garden Salad',
      cuisine: 'Universal',
      allergens: [],
      basePortions: [
        { itemCode: 'GREENS-MIX-12KG', description: 'Mixed Greens', unit: 'g', basePerPerson: 120, packSize: { qty: 12000, unit: 'g' } },
        { itemCode: 'CUCUMBER-5KG', description: 'Cucumber', unit: 'g', basePerPerson: 40, packSize: { qty: 5000, unit: 'g' } },
        { itemCode: 'TOMATO-CHERRY-2KG', description: 'Cherry Tomatoes', unit: 'g', basePerPerson: 40, packSize: { qty: 2000, unit: 'g' } },
        { itemCode: 'DRESSING-RANCH-4L', description: 'Ranch Dressing', unit: 'ml', basePerPerson: 20, packSize: { qty: 4000, unit: 'ml' } }
      ],
      notes: 'Keep chilled until service.'
    },
    {
      id: 'RCP-RAITA',
      name: 'Cucumber Raita',
      cuisine: 'South Asian',
      allergens: ['dairy'],
      basePortions: [
        { itemCode: 'YOGURT-PLAIN-4L', description: 'Plain Yogurt', unit: 'ml', basePerPerson: 80, packSize: { qty: 4000, unit: 'ml' } },
        { itemCode: 'CUCUMBER-5KG', description: 'Cucumber', unit: 'g', basePerPerson: 25, packSize: { qty: 5000, unit: 'g' } },
        { itemCode: 'CUMIN-GROUND-500G', description: 'Ground Cumin', unit: 'g', basePerPerson: 1, packSize: { qty: 500, unit: 'g' } },
        { itemCode: 'SALT-KOSHER-5KG', description: 'Kosher Salt', unit: 'g', basePerPerson: 1, packSize: { qty: 5000, unit: 'g' } }
      ],
      notes: 'Mix 30 min before service; keep refrigerated.'
    },
    {
      id: 'RCP-DHAL-TADKA',
      name: 'Dhal Tadka',
      cuisine: 'South Asian',
      allergens: [],
      basePortions: [
        { itemCode: 'LENTILS-RED-20KG', description: 'Red Lentils', unit: 'g', basePerPerson: 120, packSize: { qty: 20000, unit: 'g' } },
        { itemCode: 'ONION-YELLOW-10KG', description: 'Yellow Onion', unit: 'g', basePerPerson: 20, packSize: { qty: 10000, unit: 'g' } },
        { itemCode: 'TOMATO-5KG', description: 'Tomatoes', unit: 'g', basePerPerson: 30, packSize: { qty: 5000, unit: 'g' } },
        { itemCode: 'GHEE-2KG', description: 'Ghee', unit: 'g', basePerPerson: 6, packSize: { qty: 2000, unit: 'g' } },
        { itemCode: 'SPICE-TADKA-1KG', description: 'Tadka Spice Mix', unit: 'g', basePerPerson: 3, packSize: { qty: 1000, unit: 'g' } }
      ],
      notes: 'Lentil curry; vegan if ghee replaced with oil.'
    },
    {
      id: 'RCP-BAKED-FISH',
      name: 'Herb-Crusted Baked Fish',
      cuisine: 'Mediterranean',
      allergens: ['fish'],
      basePortions: [
        { itemCode: 'FISH-COD-5KG', description: 'Cod Fillet', unit: 'g', basePerPerson: 190, packSize: { qty: 5000, unit: 'g' } },
        { itemCode: 'LEMON-JUICE-1L', description: 'Lemon Juice', unit: 'ml', basePerPerson: 10, packSize: { qty: 1000, unit: 'ml' } },
        { itemCode: 'HERB-ITALIAN-500G', description: 'Italian Herb Mix', unit: 'g', basePerPerson: 1, packSize: { qty: 500, unit: 'g' } },
        { itemCode: 'OIL-OLIVE-5L', description: 'Olive Oil', unit: 'ml', basePerPerson: 6, packSize: { qty: 5000, unit: 'ml' } }
      ],
      notes: 'Bake at 375°F for 18-20 min.'
    }
  ];

  seedData.forEach(recipe => {
    recipe.createdAt = new Date().toISOString();
    recipe.updatedAt = new Date().toISOString();
    recipes.set(recipe.id, recipe);
  });

  logger.info(`Seeded ${recipes.size} recipes`);
}

// Initialize seed data
seedRecipes();

/**
 * Auto-populate day lineups for 4-week cycle
 */
function autoPopulateDayLineups() {
  const Planner = require('./Planner');
  const weeks = Planner.buildWeeksStructure();
  const recipeArray = Array.from(recipes.values());

  // Assign recipes to days in rotation
  let recipeIdx = 0;
  for (const week of weeks) {
    for (const day of week.days) {
      // Assign 1-2 recipes per day (rotating through available recipes)
      const dayRecipes = [
        recipeArray[recipeIdx % recipeArray.length]?.id,
        recipeArray[(recipeIdx + 1) % recipeArray.length]?.id
      ].filter(Boolean);

      setDayRecipes(day.isoDate, dayRecipes);
      recipeIdx += 2;
    }
  }

  logger.info(`Auto-populated ${weeks.length * 7} days with recipes`);
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
