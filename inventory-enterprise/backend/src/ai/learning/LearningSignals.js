/**
 * LearningSignals.js - v14.0
 * NeuroPilot Next-Level Learning: Weighted Feature Signals
 *
 * Computes multi-dimensional learning signals from diverse data sources:
 * - Menu signal (4-week menu calendar patterns)
 * - Population signal (site population changes)
 * - Seasonality signal (weekday/holiday patterns)
 * - Contractor requisitions signal
 * - Waste feedback signal
 * - FIFO age pressure signal
 * - Invoice lead-time signal
 *
 * Weighting framework:
 * - menu_signal: 0.35 (highest - direct demand driver)
 * - population_signal: 0.25 (second highest - scales all demand)
 * - seasonality: 0.10
 * - contractor_signal: 0.10
 * - waste_feedback: 0.10
 * - fifo_age_pressure: 0.05
 * - invoice_leadtime: 0.05
 *
 * @version 14.0.0
 * @author NeuroInnovate AI Team
 */

const { logger } = require('../../../config/logger');

class LearningSignals {
  constructor(db) {
    this.db = db;

    // Weighting framework (must sum to 1.0)
    this.weights = {
      menu_signal: 0.35,
      population_signal: 0.25,
      seasonality: 0.10,
      contractor_signal: 0.10,
      waste_feedback: 0.10,
      fifo_age_pressure: 0.05,
      invoice_leadtime: 0.05
    };
  }

  /**
   * Compute all learning signals and generate insights
   * @returns {Object} { insights[], composite_confidence, signal_breakdown }
   */
  async computeAllSignals() {
    const startTime = Date.now();

    try {
      // Compute individual signals in parallel
      const [
        menuSignal,
        populationSignal,
        seasonalitySignal,
        contractorSignal,
        wasteSignal,
        fifoSignal,
        invoiceSignal
      ] = await Promise.all([
        this._computeMenuSignal(),
        this._computePopulationSignal(),
        this._computeSeasonalitySignal(),
        this._computeContractorSignal(),
        this._computeWasteFeedbackSignal(),
        this._computeFIFOAgePressureSignal(),
        this._computeInvoiceLeadTimeSignal()
      ]);

      // Aggregate signals into weighted composite
      const signals = {
        menu: menuSignal,
        population: populationSignal,
        seasonality: seasonalitySignal,
        contractor: contractorSignal,
        waste: wasteSignal,
        fifo: fifoSignal,
        invoice: invoiceSignal
      };

      // Calculate weighted confidence
      const compositeConfidence = this._calculateWeightedConfidence(signals);

      // Generate insights from signals
      const insights = this._generateInsights(signals, compositeConfidence);

      // Persist insights to database
      await this._persistInsights(insights, signals, compositeConfidence);

      const duration = Date.now() - startTime;
      logger.info('LearningSignals: Computed all signals', {
        insights_count: insights.length,
        composite_confidence: compositeConfidence,
        duration_ms: duration
      });

      return {
        success: true,
        insights,
        composite_confidence: compositeConfidence,
        signal_breakdown: signals,
        duration_ms: duration
      };

    } catch (error) {
      logger.error('LearningSignals: Signal computation failed', { error: error.message });
      throw error;
    }
  }

