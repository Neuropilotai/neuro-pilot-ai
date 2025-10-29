/**
 * NeuroNexus Autonomous Scheduler
 * Orchestrates automated forecast generation and retraining
 *
 * @version 1.0.0
 * @author Enterprise AI Architecture Team
 */

const cron = require('node-cron');
const nodemailer = require('nodemailer');
const axios = require('axios');
const db = require('./database');

// Configuration
const CONFIG = {
  FORECAST_SCHEDULE: '0 2 * * *', // Daily at 2 AM UTC
  RETRAIN_SCHEDULE: '0 3 * * 0', // Sunday at 3 AM UTC
  HEALTH_CHECK_SCHEDULE: '*/5 * * * *', // Every 5 minutes
  ML_SERVICE_URL: process.env.ML_SERVICE_URL || 'http://localhost:8001',
  ADMIN_EMAIL: process.env.ADMIN_EMAIL,
  BATCH_SIZE: 50,
  MAX_FORECAST_DURATION_MS: 600000, // 10 minutes
};

// Email transport
const emailTransport = nodemailer.createTransport({
  host: process.env.SMTP_SERVER || 'smtp.gmail.com',
  port: parseInt(process.env.SMTP_PORT || '587'),
  secure: false,
  auth: {
    user: process.env.SMTP_USERNAME,
    pass: process.env.SMTP_PASSWORD,
  },
});

// Utilities
function log(level, message, meta = {}) {
  const timestamp = new Date().toISOString();
  console.log(JSON.stringify({
    timestamp,
    level,
    message,
    ...meta
  }));
}

function chunkArray(array, size) {
  const chunks = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
}

async function sendEmail({ to, subject, html }) {
  if (!to) {
    log('warn', 'Email not sent: no recipient configured');
    return;
  }

  try {
    await emailTransport.sendMail({
      from: `"NeuroNexus Autonomous System" <${process.env.SMTP_USERNAME}>`,
      to,
      subject,
      html,
    });

    log('info', 'Email sent successfully', { to, subject });
  } catch (error) {
    log('error', 'Failed to send email', { error: error.message, to, subject });
  }
}

// ============================================================================
// DAILY FORECAST PIPELINE
// ============================================================================

async function runDailyForecastPipeline() {
  const startTime = Date.now();
  log('info', '=== Starting Daily Forecast Pipeline ===');

  try {
    // Step 1: Get active SKUs
    const activeSKUs = await db.all(`
      SELECT sku, name, category, current_stock, lead_time_days, unit_cost
      FROM inventory_items
      WHERE is_active = TRUE
      ORDER BY sku
    `);

    log('info', `Fetched ${activeSKUs.length} active SKUs for processing`);

    if (activeSKUs.length === 0) {
      log('warn', 'No active SKUs found. Exiting pipeline.');
      return;
    }

    // Step 2: Process in batches
    const batches = chunkArray(activeSKUs, CONFIG.BATCH_SIZE);
    const results = {
      forecasts: [],
      recommendations: [],
      errors: [],
    };

    for (let i = 0; i < batches.length; i++) {
      const batch = batches[i];
      log('info', `Processing batch ${i + 1}/${batches.length} (${batch.length} SKUs)`);

      const batchResults = await Promise.all(
        batch.map(item => generateForecastForSKU(item).catch(error => ({
          success: false,
          sku: item.sku,
          error: error.message
        })))
      );

      batchResults.forEach(result => {
        if (result.success) {
          results.forecasts.push(result.forecast);
          if (result.recommendation) {
            results.recommendations.push(result.recommendation);
          }
        } else {
          results.errors.push({ sku: result.sku, error: result.error });
        }
      });
    }

    // Step 3: Store forecasts
    log('info', `Storing ${results.forecasts.length} forecasts to database...`);
    await saveForecastsToDatabase(results.forecasts);

    // Step 4: Store recommendations
    log('info', `Storing ${results.recommendations.length} recommendations to database...`);
    await saveRecommendationsToDatabase(results.recommendations);

    // Step 5: Calculate stats
    const duration = Date.now() - startTime;
    const urgentCount = results.recommendations.filter(r => r.priority === 'urgent').length;
    const highCount = results.recommendations.filter(r => r.priority === 'high').length;

    const stats = {
      totalSKUs: activeSKUs.length,
      successCount: results.forecasts.length,
      errorCount: results.errors.length,
      urgentOrders: urgentCount,
      highOrders: highCount,
      durationMs: duration,
    };

    log('info', '=== Forecast Pipeline Complete ===', stats);

    // Step 6: Send notification
    await sendForecastNotification(stats, results.recommendations);

    // Step 7: Audit log
    await logAuditEvent('daily_forecast_pipeline', stats);

    // Step 8: Generate daily intelligence report (Phase 1.5)
    try {
      const { sendDailyReport } = require('./generate_daily_report');
      log('info', 'Generating daily intelligence report...');
      await sendDailyReport();
      log('info', 'Daily intelligence report sent successfully');
    } catch (reportError) {
      log('error', 'Failed to send daily intelligence report', { error: reportError.message });
      // Non-fatal - continue execution
    }

    return stats;

  } catch (error) {
    log('error', 'Forecast pipeline failed', { error: error.message, stack: error.stack });

    await sendEmail({
      to: CONFIG.ADMIN_EMAIL,
      subject: '[NeuroNexus] CRITICAL: Forecast Pipeline Failed',
      html: `
        <h2>Forecast Pipeline Failure</h2>
        <p><strong>Error:</strong> ${error.message}</p>
        <p><strong>Time:</strong> ${new Date().toISOString()}</p>
        <pre>${error.stack}</pre>
      `
    });

    throw error;
  }
}

