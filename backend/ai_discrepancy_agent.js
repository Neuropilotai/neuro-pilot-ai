const fs = require('fs');
const path = require('path');

console.log('🤖 AI DISCREPANCY DETECTION AGENT');
console.log('='.repeat(80));

class AIDiscrepancyAgent {
  constructor() {
    this.dataDir = './data';
    this.alertThreshold = 5; // Alert if discrepancy > 5%
    this.criticalThreshold = 15; // Critical alert if discrepancy > 15%
    this.monitoringActive = true;
    this.lastCheck = null;
    this.alertHistory = [];
  }

  async startMonitoring() {
    console.log('🚀 Starting AI discrepancy monitoring...');
    console.log(`⚠️ Alert threshold: ${this.alertThreshold}%`);
    console.log(`🚨 Critical threshold: ${this.criticalThreshold}%`);

    // Run initial check
    await this.performDiscrepancyAnalysis();

    // Set up periodic monitoring every 5 minutes
    setInterval(async () => {
      if (this.monitoringActive) {
        await this.performDiscrepancyAnalysis();
      }
    }, 300000); // 5 minutes
  }

  async performDiscrepancyAnalysis() {
    try {
      console.log(`\n🔍 AI Analysis at ${new Date().toISOString()}`);

      // Load financial audit data
      const FinancialAuditor = require('./financial_audit_analysis');
      const auditor = new FinancialAuditor();
      const auditResults = await auditor.performAudit();

      // Calculate discrepancy
      const ordersTotal = auditResults.ordersTotal;
      const inventoryTotal = auditResults.inventoryTotal;
      const discrepancy = Math.abs(ordersTotal - inventoryTotal);
      const discrepancyPercent = (discrepancy / ordersTotal) * 100;

      console.log(`📊 Orders: $${ordersTotal.toFixed(2)}`);
      console.log(`📦 Inventory: $${inventoryTotal.toFixed(2)}`);
      console.log(`💥 Discrepancy: $${discrepancy.toFixed(2)} (${discrepancyPercent.toFixed(1)}%)`);

      // AI-powered discrepancy analysis
      const analysis = this.analyzeDiscrepancy(discrepancyPercent, auditResults);

      if (analysis.alertLevel !== 'normal') {
        this.generateAlert(analysis, {
          ordersTotal,
          inventoryTotal,
          discrepancy,
          discrepancyPercent
        });
      }

      this.lastCheck = new Date().toISOString();

      // Save monitoring report
      this.saveMonitoringReport(analysis, {
        ordersTotal,
        inventoryTotal,
        discrepancy,
        discrepancyPercent,
        timestamp: this.lastCheck
      });

    } catch (error) {
      console.error('❌ AI Analysis failed:', error.message);
    }
  }

  analyzeDiscrepancy(discrepancyPercent, auditResults) {
    const analysis = {
      alertLevel: 'normal',
      severity: 'low',
      issues: [],
      recommendations: [],
      aiInsights: []
    };

    // Determine alert level
    if (discrepancyPercent > this.criticalThreshold) {
      analysis.alertLevel = 'critical';
      analysis.severity = 'high';
    } else if (discrepancyPercent > this.alertThreshold) {
      analysis.alertLevel = 'warning';
      analysis.severity = 'medium';
    }

    // AI-powered issue detection
    this.detectInventoryIssues(analysis, auditResults);
    this.detectPatterns(analysis, discrepancyPercent);
    this.generateRecommendations(analysis, discrepancyPercent);

    return analysis;
  }

  detectInventoryIssues(analysis, auditResults) {
    // Check for missing items
    if (auditResults.missingSalesFromInventory && auditResults.missingSalesFromInventory.length > 0) {
      analysis.issues.push({
        type: 'missing_inventory_items',
        count: auditResults.missingSalesFromInventory.length,
        description: `${auditResults.missingSalesFromInventory.length} items sold but not found in inventory`
      });
    }

    // Check for orphaned inventory
    if (auditResults.extraInventoryNotInOrders && auditResults.extraInventoryNotInOrders.length > 0) {
      analysis.issues.push({
        type: 'orphaned_inventory',
        count: auditResults.extraInventoryNotInOrders.length,
        description: `${auditResults.extraInventoryNotInOrders.length} inventory items with no sales history`
      });
    }

    // Check for credit memo issues
    if (auditResults.creditMemoAdjustments > 1000) {
      analysis.issues.push({
        type: 'high_credit_adjustments',
        amount: auditResults.creditMemoAdjustments,
        description: `High credit memo adjustments: $${auditResults.creditMemoAdjustments.toFixed(2)}`
      });
    }
  }