  /**
   * Compute menu signal: 4-week menu calendar pattern analysis
   * Analyzes recipe frequency, quantity trends, and menu diversity
   * @private
   */
  async _computeMenuSignal() {
    try {
      // Get 4-week menu calendar data
      const menuData = await this.db.all(`
        SELECT
          mc.recipe_code,
          r.display_name,
          COUNT(*) as appearances_4w,
          AVG(mc.qty) as avg_qty,
          MAX(mc.qty) as max_qty,
          MIN(mc.qty) as min_qty,
          DATE(mc.plan_date) as plan_date
        FROM menu_calendar mc
        JOIN recipes r ON mc.recipe_code = r.recipe_code
        WHERE mc.plan_date >= DATE('now', '-28 days')
          AND mc.plan_date <= DATE('now')
        GROUP BY mc.recipe_code
        ORDER BY appearances_4w DESC
      `);

      if (!menuData || menuData.length === 0) {
        return { strength: 0.2, confidence: 0.3, insights: ['No menu calendar data available'] };
      }

      const insights = [];
      let totalStrength = 0;

      // Analyze menu patterns
      const totalRecipes = menuData.length;
      const highFrequencyRecipes = menuData.filter(r => r.appearances_4w >= 4).length; // Weekly+
      const mediumFrequencyRecipes = menuData.filter(r => r.appearances_4w >= 2 && r.appearances_4w < 4).length;

      if (highFrequencyRecipes > 0) {
        insights.push(`${highFrequencyRecipes} recipes appear weekly or more (strong demand pattern)`);
        totalStrength += 0.4;
      }

      if (mediumFrequencyRecipes > 0) {
        insights.push(`${mediumFrequencyRecipes} recipes appear 2-3x/month (moderate pattern)`);
        totalStrength += 0.3;
      }

      // Check for quantity consistency
      const consistentRecipes = menuData.filter(r => {
        const variation = (r.max_qty - r.min_qty) / r.avg_qty;
        return variation < 0.2; // Less than 20% variation
      }).length;

      if (consistentRecipes > totalRecipes * 0.5) {
        insights.push(`${consistentRecipes} recipes show consistent quantities (reliable forecasting)`);
        totalStrength += 0.3;
      } else {
        insights.push(`${totalRecipes - consistentRecipes} recipes show high quantity variation (adjust forecasts)`);
        totalStrength += 0.1;
      }

      // Normalize strength
      const strength = Math.min(1.0, totalStrength);
      const confidence = menuData.length >= 10 ? 0.9 : (menuData.length / 10) * 0.9;

      return {
        strength,
        confidence,
        insights,
        metadata: {
          total_recipes: totalRecipes,
          high_frequency: highFrequencyRecipes,
          medium_frequency: mediumFrequencyRecipes,
          consistent_recipes: consistentRecipes
        }
      };

    } catch (error) {
      logger.error('Menu signal computation failed:', error);
      return { strength: 0, confidence: 0, insights: ['Menu signal unavailable'], error: error.message };
    }
  }

  /**
   * Compute population signal: Site population trends and changes
   * @private
   */
  async _computePopulationSignal() {
    try {
      const popData = await this.db.all(`
        SELECT
          effective_date,
          total_population,
          indian_count
        FROM site_population
        WHERE effective_date >= DATE('now', '-7 days')
        ORDER BY effective_date DESC
        LIMIT 7
      `);

      if (!popData || popData.length === 0) {
        return { strength: 0.1, confidence: 0.2, insights: ['No population data'] };
      }

      const insights = [];
      const latest = popData[0];
      const oldest = popData[popData.length - 1];

      const popChange = latest.total_population - oldest.total_population;
      const popChangePct = (popChange / oldest.total_population) * 100;

      if (Math.abs(popChangePct) > 5) {
        insights.push(`Population ${popChange > 0 ? 'increased' : 'decreased'} by ${Math.abs(popChangePct).toFixed(1)}% (${Math.abs(popChange)} people)`);
        return { strength: 0.9, confidence: 0.95, insights };
      } else if (Math.abs(popChangePct) > 2) {
        insights.push(`Minor population shift: ${popChangePct > 0 ? '+' : ''}${popChangePct.toFixed(1)}%`);
        return { strength: 0.6, confidence: 0.85, insights };
      } else {
        insights.push(`Population stable at ${latest.total_population} (variation < 2%)`);
        return { strength: 0.3, confidence: 0.9, insights };
      }

    } catch (error) {
      logger.error('Population signal computation failed:', error);
      return { strength: 0, confidence: 0, insights: ['Population signal unavailable'] };
    }
  }

  /**
   * Compute seasonality signal: Weekday patterns and holiday detection
   * @private
   */
  async _computeSeasonalitySignal() {
    try {
      const today = new Date();
      const dayOfWeek = today.getDay(); // 0=Sunday, 6=Saturday
      const insights = [];

      // Weekend detection
      if (dayOfWeek === 0) {
        insights.push('Sunday: Jigg Dinner pattern (Week 2 & 4 only), reduced population');
        return { strength: 0.8, confidence: 0.9, insights };
      } else if (dayOfWeek === 6) {
        insights.push('Saturday: Steak Night (AAA 10oz + potatoes + butter pats)');
        return { strength: 0.9, confidence: 0.95, insights };
      }

      // Weekday pattern
      if (dayOfWeek >= 1 && dayOfWeek <= 5) {
        insights.push('Weekday: Full breakfast program, sandwich baseline ~500/day');
        return { strength: 0.5, confidence: 0.85, insights };
      }

      return { strength: 0.3, confidence: 0.7, insights: ['Standard day pattern'] };

    } catch (error) {
      logger.error('Seasonality signal computation failed:', error);
      return { strength: 0, confidence: 0, insights: ['Seasonality signal unavailable'] };
    }
  }

