const EventEmitter = require("events");
const fetch = require("node-fetch");

class EnhancedTradingAgent extends EventEmitter {
  constructor() {
    super();
    this.status = "initializing";
    this.paperBalance = 100000; // Starting with $100K
    this.signals = [];
    this.positions = new Map();
    this.trades = [];
    this.learningData = [];

    // Learning parameters
    this.isLearning = true;
    this.learningProgress = 0;
    this.modelAccuracy = 0.65;
    this.signalConfidence = 0.7;

    // Performance tracking
    this.performance = {
      totalTrades: 0,
      winningTrades: 0,
      losingTrades: 0,
      totalPnL: 0,
      winRate: 0,
      avgTradeReturn: 0,
      sharpeRatio: 0,
      maxDrawdown: 0,
    };

    // Market symbols to monitor
    this.symbols = ["AAPL", "TSLA", "NVDA", "MSFT", "GOOGL", "AMZN", "META"];

    // Technical indicators cache
    this.marketData = new Map();
    this.predictions = new Map();

    this.init();
  }

  async init() {
    try {
      this.status = "online";
      this.startLearningLoop();
      this.startTradingLoop();
      this.startPerformanceTracking();

      console.log("🤖 Enhanced Trading Agent initialized with active learning");
      console.log(`📊 Monitoring ${this.symbols.length} symbols`);
      console.log(
        `💰 Paper trading balance: $${this.paperBalance.toLocaleString()}`,
      );
    } catch (error) {
      console.error("Enhanced Trading Agent initialization error:", error);
      this.status = "error";
    }
  }

  startLearningLoop() {
    // Update learning progress and retrain models
    setInterval(async () => {
      if (this.isLearning) {
        await this.performLearningCycle();
      }
    }, 60000); // Every minute

    // Major model retraining every hour
    setInterval(async () => {
      await this.retrainModels();
    }, 3600000); // Every hour
  }

  async performLearningCycle() {
    try {
      // Collect market data for all symbols
      for (const symbol of this.symbols) {
        const marketData = await this.fetchMarketData(symbol);
        if (marketData) {
          this.marketData.set(symbol, marketData);
          await this.analyzeAndLearn(symbol, marketData);
        }
      }

      // Update learning progress
      this.learningProgress += 0.1;
      if (this.learningProgress > 100) this.learningProgress = 100;

      // Improve model accuracy based on recent performance
      this.updateModelAccuracy();

      console.log(
        `📚 Learning cycle completed. Progress: ${this.learningProgress.toFixed(1)}%`,
      );
    } catch (error) {
      console.error("Learning cycle error:", error);
    }
  }

  async fetchMarketData(symbol) {
    try {
      // Using Yahoo Finance API through yfinance proxy
      const response = await fetch(
        `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=5m&range=1d`,
      );
      const data = await response.json();

      if (data.chart && data.chart.result && data.chart.result[0]) {
        const result = data.chart.result[0];
        const meta = result.meta;
        const quote = result.indicators.quote[0];

        return {
          symbol,
          timestamp: new Date(),
          price: meta.regularMarketPrice || meta.previousClose,
          open: quote.open[quote.open.length - 1],
          high: quote.high[quote.high.length - 1],
          low: quote.low[quote.low.length - 1],
          close: quote.close[quote.close.length - 1],
          volume: quote.volume[quote.volume.length - 1],
          change:
            ((meta.regularMarketPrice - meta.previousClose) /
              meta.previousClose) *
            100,
        };
      }
    } catch (error) {
      console.error(`Error fetching data for ${symbol}:`, error.message);
      return null;
    }
  }

