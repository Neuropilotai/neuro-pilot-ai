/**
 * GovernanceIntelligenceService.js (v16.0.0)
 *
 * Purpose: Predictive insights, anomaly detection, bilingual intelligence
 * - Detect anomalies (forecast vs actual deviations)
 * - Generate bilingual insights (EN/FR)
 * - Compute intelligence score (0-100)
 * - Generate PDF reports
 *
 * Author: NeuroPilot AI Development Team
 * Date: 2025-10-18
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

class GovernanceIntelligenceService {
  constructor(db) {
    this.db = db;
  }

  /**
   * Detect anomalies by comparing forecasts vs actuals
   * Flags deviations > 10% with auto-scaled severity
   */
  async detectAnomalies() {
    try {
      const anomalies = [];
      const pillars = ['finance', 'health', 'ai', 'menu', 'composite'];
      const today = new Date().toISOString().split('T')[0];

      for (const pillar of pillars) {
        // Get last 7 days of actual scores
        const actuals = await this.db.all(`
          SELECT as_of, score
          FROM governance_daily
          WHERE pillar = ?
            AND as_of >= date('now', '-7 days')
          ORDER BY as_of DESC
          LIMIT 7
        `, [pillar]);

        if (actuals.length === 0) {
          // Missing data anomaly
          const anomalyId = crypto.randomUUID();
          anomalies.push({
            id: anomalyId,
            as_of: today,
            pillar,
            type: 'missing_data',
            delta: 0,
            severity: 'medium',
            message: `No recent data for ${pillar} pillar (last 7 days)`
          });
          continue;
        }

        // Get forecasts for these dates
        for (const actual of actuals) {
          const forecast = await this.db.get(`
            SELECT score, lower, upper
            FROM governance_forecast
            WHERE pillar = ?
              AND as_of = ?
            ORDER BY created_at DESC
            LIMIT 1
          `, [pillar, actual.as_of]);

          if (!forecast) continue;

          const delta = actual.score - forecast.score;
          const percentDelta = Math.abs(delta / forecast.score * 100);

          // Detect anomaly if deviation > 10%
          if (percentDelta > 10) {
            const anomalyId = crypto.randomUUID();
            const type = delta > 0 ? 'surge' : 'drop';
            const severity = this._calculateSeverity(percentDelta);

            anomalies.push({
              id: anomalyId,
              as_of: actual.as_of,
              pillar,
              type,
              delta,
              severity,
              message: `${pillar}: ${type} detected — ${Math.abs(delta).toFixed(1)} point deviation (${percentDelta.toFixed(1)}% from forecast)`
            });
          }
        }
      }

      // Insert anomalies
      for (const anomaly of anomalies) {
        await this.db.run(`
          INSERT INTO governance_anomalies (id, as_of, pillar, type, delta, severity, message)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `, [anomaly.id, anomaly.as_of, anomaly.pillar, anomaly.type, anomaly.delta, anomaly.severity, anomaly.message]);
      }

      console.log(`✅ Detected ${anomalies.length} anomalies`);

      return {
        success: true,
        anomalies_detected: anomalies.length,
        anomalies
      };
    } catch (error) {
      console.error('❌ Error detecting anomalies:', error);
      throw error;
    }
  }

  /**
   * Generate bilingual insights for each pillar
   */
  async generateInsights() {
    try {
      const insights = [];
      const pillars = ['finance', 'health', 'ai', 'menu', 'composite'];
      const today = new Date().toISOString().split('T')[0];

      for (const pillar of pillars) {
        // Get last 7 days of scores
        const recentScores = await this.db.all(`
          SELECT as_of, score
          FROM governance_daily
          WHERE pillar = ?
            AND as_of >= date('now', '-7 days')
          ORDER BY as_of ASC
        `, [pillar]);

        if (recentScores.length < 2) continue;

        // Calculate trend
        const first = recentScores[0].score;
        const last = recentScores[recentScores.length - 1].score;
        const trend = last - first;
        const variance = this._calculateVariance(recentScores.map(s => s.score));

        // Get forecast for today
        const forecast = await this.db.get(`
          SELECT score
          FROM governance_forecast
          WHERE pillar = ?
            AND as_of = ?
          ORDER BY created_at DESC
          LIMIT 1
        `, [pillar, today]);

        const forecastDelta = forecast ? (last - forecast.score) : 0;
        const forecastPercent = forecast ? ((forecastDelta / forecast.score) * 100) : 0;

        // Generate bilingual insight
        const { insight_en, insight_fr, confidence } = this._generateBilingualInsight(
          pillar,
          trend,
          variance,
          forecastDelta,
          forecastPercent,
          last
        );

        const insightId = crypto.randomUUID();
        insights.push({
          id: insightId,
          as_of: today,
          pillar,
          insight_en,
          insight_fr,
          confidence
        });

        // Insert insight
        await this.db.run(`
          INSERT INTO governance_insights (id, as_of, pillar, insight_en, insight_fr, confidence)
          VALUES (?, ?, ?, ?, ?, ?)
        `, [insightId, today, pillar, insight_en, insight_fr, confidence]);
      }

      console.log(`✅ Generated ${insights.length} insights`);

      return {
        success: true,
        insights_generated: insights.length,
        insights
      };
    } catch (error) {
      console.error('❌ Error generating insights:', error);
      throw error;
    }
  }

  /**
   * Compute governance intelligence score (0-100)
   * Components: Forecast Reliability 30%, Data Completeness 20%, Anomaly Severity 10%, Governance Accuracy 40%
   */
  async computeIntelligenceScore() {
    try {
      // 1. Forecast Reliability (30%) - RMSE of last 7 days
      const forecastReliability = await this._computeForecastReliability();

      // 2. Data Completeness (20%) - Missing vs expected daily rows
      const dataCompleteness = await this._computeDataCompleteness();

      // 3. Anomaly Severity (10%) - Weighted penalty
      const anomalyPenalty = await this._computeAnomalyPenalty();

      // 4. Governance Accuracy (40%) - Blend of pillar scores
      const governanceAccuracy = await this._computeGovernanceAccuracy();

      // Compute composite intelligence score
      const intelligenceScore = Math.round(
        (forecastReliability * 0.30) +
        (dataCompleteness * 0.20) +
        (anomalyPenalty * 0.10) +
        (governanceAccuracy * 0.40)
      );

      console.log(`✅ Intelligence Score: ${intelligenceScore} (Forecast: ${forecastReliability.toFixed(1)}, Data: ${dataCompleteness.toFixed(1)}, Anomaly: ${anomalyPenalty.toFixed(1)}, Governance: ${governanceAccuracy.toFixed(1)})`);

      return {
        success: true,
        intelligence_score: intelligenceScore,
        components: {
          forecast_reliability: forecastReliability,
          data_completeness: dataCompleteness,
          anomaly_penalty: anomalyPenalty,
          governance_accuracy: governanceAccuracy
        }
      };
    } catch (error) {
      console.error('❌ Error computing intelligence score:', error);
      throw error;
    }
  }

  /**
   * Generate bilingual PDF report
   */
  async generatePDFReport() {
    try {
      const reportDir = path.join(__dirname, '../../reports/governance');
      if (!fs.existsSync(reportDir)) {
        fs.mkdirSync(reportDir, { recursive: true });
      }

      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const reportPath = path.join(reportDir, `governance_intelligence_${timestamp}.html`);

      // Get data
      const intelligence = await this.computeIntelligenceScore();
      const anomalies = await this.db.all(`
        SELECT * FROM v_governance_anomalies_active
        ORDER BY severity, as_of DESC
        LIMIT 10
      `);
      const insights = await this.db.all(`
        SELECT * FROM v_governance_insights_latest
        ORDER BY as_of DESC
        LIMIT 15
      `);

      // Generate HTML report (can be converted to PDF via headless browser)
      const html = this._generateHTMLReport(intelligence, anomalies, insights);

      fs.writeFileSync(reportPath, html, 'utf8');

      console.log(`✅ Report generated: ${reportPath}`);

      return {
        success: true,
        report_path: reportPath,
        report_url: `/reports/governance/${path.basename(reportPath)}`
      };
    } catch (error) {
      console.error('❌ Error generating PDF report:', error);
      throw error;
    }
  }

  /**
   * Get current intelligence status
   */
  async getIntelligenceStatus() {
    try {
      const intelligence = await this.computeIntelligenceScore();

      const anomalies = await this.db.all(`
        SELECT * FROM v_governance_anomalies_active
        LIMIT 20
      `);

      const insights = await this.db.all(`
        SELECT * FROM v_governance_insights_latest
        LIMIT 10
      `);

      const anomalyCounts = await this.db.get(`
        SELECT
          COUNT(*) as total,
          SUM(CASE WHEN severity = 'critical' THEN 1 ELSE 0 END) as critical,
          SUM(CASE WHEN severity = 'high' THEN 1 ELSE 0 END) as high,
          SUM(CASE WHEN severity = 'medium' THEN 1 ELSE 0 END) as medium,
          SUM(CASE WHEN severity = 'low' THEN 1 ELSE 0 END) as low
        FROM governance_anomalies
        WHERE resolved = 0
      `);

      return {
        success: true,
        intelligence_score: intelligence.intelligence_score,
        components: intelligence.components,
        anomalies: anomalies || [],
        anomaly_counts: anomalyCounts || { total: 0, critical: 0, high: 0, medium: 0, low: 0 },
        insights: insights || []
      };
    } catch (error) {
      console.error('❌ Error getting intelligence status:', error);
      throw error;
    }
  }

  // ============================================================================
  // PRIVATE HELPERS
  // ============================================================================

  _calculateSeverity(percentDelta) {
    if (percentDelta >= 30) return 'critical';
    if (percentDelta >= 20) return 'high';
    if (percentDelta >= 10) return 'medium';
    return 'low';
  }

  _calculateVariance(values) {
    const n = values.length;
    if (n === 0) return 0;
    const mean = values.reduce((sum, v) => sum + v, 0) / n;
    const variance = values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / n;
    return Math.sqrt(variance);
  }

  _generateBilingualInsight(pillar, trend, variance, forecastDelta, forecastPercent, currentScore) {
    const pillarNames = {
      finance: { en: 'Finance', fr: 'Finance' },
      health: { en: 'Health', fr: 'Santé' },
      ai: { en: 'AI', fr: 'IA' },
      menu: { en: 'Menu', fr: 'Menu' },
      composite: { en: 'Composite', fr: 'Composite' }
    };

    let insight_en = '';
    let insight_fr = '';
    let confidence = 0.85;

    if (Math.abs(trend) < 2 && variance < 5) {
      // Stable
      insight_en = `${pillarNames[pillar].en} stability maintained — variance ${variance.toFixed(1)}% (${forecastPercent > 0 ? '+' : ''}${forecastPercent.toFixed(1)}% vs forecast)`;
      insight_fr = `Stabilité ${pillarNames[pillar].fr} maintenue — écart de ${variance.toFixed(1)}% (${forecastPercent > 0 ? '+' : ''}${forecastPercent.toFixed(1)}% vs prévision)`;
      confidence = 0.90;
    } else if (trend > 5) {
      // Improving
      insight_en = `${pillarNames[pillar].en} improving — trend +${trend.toFixed(1)} pts over 7 days (current: ${currentScore.toFixed(1)})`;
      insight_fr = `${pillarNames[pillar].fr} en amélioration — tendance +${trend.toFixed(1)} pts sur 7 jours (actuel: ${currentScore.toFixed(1)})`;
      confidence = 0.88;
    } else if (trend < -5) {
      // Declining
      insight_en = `${pillarNames[pillar].en} declining — trend ${trend.toFixed(1)} pts over 7 days (requires attention)`;
      insight_fr = `${pillarNames[pillar].fr} en baisse — tendance ${trend.toFixed(1)} pts sur 7 jours (nécessite attention)`;
      confidence = 0.85;
    } else {
      // Moderate variance
      insight_en = `${pillarNames[pillar].en} moderate variance — ${variance.toFixed(1)}% deviation (monitoring recommended)`;
      insight_fr = `${pillarNames[pillar].fr} variance modérée — écart de ${variance.toFixed(1)}% (surveillance recommandée)`;
      confidence = 0.82;
    }

    return { insight_en, insight_fr, confidence };
  }

  async _computeForecastReliability() {
    // RMSE of last 7 days (lower is better, convert to 0-100 scale)
    const results = await this.db.all(`
      SELECT
        d.score as actual,
        f.score as forecast
      FROM governance_daily d
      LEFT JOIN governance_forecast f ON d.pillar = f.pillar AND d.as_of = f.as_of
      WHERE d.as_of >= date('now', '-7 days')
        AND f.score IS NOT NULL
    `);

    if (results.length === 0) return 60; // Default if no forecast data

    const rmse = Math.sqrt(
      results.reduce((sum, r) => sum + Math.pow(r.actual - r.forecast, 2), 0) / results.length
    );

    // Convert RMSE to 0-100 scale (lower RMSE = higher score)
    const reliability = Math.max(0, Math.min(100, 100 - (rmse * 2)));
    return reliability;
  }

  async _computeDataCompleteness() {
    // Expected: 5 pillars * 7 days = 35 rows
    const expected = 35;
    const actual = await this.db.get(`
      SELECT COUNT(*) as count
      FROM governance_daily
      WHERE as_of >= date('now', '-7 days')
    `);

    const completeness = (actual.count / expected) * 100;
    return Math.min(100, completeness);
  }

  async _computeAnomalyPenalty() {
    // Weighted penalty: critical=20, high=10, medium=5, low=2
    const anomalies = await this.db.get(`
      SELECT
        SUM(CASE WHEN severity = 'critical' THEN 20 ELSE 0 END) as critical_penalty,
        SUM(CASE WHEN severity = 'high' THEN 10 ELSE 0 END) as high_penalty,
        SUM(CASE WHEN severity = 'medium' THEN 5 ELSE 0 END) as medium_penalty,
        SUM(CASE WHEN severity = 'low' THEN 2 ELSE 0 END) as low_penalty
      FROM governance_anomalies
      WHERE resolved = 0
        AND as_of >= date('now', '-7 days')
    `);

    const totalPenalty = (anomalies.critical_penalty || 0) + (anomalies.high_penalty || 0) +
                        (anomalies.medium_penalty || 0) + (anomalies.low_penalty || 0);

    // Convert penalty to 0-100 score (higher penalty = lower score)
    const score = Math.max(0, 100 - totalPenalty);
    return score;
  }

  async _computeGovernanceAccuracy() {
    // Get latest composite score
    const latest = await this.db.get(`
      SELECT score
      FROM governance_daily
      WHERE pillar = 'composite'
      ORDER BY as_of DESC
      LIMIT 1
    `);

    return latest ? latest.score : 60;
  }

  _generateHTMLReport(intelligence, anomalies, insights) {
    const timestamp = new Date().toISOString().split('T')[0];

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>NeuroPilot Governance Intelligence Report</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; margin: 40px; color: #1f2937; }
    h1 { color: #111827; border-bottom: 3px solid #3b82f6; padding-bottom: 10px; }
    h2 { color: #374151; margin-top: 30px; }
    .score-badge { display: inline-block; padding: 8px 16px; border-radius: 8px; font-weight: bold; font-size: 20px; }
    .score-green { background: #d1fae5; color: #065f46; }
    .score-amber { background: #fef3c7; color: #92400e; }
    .score-red { background: #fee2e2; color: #991b1b; }
    table { width: 100%; border-collapse: collapse; margin: 20px 0; }
    th, td { text-align: left; padding: 12px; border-bottom: 1px solid #e5e7eb; }
    th { background: #f3f4f6; font-weight: 600; }
    .severity-critical { color: #dc2626; font-weight: bold; }
    .severity-high { color: #f59e0b; font-weight: bold; }
    .severity-medium { color: #f59e0b; }
    .severity-low { color: #6b7280; }
    .insight { background: #f0f9ff; padding: 12px; border-left: 4px solid #3b82f6; margin: 10px 0; }
    .bilingual { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin: 20px 0; }
    .lang-block { padding: 15px; background: #f9fafb; border-radius: 8px; }
  </style>
</head>
<body>
  <h1>🧠 NeuroPilot Governance Intelligence Report</h1>
  <p><strong>Generated:</strong> ${timestamp} | <strong>Version:</strong> 16.0.0</p>

  <h2>Intelligence Score</h2>
  <div class="score-badge ${intelligence.intelligence_score >= 90 ? 'score-green' : intelligence.intelligence_score >= 75 ? 'score-amber' : 'score-red'}">
    ${intelligence.intelligence_score}/100
  </div>

  <h3>Score Components</h3>
  <table>
    <tr>
      <th>Component</th>
      <th>Weight</th>
      <th>Score</th>
    </tr>
    <tr>
      <td>Forecast Reliability</td>
      <td>30%</td>
      <td>${intelligence.components.forecast_reliability.toFixed(1)}</td>
    </tr>
    <tr>
      <td>Data Completeness</td>
      <td>20%</td>
      <td>${intelligence.components.data_completeness.toFixed(1)}</td>
    </tr>
    <tr>
      <td>Anomaly Penalty</td>
      <td>10%</td>
      <td>${intelligence.components.anomaly_penalty.toFixed(1)}</td>
    </tr>
    <tr>
      <td>Governance Accuracy</td>
      <td>40%</td>
      <td>${intelligence.components.governance_accuracy.toFixed(1)}</td>
    </tr>
  </table>

  <h2>⚠️ Active Anomalies</h2>
  ${anomalies.length === 0 ? '<p>No active anomalies detected.</p>' : `
  <table>
    <tr>
      <th>Date</th>
      <th>Pillar</th>
      <th>Type</th>
      <th>Severity</th>
      <th>Message</th>
    </tr>
    ${anomalies.map(a => `
    <tr>
      <td>${a.as_of}</td>
      <td>${a.pillar}</td>
      <td>${a.type}</td>
      <td class="severity-${a.severity}">${a.severity.toUpperCase()}</td>
      <td>${a.message}</td>
    </tr>
    `).join('')}
  </table>
  `}

  <h2>💡 Insights (Bilingual)</h2>
  ${insights.map(i => `
  <div class="insight">
    <div class="bilingual">
      <div class="lang-block">
        <strong>🇬🇧 EN:</strong> ${i.insight_en}
      </div>
      <div class="lang-block">
        <strong>🇫🇷 FR:</strong> ${i.insight_fr}
      </div>
    </div>
    <small>Confidence: ${(i.confidence * 100).toFixed(0)}% | Pillar: ${i.pillar} | Date: ${i.as_of}</small>
  </div>
  `).join('')}

  <hr style="margin: 40px 0;">
  <p style="text-align: center; color: #6b7280;">
    <em>Generated by NeuroPilot AI Governance Intelligence v16.0.0</em>
  </p>
</body>
</html>`;
  }
}

module.exports = GovernanceIntelligenceService;