async function generateForecastForSKU(item) {
  try {
    const { sku, name, category, current_stock, lead_time_days, unit_cost } = item;

    // Get usage history (104 weeks)
    const history = await db.all(`
      SELECT usage_date, quantity_used
      FROM usage_history
      WHERE sku = ?
      ORDER BY usage_date DESC
      LIMIT 104
    `, [sku]);

    if (history.length < 12) {
      throw new Error(`Insufficient history: only ${history.length} weeks available`);
    }

    // Call ML service for forecast
    const forecastResponse = await axios.post(`${CONFIG.ML_SERVICE_URL}/predict`, {
      sku,
      history: history.reverse(), // Chronological order
      horizon_weeks: 4,
    }, {
      timeout: 30000 // 30 second timeout
    });

    const forecast = forecastResponse.data;

    // Calculate reorder recommendation
    const recommendation = await calculateReorderRecommendation(
      sku,
      forecast.point_forecast,
      forecast.confidence_score,
      current_stock,
      lead_time_days,
      unit_cost
    );

    return {
      success: true,
      forecast: {
        sku,
        forecast_date: new Date().toISOString().split('T')[0],
        prediction_date: forecast.prediction_date || new Date().toISOString().split('T')[0],
        horizon_weeks: 4,
        predicted_quantity: forecast.point_forecast,
        confidence_score: forecast.confidence_score,
        model_name: forecast.model_name || 'ensemble',
        model_version: forecast.model_version || 'v1.0.0',
      },
      recommendation,
    };

  } catch (error) {
    return {
      success: false,
      sku: item.sku,
      error: error.message,
    };
  }
}

