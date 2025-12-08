/**
 * Reorder Alerts Service
 * P1 Hardening: Nightly job + endpoint + email/webhook notifications
 * 
 * Checks inventory items against reorder points and sends alerts
 */

const nodemailer = require('nodemailer');
const axios = require('axios');

// Email transport (reuse from scheduler if available)
let emailTransport = null;
if (process.env.SMTP_USERNAME && process.env.SMTP_PASSWORD) {
  emailTransport = nodemailer.createTransport({
    host: process.env.SMTP_SERVER || 'smtp.gmail.com',
    port: parseInt(process.env.SMTP_PORT || '587'),
    secure: false,
    auth: {
      user: process.env.SMTP_USERNAME,
      pass: process.env.SMTP_PASSWORD,
    },
  });
}

/**
 * Run nightly reorder alerts check
 * Scans all orgs and identifies items below reorder point
 */
async function runReorderAlertsCheck(db) {
  const startTime = Date.now();
  console.log('[ReorderAlerts] Starting nightly reorder alerts check...');

  try {
    // Get all organizations
    const orgsResult = await db.query(`
      SELECT id, name, slug, settings
      FROM organizations
      WHERE deleted_at IS NULL
    `);

    const allAlerts = [];
    let totalItemsChecked = 0;
    let totalAlertsGenerated = 0;

    // Process each organization
    for (const org of orgsResult.rows) {
      const orgId = org.id;
      
      // Get items below reorder point for this org
      const alertsResult = await db.query(`
        SELECT 
          ii.item_id,
          ii.item_code,
          ii.item_name,
          ii.current_quantity,
          ii.reorder_point,
          ii.par_level,
          ii.min_quantity,
          ii.unit,
          ii.unit_cost,
          ii.category,
          ii.location,
          ii.site_id,
          s.name as site_name,
          CASE 
            WHEN ii.current_quantity <= 0 THEN 'critical'
            WHEN ii.current_quantity <= ii.reorder_point THEN 'urgent'
            WHEN ii.current_quantity <= ii.par_level THEN 'warning'
            ELSE 'info'
          END as alert_level,
          (ii.reorder_point - ii.current_quantity) as shortage_qty,
          (ii.par_level - ii.current_quantity) as par_shortage_qty
        FROM inventory_items ii
        LEFT JOIN sites s ON ii.site_id = s.id
        WHERE ii.org_id = $1
          AND ii.is_active = true
          AND (
            ii.current_quantity <= ii.reorder_point
            OR (ii.reorder_point = 0 AND ii.current_quantity <= ii.par_level)
            OR (ii.reorder_point = 0 AND ii.par_level = 0 AND ii.current_quantity <= ii.min_quantity)
          )
        ORDER BY 
          CASE 
            WHEN ii.current_quantity <= 0 THEN 1
            WHEN ii.current_quantity <= ii.reorder_point THEN 2
            WHEN ii.current_quantity <= ii.par_level THEN 3
            ELSE 4
          END,
          ii.item_name ASC
      `, [orgId]);

      totalItemsChecked += alertsResult.rows.length;
      
      if (alertsResult.rows.length > 0) {
        const orgAlerts = {
          org_id: orgId,
          org_name: org.name,
          org_slug: org.slug,
          alerts: alertsResult.rows.map(row => ({
            item_id: row.item_id,
            item_code: row.item_code,
            item_name: row.item_name,
            current_quantity: parseFloat(row.current_quantity || 0),
            reorder_point: parseFloat(row.reorder_point || 0),
            par_level: parseFloat(row.par_level || 0),
            min_quantity: parseFloat(row.min_quantity || 0),
            unit: row.unit,
            unit_cost: parseFloat(row.unit_cost || 0),
            category: row.category,
            location: row.location,
            site_id: row.site_id,
            site_name: row.site_name,
            alert_level: row.alert_level,
            shortage_qty: parseFloat(row.shortage_qty || 0),
            par_shortage_qty: parseFloat(row.par_shortage_qty || 0),
            estimated_value: parseFloat(row.unit_cost || 0) * parseFloat(row.shortage_qty || 0)
          })),
          summary: {
            total_alerts: alertsResult.rows.length,
            critical: alertsResult.rows.filter(r => r.alert_level === 'critical').length,
            urgent: alertsResult.rows.filter(r => r.alert_level === 'urgent').length,
            warning: alertsResult.rows.filter(r => r.alert_level === 'warning').length,
            total_shortage_value: alertsResult.rows.reduce((sum, r) => 
              sum + (parseFloat(r.unit_cost || 0) * parseFloat(r.shortage_qty || 0)), 0
            )
          }
        };

        allAlerts.push(orgAlerts);
        totalAlertsGenerated += alertsResult.rows.length;

        // Send notifications for this org
        await sendReorderNotifications(orgAlerts, org.settings || {});
      }
    }

    const duration = Date.now() - startTime;
    console.log(`[ReorderAlerts] Check completed in ${duration}ms`);
    console.log(`[ReorderAlerts] Organizations checked: ${orgsResult.rows.length}`);
    console.log(`[ReorderAlerts] Items checked: ${totalItemsChecked}`);
    console.log(`[ReorderAlerts] Alerts generated: ${totalAlertsGenerated}`);

    // Store alert run summary (optional - create table if needed)
    try {
      await db.query(`
        INSERT INTO reorder_alert_runs (org_id, items_checked, alerts_generated, run_at)
        VALUES ($1, $2, $3, NOW())
        ON CONFLICT DO NOTHING
      `, [null, totalItemsChecked, totalAlertsGenerated]);
    } catch (err) {
      // Table might not exist - ignore
      console.log('[ReorderAlerts] Alert run summary table not found, skipping');
    }

    return {
      success: true,
      run_at: new Date().toISOString(),
      duration_ms: duration,
      organizations_checked: orgsResult.rows.length,
      items_checked: totalItemsChecked,
      alerts_generated: totalAlertsGenerated,
      alerts_by_org: allAlerts
    };

  } catch (error) {
    console.error('[ReorderAlerts] Error in nightly check:', error);
    throw error;
  }
}