  /**
   * Compute contractor signal: Small coffee bag requisitions
   * @private
   */
  async _computeContractorSignal() {
    try {
      // Check for contractor requisition patterns in feedback comments
      const contractorFeedback = await this.db.all(`
        SELECT comment_text, created_at
        FROM ai_feedback_comments
        WHERE LOWER(comment_text) LIKE '%contractor%'
           OR LOWER(comment_text) LIKE '%small coffee%'
           OR LOWER(comment_text) LIKE '%split%bag%'
        AND created_at >= datetime('now', '-30 days')
        ORDER BY created_at DESC
        LIMIT 5
      `);

      if (contractorFeedback && contractorFeedback.length > 0) {
        const insights = [`${contractorFeedback.length} contractor requisitions noted in last 30d`];
        return { strength: 0.6, confidence: 0.75, insights };
      }

      return { strength: 0.2, confidence: 0.5, insights: ['No recent contractor requisitions'] };

    } catch (error) {
      logger.error('Contractor signal computation failed:', error);
      return { strength: 0, confidence: 0, insights: ['Contractor signal unavailable'] };
    }
  }

  /**
   * Compute waste feedback signal: Waste tracking and adjustments
   * @private
   */
  async _computeWasteFeedbackSignal() {
    try {
      const wasteFeedback = await this.db.all(`
        SELECT comment_text, created_at
        FROM ai_feedback_comments
        WHERE LOWER(comment_text) LIKE '%waste%'
           OR LOWER(comment_text) LIKE '%spoil%'
           OR LOWER(comment_text) LIKE '%discard%'
           OR LOWER(comment_text) LIKE '%expire%'
        AND created_at >= datetime('now', '-14 days')
        ORDER BY created_at DESC
        LIMIT 10
      `);

      if (wasteFeedback && wasteFeedback.length > 0) {
        const insights = [`${wasteFeedback.length} waste reports in last 14d - review sandwich/breakfast quantities`];
        return { strength: 0.7, confidence: 0.8, insights };
      }

      return { strength: 0.3, confidence: 0.6, insights: ['No recent waste reports'] };

    } catch (error) {
      logger.error('Waste signal computation failed:', error);
      return { strength: 0, confidence: 0, insights: ['Waste signal unavailable'] };
    }
  }

  /**
   * Compute FIFO age pressure signal: Inventory aging and expiration risk
   * @private
   */
  async _computeFIFOAgePressureSignal() {
    try {
      const agingLayers = await this.db.all(`
        SELECT
          item_code,
          received_at,
          remaining_qty,
          unit_cost_cents,
          JULIANDAY('now') - JULIANDAY(received_at) as age_days
        FROM fifo_cost_layers
        WHERE remaining_qty > 0
          AND JULIANDAY('now') - JULIANDAY(received_at) > 7
        ORDER BY age_days DESC
        LIMIT 20
      `);

      if (!agingLayers || agingLayers.length === 0) {
        return { strength: 0.2, confidence: 0.5, insights: ['No FIFO aging pressure detected'] };
      }

      const criticalAging = agingLayers.filter(l => l.age_days > 14).length;
      const insights = [];

      if (criticalAging > 5) {
        insights.push(`${criticalAging} items aging >14 days - prioritize consumption`);
        return { strength: 0.8, confidence: 0.85, insights };
      } else if (criticalAging > 0) {
        insights.push(`${criticalAging} items aging >14 days - minor concern`);
        return { strength: 0.5, confidence: 0.75, insights };
      } else {
        insights.push(`${agingLayers.length} items aging 7-14 days - normal rotation`);
        return { strength: 0.3, confidence: 0.7, insights };
      }

    } catch (error) {
      logger.error('FIFO age signal computation failed:', error);
      return { strength: 0, confidence: 0, insights: ['FIFO signal unavailable'] };
    }
  }

