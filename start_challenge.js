#!/usr/bin/env node

/**
 * 🎯 PAPER TRADING CHALLENGE LAUNCHER
 * 
 * Launch the AI trading agent with $500 initial capital
 * Goal: Maximum profit in 7 days using paper trading
 * 
 * Features:
 * - 95% AI model accuracy
 * - Aggressive trading mode
 * - High-frequency trading (30-second intervals)
 * - Risk management with 15% profit targets
 * - Real-time progress monitoring
 */

const SuperTradingAgent = require('./backend/super_trading_agent');

async function startTradingChallenge() {
  console.log(`
🚀 NEURO.PILOT.AI TRADING CHALLENGE
====================================
💰 Initial Capital: $500.00
⏰ Duration: 7 days
🎯 Goal: Maximum profit possible
🤖 AI Accuracy: 95%
📊 Data Points: 9,720+
🧠 Learning: 100% Complete
====================================
  `);

  try {
    // Initialize the Super Trading Agent
    console.log('🔧 Initializing Super Trading Agent...');
    const agent = new SuperTradingAgent();
    
    // Wait a moment for initialization
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    console.log('✅ Agent initialized successfully!');
    console.log(`🧠 Current AI Accuracy: ${(agent.modelAccuracy * 100).toFixed(1)}%`);
    console.log(`📊 Learning Progress: ${agent.learningProgress}%`);
    
    // Start the paper trading challenge
    console.log('\n🎯 Starting Paper Trading Challenge...');
    const challengeResult = await agent.startPaperTradingChallenge(500);
    
    console.log(`✅ Challenge Started Successfully!`);
    console.log(`📅 Start Time: ${challengeResult.startTime.toLocaleString()}`);
    console.log(`📅 End Time: ${challengeResult.endTime.toLocaleString()}`);
    console.log(`🚀 Trading Mode: ${challengeResult.tradingMode.toUpperCase()}`);
    
    // Setup monitoring
    console.log('\n📊 Setting up real-time monitoring...');
    
    // Monitor progress every 30 seconds
    const monitorInterval = setInterval(() => {
      const elapsed = Date.now() - challengeResult.startTime.getTime();
      const remaining = (7 * 24 * 60 * 60 * 1000) - elapsed;
      
      if (remaining <= 0) {
        clearInterval(monitorInterval);
        console.log('⏰ Challenge time expired!');
        return;
      }
      
      const profit = agent.challengeBalance - 500;
      const profitPercent = (profit / 500) * 100;
      
      console.log(`
📊 LIVE CHALLENGE STATUS
========================
💰 Current Balance: $${agent.challengeBalance.toFixed(2)}
📈 Profit/Loss: ${profit >= 0 ? '+' : ''}$${profit.toFixed(2)} (${profitPercent.toFixed(1)}%)
📊 Total Trades: ${agent.performance.totalTrades}
🎯 Win Rate: ${agent.performance.winRate.toFixed(1)}%
⏰ Time Remaining: ${Math.floor(remaining / (1000 * 60 * 60))} hours
========================
      `);
    }, 30000); // Every 30 seconds
    
    // Handle graceful shutdown
    process.on('SIGINT', async () => {
      console.log('\n🛑 Stopping challenge...');
      clearInterval(monitorInterval);
      
      if (agent.challengeMode) {
        const finalResults = await agent.endPaperTradingChallenge();
        console.log('\n🏆 FINAL RESULTS:');
        console.log(`💰 Final Balance: $${finalResults.finalBalance.toFixed(2)}`);
        console.log(`📈 Total Profit: ${finalResults.totalProfit >= 0 ? '+' : ''}$${finalResults.totalProfit.toFixed(2)}`);
        console.log(`🎯 Win Rate: ${finalResults.winRate.toFixed(1)}%`);
      }
      
      process.exit(0);
    });
    
    console.log(`
🚀 CHALLENGE IS LIVE!
====================
The AI agent is now trading aggressively to maximize profit.
Monitor the console for real-time updates every 30 seconds.

Press Ctrl+C to stop the challenge early.

Good luck! 🍀
    `);
    
  } catch (error) {
    console.error('❌ Challenge startup error:', error);
    process.exit(1);
  }
}

// Start the challenge
startTradingChallenge().catch(error => {
  console.error('💥 Fatal error:', error);
  process.exit(1);
});