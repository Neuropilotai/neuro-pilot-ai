-- ============================================================================
-- Migration 016: Load Complete Rotation Schedule Knowledge
-- Purpose: Push all documented menu/rotation knowledge into AI learning system
-- Date: 2025-10-12
-- Source: ROTATION_SCHEDULE_INTELLIGENCE.md, NEUROPILOT_AI_CHEF_STATUS.md
-- ============================================================================

-- ============================================================================
-- 1. SATURDAY STEAK NIGHT (Weekly Recurring)
-- ============================================================================

INSERT INTO ai_learning_insights (insight_text, source, confidence, applied_at, metadata)
VALUES
  ('Saturday Steak Night: Every Saturday, 250 servings, 10oz AAA steak per person', 'owner_rotation_schedule', 0.99, datetime('now'), '{"frequency": "weekly", "day": "Saturday", "servings": 250, "steak_oz": 10}'),
  ('Steak Night sides: Baking potatoes (1 per person) + butter pats (2 per person)', 'owner_rotation_schedule', 0.99, datetime('now'), '{"event": "steak_night", "potato_per_person": 1, "butter_per_person": 2}'),
  ('Steak Night total demand: 250 steaks (10oz each = 156.25 lbs total beef)', 'owner_rotation_schedule', 0.95, datetime('now'), '{"item": "steak", "total_lbs": 156.25}');

-- Add steak night item aliases
INSERT OR IGNORE INTO item_alias_map (alias_name, item_code, category, conversion_factor, conversion_unit, notes)
VALUES
  ('steak_aaa', 'BEEF-STEAK-AAA-10OZ', 'dinner', 1.0, 'ea', 'AAA steak for Saturday steak night'),
  ('potato_baking', 'POTATO-BAKING-LG', 'dinner', 1.0, 'ea', 'Large baking potatoes for steak night');

-- ============================================================================
-- 2. JIGG DINNER (Bi-Weekly Recurring - Sundays Week 2 & 4)
-- ============================================================================

INSERT INTO ai_learning_insights (insight_text, source, confidence, applied_at, metadata)
VALUES
  ('Jigg Dinner: Every other Sunday (Week 2 & 4 only), NOT daily', 'owner_correction', 0.99, datetime('now'), '{"frequency": "bi-weekly", "day": "Sunday", "weeks": [2, 4], "servings": 250}'),
  ('Jigg Dinner corrected from DAILY (95% confidence) to BI-WEEKLY (99% confidence)', 'owner_correction', 0.99, datetime('now'), '{"correction": true, "old_pattern": "daily", "new_pattern": "bi-weekly"}'),
  ('Jigg Dinner recipe: Turkey breast (sliced), boiled potato, cabbage, butter', 'owner_rotation_schedule', 0.95, datetime('now'), '{"servings": 250, "main": "turkey_breast", "sides": ["potato_boiled", "cabbage", "butter"]}'),
  ('Jigg Dinner rotation start: 2025-10-16, first serving 2025-10-27 (Sunday Week 2)', 'owner_rotation_schedule', 0.99, datetime('now'), '{"start_date": "2025-10-16", "first_jigg": "2025-10-27"}');

-- Add Jigg dinner item aliases
INSERT OR IGNORE INTO item_alias_map (alias_name, item_code, category, conversion_factor, conversion_unit, notes)
VALUES
  ('turkey_breast', 'TURKEY-BREAST-SLICED-LB', 'dinner', 1.0, 'lb', 'Turkey breast for Jigg Dinner'),
  ('potato_boiled', 'POTATO-BOILING-LB', 'dinner', 1.0, 'lb', 'Boiling potatoes for Jigg Dinner'),
  ('cabbage', 'CABBAGE-HEAD-EA', 'dinner', 1.0, 'ea', 'Cabbage for Jigg Dinner');

-- ============================================================================
-- 3. DAILY SANDWICH PROGRAM
-- ============================================================================

INSERT INTO ai_learning_insights (insight_text, source, confidence, applied_at, metadata)
VALUES
  ('Daily Sandwich Program: 500 sandwiches per day (every day)', 'owner_rotation_schedule', 0.99, datetime('now'), '{"frequency": "daily", "quantity": 500, "category": "lunch"}'),
  ('Sandwich program uses ~93.75 lbs turkey breast daily', 'owner_calculation', 0.90, datetime('now'), '{"item": "turkey_breast", "daily_lbs": 93.75}');

-- ============================================================================
-- 4. DAILY INDIAN MEALS
-- ============================================================================

INSERT INTO ai_learning_insights (insight_text, source, confidence, applied_at, metadata)
VALUES
  ('Indian Meals: 20 servings per day (every day)', 'owner_rotation_schedule', 0.99, datetime('now'), '{"frequency": "daily", "servings": 20, "sub_population": "indian"}'),
  ('Indian meal count separate from main population (currently 10 in site_population, but served 20 daily)', 'owner_data', 0.85, datetime('now'), '{"recorded_count": 10, "actual_servings": 20}');

-- ============================================================================
-- 5. BREAKFAST & BEVERAGE (Already in site_population, but reinforce)
-- ============================================================================

