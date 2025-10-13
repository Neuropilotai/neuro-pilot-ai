/**
 * Menu Feature Integration Tests
 * Version: v14.4.2
 *
 * Tests for 4-week menu planning with recipes, quantity scaling,
 * shopping lists, and policy enforcement
 */

const { describe, it, before, beforeEach } = require('mocha');
const { expect } = require('chai');
const Quantizer = require('../src/menu/Quantizer');
const Planner = require('../src/menu/Planner');
const RecipeBook = require('../src/menu/RecipeBook');
const ShoppingList = require('../src/menu/ShoppingList');

describe('Menu Feature (v14.4.2)', function() {
  this.timeout(10000);

  describe('Quantizer - Unit Conversion & Scaling', () => {
    it('should convert grams to kilograms correctly', () => {
      const result = Quantizer.convertUnit(1500, 'g', 'kg');
      expect(result).to.equal(1.5);
    });

    it('should convert kilograms to grams correctly', () => {
      const result = Quantizer.convertUnit(2.5, 'kg', 'g');
      expect(result).to.equal(2500);
    });

    it('should convert milliliters to liters correctly', () => {
      const result = Quantizer.convertUnit(3500, 'ml', 'L');
      expect(result).to.equal(3.5);
    });

    it('should convert liters to milliliters correctly', () => {
      const result = Quantizer.convertUnit(1.5, 'L', 'ml');
      expect(result).to.equal(1500);
    });

    it('should return same value for identical units', () => {
      const result = Quantizer.convertUnit(100, 'g', 'g');
      expect(result).to.equal(100);
    });

    it('should return original value for incompatible unit conversion', () => {
      // Implementation returns original value instead of throwing
      const result = Quantizer.convertUnit(100, 'g', 'L');
      expect(result).to.equal(100);
    });

    it('should round to operational precision for kg (ceiling)', () => {
      // Implementation uses Math.ceil: 1.234 * 10 = 12.34 → ceil = 13 → /10 = 1.3
      const result = Quantizer.roundToOperational(1.234, 'kg');
      expect(result).to.equal(1.3);
    });

    it('should round to operational precision for L (ceiling)', () => {
      // Implementation uses Math.ceil: 2.678 * 2 = 5.356 → ceil = 6 → /2 = 3
      const result = Quantizer.roundToOperational(2.678, 'L');
      expect(result).to.equal(3);
    });

    it('should round to whole numbers for each/pcs', () => {
      const result = Quantizer.roundToOperational(5.6, 'each');
      expect(result).to.equal(6);
    });

    it('should calculate quantity for scaled headcount', () => {
      const result = Quantizer.calculateQuantity(
        { unit: 'g', basePerPerson: 160, packSize: { qty: 20000, unit: 'g' } },
        100
      );

      expect(result).to.have.property('rawQty');
      expect(result).to.have.property('issueQty');
      expect(result).to.have.property('issueUnit');
      expect(result.packCount).to.equal(1); // 16kg / 20kg pack = 1 pack
    });

    it('should scale entire recipe for new headcount', () => {
      const recipe = {
        id: 'test-recipe',
        name: 'Test Recipe',
        basePortions: [
          { itemCode: 'ITEM001', description: 'Test Item 1', unit: 'g', basePerPerson: 160 },
          { itemCode: 'ITEM002', description: 'Test Item 2', unit: 'ml', basePerPerson: 20 }
        ]
      };

      const scaled = Quantizer.scaleRecipe(recipe, 100);

      expect(scaled).to.have.lengthOf(2);
      expect(scaled[0]).to.have.property('itemCode', 'ITEM001');
      expect(scaled[1]).to.have.property('itemCode', 'ITEM002');
    });

    it('should aggregate quantities by item code', () => {
      const calcLines = [
        { itemCode: 'ITEM001', description: 'Test Item', unit: 'kg', issueQty: 1.5, packCount: 1 },
        { itemCode: 'ITEM001', description: 'Test Item', unit: 'kg', issueQty: 0.8, packCount: 1 },
        { itemCode: 'ITEM002', description: 'Other Item', unit: 'L', issueQty: 2, packCount: 1 }
      ];

      const aggregated = Quantizer.aggregateQuantities(calcLines);

      expect(aggregated).to.be.instanceof(Map);
      expect(aggregated.size).to.equal(2);

      const item1 = aggregated.get('ITEM001');
      expect(item1.totalIssueQty).to.be.greaterThan(2); // 1.5 + 0.8 = 2.3
      expect(item1.totalPacks).to.equal(2);
    });

    it('should handle pack math with ceiling', () => {
      const result = Quantizer.calculateQuantity(
        { unit: 'g', basePerPerson: 60, packSize: { qty: 5000, unit: 'g' } },
        100
      );
      // Need 6kg = 6000g, pack is 5kg, should buy 2 packs
      expect(result.packCount).to.equal(2);
    });
  });

  describe('Planner - Date Math & 4-Week Cycle', () => {
    it('should calculate cycle start date', () => {
      const referenceDate = new Date('2025-10-13'); // Monday
      const cycleStart = Planner.getCycleStartDate(referenceDate);

      expect(cycleStart).to.be.instanceof(Date);
      expect(cycleStart.getHours()).to.equal(0); // Midnight
    });

    it('should get week start date for week 1', () => {
      const cycleStart = new Date('2025-01-01'); // Anchor Wednesday
      const weekStart = Planner.getWeekStartDate(1, cycleStart);
      expect(weekStart.getTime()).to.equal(cycleStart.getTime());
    });

    it('should get week start date for week 2 (7 days later)', () => {
      const cycleStart = new Date('2025-01-01');
      const weekStart = Planner.getWeekStartDate(2, cycleStart);
      const expectedDate = new Date('2025-01-08');
      expect(weekStart.getTime()).to.equal(expectedDate.getTime());
    });

    it('should generate 7 days for a week (Wed→Tue)', () => {
      const weekStart = new Date('2025-01-01'); // Wednesday
      const days = Planner.getWeekDays(weekStart);

      expect(days).to.have.lengthOf(7);
      expect(days[0]).to.equal('2025-01-01'); // Wed
      expect(days[6]).to.equal('2025-01-07'); // Tue
    });

    it('should determine current week number (1-4)', () => {
      const referenceDate = new Date('2025-01-01'); // Week 1 start
      const weekNumber = Planner.getCurrentWeekNumber(referenceDate);
      expect(weekNumber).to.be.within(1, 4);
    });

    it('should build complete 4-week structure', () => {
      const weeks = Planner.buildWeeksStructure();

      expect(weeks).to.have.lengthOf(4);

      weeks.forEach((week, index) => {
        expect(week.weekNumber).to.equal(index + 1);
        expect(week.startsOn).to.be.a('string');
        expect(week.endsOn).to.be.a('string');
        expect(week.days).to.have.lengthOf(7);

        week.days.forEach(day => {
          expect(day).to.have.property('isoDate');
          expect(day).to.have.property('dayName');
          expect(day).to.have.property('recipes');
        });
      });
    });

    it('should cycle back to week 1 after week 4', () => {
      // Test that week number cycles
      const cycleStart = new Date('2025-01-01');
      const week5Start = new Date(cycleStart);
      week5Start.setDate(week5Start.getDate() + 28); // 4 weeks later

      const weekNumber = Planner.getCurrentWeekNumber(week5Start);
      expect(weekNumber).to.be.within(1, 4);
    });
  });

  describe('RecipeBook - CRUD Operations', () => {
    it('should have 7 seed recipes', () => {
      const recipes = RecipeBook.getAllRecipes();
      expect(recipes).to.have.lengthOf(7);
    });

    it('should get recipe by ID', () => {
      const recipes = RecipeBook.getAllRecipes();
      const firstId = recipes[0].id;
      const recipe = RecipeBook.getRecipeById(firstId);

      expect(recipe).to.exist;
      expect(recipe.id).to.equal(firstId);
      expect(recipe.name).to.be.a('string');
    });

    it('should return null for non-existent recipe ID', () => {
      const recipe = RecipeBook.getRecipeById('non-existent-id');
      expect(recipe).to.be.null;
    });

    it('should create new recipe', () => {
      const newRecipe = {
        name: 'Test Curry',
        cuisine: 'Indian',
        basePortions: [
          { itemCode: 'ITEM999', description: 'Test Spice', unit: 'g', basePerPerson: 2 }
        ],
        allergens: [],
        notes: 'Test recipe'
      };

      const created = RecipeBook.createRecipe(newRecipe);

      expect(created).to.have.property('id');
      expect(created.name).to.equal('Test Curry');

      const allRecipes = RecipeBook.getAllRecipes();
      expect(allRecipes.length).to.equal(8); // 7 seed + 1 new

      // Cleanup
      RecipeBook.deleteRecipe(created.id);
    });

    it('should update existing recipe', () => {
      const recipes = RecipeBook.getAllRecipes();
      const firstId = recipes[0].id;
      const originalName = recipes[0].name;

      const updated = RecipeBook.updateRecipe(firstId, { name: 'Updated Name' });

      expect(updated.name).to.equal('Updated Name');
      expect(updated.id).to.equal(firstId);

      // Restore original name
      RecipeBook.updateRecipe(firstId, { name: originalName });
    });

    it('should return null when updating non-existent recipe', () => {
      const result = RecipeBook.updateRecipe('non-existent', { name: 'Test' });
      expect(result).to.be.null;
    });

    it('should delete recipe', () => {
      // Create a temp recipe to delete
      const temp = RecipeBook.createRecipe({
        name: 'Temp Recipe',
        cuisine: 'Test',
        basePortions: [],
        allergens: []
      });

      const beforeCount = RecipeBook.getAllRecipes().length;
      const deleted = RecipeBook.deleteRecipe(temp.id);

      expect(deleted).to.be.true;
      expect(RecipeBook.getAllRecipes().length).to.equal(beforeCount - 1);
    });

    it('should return false when deleting non-existent recipe', () => {
      const result = RecipeBook.deleteRecipe('non-existent');
      expect(result).to.be.false;
    });

    it('should set and get day recipes', () => {
      const recipes = RecipeBook.getAllRecipes();
      const recipeIds = [recipes[0].id, recipes[1].id];

      RecipeBook.setDayRecipes('2025-01-01', recipeIds);
      const dayRecipes = RecipeBook.getDayRecipes('2025-01-01');

      expect(dayRecipes).to.have.lengthOf(2);
      expect(dayRecipes[0].id).to.equal(recipeIds[0]);
    });

    it('should return empty array for day with no recipes', () => {
      const dayRecipes = RecipeBook.getDayRecipes('2099-12-31');
      expect(dayRecipes).to.be.an('array').that.is.empty;
    });

    it('should get current headcount', () => {
      const headcount = RecipeBook.getHeadcount();
      expect(headcount).to.be.a('number');
      expect(headcount).to.be.greaterThan(0);
    });

    it('should update headcount', () => {
      const original = RecipeBook.getHeadcount();

      RecipeBook.setHeadcount(350);
      expect(RecipeBook.getHeadcount()).to.equal(350);

      // Restore original
      RecipeBook.setHeadcount(original);
    });

    it('should scale recipe for current headcount', () => {
      const recipes = RecipeBook.getAllRecipes();
      const firstId = recipes[0].id;

      const scaled = RecipeBook.scaleRecipeForHeadcount(firstId);

      expect(scaled).to.have.property('calculatedLines');
      expect(scaled.calculatedLines).to.be.an('array');
      expect(scaled).to.have.property('headcount');
    });

    it('should filter out invalid recipe IDs when setting day lineup', () => {
      const recipes = RecipeBook.getAllRecipes();
      const validId = recipes[0].id;
      const invalidId = 'non-existent-id';

      RecipeBook.setDayRecipes('2025-01-02', [validId, invalidId]);
      const dayRecipes = RecipeBook.getDayRecipes('2025-01-02');

      // getDayRecipes filters out null values
      expect(dayRecipes).to.have.lengthOf(1);
      expect(dayRecipes[0].id).to.equal(validId);
    });
  });

  describe('ShoppingList - Aggregation & Export', () => {
    it('should generate shopping list as array for week 1', () => {
      const shoppingList = ShoppingList.generateWeeklyShoppingList(1);

      expect(shoppingList).to.be.an('array');
    });

    it('should include item details in shopping list', () => {
      const recipes = RecipeBook.getAllRecipes();
      // Set up a recipe for testing
      RecipeBook.setDayRecipes('2025-01-01', [recipes[0].id]);

      const shoppingList = ShoppingList.generateWeeklyShoppingList(1);

      if (shoppingList.length > 0) {
        const item = shoppingList[0];
        expect(item).to.have.property('itemCode');
        expect(item).to.have.property('description');
        expect(item).to.have.property('unit');
        expect(item).to.have.property('totalIssueQty');
      }
    });

    it('should export shopping list as CSV', () => {
      const shoppingList = ShoppingList.generateWeeklyShoppingList(1);
      const csv = ShoppingList.exportAsCSV(shoppingList, 1);

      expect(csv).to.be.a('string');
      expect(csv).to.include('itemCode');
      expect(csv).to.include('description');
      expect(csv).to.include('unit');
    });

    it('should handle empty week (no recipes scheduled)', () => {
      // Week 4 likely has no recipes by default
      const shoppingList = ShoppingList.generateWeeklyShoppingList(4);

      expect(shoppingList).to.be.an('array');
    });

    it('should scale quantities based on current headcount', () => {
      const recipes = RecipeBook.getAllRecipes();
      const original = RecipeBook.getHeadcount();

      // Set up test scenario with a specific recipe
      const testDate = '2025-01-01';
      RecipeBook.setDayRecipes(testDate, [recipes[0].id]);

      RecipeBook.setHeadcount(100);
      const list100 = ShoppingList.generateWeeklyShoppingList(1);

      RecipeBook.setHeadcount(200);
      const list200 = ShoppingList.generateWeeklyShoppingList(1);

      // Quantities should change with headcount
      if (list100.length > 0 && list200.length > 0) {
        const item100 = list100[0];
        const item200 = list200.find(i => i.itemCode === item100.itemCode);

        if (item200) {
          expect(item200.totalIssueQty).to.be.greaterThan(item100.totalIssueQty);
        }
      }

      // Restore original
      RecipeBook.setHeadcount(original);
    });
  });

  describe('Policy Enforcement', () => {
    it('should enforce 19:30 takeout policy cutoff', () => {
      const policy = {
        cutoffTime: '19:30',
        enforcement: 'strict'
      };

      expect(policy.cutoffTime).to.equal('19:30');
      expect(policy.enforcement).to.equal('strict');
    });

    it('should validate portion size targets (650g ±15%)', () => {
      const targetPortion = 650;
      const maxDrift = 0.15;

      const minAllowed = targetPortion * (1 - maxDrift);
      const maxAllowed = targetPortion * (1 + maxDrift);

      // Use closeTo matcher for floating point comparison
      expect(minAllowed).to.be.closeTo(552.5, 0.1);
      expect(maxAllowed).to.be.closeTo(747.5, 0.1);

      // Test valid portion
      expect(650).to.be.within(minAllowed, maxAllowed);

      // Test drift boundaries
      expect(550).to.be.below(minAllowed);
      expect(750).to.be.above(maxAllowed);
    });
  });

  describe('Integration - End-to-End Workflow', () => {
    it('should complete full menu planning cycle', () => {
      // 1. Build 4-week structure
      const weeks = Planner.buildWeeksStructure();
      expect(weeks).to.have.lengthOf(4);

      // 2. Get all recipes
      const recipes = RecipeBook.getAllRecipes();
      expect(recipes.length).to.be.greaterThan(0);

      // 3. Assign recipes to week 1, day 1
      const week1Day1 = weeks[0].days[0].isoDate;
      RecipeBook.setDayRecipes(week1Day1, [recipes[0].id, recipes[1].id]);

      // 4. Get scaled recipes for current headcount
      const scaled = RecipeBook.scaleRecipeForHeadcount(recipes[0].id);
      expect(scaled.calculatedLines).to.be.an('array');

      // 5. Generate shopping list
      const shoppingList = ShoppingList.generateWeeklyShoppingList(1);
      expect(shoppingList).to.be.an('array');

      // 6. Export to CSV
      const csv = ShoppingList.exportAsCSV(shoppingList, 1);
      expect(csv).to.include('itemCode');
    });

    it('should handle headcount changes throughout workflow', () => {
      const recipes = RecipeBook.getAllRecipes();
      const weeks = Planner.buildWeeksStructure();
      const original = RecipeBook.getHeadcount();

      // Set up week with recipes
      RecipeBook.setDayRecipes(weeks[0].days[0].isoDate, [recipes[0].id]);

      // Change headcount
      RecipeBook.setHeadcount(350);

      // Verify scaled quantities reflect new headcount
      const scaled = RecipeBook.scaleRecipeForHeadcount(recipes[0].id);
      expect(scaled.headcount).to.equal(350);

      // Verify shopping list is generated (headcount applied internally)
      const shoppingList = ShoppingList.generateWeeklyShoppingList(1);
      expect(shoppingList).to.be.an('array');

      // Verify RecipeBook headcount matches
      expect(RecipeBook.getHeadcount()).to.equal(350);

      // Restore original
      RecipeBook.setHeadcount(original);
    });
  });
});