  detectPatterns(analysis, discrepancyPercent) {
    // AI pattern detection
    analysis.aiInsights.push({
      type: 'trend_analysis',
      insight: this.getTrendInsight(discrepancyPercent)
    });

    analysis.aiInsights.push({
      type: 'accuracy_assessment',
      insight: this.getAccuracyInsight(discrepancyPercent)
    });

    // Check for recurring patterns
    if (this.alertHistory.length > 3) {
      const recentAlerts = this.alertHistory.slice(-3);
      const avgDiscrepancy = recentAlerts.reduce((sum, alert) => sum + alert.discrepancyPercent, 0) / 3;

      if (avgDiscrepancy > 10) {
        analysis.aiInsights.push({
          type: 'pattern_detection',
          insight: `Persistent discrepancy pattern detected: ${avgDiscrepancy.toFixed(1)}% average over last 3 checks`
        });
      }
    }
  }

  getTrendInsight(discrepancyPercent) {
    if (discrepancyPercent > 30) {
      return '🚨 Critical: Major financial discrepancy indicates serious inventory management issues';
    } else if (discrepancyPercent > 15) {
      return '⚠️ High: Significant discrepancy suggests inventory tracking problems';
    } else if (discrepancyPercent > 5) {
      return '📊 Medium: Moderate discrepancy may indicate data synchronization issues';
    } else {
      return '✅ Low: Minor discrepancy within acceptable range';
    }
  }

  getAccuracyInsight(discrepancyPercent) {
    const accuracy = 100 - discrepancyPercent;

    if (accuracy > 95) {
      return '🎯 Excellent: System accuracy is very high';
    } else if (accuracy > 85) {
      return '👍 Good: System accuracy is acceptable but could be improved';
    } else if (accuracy > 70) {
      return '⚠️ Poor: System accuracy needs improvement';
    } else {
      return '🚨 Critical: System accuracy is unacceptable and requires immediate attention';
    }
  }

  generateRecommendations(analysis, discrepancyPercent) {
    if (discrepancyPercent > 15) {
      analysis.recommendations.push('🔍 Perform immediate physical inventory count');
      analysis.recommendations.push('📋 Review and reconcile all recent transactions');
      analysis.recommendations.push('🔧 Check FIFO processing for data corruption');
    } else if (discrepancyPercent > 5) {
      analysis.recommendations.push('📊 Review inventory valuation methods');
      analysis.recommendations.push('🔄 Synchronize order and inventory data');
      analysis.recommendations.push('📈 Implement regular reconciliation processes');
    }

    // Always recommend these for any discrepancy
    if (discrepancyPercent > 1) {
      analysis.recommendations.push('🤖 Enable continuous AI monitoring');
      analysis.recommendations.push('📱 Set up real-time discrepancy alerts');
    }
  }

  generateAlert(analysis, metrics) {
    const alert = {
      timestamp: new Date().toISOString(),
      alertLevel: analysis.alertLevel,
      severity: analysis.severity,
      discrepancyPercent: metrics.discrepancyPercent,
      discrepancyAmount: metrics.discrepancy,
      ordersTotal: metrics.ordersTotal,
      inventoryTotal: metrics.inventoryTotal,
      issues: analysis.issues,
      recommendations: analysis.recommendations,
      aiInsights: analysis.aiInsights
    };

    // Add to alert history
    this.alertHistory.push(alert);

    // Keep only last 10 alerts
    if (this.alertHistory.length > 10) {
      this.alertHistory = this.alertHistory.slice(-10);
    }

    // Display alert
    this.displayAlert(alert);

    // Save alert to file
    this.saveAlert(alert);

    return alert;
  }

