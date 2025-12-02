/**
 * owner-forecast.js - v6.7
 * Daily Predictive Demand API Routes
 *
 * Endpoints:
 * - GET  /api/owner/forecast/daily         - Get all predicted usage for today
 * - GET  /api/owner/forecast/breakfast     - Get breakfast demand
 * - GET  /api/owner/forecast/beverage      - Get beverage demand (NEW)
 * - GET  /api/owner/forecast/stockout      - Get stock-out forecast
 * - POST /api/owner/forecast/comment       - Submit learning comment
 * - POST /api/owner/forecast/train         - Apply all pending comments
 */

const express = require('express');
const router = express.Router();

const MenuPredictor = require('../src/ai/forecast/MenuPredictor');
const BreakfastPredictor = require('../src/ai/forecast/BreakfastPredictor');
const BeverageMath = require('../src/ai/forecast/BeverageMath');
const FeedbackTrainer = require('../src/ai/forecast/FeedbackTrainer');

// v21.1.9: PostgreSQL pool for native queries
const { pool } = require('../db');

// Middleware: owner-only (assumes auth middleware applied upstream)
const { requireOwner } = require('../middleware/requireOwner');

// Apply owner-only protection to all routes
router.use(requireOwner);

/**
 * GET /api/owner/forecast/daily
 * Get predicted usage for today (menu + breakfast + beverages)
 */