/**
 * Send email and webhook notifications for reorder alerts
 */
async function sendReorderNotifications(orgAlerts, orgSettings) {
  const { org_name, alerts, summary } = orgAlerts;

  // Get notification preferences from org settings
  const emailRecipients = orgSettings.reorder_alert_emails || [];
  const webhookUrl = orgSettings.reorder_webhook_url || process.env.REORDER_WEBHOOK_URL;

  // Send email if recipients configured
  if (emailRecipients.length > 0 && emailTransport) {
    try {
      const emailHtml = generateReorderAlertEmail(orgAlerts);
      
      await emailTransport.sendMail({
        from: `"Inventory System" <${process.env.SMTP_USERNAME}>`,
        to: emailRecipients.join(', '),
        subject: `Reorder Alert: ${summary.total_alerts} items need attention - ${org_name}`,
        html: emailHtml,
      });

      console.log(`[ReorderAlerts] Email sent to ${emailRecipients.length} recipients for org ${org_name}`);
    } catch (error) {
      console.error(`[ReorderAlerts] Failed to send email for org ${org_name}:`, error.message);
    }
  }

  // Send webhook if configured
  if (webhookUrl) {
    try {
      await axios.post(webhookUrl, {
        event: 'reorder_alert',
        org_id: orgAlerts.org_id,
        org_name: org_name,
        timestamp: new Date().toISOString(),
        summary: summary,
        alerts: alerts.slice(0, 50), // Limit to first 50 for webhook
        total_alerts: alerts.length
      }, {
        timeout: 5000,
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'Inventory-Enterprise/1.0'
        }
      });

      console.log(`[ReorderAlerts] Webhook sent to ${webhookUrl} for org ${org_name}`);
    } catch (error) {
      console.error(`[ReorderAlerts] Failed to send webhook for org ${org_name}:`, error.message);
    }
  }
}

/**
 * Generate HTML email template for reorder alerts
 */
