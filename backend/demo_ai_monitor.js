const AIMonitor = require('./ai_monitor_autofix');

console.log('🤖 AI MONITOR DEMONSTRATION');
console.log('='.repeat(80));

class DemoAIMonitor extends AIMonitor {
  constructor() {
    super();
    this.maxFixAttempts = 3; // Just 3 cycles for demo
  }

  async runDemo() {
    console.log('🚀 Running AI Monitor Demo (3 cycles)...\n');

    for (let cycle = 1; cycle <= 3; cycle++) {
      console.log(`\n🔄 CYCLE ${cycle}/3`);
      console.log('-'.repeat(40));

      await this.performAnalysisAndFix();

      if (cycle < 3) {
        console.log('\n⏳ Waiting 5 seconds before next cycle...');
        await this.sleep(5000);
      }
    }

    this.generateMonitoringReport();
    console.log('\n✅ Demo completed!');
  }
}

// Run demo
const demo = new DemoAIMonitor();
demo.runDemo().catch(console.error);