  async analyzeAndLearn(symbol, marketData) {
    try {
      // Calculate technical indicators
      const indicators = this.calculateTechnicalIndicators(marketData);

      // Generate prediction
      const prediction = this.generatePrediction(
        symbol,
        marketData,
        indicators,
      );
      this.predictions.set(symbol, prediction);

      // Store learning data
      this.learningData.push({
        symbol,
        timestamp: marketData.timestamp,
        price: marketData.price,
        indicators,
        prediction,
        confidence: this.signalConfidence,
      });

      // Keep only last 1000 learning entries
      if (this.learningData.length > 1000) {
        this.learningData = this.learningData.slice(-1000);
      }

      // Check if we should execute a trade
      if (prediction.confidence > 0.75) {
        await this.executePaperTrade(symbol, prediction, marketData);
      }
    } catch (error) {
      console.error(`Analysis error for ${symbol}:`, error);
    }
  }

  calculateTechnicalIndicators(marketData) {
    // Simulate advanced technical analysis
    const price = marketData.price;
    const change = marketData.change;

    return {
      rsi: 30 + Math.abs(change) * 10 + Math.random() * 20, // RSI simulation
      macd: change > 0 ? Math.random() * 0.5 : Math.random() * -0.5,
      bollingerBands: {
        upper: price * 1.02,
        middle: price,
        lower: price * 0.98,
      },
      movingAverages: {
        sma20: price * (0.98 + Math.random() * 0.04),
        sma50: price * (0.95 + Math.random() * 0.1),
        ema12: price * (0.99 + Math.random() * 0.02),
      },
      volume: marketData.volume,
      volatility: Math.abs(change) / 100,
      momentum: change > 0 ? 1 : -1,
    };
  }

  generatePrediction(symbol, marketData, indicators) {
    // Advanced ML-style prediction algorithm
    let score = 0;
    let confidence = 0.5;

    // RSI analysis
    if (indicators.rsi < 30) score += 0.3; // Oversold - bullish
    if (indicators.rsi > 70) score -= 0.3; // Overbought - bearish

    // MACD analysis
    score += indicators.macd * 0.5;

    // Moving average analysis
    if (marketData.price > indicators.movingAverages.sma20) score += 0.2;
    if (marketData.price > indicators.movingAverages.sma50) score += 0.1;

    // Volume analysis
    if (indicators.volume > 1000000) confidence += 0.1;

    // Volatility adjustment
    if (indicators.volatility > 0.02) confidence -= 0.1;

    // Model accuracy influence
    confidence *= this.modelAccuracy;

    // Determine signal
    let signal = "HOLD";
    if (score > 0.3 && confidence > 0.6) signal = "BUY";
    if (score < -0.3 && confidence > 0.6) signal = "SELL";

    return {
      signal,
      confidence: Math.min(Math.max(confidence, 0.1), 0.95),
      score,
      targetPrice: marketData.price * (1 + score * 0.05),
      stopLoss: marketData.price * (1 - Math.abs(score) * 0.03),
      timeHorizon: "1H",
      reasoning: this.generateReasoning(signal, indicators, score),
    };
  }

  generateReasoning(signal, indicators, score) {
    const reasons = [];

    if (signal === "BUY") {
      if (indicators.rsi < 35)
        reasons.push("RSI indicates oversold conditions");
      if (indicators.macd > 0) reasons.push("MACD showing bullish momentum");
      if (score > 0.4) reasons.push("Strong technical confluence");
    } else if (signal === "SELL") {
      if (indicators.rsi > 65)
        reasons.push("RSI indicates overbought conditions");
      if (indicators.macd < 0) reasons.push("MACD showing bearish momentum");
      if (score < -0.4) reasons.push("Strong bearish technical signals");
    } else {
      reasons.push("Mixed signals, staying neutral");
    }

    return reasons.join(", ");
  }

