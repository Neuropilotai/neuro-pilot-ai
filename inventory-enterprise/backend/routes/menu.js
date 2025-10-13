/**
 * Menu Planning API Routes (v14.4.2)
 * 4-week menu calendar, recipe management, quantity scaling, shopping lists
 *
 * @version 14.4.2
 */

const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const { requireOwner } = require('../middleware/requireOwner');
const { logger } = require('../config/logger');

const Planner = require('../src/menu/Planner');
const RecipeBook = require('../src/menu/RecipeBook');
const ShoppingList = require('../src/menu/ShoppingList');

// Rate limiting (10 ops/min per IP)
const rateLimits = {};
const RATE_LIMIT_WINDOW = 60000; // 1 min
const RATE_LIMIT_MAX = 10;

function checkRateLimit(ip) {
  const now = Date.now();

  if (!rateLimits[ip]) {
    rateLimits[ip] = { count: 1, window: now };
    return { allowed: true };
  }

  const entry = rateLimits[ip];

  if (now - entry.window > RATE_LIMIT_WINDOW) {
    entry.count = 1;
    entry.window = now;
    return { allowed: true };
  }

  if (entry.count >= RATE_LIMIT_MAX) {
    const resetIn = Math.ceil((RATE_LIMIT_WINDOW - (now - entry.window)) / 1000);
    return { allowed: false, resetIn };
  }

  entry.count++;
  return { allowed: true };
}

/**
 * GET /api/menu/weeks
 * Get 4-week menu structure with dates
 */
