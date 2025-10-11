/**
 * BeverageMath.js - v6.7
 * Unit conversions for beverages (cups, oz, g, ml, ea)
 *
 * Handles:
 * - Coffee: cups → grams of grounds
 * - Creamer: oz per cup
 * - Milk: oz per person
 * - Tea: bags (ea) per person
 * - Juice: oz per person
 */

class BeverageMath {
  constructor() {
    // Standard conversion factors
    this.conversions = {
      // Volume conversions
      oz_to_ml: 29.5735,
      ml_to_oz: 1 / 29.5735,
      cup_to_oz: 8,
      oz_to_cup: 1 / 8,
      cup_to_ml: 236.588,
      ml_to_cup: 1 / 236.588,

      // Weight conversions
      g_to_oz: 0.035274,
      oz_to_g: 28.3495,
      kg_to_g: 1000,
      g_to_kg: 1 / 1000,

      // Coffee-specific (grounds per cup)
      coffee_g_per_cup_weak: 8,
      coffee_g_per_cup_medium: 10,
      coffee_g_per_cup_strong: 12
    };
  }

  /**
   * Calculate coffee grounds needed (in grams)
   * @param {number} cups - Number of cups to brew
   * @param {string} strength - 'weak', 'medium', 'strong'
   * @param {number} cupSizeOz - Cup size in oz (default 8)
   * @returns {number} Grams of coffee grounds needed
   */
  calculateCoffeeGrounds(cups, strength = 'medium', cupSizeOz = 8) {
    const strengthKey = `coffee_g_per_cup_${strength}`;
    const gramsPerCup = this.conversions[strengthKey] || this.conversions.coffee_g_per_cup_medium;

    return Math.round(cups * gramsPerCup * 10) / 10;
  }

  /**
   * Calculate coffee demand from population
   * @param {number} population - Number of people
   * @param {number} cupsPerPerson - Cups per person (e.g., 1.3)
   * @param {number} gramsPerCup - Grams per cup (e.g., 10)
   * @returns {Object} { total_cups, total_grams, per_person }
   */
  calculateCoffeeDemand(population, cupsPerPerson = 1.3, gramsPerCup = 10) {
    const totalCups = population * cupsPerPerson;
    const totalGrams = totalCups * gramsPerCup;

    return {
      total_cups: Math.round(totalCups * 10) / 10,
      total_grams: Math.round(totalGrams * 10) / 10,
      per_person: cupsPerPerson,
      grams_per_cup: gramsPerCup
    };
  }

  /**
   * Calculate creamer demand (in oz)
   * @param {number} population - Number of people
   * @param {number} cupsPerPerson - Cups per person
   * @param {number} creamerOzPerCup - Oz of creamer per cup (e.g., 0.5)
   * @returns {Object} { total_oz, total_ml, per_person }
   */
  calculateCreamerDemand(population, cupsPerPerson = 1.3, creamerOzPerCup = 0.5) {
    const totalCups = population * cupsPerPerson;
    const totalOz = totalCups * creamerOzPerCup;
    const totalMl = totalOz * this.conversions.oz_to_ml;

    return {
      total_oz: Math.round(totalOz * 10) / 10,
      total_ml: Math.round(totalMl * 10) / 10,
      per_person: Math.round(cupsPerPerson * creamerOzPerCup * 100) / 100,
      oz_per_cup: creamerOzPerCup
    };
  }

  /**
   * Calculate milk demand (in oz)
   * @param {number} population - Number of people
   * @param {number} ozPerPerson - Oz per person (e.g., 4)
   * @returns {Object} { total_oz, total_ml, total_cups, per_person }
   */
  calculateMilkDemand(population, ozPerPerson = 4) {
    const totalOz = population * ozPerPerson;
    const totalMl = totalOz * this.conversions.oz_to_ml;
    const totalCups = totalOz / this.conversions.cup_to_oz;

    return {
      total_oz: Math.round(totalOz * 10) / 10,
      total_ml: Math.round(totalMl * 10) / 10,
      total_cups: Math.round(totalCups * 10) / 10,
      per_person: ozPerPerson
    };
  }

  /**
   * Calculate tea bag demand
   * @param {number} population - Number of people
   * @param {number} bagsPerPerson - Tea bags per person (e.g., 0.3)
   * @returns {Object} { total_bags, per_person }
   */
  calculateTeaDemand(population, bagsPerPerson = 0.3) {
    const totalBags = population * bagsPerPerson;

    return {
      total_bags: Math.ceil(totalBags),  // Always round up for tea bags
      per_person: bagsPerPerson
    };
  }