function generateReorderAlertEmail(orgAlerts) {
  const { org_name, alerts, summary } = orgAlerts;
  
  const criticalItems = alerts.filter(a => a.alert_level === 'critical');
  const urgentItems = alerts.filter(a => a.alert_level === 'urgent');
  const warningItems = alerts.filter(a => a.alert_level === 'warning');

  return `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .header { background: #f44336; color: white; padding: 20px; text-align: center; }
    .content { padding: 20px; }
    .summary { background: #f5f5f5; padding: 15px; border-radius: 5px; margin: 20px 0; }
    .summary-item { margin: 5px 0; }
    .alert-table { width: 100%; border-collapse: collapse; margin: 20px 0; }
    .alert-table th { background: #333; color: white; padding: 10px; text-align: left; }
    .alert-table td { padding: 8px; border-bottom: 1px solid #ddd; }
    .alert-table tr:hover { background: #f5f5f5; }
    .critical { color: #d32f2f; font-weight: bold; }
    .urgent { color: #f57c00; font-weight: bold; }
    .warning { color: #fbc02d; }
    .footer { background: #f5f5f5; padding: 15px; text-align: center; font-size: 12px; color: #666; }
  </style>
</head>
<body>
  <div class="header">
    <h1>🛒 Reorder Alert</h1>
    <p>${org_name}</p>
  </div>
  
  <div class="content">
    <div class="summary">
      <h2>Summary</h2>
      <div class="summary-item"><strong>Total Items Needing Attention:</strong> ${summary.total_alerts}</div>
      <div class="summary-item"><strong>Critical (Out of Stock):</strong> <span class="critical">${summary.critical}</span></div>
      <div class="summary-item"><strong>Urgent (Below Reorder Point):</strong> <span class="urgent">${summary.urgent}</span></div>
      <div class="summary-item"><strong>Warning (Below Par Level):</strong> <span class="warning">${summary.warning}</span></div>
      <div class="summary-item"><strong>Estimated Reorder Value:</strong> $${summary.total_shortage_value.toFixed(2)}</div>
    </div>

    ${criticalItems.length > 0 ? `
    <h3 class="critical">Critical Items (Out of Stock)</h3>
    <table class="alert-table">
      <tr>
        <th>Item Code</th>
        <th>Item Name</th>
        <th>Current Qty</th>
        <th>Reorder Point</th>
        <th>Shortage</th>
        <th>Location</th>
      </tr>
      ${criticalItems.map(item => `
      <tr>
        <td>${item.item_code}</td>
        <td>${item.item_name}</td>
        <td class="critical">${item.current_quantity} ${item.unit}</td>
        <td>${item.reorder_point} ${item.unit}</td>
        <td>${item.shortage_qty} ${item.unit}</td>
        <td>${item.location || 'N/A'}</td>
      </tr>
      `).join('')}
    </table>
    ` : ''}

    ${urgentItems.length > 0 ? `
    <h3 class="urgent">Urgent Items (Below Reorder Point)</h3>
    <table class="alert-table">
      <tr>
        <th>Item Code</th>
        <th>Item Name</th>
        <th>Current Qty</th>
        <th>Reorder Point</th>
        <th>Shortage</th>
        <th>Location</th>
      </tr>
      ${urgentItems.slice(0, 20).map(item => `
      <tr>
        <td>${item.item_code}</td>
        <td>${item.item_name}</td>
        <td class="urgent">${item.current_quantity} ${item.unit}</td>
        <td>${item.reorder_point} ${item.unit}</td>
        <td>${item.shortage_qty} ${item.unit}</td>
        <td>${item.location || 'N/A'}</td>
      </tr>
      `).join('')}
    </table>
    ${urgentItems.length > 20 ? `<p><em>... and ${urgentItems.length - 20} more items</em></p>` : ''}
    ` : ''}

    ${warningItems.length > 0 ? `
    <h3 class="warning">Warning Items (Below Par Level)</h3>
    <p><em>${warningItems.length} items are below par level but above reorder point</em></p>
    ` : ''}
  </div>

  <div class="footer">
    <p>This is an automated alert from your Inventory Management System.</p>
    <p>Generated at ${new Date().toLocaleString()}</p>
  </div>
</body>
</html>
  `;
}

/**
 * Get reorder alerts for a specific organization (for API endpoint)
 */