  displayAlert(alert) {
    const icon = alert.alertLevel === 'critical' ? '🚨' : '⚠️';
    const level = alert.alertLevel.toUpperCase();

    console.log(`\n${icon} ${level} DISCREPANCY ALERT ${icon}`);
    console.log('='.repeat(60));
    console.log(`🕐 Time: ${alert.timestamp}`);
    console.log(`💥 Discrepancy: $${alert.discrepancyAmount.toFixed(2)} (${alert.discrepancyPercent.toFixed(1)}%)`);
    console.log(`📊 Orders: $${alert.ordersTotal.toFixed(2)}`);
    console.log(`📦 Inventory: $${alert.inventoryTotal.toFixed(2)}`);

    if (alert.issues.length > 0) {
      console.log('\n🔍 DETECTED ISSUES:');
      alert.issues.forEach(issue => {
        console.log(`  • ${issue.description}`);
      });
    }

    if (alert.aiInsights.length > 0) {
      console.log('\n🤖 AI INSIGHTS:');
      alert.aiInsights.forEach(insight => {
        console.log(`  • ${insight.insight}`);
      });
    }

    if (alert.recommendations.length > 0) {
      console.log('\n💡 RECOMMENDATIONS:');
      alert.recommendations.forEach(rec => {
        console.log(`  • ${rec}`);
      });
    }

    console.log('='.repeat(60));
  }

  saveAlert(alert) {
    try {
      const alertsFile = path.join(this.dataDir, 'ai_discrepancy_alerts.json');
      let alerts = [];

      if (fs.existsSync(alertsFile)) {
        alerts = JSON.parse(fs.readFileSync(alertsFile, 'utf8'));
      }

      alerts.push(alert);

      // Keep only last 50 alerts
      if (alerts.length > 50) {
        alerts = alerts.slice(-50);
      }

      fs.writeFileSync(alertsFile, JSON.stringify(alerts, null, 2));
      console.log(`💾 Alert saved to ai_discrepancy_alerts.json`);

    } catch (error) {
      console.error('❌ Failed to save alert:', error.message);
    }
  }

  saveMonitoringReport(analysis, metrics) {
    try {
      const report = {
        timestamp: metrics.timestamp,
        systemHealth: {
          ordersTotal: metrics.ordersTotal,
          inventoryTotal: metrics.inventoryTotal,
          discrepancy: metrics.discrepancy,
          discrepancyPercent: metrics.discrepancyPercent,
          accuracy: 100 - metrics.discrepancyPercent
        },
        aiAnalysis: analysis,
        alertHistory: this.alertHistory.length,
        monitoringStatus: 'active'
      };

      const reportFile = path.join(this.dataDir, 'ai_monitoring_report.json');
      fs.writeFileSync(reportFile, JSON.stringify(report, null, 2));

    } catch (error) {
      console.error('❌ Failed to save monitoring report:', error.message);
    }
  }

  getStatus() {
    return {
      monitoringActive: this.monitoringActive,
      lastCheck: this.lastCheck,
      alertCount: this.alertHistory.length,
      alertThreshold: this.alertThreshold,
      criticalThreshold: this.criticalThreshold
    };
  }

  stopMonitoring() {
    this.monitoringActive = false;
    console.log('⏹️ AI monitoring stopped');
  }

  setThresholds(alert, critical) {
    this.alertThreshold = alert;
    this.criticalThreshold = critical;
    console.log(`🔧 Thresholds updated: Alert ${alert}%, Critical ${critical}%`);
  }
}

// Export for use in other modules
module.exports = AIDiscrepancyAgent;

// Run standalone monitoring if called directly
if (require.main === module) {
  const agent = new AIDiscrepancyAgent();
  agent.startMonitoring().catch(console.error);

  // Graceful shutdown
  process.on('SIGINT', () => {
    console.log('\n🛑 Shutting down AI monitoring...');
    agent.stopMonitoring();
    process.exit(0);
  });
}