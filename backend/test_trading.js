const RealTradingAgent = require('./real_trading_agent');

async function testTrading() {
  console.log('🧠 Testing Real Trading Agent...\n');
  
  const agent = new RealTradingAgent();
  
  try {
    await agent.startTrading();
    console.log('\n📊 Generated Signals:');
    console.log(JSON.stringify(agent.signals, null, 2));
  } catch (error) {
    console.error('❌ Error:', error);
  }
}

testTrading();