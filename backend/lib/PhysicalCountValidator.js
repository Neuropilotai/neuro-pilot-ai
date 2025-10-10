/**
 * ENTERPRISE PHYSICAL COUNT VALIDATION LAYER
 *
 * Provides comprehensive validation for physical count operations
 * Ensures data integrity, business rule compliance, and audit readiness
 */

class PhysicalCountValidator {
  constructor() {
    this.validationRules = {
      countStart: [
        'validateDates',
        'validatePeopleCount',
        'validateOrderDate',
        'validateBusinessLogic'
      ],
      itemAdd: [
        'validateItemData',
        'validateQuantity',
        'validateLocation',
        'validatePricing',
        'validateDuplicates'
      ],
      countComplete: [
        'validateCompletionRequirements',
        'validateMinimumItems',
        'validateLocationCoverage'
      ]
    };
  }

  /**
   * Validate count start parameters
   */
  validateCountStart(params, existingConfig) {
    const errors = [];
    const warnings = [];

    // Check if count already in progress
    if (existingConfig?.counts?.secondCount?.status === 'IN_PROGRESS') {
      errors.push({
        field: 'status',
        message: 'A count is already in progress. Please complete or cancel it first.',
        code: 'COUNT_IN_PROGRESS'
      });
    }

    // Validate dates
    const dateValidation = this._validateDates(params);
    errors.push(...dateValidation.errors);
    warnings.push(...dateValidation.warnings);

    // Validate people count
    const peopleValidation = this._validatePeopleCount(params.peopleOnSite);
    errors.push(...peopleValidation.errors);
    warnings.push(...peopleValidation.warnings);

    // Validate last order date
    const orderDateValidation = this._validateOrderDate(params);
    errors.push(...orderDateValidation.errors);
    warnings.push(...orderDateValidation.warnings);

    // Business logic validation
    const businessValidation = this._validateBusinessLogic(params, existingConfig);
    errors.push(...businessValidation.errors);
    warnings.push(...businessValidation.warnings);

    return {
      valid: errors.length === 0,
      errors,
      warnings,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Validate item addition
   */
  validateItemAdd(item, currentCount, existingConfig) {
    const errors = [];
    const warnings = [];

    // Validate required fields
    const requiredFields = ['location', 'itemCode', 'itemName', 'quantity', 'unit'];
    for (const field of requiredFields) {
      if (!item[field] || item[field] === '') {
        errors.push({
          field: field,
          message: `${field} is required`,
          code: 'REQUIRED_FIELD'
        });
      }
    }

    // Validate location exists
    if (item.location) {
      const locationExists = existingConfig?.locations?.some(loc => loc.id === item.location);
      if (!locationExists) {
        errors.push({
          field: 'location',
          message: `Location ${item.location} does not exist`,
          code: 'INVALID_LOCATION'
        });
      }
    }

    // Validate quantity
    const quantityValidation = this._validateQuantity(item.quantity, item.unit);
    errors.push(...quantityValidation.errors);
    warnings.push(...quantityValidation.warnings);

    // Validate pricing
    if (item.unitPrice !== undefined && item.unitPrice !== null) {
      const pricingValidation = this._validatePricing(item.unitPrice, item.quantity);
      errors.push(...pricingValidation.errors);
      warnings.push(...pricingValidation.warnings);
    }

    // Check for duplicates
    const duplicateValidation = this._validateDuplicates(item, currentCount);
    warnings.push(...duplicateValidation.warnings);

    // Validate item code format
    if (item.itemCode && !/^\d{1,10}$/.test(item.itemCode)) {
      warnings.push({
        field: 'itemCode',
        message: 'Item code should be numeric (1-10 digits)',
        code: 'INVALID_ITEM_CODE_FORMAT'
      });
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Validate count completion
   */
  validateCountComplete(currentCount, config) {
    const errors = [];
    const warnings = [];

    // Check if count is in progress
    if (currentCount.status !== 'IN_PROGRESS') {
      errors.push({
        field: 'status',
        message: 'No count in progress to complete',
        code: 'NO_COUNT_IN_PROGRESS'
      });
    }

    // Validate minimum items
    if (currentCount.itemsCounted < 1) {
      errors.push({
        field: 'itemsCounted',
        message: 'Count must have at least 1 item',
        code: 'INSUFFICIENT_ITEMS'
      });
    }

    // Warn if significantly fewer items than first count
    const firstCount = config?.counts?.firstCount;
    if (firstCount && currentCount.itemsCounted < firstCount.itemsCounted * 0.5) {
      warnings.push({
        field: 'itemsCounted',
        message: `Count has significantly fewer items (${currentCount.itemsCounted}) than first count (${firstCount.itemsCounted})`,
        code: 'LOW_ITEM_COUNT'
      });
    }

    // Warn if no locations counted
    if (!currentCount.locationsCounted || currentCount.locationsCounted.length === 0) {
      warnings.push({
        field: 'locationsCounted',
        message: 'No locations have been counted',
        code: 'NO_LOCATIONS'
      });
    }

    // Check for reasonable total value
    if (currentCount.totalValue <= 0) {
      warnings.push({
        field: 'totalValue',
        message: 'Total count value is $0. Ensure all items have prices.',
        code: 'ZERO_VALUE'
      });
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
      timestamp: new Date().toISOString()
    };
  }

  // ==================== PRIVATE VALIDATION METHODS ====================

  _validateDates(params) {
    const errors = [];
    const warnings = [];

    const startDate = new Date(params.startDate);
    const endDate = new Date(params.endDate);
    const now = new Date();

    // Check dates are valid
    if (isNaN(startDate.getTime())) {
      errors.push({
        field: 'startDate',
        message: 'Invalid start date format',
        code: 'INVALID_DATE'
      });
    }

    if (isNaN(endDate.getTime())) {
      errors.push({
        field: 'endDate',
        message: 'Invalid end date format',
        code: 'INVALID_DATE'
      });
    }

    if (startDate && endDate) {
      // End date must be after start date
      if (endDate < startDate) {
        errors.push({
          field: 'endDate',
          message: 'End date must be after start date',
          code: 'INVALID_DATE_RANGE'
        });
      }

      // Warn if count spans more than 7 days
      const daysDiff = (endDate - startDate) / (1000 * 60 * 60 * 24);
      if (daysDiff > 7) {
        warnings.push({
          field: 'dateRange',
          message: `Count spans ${daysDiff.toFixed(1)} days. Counts should typically be completed within 1-2 days.`,
          code: 'LONG_COUNT_DURATION'
        });
      }

      // Warn if dates are in the future
      if (startDate > now) {
        warnings.push({
          field: 'startDate',
          message: 'Start date is in the future',
          code: 'FUTURE_DATE'
        });
      }
    }

    return { errors, warnings };
  }

  _validatePeopleCount(peopleOnSite) {
    const errors = [];
    const warnings = [];

    const count = parseInt(peopleOnSite);

    if (isNaN(count) || count < 1) {
      errors.push({
        field: 'peopleOnSite',
        message: 'Number of people must be at least 1',
        code: 'INVALID_PEOPLE_COUNT'
      });
    }

    if (count > 20) {
      warnings.push({
        field: 'peopleOnSite',
        message: 'Unusually high number of people on site',
        code: 'HIGH_PEOPLE_COUNT'
      });
    }

    return { errors, warnings };
  }

  _validateOrderDate(params) {
    const errors = [];
    const warnings = [];

    const lastOrderDate = new Date(params.lastOrderDate);
    const startDate = new Date(params.startDate);
    const endDate = new Date(params.endDate);

    if (isNaN(lastOrderDate.getTime())) {
      errors.push({
        field: 'lastOrderDate',
        message: 'Invalid last order date format',
        code: 'INVALID_DATE'
      });
      return { errors, warnings };
    }

    // Last order date should be before or equal to count end date
    if (lastOrderDate > endDate) {
      warnings.push({
        field: 'lastOrderDate',
        message: 'Last order date is after count end date. This may cause discrepancies.',
        code: 'ORDER_DATE_AFTER_COUNT'
      });
    }

    // Warn if last order date is very old
    const daysSinceOrder = (startDate - lastOrderDate) / (1000 * 60 * 60 * 24);
    if (daysSinceOrder > 30) {
      warnings.push({
        field: 'lastOrderDate',
        message: `Last order date is ${daysSinceOrder.toFixed(0)} days before count. Consider updating inventory with recent orders.`,
        code: 'OLD_ORDER_DATE'
      });
    }

    return { errors, warnings };
  }

  _validateBusinessLogic(params, existingConfig) {
    const errors = [];
    const warnings = [];

    // Check against first count date
    const firstCount = existingConfig?.counts?.firstCount;
    if (firstCount) {
      const firstCountDate = new Date(firstCount.countDate);
      const newStartDate = new Date(params.startDate);

      if (newStartDate < firstCountDate) {
        errors.push({
          field: 'startDate',
          message: `Count start date cannot be before first count date (${firstCount.countDate})`,
          code: 'INVALID_COUNT_SEQUENCE'
        });
      }
    }

    return { errors, warnings };
  }

  _validateQuantity(quantity, unit) {
    const errors = [];
    const warnings = [];

    const qty = parseFloat(quantity);

    if (isNaN(qty)) {
      errors.push({
        field: 'quantity',
        message: 'Quantity must be a valid number',
        code: 'INVALID_QUANTITY'
      });
      return { errors, warnings };
    }

    if (qty <= 0) {
      errors.push({
        field: 'quantity',
        message: 'Quantity must be greater than 0',
        code: 'INVALID_QUANTITY'
      });
    }

    if (qty > 10000) {
      warnings.push({
        field: 'quantity',
        message: `Unusually high quantity: ${qty}. Please verify.`,
        code: 'HIGH_QUANTITY'
      });
    }

    // Validate fractional quantities for certain units
    const wholeNumberUnits = ['CS', 'EA', 'BX', 'DZ', 'CT', 'PK', 'PC'];
    if (wholeNumberUnits.includes(unit) && qty % 1 !== 0) {
      warnings.push({
        field: 'quantity',
        message: `Fractional quantity (${qty}) for unit ${unit}. Should typically be whole number.`,
        code: 'FRACTIONAL_QUANTITY'
      });
    }

    return { errors, warnings };
  }

  _validatePricing(unitPrice, quantity) {
    const errors = [];
    const warnings = [];

    const price = parseFloat(unitPrice);

    if (isNaN(price)) {
      errors.push({
        field: 'unitPrice',
        message: 'Unit price must be a valid number',
        code: 'INVALID_PRICE'
      });
      return { errors, warnings };
    }

    if (price < 0) {
      errors.push({
        field: 'unitPrice',
        message: 'Unit price cannot be negative',
        code: 'NEGATIVE_PRICE'
      });
    }

    if (price === 0) {
      warnings.push({
        field: 'unitPrice',
        message: 'Unit price is $0. Item will not contribute to total value.',
        code: 'ZERO_PRICE'
      });
    }

    if (price > 10000) {
      warnings.push({
        field: 'unitPrice',
        message: `Unusually high unit price: $${price}. Please verify.`,
        code: 'HIGH_PRICE'
      });
    }

    // Check total value
    if (quantity && price) {
      const totalValue = quantity * price;
      if (totalValue > 100000) {
        warnings.push({
          field: 'totalValue',
          message: `Very high item value: $${totalValue.toFixed(2)}. Please verify quantity and price.`,
          code: 'HIGH_TOTAL_VALUE'
        });
      }
    }

    return { errors, warnings };
  }

  _validateDuplicates(newItem, currentCount) {
    const warnings = [];

    if (!currentCount?.items) return { warnings };

    // Check for exact duplicates (same item code and location)
    const exactDuplicate = currentCount.items.find(
      item => item.itemCode === newItem.itemCode && item.location === newItem.location
    );

    if (exactDuplicate) {
      warnings.push({
        field: 'itemCode',
        message: `Item ${newItem.itemCode} already counted in ${newItem.location}. Consider updating existing entry.`,
        code: 'DUPLICATE_ITEM'
      });
    }

    // Check for same item in different location
    const sameItemDifferentLocation = currentCount.items.find(
      item => item.itemCode === newItem.itemCode && item.location !== newItem.location
    );

    if (sameItemDifferentLocation) {
      warnings.push({
        field: 'location',
        message: `Item ${newItem.itemCode} was previously counted in ${sameItemDifferentLocation.location}. Item exists in multiple locations.`,
        code: 'MULTI_LOCATION_ITEM'
      });
    }

    return { warnings };
  }

  /**
   * Generate validation report
   */
  generateReport(validationResult) {
    const report = {
      timestamp: validationResult.timestamp,
      valid: validationResult.valid,
      errorCount: validationResult.errors.length,
      warningCount: validationResult.warnings.length,
      errors: validationResult.errors,
      warnings: validationResult.warnings,
      severity: this._calculateSeverity(validationResult)
    };

    return report;
  }

  _calculateSeverity(validationResult) {
    if (validationResult.errors.length > 0) return 'CRITICAL';
    if (validationResult.warnings.length > 5) return 'HIGH';
    if (validationResult.warnings.length > 2) return 'MEDIUM';
    if (validationResult.warnings.length > 0) return 'LOW';
    return 'NONE';
  }
}

module.exports = PhysicalCountValidator;
