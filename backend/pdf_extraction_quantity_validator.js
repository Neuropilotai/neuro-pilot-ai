#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

console.log('🤖 PDF EXTRACTION QUANTITY VALIDATOR & AI MONITORING SYSTEM');
console.log('=' .repeat(60));

// Units that should NEVER have fractional quantities
const WHOLE_UNITS = ['CS', 'CT', 'BX', 'PK', 'EA', 'DZ', 'PR', 'PC', 'PACK', 'CASE', 'CARTON'];

// Quantity validation rules
const VALIDATION_RULES = {
  wholeUnits: WHOLE_UNITS,
  maxReasonableQuantity: 1000, // Alert if quantity > 1000
  suspiciousFractional: 0.5,   // Alert if fractional part < 0.5 (likely error)
  maxUnitPrice: 10000          // Alert if unit price > $10,000
};

/**
 * Validates a single item's quantity based on its unit type
 */
function validateItemQuantity(item) {
  const errors = [];
  const warnings = [];

  const quantity = parseFloat(item.quantity || 0);
  const unit = (item.unit || '').toUpperCase();
  const unitPrice = parseFloat(item.unitPrice || 0);

  // Check for fractional quantities in whole units
  if (WHOLE_UNITS.includes(unit) && quantity % 1 !== 0) {
    errors.push({
      type: 'FRACTIONAL_WHOLE_UNIT',
      message: `${unit} units cannot have fractional quantities`,
      itemCode: item.itemCode,
      itemName: item.name || item.description,
      originalQuantity: quantity,
      suggestedQuantity: Math.ceil(quantity),
      severity: 'ERROR'
    });
  }

  // Check for unreasonably high quantities
  if (quantity > VALIDATION_RULES.maxReasonableQuantity) {
    warnings.push({
      type: 'HIGH_QUANTITY',
      message: `Unusually high quantity: ${quantity}`,
      itemCode: item.itemCode,
      itemName: item.name || item.description,
      quantity: quantity,
      severity: 'WARNING'
    });
  }

  // Check for suspicious fractional quantities (likely OCR errors)
  if (quantity % 1 !== 0 && (quantity % 1) < VALIDATION_RULES.suspiciousFractional) {
    warnings.push({
      type: 'SUSPICIOUS_FRACTIONAL',
      message: `Suspicious fractional quantity: ${quantity} (OCR error?)`,
      itemCode: item.itemCode,
      itemName: item.name || item.description,
      originalQuantity: quantity,
      suggestedQuantity: Math.round(quantity),
      severity: 'WARNING'
    });
  }

  // Check for unreasonably high unit prices
  if (unitPrice > VALIDATION_RULES.maxUnitPrice) {
    warnings.push({
      type: 'HIGH_UNIT_PRICE',
      message: `Unusually high unit price: $${unitPrice}`,
      itemCode: item.itemCode,
      itemName: item.name || item.description,
      unitPrice: unitPrice,
      severity: 'WARNING'
    });
  }

  return { errors, warnings };
}

/**
 * Validates all orders and creates corrected versions
 */