  /**
   * Compute invoice lead-time signal: Delivery patterns and vendor reliability
   * @private
   */
  async _computeInvoiceLeadTimeSignal() {
    try {
      const recentInvoices = await this.db.all(`
        SELECT
          invoice_date,
          vendor,
          created_at,
          JULIANDAY(created_at) - JULIANDAY(invoice_date) as processing_lag_days
        FROM documents
        WHERE invoice_date IS NOT NULL
          AND created_at >= datetime('now', '-30 days')
          AND vendor IS NOT NULL
        ORDER BY invoice_date DESC
        LIMIT 30
      `);

      if (!recentInvoices || recentInvoices.length === 0) {
        return { strength: 0.2, confidence: 0.4, insights: ['No invoice lead-time data'] };
      }

      // Calculate average processing lag by vendor
      const vendorLags = {};
      recentInvoices.forEach(inv => {
        if (!vendorLags[inv.vendor]) {
          vendorLags[inv.vendor] = [];
        }
        vendorLags[inv.vendor].push(inv.processing_lag_days);
      });

      const insights = [];
      let maxLag = 0;

      Object.entries(vendorLags).forEach(([vendor, lags]) => {
        const avgLag = lags.reduce((sum, l) => sum + l, 0) / lags.length;
        if (avgLag > maxLag) maxLag = avgLag;
      });

      if (maxLag > 10) {
        insights.push(`Invoice processing lag up to ${maxLag.toFixed(1)} days - review GFS delivery schedule`);
        return { strength: 0.6, confidence: 0.7, insights };
      } else {
        insights.push(`Invoice processing within ${maxLag.toFixed(1)} days - acceptable lead time`);
        return { strength: 0.3, confidence: 0.75, insights };
      }

    } catch (error) {
      logger.error('Invoice lead-time signal computation failed:', error);
      return { strength: 0, confidence: 0, insights: ['Invoice signal unavailable'] };
    }
  }

  /**
   * Calculate weighted composite confidence from all signals
   * @private
   */
  _calculateWeightedConfidence(signals) {
    let weightedSum = 0;

    weightedSum += signals.menu.confidence * this.weights.menu_signal;
    weightedSum += signals.population.confidence * this.weights.population_signal;
    weightedSum += signals.seasonality.confidence * this.weights.seasonality;
    weightedSum += signals.contractor.confidence * this.weights.contractor_signal;
    weightedSum += signals.waste.confidence * this.weights.waste_feedback;
    weightedSum += signals.fifo.confidence * this.weights.fifo_age_pressure;
    weightedSum += signals.invoice.confidence * this.weights.invoice_leadtime;

    return Math.round(weightedSum * 100) / 100; // Round to 2 decimals
  }

  /**
   * Generate actionable insights from signal analysis
   * @private
   */
  _generateInsights(signals, compositeConfidence) {
    const insights = [];

    // Collect all signal insights
    Object.entries(signals).forEach(([signalName, signalData]) => {
      if (signalData.insights && signalData.insights.length > 0) {
        signalData.insights.forEach(insight => {
          insights.push({
            insight_type: `signal_${signalName}`,
            title: `${signalName.toUpperCase()} Signal`,
            description: insight,
            confidence: signalData.confidence,
            source_tag: 'autonomy_2025_v14',
            detected_at: new Date().toISOString(),
            applied_at: null,
            impact_score: signalData.strength
          });
        });
      }
    });

    // Add composite insight
    insights.push({
      insight_type: 'weighted_composite',
      title: 'Multi-Signal Learning Composite',
      description: `Analyzed ${Object.keys(signals).length} learning signals with ${compositeConfidence} composite confidence`,
      confidence: compositeConfidence,
      source_tag: 'autonomy_2025_v14',
      detected_at: new Date().toISOString(),
      applied_at: null,
      impact_score: compositeConfidence
    });

    return insights;
  }

  /**
   * Persist insights to ai_learning_insights table
   * @private
   */
  async _persistInsights(insights, signals, compositeConfidence) {
    try {
      for (const insight of insights) {
        await this.db.run(`
          INSERT INTO ai_learning_insights (
            insight_type,
            title,
            description,
            confidence,
            source_tag,
            detected_at,
            applied_at,
            impact_score,
            created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
        `, [
          insight.insight_type,
          insight.title,
          insight.description,
          insight.confidence,
          insight.source_tag,
          insight.detected_at,
          insight.applied_at,
          insight.impact_score
        ]);
      }

      logger.info('LearningSignals: Persisted insights', { count: insights.length });
    } catch (error) {
      logger.error('Failed to persist insights:', error);
      throw error;
    }
  }
}

module.exports = LearningSignals;