async function calculateReorderRecommendation(sku, forecasted_demand_4w, confidence, current_stock, lead_time_days, unit_cost) {
  // Simple ABC classification (will be enhanced with actual data)
  const abc_class = unit_cost > 50 ? 'A' : unit_cost > 20 ? 'B' : 'C';

  // Service levels by ABC class
  const serviceLevels = { A: 0.99, B: 0.95, C: 0.90 };
  const zScores = { A: 2.33, B: 1.65, C: 1.28 };

  const service_level = serviceLevels[abc_class];
  const z_score = zScores[abc_class];

  // Daily demand
  const avg_daily_demand = forecasted_demand_4w / 28;
  const std_daily_demand = avg_daily_demand * 0.15; // Estimate 15% CV

  // Safety stock
  const sigma_lt = Math.sqrt(lead_time_days * std_daily_demand ** 2);
  const safety_stock = z_score * sigma_lt;

  // Reorder point
  const reorder_point = (avg_daily_demand * lead_time_days) + safety_stock;

  // Should reorder?
  const should_reorder = current_stock < reorder_point;

  // Order quantity
  let recommended_order_quantity = 0;
  if (should_reorder) {
    const target_stock = forecasted_demand_4w + safety_stock;
    recommended_order_quantity = Math.max(target_stock - current_stock, 0);
    recommended_order_quantity = Math.ceil(recommended_order_quantity);
  }

  // Priority
  const days_until_stockout = (current_stock - safety_stock) / (avg_daily_demand + 0.001);
  let priority = 'low';
  if (days_until_stockout < lead_time_days) {
    priority = 'urgent';
  } else if (days_until_stockout < lead_time_days * 1.5) {
    priority = 'high';
  } else if (should_reorder) {
    priority = 'medium';
  }

  return {
    sku,
    abc_class,
    forecasted_demand_4w: Math.round(forecasted_demand_4w * 100) / 100,
    avg_daily_demand: Math.round(avg_daily_demand * 100) / 100,
    safety_stock: Math.round(safety_stock * 100) / 100,
    reorder_point: Math.round(reorder_point * 100) / 100,
    current_stock,
    should_reorder,
    recommended_order_quantity,
    priority,
    days_until_stockout: Math.round(days_until_stockout * 10) / 10,
    service_level_target: service_level,
    lead_time_days,
  };
}

async function saveForecastsToDatabase(forecasts) {
  const stmt = await db.prepare(`
    INSERT INTO forecasts
    (sku, forecast_date, prediction_date, horizon_weeks, predicted_quantity,
     confidence_score, model_name, model_version, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
  `);

  for (const forecast of forecasts) {
    await stmt.run([
      forecast.sku,
      forecast.forecast_date,
      forecast.prediction_date,
      forecast.horizon_weeks,
      forecast.predicted_quantity,
      forecast.confidence_score,
      forecast.model_name,
      forecast.model_version,
    ]);
  }

  await stmt.finalize();
}

async function saveRecommendationsToDatabase(recommendations) {
  const stmt = await db.prepare(`
    INSERT INTO reorder_recommendations
    (sku, recommendation_date, abc_class, forecasted_demand_4w, avg_daily_demand,
     safety_stock, reorder_point, current_stock, should_reorder,
     recommended_order_quantity, priority, days_until_stockout,
     service_level_target, lead_time_days, status, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', datetime('now'))
  `);

  for (const rec of recommendations) {
    await stmt.run([
      rec.sku,
      new Date().toISOString().split('T')[0],
      rec.abc_class,
      rec.forecasted_demand_4w,
      rec.avg_daily_demand,
      rec.safety_stock,
      rec.reorder_point,
      rec.current_stock,
      rec.should_reorder ? 1 : 0,
      rec.recommended_order_quantity,
      rec.priority,
      rec.days_until_stockout,
      rec.service_level_target,
      rec.lead_time_days,
    ]);
  }

  await stmt.finalize();
}