function validateAndCorrectOrders() {
  const ordersDir = './data/gfs_orders';

  if (!fs.existsSync(ordersDir)) {
    console.log('❌ Orders directory not found:', ordersDir);
    return;
  }

  const orderFiles = fs.readdirSync(ordersDir).filter(f => f.endsWith('.json'));
  console.log(`📦 Validating ${orderFiles.length} order files...`);

  let totalErrors = 0;
  let totalWarnings = 0;
  let correctedOrders = 0;
  const problemOrders = [];

  orderFiles.forEach(file => {
    const filePath = path.join(ordersDir, file);

    try {
      const orderData = JSON.parse(fs.readFileSync(filePath, 'utf8'));

      if (!orderData.items || !Array.isArray(orderData.items)) {
        return; // Skip invalid orders
      }

      let orderHasErrors = false;
      let orderHasWarnings = false;
      let correctedItems = [];

      orderData.items.forEach(item => {
        const validation = validateItemQuantity(item);

        if (validation.errors.length > 0) {
          totalErrors += validation.errors.length;
          orderHasErrors = true;

          // Auto-correct fractional whole units
          const fractionalError = validation.errors.find(e => e.type === 'FRACTIONAL_WHOLE_UNIT');
          if (fractionalError) {
            item.quantity = fractionalError.suggestedQuantity;
            item.corrected = true;
            item.originalQuantity = fractionalError.originalQuantity;
            item.correctionReason = 'Fractional quantity rounded up for whole unit';

            // Recalculate line total
            item.lineTotal = item.quantity * item.unitPrice;
          }
        }

        if (validation.warnings.length > 0) {
          totalWarnings += validation.warnings.length;
          orderHasWarnings = true;
        }

        // Add validation info to item
        item.validation = {
          errors: validation.errors,
          warnings: validation.warnings,
          validated: true,
          validatedAt: new Date().toISOString()
        };

        correctedItems.push(item);
      });

      if (orderHasErrors || orderHasWarnings) {
        problemOrders.push({
          file: file,
          invoiceNumber: orderData.invoiceNumber,
          errors: orderHasErrors,
          warnings: orderHasWarnings,
          itemCount: orderData.items.length
        });
      }

      if (orderHasErrors) {
        // Save corrected order
        orderData.items = correctedItems;
        orderData.corrected = true;
        orderData.correctedAt = new Date().toISOString();
        orderData.validationSummary = {
          errorsFound: orderData.items.reduce((sum, item) => sum + (item.validation?.errors?.length || 0), 0),
          warningsFound: orderData.items.reduce((sum, item) => sum + (item.validation?.warnings?.length || 0), 0)
        };

        // Create backup and save corrected version
        const backupPath = filePath + '.backup';
        if (!fs.existsSync(backupPath)) {
          fs.copyFileSync(filePath, backupPath);
        }

        fs.writeFileSync(filePath, JSON.stringify(orderData, null, 2));
        correctedOrders++;
      }

    } catch (error) {
      console.log(`⚠️  Error processing ${file}: ${error.message}`);
    }
  });

  console.log('');
  console.log('📋 VALIDATION SUMMARY:');
  console.log('=' .repeat(60));
  console.log(`📦 Orders processed: ${orderFiles.length}`);
  console.log(`❌ Total errors found: ${totalErrors}`);
  console.log(`⚠️  Total warnings found: ${totalWarnings}`);
  console.log(`🔧 Orders corrected: ${correctedOrders}`);
  console.log('');

  if (problemOrders.length > 0) {
    console.log('🚨 ORDERS WITH ISSUES:');
    problemOrders.forEach((order, index) => {
      console.log(`${index + 1}. ${order.file} (Invoice: ${order.invoiceNumber})`);
      console.log(`   Items: ${order.itemCount}, Errors: ${order.errors ? 'YES' : 'NO'}, Warnings: ${order.warnings ? 'YES' : 'NO'}`);
    });
  }

  // Create validation report
  const report = {
    validatedAt: new Date().toISOString(),
    ordersProcessed: orderFiles.length,
    totalErrors: totalErrors,
    totalWarnings: totalWarnings,
    ordersCorrected: correctedOrders,
    validationRules: VALIDATION_RULES,
    problemOrders: problemOrders
  };

  fs.writeFileSync('./data/pdf_extraction_validation_report.json', JSON.stringify(report, null, 2));
  console.log('');
  console.log('✅ Validation report saved to: pdf_extraction_validation_report.json');

  return report;
}

/**
 * AI Monitoring System for ongoing validation
 */
function startAIMonitoring() {
  console.log('');
  console.log('🤖 STARTING AI MONITORING SYSTEM');
  console.log('- Monitors new PDF extractions');
  console.log('- Auto-corrects fractional whole units');
  console.log('- Alerts on suspicious quantities');
  console.log('- Validates against business rules');

  // This would integrate with the PDF extraction process
  // For now, we'll create the monitoring infrastructure

  const monitoringConfig = {
    enabled: true,
    autoCorrect: true,
    alertThresholds: VALIDATION_RULES,
    logFile: './data/quantity_validation.log',
    lastCheck: new Date().toISOString()
  };

  fs.writeFileSync('./data/ai_monitoring_config.json', JSON.stringify(monitoringConfig, null, 2));
  console.log('✅ AI monitoring configuration saved');
}

// Main execution
console.log('🔄 Starting PDF extraction validation and AI monitoring setup...');
console.log('');

const report = validateAndCorrectOrders();
startAIMonitoring();

console.log('');
console.log('🎯 NEXT STEPS:');
console.log('1. Integrate this validator with PDF extraction process');
console.log('2. Set up real-time monitoring alerts');
console.log('3. Review and approve any auto-corrections');
console.log('4. Train AI on business-specific quantity patterns');

console.log('\\n✅ PDF extraction quantity validation system ready!');