async function getReorderAlerts(db, orgId, siteId = null, options = {}) {
  const {
    alert_level = null,
    limit = 100,
    offset = 0
  } = options;

  let query = `
    SELECT 
      ii.item_id,
      ii.item_code,
      ii.item_name,
      ii.current_quantity,
      ii.reorder_point,
      ii.par_level,
      ii.min_quantity,
      ii.unit,
      ii.unit_cost,
      ii.category,
      ii.location,
      ii.site_id,
      s.name as site_name,
      CASE 
        WHEN ii.current_quantity <= 0 THEN 'critical'
        WHEN ii.current_quantity <= ii.reorder_point THEN 'urgent'
        WHEN ii.current_quantity <= ii.par_level THEN 'warning'
        ELSE 'info'
      END as alert_level,
      (ii.reorder_point - ii.current_quantity) as shortage_qty,
      (ii.par_level - ii.current_quantity) as par_shortage_qty,
      (ii.unit_cost * (ii.reorder_point - ii.current_quantity)) as estimated_reorder_value
    FROM inventory_items ii
    LEFT JOIN sites s ON ii.site_id = s.id
    WHERE ii.org_id = $1
      AND ii.is_active = true
      AND (
        ii.current_quantity <= ii.reorder_point
        OR (ii.reorder_point = 0 AND ii.current_quantity <= ii.par_level)
        OR (ii.reorder_point = 0 AND ii.par_level = 0 AND ii.current_quantity <= ii.min_quantity)
      )
  `;

  const params = [orgId];
  let paramIndex = 2;

  // Site filtering
  if (siteId) {
    query += ` AND ii.site_id = $${paramIndex}`;
    params.push(siteId);
    paramIndex++;
  }

  // Alert level filtering
  if (alert_level) {
    query += ` AND CASE 
      WHEN ii.current_quantity <= 0 THEN 'critical'
      WHEN ii.current_quantity <= ii.reorder_point THEN 'urgent'
      WHEN ii.current_quantity <= ii.par_level THEN 'warning'
      ELSE 'info'
    END = $${paramIndex}`;
    params.push(alert_level);
    paramIndex++;
  }

  query += ` ORDER BY 
    CASE 
      WHEN ii.current_quantity <= 0 THEN 1
      WHEN ii.current_quantity <= ii.reorder_point THEN 2
      WHEN ii.current_quantity <= ii.par_level THEN 3
      ELSE 4
    END,
    ii.item_name ASC
    LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
  
  params.push(limit, offset);

  const result = await db.query(query, params);

  // Get total count
  let countQuery = `
    SELECT COUNT(*) as total
    FROM inventory_items ii
    WHERE ii.org_id = $1
      AND ii.is_active = true
      AND (
        ii.current_quantity <= ii.reorder_point
        OR (ii.reorder_point = 0 AND ii.current_quantity <= ii.par_level)
        OR (ii.reorder_point = 0 AND ii.par_level = 0 AND ii.current_quantity <= ii.min_quantity)
      )
  `;
  const countParams = [orgId];
  
  if (siteId) {
    countQuery += ` AND ii.site_id = $2`;
    countParams.push(siteId);
  }

  if (alert_level) {
    countQuery += ` AND CASE 
      WHEN ii.current_quantity <= 0 THEN 'critical'
      WHEN ii.current_quantity <= ii.reorder_point THEN 'urgent'
      WHEN ii.current_quantity <= ii.par_level THEN 'warning'
      ELSE 'info'
    END = $${countParams.length + 1}`;
    countParams.push(alert_level);
  }

  const countResult = await db.query(countQuery, countParams);
  const total = parseInt(countResult.rows[0]?.total || 0);

  const alerts = result.rows.map(row => ({
    item_id: row.item_id,
    item_code: row.item_code,
    item_name: row.item_name,
    current_quantity: parseFloat(row.current_quantity || 0),
    reorder_point: parseFloat(row.reorder_point || 0),
    par_level: parseFloat(row.par_level || 0),
    min_quantity: parseFloat(row.min_quantity || 0),
    unit: row.unit,
    unit_cost: parseFloat(row.unit_cost || 0),
    category: row.category,
    location: row.location,
    site_id: row.site_id,
    site_name: row.site_name,
    alert_level: row.alert_level,
    shortage_qty: parseFloat(row.shortage_qty || 0),
    par_shortage_qty: parseFloat(row.par_shortage_qty || 0),
    estimated_reorder_value: parseFloat(row.estimated_reorder_value || 0)
  }));

  // Calculate summary
  const summary = {
    total: total,
    critical: alerts.filter(a => a.alert_level === 'critical').length,
    urgent: alerts.filter(a => a.alert_level === 'urgent').length,
    warning: alerts.filter(a => a.alert_level === 'warning').length,
    total_shortage_value: alerts.reduce((sum, a) => sum + a.estimated_reorder_value, 0)
  };

  return {
    alerts,
    summary,
    pagination: {
      limit,
      offset,
      total
    }
  };
}

module.exports = {
  runReorderAlertsCheck,
  getReorderAlerts,
  sendReorderNotifications
};