INSERT INTO ai_learning_insights (insight_text, source, confidence, applied_at, metadata)
VALUES
  ('Breakfast Service: 250 servings per day - 2 eggs, 2 bread slices, 2 bacon strips per person', 'owner_rotation_schedule', 0.99, datetime('now'), '{"frequency": "daily", "servings": 250, "eggs": 2, "bread": 2, "bacon": 2}'),
  ('Beverage Service: 250 servings per day - 1.5 cups coffee, 8oz milk per person', 'owner_rotation_schedule', 0.99, datetime('now'), '{"frequency": "daily", "servings": 250, "coffee_cups": 1.5, "milk_oz": 8}'),
  ('Coffee consumption: 15g grounds per 12oz cup', 'owner_rotation_schedule', 0.99, datetime('now'), '{"coffee_grounds_per_cup_g": 15, "cup_size_oz": 12}');

-- ============================================================================
-- 6. ROTATION SCHEDULE PATTERN
-- ============================================================================

INSERT INTO ai_learning_insights (insight_text, source, confidence, applied_at, metadata)
VALUES
  ('4-Week Rotation Pattern: Week 1 (Odd) standard, Week 2 (Even) + Jigg, Week 3 (Odd) David OFF, Week 4 (Even) David OFF + Jigg', 'owner_rotation_schedule', 0.99, datetime('now'), '{"rotation_weeks": 4, "rotation_start": "2025-10-16"}'),
  ('David ON weeks: Week 1 & 2 (Oct 16-29), David OFF weeks: Week 3 & 4 (Oct 30-Nov 12)', 'owner_rotation_schedule', 0.99, datetime('now'), '{"david_on": [1, 2], "david_off": [3, 4]}');

-- ============================================================================
-- 7. FORECAST ACCURACY IMPROVEMENT (Learning Metadata)
-- ============================================================================

INSERT INTO ai_learning_insights (insight_text, source, confidence, applied_at, metadata)
VALUES
  ('Jigg Dinner correction improved forecast accuracy by 30% (removed ~65 lbs turkey, ~250 potatoes, ~263 butter pats from non-Jigg days)', 'owner_correction_impact', 0.95, datetime('now'), '{"accuracy_improvement_pct": 30, "turkey_savings_lbs": 65, "potato_savings_ea": 250}'),
  ('Pattern complexity: Multi-week rotation with conditional events (Jigg Dinner Sundays W2/W4 only)', 'learning_model_update', 0.90, datetime('now'), '{"pattern_type": "multi_week_conditional", "complexity": "high"}');

-- ============================================================================
-- 8. UPDATE DINNER PROFILE IN SITE_POPULATION
-- ============================================================================

UPDATE site_population
SET
  dinner_profile = '{"steak_night": {"day": "Saturday", "frequency": "weekly", "steak_oz_per_person": 10, "servings": 250, "potato_per_person": 1, "butter_pats_per_person": 2}, "jigg_dinner": {"day": "Sunday", "frequency": "bi-weekly", "weeks": [2, 4], "servings": 250, "rotation_start": "2025-10-16"}, "sandwich_program": {"frequency": "daily", "quantity": 500}, "indian_meals": {"frequency": "daily", "servings": 20}}',
  lunch_profile = '{"sandwich_program": {"frequency": "daily", "quantity": 500, "turkey_lbs_per_day": 93.75}, "indian_meals": {"servings": 20}}',
  updated_at = CURRENT_TIMESTAMP
WHERE effective_date = DATE('now');

-- ============================================================================
-- 9. ADD FORECAST CACHE ENTRIES FOR WEEKLY PATTERNS
-- ============================================================================

-- Saturday steak night forecast (this Saturday)
INSERT OR REPLACE INTO ai_daily_forecast_cache (item_code, date, forecast_date, predicted_demand, confidence, model_used, metadata)
SELECT
  'BEEF-STEAK-AAA-10OZ',
  date('now', '+' || ((6 - cast(strftime('%w', 'now') as integer)) % 7) || ' days'), -- Next Saturday
  date('now'),
  250,
  0.95,
  'rotation_schedule_pattern',
  '{"event": "steak_night", "frequency": "weekly", "day": "Saturday"}'
WHERE cast(strftime('%w', 'now') as integer) != 6; -- If not already Saturday

-- Add baking potatoes for steak night
INSERT OR REPLACE INTO ai_daily_forecast_cache (item_code, date, forecast_date, predicted_demand, confidence, model_used, metadata)
SELECT
  'POTATO-BAKING-LG',
  date('now', '+' || ((6 - cast(strftime('%w', 'now') as integer)) % 7) || ' days'), -- Next Saturday
  date('now'),
  250,
  0.95,
  'rotation_schedule_pattern',
  '{"event": "steak_night", "item": "side_dish"}'
WHERE cast(strftime('%w', 'now') as integer) != 6;

-- ============================================================================
-- 10. MIGRATION COMPLETE MARKER
-- ============================================================================

INSERT OR IGNORE INTO migrations (name, applied_at)
VALUES ('016_load_rotation_schedule_knowledge', datetime('now'));

-- ============================================================================
-- SUMMARY
-- ============================================================================
-- Learning Insights Added: 15 (steak night, Jigg dinner, breakfast, rotation)
-- Item Aliases Added: 5 (steak, potatoes, turkey, cabbage)
-- Dinner Profile Updated: steak_night, jigg_dinner, sandwich_program, indian_meals
-- Forecast Cache: 2 entries (steak + potatoes for next Saturday)
-- ============================================================================