  /**
   * Calculate juice demand (in oz)
   * @param {number} population - Number of people
   * @param {number} ozPerPerson - Oz per person (e.g., 6 for OJ)
   * @param {string} juiceType - 'orange' or 'apple'
   * @returns {Object} { total_oz, total_ml, total_cups, per_person, type }
   */
  calculateJuiceDemand(population, ozPerPerson = 6, juiceType = 'orange') {
    const totalOz = population * ozPerPerson;
    const totalMl = totalOz * this.conversions.oz_to_ml;
    const totalCups = totalOz / this.conversions.cup_to_oz;

    return {
      total_oz: Math.round(totalOz * 10) / 10,
      total_ml: Math.round(totalMl * 10) / 10,
      total_cups: Math.round(totalCups * 10) / 10,
      per_person: ozPerPerson,
      type: juiceType
    };
  }

  /**
   * Parse free-text beverage comment
   * Examples:
   *   "coffee 1.3 cups/person" → { item: 'coffee', value: 1.3, unit: 'cups', per: 'person' }
   *   "creamer 0.5 oz/cup" → { item: 'creamer', value: 0.5, unit: 'oz', per: 'cup' }
   *   "milk 4 oz per person" → { item: 'milk', value: 4, unit: 'oz', per: 'person' }
   * @param {string} comment - Free-text comment
   * @returns {Object|null} { item, value, unit, per }
   */
  parseComment(comment) {
    if (!comment || typeof comment !== 'string') {
      return null;
    }

    const normalized = comment.toLowerCase().trim();

    // Pattern: "<item> <number> <unit>/<per>" or "<item> <number> <unit> per <per>"
    const patterns = [
      /(\w+)\s+([\d.]+)\s+(\w+)\s*\/\s*(\w+)/,  // "coffee 1.3 cups/person"
      /(\w+)\s+([\d.]+)\s+(\w+)\s+per\s+(\w+)/   // "milk 4 oz per person"
    ];

    for (const pattern of patterns) {
      const match = normalized.match(pattern);
      if (match) {
        return {
          item: match[1],
          value: parseFloat(match[2]),
          unit: match[3],
          per: match[4]
        };
      }
    }

    return null;
  }

  /**
   * Convert between units
   * @param {number} value - Value to convert
   * @param {string} fromUnit - Source unit (oz, ml, g, kg, cups)
   * @param {string} toUnit - Target unit
   * @returns {number} Converted value
   */
  convert(value, fromUnit, toUnit) {
    if (fromUnit === toUnit) {
      return value;
    }

    const key = `${fromUnit}_to_${toUnit}`;
    const conversionFactor = this.conversions[key];

    if (conversionFactor) {
      return Math.round(value * conversionFactor * 100) / 100;
    }

    // Try reverse conversion
    const reverseKey = `${toUnit}_to_${fromUnit}`;
    const reverseFactor = this.conversions[reverseKey];

    if (reverseFactor) {
      return Math.round(value / reverseFactor * 100) / 100;
    }

    throw new Error(`No conversion available from ${fromUnit} to ${toUnit}`);
  }

  /**
   * Calculate all beverage demands from population and profile
   * @param {number} population - Total population
   * @param {Object} profile - Beverage profile JSON
   * @returns {Object} All beverage demands
   */
  calculateAllBeverages(population, profile) {
    const coffee = this.calculateCoffeeDemand(
      population,
      profile.coffee_cups_per_person || 1.3,
      profile.coffee_grounds_g_per_cup || 10
    );

    const creamer = this.calculateCreamerDemand(
      population,
      profile.coffee_cups_per_person || 1.3,
      profile.creamer_oz_per_cup || 0.5
    );

    const milk = this.calculateMilkDemand(
      population,
      profile.milk_oz_per_person || 4
    );

    const tea = this.calculateTeaDemand(
      population,
      profile.tea_bags_per_person || 0.3
    );

    const orangeJuice = this.calculateJuiceDemand(
      population,
      profile.orange_juice_oz_per_person || 6,
      'orange'
    );

    const appleJuice = this.calculateJuiceDemand(
      population,
      profile.apple_juice_oz_per_person || 4,
      'apple'
    );

    return {
      coffee,
      creamer,
      milk,
      tea,
      orange_juice: orangeJuice,
      apple_juice: appleJuice,
      population,
      profile
    };
  }
}

module.exports = BeverageMath;
