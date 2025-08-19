const AutonomousTradingSystem = require("./autonomous_trading_system");
const WeeklyTradingTracker = require("./weekly_trading_tracker");

class WeeklyTradingChallenge {
  constructor() {
    this.tradingSystem = new AutonomousTradingSystem();
    this.weeklyTracker = new WeeklyTradingTracker();
    this.dailyReportInterval = null;
    this.reportGenerationInterval = null;
  }

  async start() {
    console.log("🚀 Starting Weekly Trading Challenge!");
    console.log("💰 Starting with $500 paper money");
    console.log("🎯 Goal: See what the AI can generate in 7 days");
    console.log("🤖 Fully autonomous - no human intervention required");
    console.log("📊 Daily progress tracking with milestones\n");

    // Initialize weekly tracking
    await this.weeklyTracker.initializeWeeklyTracking();

    // Listen for trades to update tracking
    this.tradingSystem.on("trade", async (trade) => {
      console.log(
        `💱 Trade executed: ${trade.action} ${trade.quantity} ${trade.symbol} @ $${trade.price.toFixed(2)}`,
      );
      if (trade.pnl !== 0) {
        console.log(
          `📈 P&L: ${trade.pnl >= 0 ? "+" : ""}$${trade.pnl.toFixed(2)}`,
        );
      }
    });

    // Start the autonomous trading system
    await this.tradingSystem.start();

    // Generate initial report
    await this.generateWeeklyReport();

    // Schedule daily reports at 9 AM
    this.scheduleDailyReports();

    // Generate HTML report every 5 minutes
    this.reportGenerationInterval = setInterval(
      async () => {
        await this.generateWeeklyReport();
      },
      5 * 60 * 1000,
    );

    console.log(
      "🎯 Weekly challenge started! Reports will be generated regularly.",
    );
    console.log(
      "📊 View progress at: /Users/davidmikulis/neuro-pilot-ai/backend/public/weekly_report.html",
    );
  }

  async generateWeeklyReport() {
    try {
      const currentState = await this.tradingSystem.getCurrentState();
      await this.weeklyTracker.recordDailySnapshot(currentState);

      const reportPath = await this.weeklyTracker.generateHTMLReport();
      console.log(`📊 Weekly report updated: ${reportPath}`);

      // Display console report every hour
      const now = new Date();
      if (now.getMinutes() === 0) {
        this.weeklyTracker.displayWeeklyReport();
      }
    } catch (error) {
      console.error("Error generating weekly report:", error);
    }
  }

  scheduleDailyReports() {
    // Check every minute if it's time for daily report
    this.dailyReportInterval = setInterval(() => {
      const now = new Date();

      // Generate daily report at 9 AM
      if (now.getHours() === 9 && now.getMinutes() === 0) {
        this.generateDailyReport();
      }
    }, 60000);
  }

  async generateDailyReport() {
    console.log("\n🌅 DAILY TRADING REPORT");
    console.log("=".repeat(50));

    const currentState = await this.tradingSystem.getCurrentState();
    await this.weeklyTracker.recordDailySnapshot(currentState);

    this.weeklyTracker.displayWeeklyReport();

    // Generate updated HTML report
    await this.weeklyTracker.generateHTMLReport();
  }

  stop() {
    console.log("\n🛑 Stopping Weekly Trading Challenge...");

    this.tradingSystem.stop();

    if (this.dailyReportInterval) {
      clearInterval(this.dailyReportInterval);
    }

    if (this.reportGenerationInterval) {
      clearInterval(this.reportGenerationInterval);
    }

    // Generate final report
    this.generateFinalReport();
  }

  async generateFinalReport() {
    console.log("\n🏁 FINAL WEEKLY REPORT");
    console.log("=".repeat(60));

    const currentState = await this.tradingSystem.getCurrentState();
    await this.weeklyTracker.recordDailySnapshot(currentState);

    this.weeklyTracker.displayWeeklyReport();

    const finalReport = this.weeklyTracker.generateWeeklyReport();

    console.log("\n🎯 CHALLENGE SUMMARY:");
    console.log(
      `   Starting Balance: $${finalReport.performance.startingBalance}`,
    );
    console.log(
      `   Final Balance: $${finalReport.performance.currentBalance.toFixed(2)}`,
    );
    console.log(
      `   Total Return: ${finalReport.performance.totalReturn >= 0 ? "+" : ""}${finalReport.performance.totalReturn.toFixed(2)}%`,
    );
    console.log(
      `   Milestones Achieved: ${finalReport.milestones.achieved}/${finalReport.milestones.total}`,
    );

    if (finalReport.performance.currentBalance > 500) {
      console.log("\n🎉 CHALLENGE SUCCESSFUL! The AI made money!");
    } else {
      console.log("\n📉 Challenge ended with loss - AI learning opportunity");
    }

    console.log(
      "\n📊 Full report available at: /Users/davidmikulis/neuro-pilot-ai/backend/public/weekly_report.html",
    );
  }
}

// Start the challenge
const challenge = new WeeklyTradingChallenge();

challenge.start().catch(console.error);

// Handle graceful shutdown
process.on("SIGINT", () => {
  console.log("\n\n💤 Shutting down weekly challenge...");
  challenge.stop();
  process.exit(0);
});

// Keep process alive
process.stdin.resume();