router.get('/daily', async (req, res) => {
  const startTime = Date.now();

  try {
    const db = req.app.locals.db;
    const predictor = new MenuPredictor(db);

    const result = await predictor.getPredictedUsageForToday();

    const duration = Date.now() - startTime;

    res.json({
      success: true,
      ...result,
      latency_ms: duration
    });

  } catch (error) {
    console.error('GET /api/owner/forecast/daily error:', error);

    // If forecast view doesn't exist, return empty forecast data instead of 500 error
    if (error.message && error.message.includes('no such table')) {
      const duration = Date.now() - startTime;
      return res.json({
        success: true,
        items: [],
        total_items: 0,
        note: 'Forecast views not available - using inventory estimates instead',
        latency_ms: duration
      });
    }

    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/owner/forecast/breakfast
 * Get breakfast demand for today
 */
router.get('/breakfast', async (req, res) => {
  try {
    const db = req.app.locals.db;
    const predictor = new BreakfastPredictor(db);

    const result = await predictor.getBreakfastDemandForToday();

    res.json(result);

  } catch (error) {
    console.error('GET /api/owner/forecast/breakfast error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/owner/forecast/beverage
 * Get beverage demand for today
 */
router.get('/beverage', async (req, res) => {
  try {
    const db = req.app.locals.db;
    const predictor = new BreakfastPredictor(db);

    const result = await predictor.getBeverageDemandForToday();

    res.json(result);

  } catch (error) {
    console.error('GET /api/owner/forecast/beverage error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/owner/forecast/stockout
 * Get stock-out forecast with risk levels
 */
router.get('/stockout', async (req, res) => {
  try {
    const db = req.app.locals.db;
    const predictor = new MenuPredictor(db);

    const result = await predictor.getStockoutForecast();

    res.json(result);

  } catch (error) {
    console.error('GET /api/owner/forecast/stockout error:', error);

    // If forecast view doesn't exist, return empty stockout data instead of 500 error
    if (error.message && error.message.includes('no such table')) {
      return res.json({
        success: true,
        items: [],
        critical: [],
        high: [],
        medium: [],
        total: 0,
        note: 'Forecast views not available - using inventory estimates instead'
      });
    }

    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/owner/forecast/population
 * Get population stats for today
 */
router.get('/population', async (req, res) => {
  try {
    const db = req.app.locals.db;
    const predictor = new MenuPredictor(db);

    const result = await predictor.getPopulationStats();

    res.json(result);

  } catch (error) {
    console.error('GET /api/owner/forecast/population error:', error);

    // If population table doesn't exist, return default values
    if (error.message && error.message.includes('no such table')) {
      return res.json({
        success: true,
        effective_date: new Date().toISOString().split('T')[0],
        total_count: 250,
        indian_count: 0,
        beverages_profile: null,
        breakfast_profile: null,
        notes: 'Population tracking not available - using defaults',
        is_default: true
      });
    }

    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/owner/forecast/population
 * Update population counts
 * Body: { total_count, indian_count }
 */
router.post('/population', async (req, res) => {
  try {
    const { total_count, indian_count } = req.body;

    if (!total_count || total_count < 1) {
      return res.status(400).json({
        success: false,
        error: 'total_count is required and must be > 0'
      });
    }

    const db = req.app.locals.db;
    const predictor = new MenuPredictor(db);

    const result = await predictor.updatePopulation(total_count, indian_count);

    res.json(result);

  } catch (error) {
    console.error('POST /api/owner/forecast/population error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/owner/forecast/comment
 * Submit a learning comment
 * Body: { comment, source }
 *
 * Examples:
 *   { "comment": "coffee 1.3 cups/person" }
 *   { "comment": "500 sandwiches/day" }
 *   { "comment": "eggs 1.5 per person for breakfast" }
 */
router.post('/comment', async (req, res) => {
  try {
    const { comment, source } = req.body;

    if (!comment || typeof comment !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'comment text is required'
      });
    }

    const db = req.app.locals.db;
    const trainer = new FeedbackTrainer(db);

    // Store comment
    const storeResult = await trainer.storeComment(
      comment,
      req.user?.email || 'owner@neuroinnovate.local',
      source || 'owner_console'
    );

    // Parse to show what would be applied
    const parsed = trainer.parseComment(comment);

    res.json({
      success: true,
      stored: storeResult,
      parsed,
      message: parsed.intent !== 'unknown'
        ? `Stored comment with intent: ${parsed.intent}. Use POST /api/owner/forecast/train to apply.`
        : 'Stored comment but could not parse intent. Manual review needed.'
    });

  } catch (error) {
    console.error('POST /api/owner/forecast/comment error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/owner/forecast/train
 * Apply learning from all pending comments
 */
router.post('/train', async (req, res) => {
  const startTime = Date.now();

  try {
    const db = req.app.locals.db;
    const trainer = new FeedbackTrainer(db);

    const result = await trainer.applyAllPendingComments();

    const duration = Date.now() - startTime;

    res.json({
      ...result,
      latency_ms: duration
    });

  } catch (error) {
    console.error('POST /api/owner/forecast/train error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/owner/forecast/train/:comment_id
 * Apply learning from a specific comment
 */
router.post('/train/:comment_id', async (req, res) => {
  try {
    const { comment_id } = req.params;

    if (!comment_id || isNaN(parseInt(comment_id))) {
      return res.status(400).json({
        success: false,
        error: 'Invalid comment_id'
      });
    }

    const db = req.app.locals.db;
    const trainer = new FeedbackTrainer(db);

    const result = await trainer.applyLearningFromComment(parseInt(comment_id));

    res.json(result);

  } catch (error) {
    console.error('POST /api/owner/forecast/train/:comment_id error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/owner/forecast/comments
 * Get all feedback comments (applied and pending)
 * v21.1.9: Migrated to native PostgreSQL (no SQLite compat adapter)
 */
router.get('/comments', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 50;
    const applied = req.query.applied; // 'true', 'false', or undefined (all)

    // v21.1.9: Build PostgreSQL query with positional parameters
    let sql = `
      SELECT
        comment_id,
        comment_text,
        parsed_intent,
        parsed_item_code,
        parsed_value,
        parsed_unit,
        applied,
        applied_at,
        comment_source,
        user_email,
        created_at
      FROM ai_feedback_comments
    `;

    const params = [];
    let paramIndex = 1;

    // v21.1.9: Use PostgreSQL TRUE/FALSE instead of SQLite 1/0
    if (applied === 'true') {
      sql += ` WHERE applied = TRUE`;
    } else if (applied === 'false') {
      sql += ` WHERE applied = FALSE`;
    }

    // v21.1.9: Use PostgreSQL positional parameter $1 instead of ?
    sql += ` ORDER BY created_at DESC LIMIT $${paramIndex}`;
    params.push(limit);

    const result = await pool.query(sql, params);

    res.json({
      success: true,
      comments: result.rows,
      count: result.rows.length
    });

  } catch (error) {
    console.error('GET /api/owner/forecast/comments error:', error);

    // Handle table not existing (PostgreSQL error code 42P01)
    if (error.code === '42P01' || (error.message && error.message.includes('does not exist'))) {
      return res.json({
        success: true,
        comments: [],
        count: 0,
        note: 'Feedback system not available - table not created yet'
      });
    }

    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/owner/forecast/breakfast/profile
 * Update breakfast profile
 * Body: { bread_slices_per_person, eggs_per_person, ... }
 */
router.post('/breakfast/profile', async (req, res) => {
  try {
    const db = req.app.locals.db;
    const predictor = new BreakfastPredictor(db);

    const result = await predictor.updateBreakfastProfile(req.body);

    res.json(result);

  } catch (error) {
    console.error('POST /api/owner/forecast/breakfast/profile error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/owner/forecast/beverage/profile
 * Update beverage profile
 * Body: { coffee_cups_per_person, creamer_oz_per_cup, ... }
 */
router.post('/beverage/profile', async (req, res) => {
  try {
    const db = req.app.locals.db;
    const predictor = new BreakfastPredictor(db);

    const result = await predictor.updateBeverageProfile(req.body);

    res.json(result);

  } catch (error) {
    console.error('POST /api/owner/forecast/beverage/profile error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/owner/forecast/beverage/calculate
 * Calculate beverage demands with custom parameters
 * Query: ?population=250&coffee_cups=1.5&creamer_oz=0.6
 */
router.get('/beverage/calculate', async (req, res) => {
  try {
    const {
      population = 250,
      coffee_cups_per_person = 1.3,
      coffee_grounds_g_per_cup = 10,
      creamer_oz_per_cup = 0.5,
      milk_oz_per_person = 4,
      tea_bags_per_person = 0.3,
      orange_juice_oz_per_person = 6,
      apple_juice_oz_per_person = 4
    } = req.query;

    const beverageMath = new BeverageMath();

    const profile = {
      coffee_cups_per_person: parseFloat(coffee_cups_per_person),
      coffee_grounds_g_per_cup: parseFloat(coffee_grounds_g_per_cup),
      creamer_oz_per_cup: parseFloat(creamer_oz_per_cup),
      milk_oz_per_person: parseFloat(milk_oz_per_person),
      tea_bags_per_person: parseFloat(tea_bags_per_person),
      orange_juice_oz_per_person: parseFloat(orange_juice_oz_per_person),
      apple_juice_oz_per_person: parseFloat(apple_juice_oz_per_person)
    };

    const result = beverageMath.calculateAllBeverages(parseInt(population), profile);

    res.json({
      success: true,
      ...result
    });

  } catch (error) {
    console.error('GET /api/owner/forecast/beverage/calculate error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;