  async executePaperTrade(symbol, prediction, marketData) {
    if (prediction.signal === "HOLD") return;

    const tradeSize = Math.floor(this.paperBalance * 0.02); // 2% of balance per trade
    const shares = Math.floor(tradeSize / marketData.price);

    if (shares < 1) return;

    const trade = {
      id: Date.now(),
      symbol,
      type: prediction.signal,
      shares,
      entryPrice: marketData.price,
      targetPrice: prediction.targetPrice,
      stopLoss: prediction.stopLoss,
      timestamp: new Date(),
      confidence: prediction.confidence,
      reasoning: prediction.reasoning,
      status: "open",
    };

    this.trades.push(trade);
    this.positions.set(symbol, trade);

    // Update balance
    const cost = shares * marketData.price;
    if (prediction.signal === "BUY") {
      this.paperBalance -= cost;
    }

    console.log(
      `📈 ${prediction.signal} ${shares} shares of ${symbol} at $${marketData.price} (Confidence: ${(prediction.confidence * 100).toFixed(1)}%)`,
    );

    // Schedule trade exit check
    setTimeout(() => this.checkTradeExit(trade.id), 300000); // Check after 5 minutes
  }

  async checkTradeExit(tradeId) {
    const trade = this.trades.find(
      (t) => t.id === tradeId && t.status === "open",
    );
    if (!trade) return;

    try {
      const currentData = await this.fetchMarketData(trade.symbol);
      if (!currentData) return;

      const currentPrice = currentData.price;
      let shouldExit = false;
      let exitReason = "";

      // Check stop loss
      if (
        (trade.type === "BUY" && currentPrice <= trade.stopLoss) ||
        (trade.type === "SELL" && currentPrice >= trade.stopLoss)
      ) {
        shouldExit = true;
        exitReason = "Stop loss triggered";
      }

      // Check target price
      if (
        (trade.type === "BUY" && currentPrice >= trade.targetPrice) ||
        (trade.type === "SELL" && currentPrice <= trade.targetPrice)
      ) {
        shouldExit = true;
        exitReason = "Target price reached";
      }

      // Time-based exit (1 hour max)
      if (Date.now() - trade.timestamp.getTime() > 3600000) {
        shouldExit = true;
        exitReason = "Time-based exit";
      }

      if (shouldExit) {
        await this.exitTrade(trade, currentPrice, exitReason);
      } else {
        // Schedule another check
        setTimeout(() => this.checkTradeExit(tradeId), 60000);
      }
    } catch (error) {
      console.error(`Error checking trade exit for ${trade.symbol}:`, error);
    }
  }

  async exitTrade(trade, exitPrice, reason) {
    trade.exitPrice = exitPrice;
    trade.exitTimestamp = new Date();
    trade.exitReason = reason;
    trade.status = "closed";

    // Calculate P&L
    let pnl = 0;
    if (trade.type === "BUY") {
      pnl = (exitPrice - trade.entryPrice) * trade.shares;
      this.paperBalance += trade.shares * exitPrice;
    } else {
      pnl = (trade.entryPrice - exitPrice) * trade.shares;
      this.paperBalance += pnl;
    }

    trade.pnl = pnl;
    this.performance.totalPnL += pnl;
    this.performance.totalTrades++;

    if (pnl > 0) {
      this.performance.winningTrades++;
    } else {
      this.performance.losingTrades++;
    }

    // Remove from active positions
    this.positions.delete(trade.symbol);

    console.log(
      `💰 Closed ${trade.type} ${trade.symbol}: ${pnl > 0 ? "+" : ""}$${pnl.toFixed(2)} (${reason})`,
    );

    // Learn from the trade
    this.learnFromTrade(trade);
  }

  learnFromTrade(trade) {
    const wasSuccessful = trade.pnl > 0;
    const confidenceAccuracy = wasSuccessful
      ? trade.confidence
      : 1 - trade.confidence;

    // Adjust model accuracy based on trade outcome
    if (wasSuccessful) {
      this.modelAccuracy = Math.min(0.95, this.modelAccuracy + 0.01);
      this.signalConfidence = Math.min(0.9, this.signalConfidence + 0.005);
    } else {
      this.modelAccuracy = Math.max(0.4, this.modelAccuracy - 0.005);
      this.signalConfidence = Math.max(0.5, this.signalConfidence - 0.002);
    }

    console.log(
      `🧠 Learning from trade: Model accuracy: ${(this.modelAccuracy * 100).toFixed(1)}%`,
    );
  }

