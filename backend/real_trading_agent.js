const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));

class RealTradingAgent {
  constructor() {
    this.positions = [];
    this.balance = 100000;
    this.signals = [];
  }

  async getMarketData(symbol) {
    try {
      const response = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${symbol}`);
      const data = await response.json();
      return data.chart.result[0];
    } catch (error) {
      console.error('Market data error:', error);
      return null;
    }
  }

  async generateSignal(symbol) {
    const data = await this.getMarketData(symbol);
    if (!data) return null;

    const price = data.meta.regularMarketPrice;
    const previousClose = data.meta.previousClose;
    const change = ((price - previousClose) / previousClose) * 100;

    // Simple momentum strategy
    let signal = 'hold';
    let confidence = 50;

    if (change > 2) {
      signal = 'buy';
      confidence = 75;
    } else if (change < -2) {
      signal = 'sell';
      confidence = 75;
    }

    return {
      symbol,
      signal,
      confidence,
      price,
      timestamp: new Date(),
      reasoning: `${change.toFixed(2)}% change from previous close`
    };
  }

  async startTrading() {
    const symbols = ['AAPL', 'TSLA', 'NVDA', 'MSFT'];
    
    for (const symbol of symbols) {
      const signal = await this.generateSignal(symbol);
      if (signal) {
        this.signals.push(signal);
        console.log(`📈 Signal: ${signal.signal.toUpperCase()} ${symbol} at ${signal.price}`);
      }
    }
  }
}

module.exports = RealTradingAgent;