router.get('/weeks', authenticateToken, requireOwner, (req, res) => {
  try {
    const weeks = Planner.buildWeeksStructure();

    // Populate recipes for each day
    weeks.forEach(week => {
      week.days.forEach(day => {
        day.recipes = RecipeBook.getDayRecipes(day.isoDate);
      });
    });

    res.json({
      success: true,
      headcount: RecipeBook.getHeadcount(),
      currentWeek: Planner.getCurrentWeekNumber(),
      weeks
    });
  } catch (error) {
    logger.error('GET /api/menu/weeks error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/menu/week/:n
 * Get specific week with calculated quantities
 */
router.get('/week/:n', authenticateToken, requireOwner, (req, res) => {
  try {
    const weekNum = parseInt(req.params.n);

    if (weekNum < 1 || weekNum > 4) {
      return res.status(400).json({
        success: false,
        error: 'Week number must be between 1 and 4'
      });
    }

    const weekStart = Planner.getWeekStartDate(weekNum);
    const days = Planner.getWeekDays(weekStart);
    const headcount = RecipeBook.getHeadcount();

    const weekData = {
      weekNumber: weekNum,
      startsOn: days[0],
      endsOn: days[6],
      headcount,
      days: days.map(isoDate => {
        const recipes = RecipeBook.getDayRecipes(isoDate);
        const scaledRecipes = recipes.map(recipe =>
          RecipeBook.scaleRecipeForHeadcount(recipe.id)
        );

        return {
          isoDate,
          dayName: Planner.getDayName(isoDate),
          recipes: scaledRecipes
        };
      })
    };

    res.json({
      success: true,
      week: weekData
    });
  } catch (error) {
    logger.error(`GET /api/menu/week/${req.params.n} error:`, error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/menu/headcount
 * Update headcount (affects all scaling)
 */
router.post('/headcount', authenticateToken, requireOwner, (req, res) => {
  const rateLimitCheck = checkRateLimit(req.ip);
  if (!rateLimitCheck.allowed) {
    return res.status(429).json({
      success: false,
      error: 'Rate limit exceeded',
      resetIn: rateLimitCheck.resetIn
    });
  }

  try {
    const { headcount } = req.body;

    if (!headcount || typeof headcount !== 'number') {
      return res.status(400).json({
        success: false,
        error: 'headcount (number) is required'
      });
    }

    const newHeadcount = RecipeBook.setHeadcount(headcount);

    logger.info(`Headcount updated to ${newHeadcount} by ${req.user.email}`);

    res.json({
      success: true,
      headcount: newHeadcount
    });
  } catch (error) {
    logger.error('POST /api/menu/headcount error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/menu/recipes
 * Get all recipes
 */
router.get('/recipes', authenticateToken, requireOwner, (req, res) => {
  try {
    const recipes = RecipeBook.getAllRecipes();

    res.json({
      success: true,
      recipes,
      total: recipes.length
    });
  } catch (error) {
    logger.error('GET /api/menu/recipes error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/menu/recipe/:id
 * Get single recipe with calculated quantities
 */
router.get('/recipe/:id', authenticateToken, requireOwner, (req, res) => {
  try {
    const scaled = RecipeBook.scaleRecipeForHeadcount(req.params.id);

    if (!scaled) {
      return res.status(404).json({
        success: false,
        error: 'Recipe not found'
      });
    }

    res.json({
      success: true,
      recipe: scaled
    });
  } catch (error) {
    logger.error(`GET /api/menu/recipe/${req.params.id} error:`, error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/menu/recipe
 * Create new recipe
 */
router.post('/recipe', authenticateToken, requireOwner, (req, res) => {
  const rateLimitCheck = checkRateLimit(req.ip);
  if (!rateLimitCheck.allowed) {
    return res.status(429).json({
      success: false,
      error: 'Rate limit exceeded',
      resetIn: rateLimitCheck.resetIn
    });
  }

  try {
    const recipe = RecipeBook.createRecipe(req.body);

    logger.info(`Recipe created: ${recipe.id} by ${req.user.email}`);

    res.json({
      success: true,
      recipe
    });
  } catch (error) {
    logger.error('POST /api/menu/recipe error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * PATCH /api/menu/recipe/:id
 * Update recipe
 */
router.patch('/recipe/:id', authenticateToken, requireOwner, (req, res) => {
  const rateLimitCheck = checkRateLimit(req.ip);
  if (!rateLimitCheck.allowed) {
    return res.status(429).json({
      success: false,
      error: 'Rate limit exceeded',
      resetIn: rateLimitCheck.resetIn
    });
  }

  try {
    const updated = RecipeBook.updateRecipe(req.params.id, req.body);

    if (!updated) {
      return res.status(404).json({
        success: false,
        error: 'Recipe not found'
      });
    }

    logger.info(`Recipe updated: ${updated.id} by ${req.user.email}`);

    res.json({
      success: true,
      recipe: updated
    });
  } catch (error) {
    logger.error(`PATCH /api/menu/recipe/${req.params.id} error:`, error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * DELETE /api/menu/recipe/:id
 * Delete recipe
 */
router.delete('/recipe/:id', authenticateToken, requireOwner, (req, res) => {
  const rateLimitCheck = checkRateLimit(req.ip);
  if (!rateLimitCheck.allowed) {
    return res.status(429).json({
      success: false,
      error: 'Rate limit exceeded',
      resetIn: rateLimitCheck.resetIn
    });
  }

  try {
    const deleted = RecipeBook.deleteRecipe(req.params.id);

    if (!deleted) {
      return res.status(404).json({
        success: false,
        error: 'Recipe not found'
      });
    }

    logger.info(`Recipe deleted: ${req.params.id} by ${req.user.email}`);

    res.json({
      success: true,
      message: 'Recipe deleted'
    });
  } catch (error) {
    logger.error(`DELETE /api/menu/recipe/${req.params.id} error:`, error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/menu/day/:isoDate/recipes
 * Set recipes for a day
 */
router.post('/day/:isoDate/recipes', authenticateToken, requireOwner, (req, res) => {
  const rateLimitCheck = checkRateLimit(req.ip);
  if (!rateLimitCheck.allowed) {
    return res.status(429).json({
      success: false,
      error: 'Rate limit exceeded',
      resetIn: rateLimitCheck.resetIn
    });
  }

  try {
    const { isoDate } = req.params;
    const { recipeIds } = req.body;

    if (!Array.isArray(recipeIds)) {
      return res.status(400).json({
        success: false,
        error: 'recipeIds array is required'
      });
    }

    RecipeBook.setDayRecipes(isoDate, recipeIds);

    logger.info(`Day recipes updated for ${isoDate}: ${recipeIds.length} recipes by ${req.user.email}`);

    res.json({
      success: true,
      isoDate,
      recipeIds
    });
  } catch (error) {
    logger.error(`POST /api/menu/day/${req.params.isoDate}/recipes error:`, error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/menu/shopping-list
 * Generate weekly shopping list
 */
router.get('/shopping-list', authenticateToken, requireOwner, (req, res) => {
  try {
    const weekNum = parseInt(req.query.week) || 1;

    if (weekNum < 1 || weekNum > 4) {
      return res.status(400).json({
        success: false,
        error: 'Week must be between 1 and 4'
      });
    }

    const shoppingList = ShoppingList.generateWeeklyShoppingList(weekNum);
    const csv = ShoppingList.exportAsCSV(shoppingList, weekNum);

    res.json({
      success: true,
      week: weekNum,
      headcount: RecipeBook.getHeadcount(),
      items: shoppingList,
      total: shoppingList.length,
      csv
    });
  } catch (error) {
    logger.error('GET /api/menu/shopping-list error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/menu/policy
 * Get menu policy settings
 */
router.get('/policy', authenticateToken, requireOwner, (req, res) => {
  try {
    const policy = {
      takeOutAfter: '19:30',
      portionTargetGrams: 650,
      serviceWindowStart: '18:45',
      serviceWindowEnd: '19:15',
      portionDriftThresholdPct: 15
    };

    res.json({
      success: true,
      policy
    });
  } catch (error) {
    logger.error('GET /api/menu/policy error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