  updateModelAccuracy() {
    const recentTrades = this.trades.filter(
      (t) =>
        t.status === "closed" &&
        Date.now() - t.exitTimestamp.getTime() < 86400000, // Last 24 hours
    );

    if (recentTrades.length > 0) {
      const winRate =
        recentTrades.filter((t) => t.pnl > 0).length / recentTrades.length;
      this.performance.winRate = winRate;

      // Adjust learning progress based on performance
      if (winRate > 0.6) {
        this.learningProgress += 1;
      } else if (winRate < 0.4) {
        this.learningProgress = Math.max(0, this.learningProgress - 0.5);
      }
    }
  }

  async retrainModels() {
    console.log("🔄 Retraining AI models...");

    // Simulate model retraining with recent data
    const recentData = this.learningData.slice(-100);

    if (recentData.length > 10) {
      // Simulate improved accuracy after retraining
      const performanceImprovement = Math.random() * 0.05; // Up to 5% improvement
      this.modelAccuracy = Math.min(
        0.95,
        this.modelAccuracy + performanceImprovement,
      );

      console.log(
        `✅ Model retrained. New accuracy: ${(this.modelAccuracy * 100).toFixed(1)}%`,
      );
    }
  }

  startTradingLoop() {
    // Generate signals every 2-5 minutes
    setInterval(
      () => {
        this.generateTradingSignals();
      },
      120000 + Math.random() * 180000,
    );
  }

  async generateTradingSignals() {
    const signals = [];

    for (const symbol of this.symbols.slice(0, 4)) {
      // Limit to 4 symbols for API
      try {
        const marketData = await this.fetchMarketData(symbol);
        if (marketData) {
          const indicators = this.calculateTechnicalIndicators(marketData);
          const prediction = this.generatePrediction(
            symbol,
            marketData,
            indicators,
          );

          signals.push({
            symbol,
            signal: prediction.signal.toLowerCase(),
            confidence: Math.round(prediction.confidence * 100),
            price: marketData.price,
            timestamp: new Date().toISOString(),
            reasoning: prediction.reasoning,
            change: marketData.change
              ? `${marketData.change.toFixed(2)}% change`
              : "Real-time analysis",
          });
        }
      } catch (error) {
        console.error(`Error generating signal for ${symbol}:`, error);
      }
    }

    this.signals = signals;
  }

  startPerformanceTracking() {
    setInterval(() => {
      this.updatePerformanceMetrics();
    }, 300000); // Every 5 minutes
  }

  updatePerformanceMetrics() {
    if (this.performance.totalTrades > 0) {
      this.performance.winRate =
        this.performance.winningTrades / this.performance.totalTrades;
      this.performance.avgTradeReturn =
        this.performance.totalPnL / this.performance.totalTrades;
    }

    // Log performance update
    console.log(
      `📊 Performance Update: Balance: $${this.paperBalance.toFixed(2)}, Total P&L: $${this.performance.totalPnL.toFixed(2)}, Win Rate: ${(this.performance.winRate * 100).toFixed(1)}%`,
    );
  }

  // API methods for external access
  getStatus() {
    return {
      status: this.status,
      balance: this.paperBalance,
      signals_today: this.signals.length,
      open_positions: this.positions.size,
      win_rate: this.performance.winRate * 100,
      total_pnl: this.performance.totalPnL,
      learning_progress: this.learningProgress / 100,
      is_learning: this.isLearning,
      model_accuracy: this.modelAccuracy * 100,
    };
  }

  getSignals() {
    return {
      signals: this.signals,
      balance: this.paperBalance,
      positions: Array.from(this.positions.values()),
      performance: this.performance,
    };
  }

  getTrades() {
    return this.trades.slice(-50); // Last 50 trades
  }
}

module.exports = EnhancedTradingAgent;