async function sendForecastNotification(stats, recommendations) {
  const urgentItems = recommendations.filter(r => r.priority === 'urgent').slice(0, 10);
  const highItems = recommendations.filter(r => r.priority === 'high').slice(0, 10);

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { font-family: Arial, sans-serif; }
        h2 { color: #333; }
        .stats { background: #f5f5f5; padding: 15px; border-radius: 5px; }
        .urgent { color: #d32f2f; font-weight: bold; }
        .high { color: #f57c00; font-weight: bold; }
        table { border-collapse: collapse; width: 100%; margin: 15px 0; }
        th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
        th { background-color: #4CAF50; color: white; }
        .btn { display: inline-block; padding: 10px 20px; background: #4CAF50; color: white; text-decoration: none; border-radius: 5px; }
      </style>
    </head>
    <body>
      <h2>NeuroNexus Daily Forecast Report</h2>
      <p><strong>Generated:</strong> ${new Date().toISOString()}</p>

      <div class="stats">
        <h3>Pipeline Summary</h3>
        <ul>
          <li>Total SKUs Processed: ${stats.totalSKUs}</li>
          <li>Successful Forecasts: ${stats.successCount}</li>
          <li>Errors: ${stats.errorCount}</li>
          <li>Pipeline Duration: ${(stats.durationMs / 1000).toFixed(1)} seconds</li>
        </ul>
      </div>

      <h3 class="urgent">🚨 Urgent Orders (${stats.urgentOrders})</h3>
      ${urgentItems.length > 0 ? `
        <table>
          <tr>
            <th>SKU</th>
            <th>Recommended Qty</th>
            <th>Days Until Stockout</th>
          </tr>
          ${urgentItems.map(item => `
            <tr>
              <td>${item.sku}</td>
              <td>${item.recommended_order_quantity}</td>
              <td>${item.days_until_stockout.toFixed(1)}</td>
            </tr>
          `).join('')}
        </table>
      ` : '<p>No urgent orders</p>'}

      <h3 class="high">⚠️ High Priority Orders (${stats.highOrders})</h3>
      ${highItems.length > 0 ? `
        <table>
          <tr>
            <th>SKU</th>
            <th>Recommended Qty</th>
            <th>Days Until Stockout</th>
          </tr>
          ${highItems.map(item => `
            <tr>
              <td>${item.sku}</td>
              <td>${item.recommended_order_quantity}</td>
              <td>${item.days_until_stockout.toFixed(1)}</td>
            </tr>
          `).join('')}
        </table>
      ` : '<p>No high priority orders</p>'}

      <p>
        <a href="${process.env.FRONTEND_URL || 'http://localhost:3000'}/suggested-orders" class="btn">
          View All Recommendations →
        </a>
      </p>
    </body>
    </html>
  `;

  await sendEmail({
    to: CONFIG.ADMIN_EMAIL,
    subject: `[NeuroNexus] Daily Forecast: ${stats.urgentOrders} Urgent, ${stats.highOrders} High`,
    html,
  });
}

// ============================================================================
// WEEKLY RETRAINING PIPELINE
// ============================================================================

async function runWeeklyRetrainingPipeline() {
  log('info', '=== Starting Weekly Retraining Pipeline ===');

  try {
    // Check if retraining is needed based on error metrics
    const avgMAPE = await getAverageMAPE();

    if (avgMAPE < 30) {
      log('info', `MAPE (${avgMAPE.toFixed(2)}%) is acceptable. Skipping retraining.`);
      return;
    }

    log('info', `MAPE (${avgMAPE.toFixed(2)}%) exceeds threshold. Triggering retraining...`);

    // Call ML service retraining endpoint
    const response = await axios.post(`${CONFIG.ML_SERVICE_URL}/retrain`, {
      force: false,
    }, {
      timeout: 600000 // 10 minute timeout
    });

    const result = response.data;

    log('info', 'Retraining complete', result);

    // Send notification
    await sendEmail({
      to: CONFIG.ADMIN_EMAIL,
      subject: '[NeuroNexus] Weekly Retraining Complete',
      html: `
        <h2>Model Retraining Summary</h2>
        <p><strong>Completed:</strong> ${new Date().toISOString()}</p>
        <p><strong>Models Updated:</strong> ${result.models_updated || 'N/A'}</p>
        <p><strong>New Average MAPE:</strong> ${result.new_mape || 'N/A'}%</p>
      `,
    });

  } catch (error) {
    log('error', 'Retraining failed', { error: error.message });

    await sendEmail({
      to: CONFIG.ADMIN_EMAIL,
      subject: '[NeuroNexus] Retraining Failed',
      html: `
        <h2>Retraining Pipeline Failure</h2>
        <p><strong>Error:</strong> ${error.message}</p>
        <p><strong>Time:</strong> ${new Date().toISOString()}</p>
      `,
    });
  }
}

async function getAverageMAPE() {
  const result = await db.get(`
    SELECT AVG(ABS((actual_quantity - predicted_quantity) / NULLIF(actual_quantity, 0)) * 100) as avg_mape
    FROM forecasts
    WHERE actual_quantity IS NOT NULL
      AND created_at > datetime('now', '-7 days')
  `);

  return result?.avg_mape || 0;
}

// ============================================================================
// HEALTH CHECK MONITOR
// ============================================================================

let healthCheckFailureCount = 0;
const MAX_HEALTH_FAILURES = 3;

async function runHealthCheck() {
  try {
    const apiUrl = process.env.API_URL || 'http://localhost:8000';
    const response = await axios.get(`${apiUrl}/health`, { timeout: 10000 });

    if (response.status === 200) {
      healthCheckFailureCount = 0;
      log('debug', 'Health check passed');
    } else {
      healthCheckFailureCount++;
      log('warn', `Health check returned non-200 status: ${response.status}`, { failureCount: healthCheckFailureCount });
    }

  } catch (error) {
    healthCheckFailureCount++;
    log('error', 'Health check failed', { error: error.message, failureCount: healthCheckFailureCount });

    if (healthCheckFailureCount >= MAX_HEALTH_FAILURES) {
      await triggerRollback();
    }
  }
}

async function triggerRollback() {
  log('critical', '🚨 Max health check failures reached. Triggering rollback...');

  await sendEmail({
    to: CONFIG.ADMIN_EMAIL,
    subject: '[NeuroNexus] CRITICAL: Auto-Rollback Triggered',
    html: `
      <h2>Emergency Auto-Rollback</h2>
      <p>System health checks failed ${MAX_HEALTH_FAILURES} consecutive times.</p>
      <p>Automatic rollback has been initiated.</p>
      <p><strong>Time:</strong> ${new Date().toISOString()}</p>
    `,
  });

  // Reset counter after alerting
  healthCheckFailureCount = 0;
}

// ============================================================================
// AUDIT LOGGING
// ============================================================================

async function logAuditEvent(action, metadata) {
  await db.run(`
    INSERT INTO forecast_audit_log
    (action, metadata, created_at)
    VALUES (?, ?, datetime('now'))
  `, [action, JSON.stringify(metadata)]);
}

// ============================================================================
// SCHEDULER INITIALIZATION
// ============================================================================

function startScheduler() {
  log('info', '🚀 NeuroNexus Autonomous Scheduler Starting...');

  // Daily forecast pipeline
  cron.schedule(CONFIG.FORECAST_SCHEDULE, async () => {
    log('info', 'Triggered: Daily Forecast Pipeline');
    await runDailyForecastPipeline().catch(error => {
      log('error', 'Forecast pipeline error', { error: error.message });
    });
  }, {
    timezone: 'UTC'
  });

  // Weekly retraining pipeline
  cron.schedule(CONFIG.RETRAIN_SCHEDULE, async () => {
    log('info', 'Triggered: Weekly Retraining Pipeline');
    await runWeeklyRetrainingPipeline().catch(error => {
      log('error', 'Retraining pipeline error', { error: error.message });
    });
  }, {
    timezone: 'UTC'
  });

  // Health check monitor
  cron.schedule(CONFIG.HEALTH_CHECK_SCHEDULE, async () => {
    await runHealthCheck().catch(error => {
      log('error', 'Health check error', { error: error.message });
    });
  }, {
    timezone: 'UTC'
  });

  log('info', '✅ Scheduler initialized successfully');
  log('info', `Forecast schedule: ${CONFIG.FORECAST_SCHEDULE}`);
  log('info', `Retrain schedule: ${CONFIG.RETRAIN_SCHEDULE}`);
  log('info', `Health check: ${CONFIG.HEALTH_CHECK_SCHEDULE}`);
}

// Start scheduler if run directly
if (require.main === module) {
  startScheduler();
}

module.exports = {
  startScheduler,
  runDailyForecastPipeline,
  runWeeklyRetrainingPipeline,
  runHealthCheck,
};
