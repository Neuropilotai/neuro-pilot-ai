const fs = require("fs").promises;
const path = require("path");
const EventEmitter = require("events");

class ExpertMultiMarketTrader extends EventEmitter {
  constructor() {
    super();
    this.tradingDataFile = path.join(__dirname, "expert_trading_data.json");
    this.signalsFile = path.join(__dirname, "multi_market_signals.json");

    // Paper wallet state
    this.wallet = {
      startingBalance: 500,
      currentBalance: 500,
      positions: new Map(),
      trades: [],
      dailyPnL: 0,
      totalPnL: 0,
      marketExposure: {
        stocks: 0,
        crypto: 0,
        forex: 0,
        commodities: 0,
        indices: 0,
      },
    };

    // ALL MARKETS - The AI trades everything for maximum expertise
    this.allMarkets = {
      // STOCKS - Tech Giants
      AAPL: {
        price: 185.5,
        market: "stocks",
        volatility: 0.02,
        category: "tech",
      },
      MSFT: {
        price: 425.3,
        market: "stocks",
        volatility: 0.015,
        category: "tech",
      },
      GOOGL: {
        price: 155.75,
        market: "stocks",
        volatility: 0.025,
        category: "tech",
      },
      AMZN: {
        price: 175.2,
        market: "stocks",
        volatility: 0.02,
        category: "tech",
      },
      NVDA: {
        price: 875.25,
        market: "stocks",
        volatility: 0.035,
        category: "tech",
      },
      META: {
        price: 485.9,
        market: "stocks",
        volatility: 0.03,
        category: "tech",
      },
      TSLA: {
        price: 245.8,
        market: "stocks",
        volatility: 0.04,
        category: "ev",
      },

      // CRYPTO - Major Coins
      BTC: {
        price: 43250.0,
        market: "crypto",
        volatility: 0.06,
        category: "major",
      },
      ETH: {
        price: 2650.0,
        market: "crypto",
        volatility: 0.07,
        category: "major",
      },
      BNB: {
        price: 315.5,
        market: "crypto",
        volatility: 0.08,
        category: "exchange",
      },
      SOL: {
        price: 98.75,
        market: "crypto",
        volatility: 0.12,
        category: "altcoin",
      },
      ADA: {
        price: 0.52,
        market: "crypto",
        volatility: 0.15,
        category: "altcoin",
      },
      DOGE: {
        price: 0.085,
        market: "crypto",
        volatility: 0.2,
        category: "meme",
      },
      MATIC: {
        price: 0.78,
        market: "crypto",
        volatility: 0.18,
        category: "defi",
      },
      LINK: {
        price: 14.85,
        market: "crypto",
        volatility: 0.16,
        category: "oracle",
      },
      UNI: {
        price: 7.25,
        market: "crypto",
        volatility: 0.19,
        category: "defi",
      },
      AVAX: {
        price: 36.8,
        market: "crypto",
        volatility: 0.14,
        category: "layer1",
      },

      // FOREX - Major Pairs
      EURUSD: {
        price: 1.0842,
        market: "forex",
        volatility: 0.01,
        category: "major",
      },
      GBPUSD: {
        price: 1.2634,
        market: "forex",
        volatility: 0.012,
        category: "major",
      },
      USDJPY: {
        price: 149.85,
        market: "forex",
        volatility: 0.011,
        category: "major",
      },
      USDCHF: {
        price: 0.8745,
        market: "forex",
        volatility: 0.01,
        category: "major",
      },
      AUDUSD: {
        price: 0.6582,
        market: "forex",
        volatility: 0.013,
        category: "commodity",
      },
      USDCAD: {
        price: 1.3456,
        market: "forex",
        volatility: 0.009,
        category: "commodity",
      },

      // COMMODITIES
      GOLD: {
        price: 2045.5,
        market: "commodities",
        volatility: 0.015,
        category: "precious",
      },
      SILVER: {
        price: 24.85,
        market: "commodities",
        volatility: 0.025,
        category: "precious",
      },
      OIL: {
        price: 78.45,
        market: "commodities",
        volatility: 0.03,
        category: "energy",
      },
      NATGAS: {
        price: 2.85,
        market: "commodities",
        volatility: 0.05,
        category: "energy",
      },
      COPPER: {
        price: 3.78,
        market: "commodities",
        volatility: 0.02,
        category: "industrial",
      },

      // INDICES
      SPY: {
        price: 475.9,
        market: "indices",
        volatility: 0.015,
        category: "us",
      },
      QQQ: {
        price: 385.25,
        market: "indices",
        volatility: 0.02,
        category: "tech",
      },
      IWM: {
        price: 195.8,
        market: "indices",
        volatility: 0.025,
        category: "smallcap",
      },
      VTI: {
        price: 245.6,
        market: "indices",
        volatility: 0.014,
        category: "total",
      },
      EEM: {
        price: 42.15,
        market: "indices",
        volatility: 0.022,
        category: "emerging",
      },
    };

    // Expert trading strategies for different markets
    this.expertStrategies = {
      // Stock strategies
      momentum_stocks: { wins: 0, losses: 0, totalPnL: 0, markets: ["stocks"] },
      earnings_play: { wins: 0, losses: 0, totalPnL: 0, markets: ["stocks"] },
      sector_rotation: { wins: 0, losses: 0, totalPnL: 0, markets: ["stocks"] },

      // Crypto strategies
      crypto_momentum: { wins: 0, losses: 0, totalPnL: 0, markets: ["crypto"] },
      defi_arbitrage: { wins: 0, losses: 0, totalPnL: 0, markets: ["crypto"] },
      altcoin_rotation: {
        wins: 0,
        losses: 0,
        totalPnL: 0,
        markets: ["crypto"],
      },

      // Forex strategies
      carry_trade: { wins: 0, losses: 0, totalPnL: 0, markets: ["forex"] },
      news_trading: { wins: 0, losses: 0, totalPnL: 0, markets: ["forex"] },
      correlation_play: { wins: 0, losses: 0, totalPnL: 0, markets: ["forex"] },

      // Commodities strategies
      inflation_hedge: {
        wins: 0,
        losses: 0,
        totalPnL: 0,
        markets: ["commodities"],
      },
      supply_demand: {
        wins: 0,
        losses: 0,
        totalPnL: 0,
        markets: ["commodities"],
      },

      // Cross-market strategies
      risk_on_off: {
        wins: 0,
        losses: 0,
        totalPnL: 0,
        markets: ["stocks", "forex", "commodities"],
      },
      volatility_play: {
        wins: 0,
        losses: 0,
        totalPnL: 0,
        markets: ["crypto", "stocks"],
      },
      correlation_break: { wins: 0, losses: 0, totalPnL: 0, markets: ["all"] },
    };

    this.isRunning = false;
    this.tradingInterval = null;
    this.marketHours = this.getMarketHours();
  }

  getMarketHours() {
    // Different markets have different hours - AI trades 24/7 where possible
    return {
      stocks: { open: 9.5, close: 16 }, // 9:30 AM - 4:00 PM EST
      crypto: { open: 0, close: 24 }, // 24/7
      forex: { open: 0, close: 24 }, // 24/7 (5 days)
      commodities: { open: 6, close: 17 }, // 6:00 AM - 5:00 PM EST
      indices: { open: 9.5, close: 16 },
    };
  }

  isMarketOpen(market) {
    const now = new Date();
    const hour = now.getHours() + now.getMinutes() / 60;
    const hours = this.marketHours[market];

    // Crypto and forex trade 24/7
    if (market === "crypto" || market === "forex") return true;

    // Check if within market hours
    return hour >= hours.open && hour <= hours.close;
  }

  async loadState() {
    try {
      const data = await fs.readFile(this.tradingDataFile, "utf8");
      const saved = JSON.parse(data);
      this.wallet = {
        ...saved.wallet,
        positions: new Map(saved.wallet.positions || []),
      };
      this.expertStrategies = saved.expertStrategies || this.expertStrategies;
      console.log("📊 Loaded previous expert trading state");
    } catch (error) {
      console.log("🆕 Starting fresh expert multi-market trading system");
    }
  }

  async saveState() {
    const toSave = {
      wallet: {
        ...this.wallet,
        positions: Array.from(this.wallet.positions.entries()),
      },
      expertStrategies: this.expertStrategies,
      lastUpdate: new Date(),
    };
    await fs.writeFile(this.tradingDataFile, JSON.stringify(toSave, null, 2));
  }

  // AI Expert Market Analysis
  async generateExpertSignals() {
    const signals = [];
    const currentHour = new Date().getHours();

    // Update all market prices with realistic movements
    for (const [symbol, data] of Object.entries(this.allMarkets)) {
      // Skip if market is closed
      if (!this.isMarketOpen(data.market)) continue;

      // Realistic price movements based on market type
      let priceChange;
      if (data.market === "crypto") {
        // Crypto: Higher volatility, can move 5-15% in a day
        priceChange = (Math.random() - 0.5) * data.volatility * data.price * 2;
      } else if (data.market === "forex") {
        // Forex: Lower volatility, typically 0.5-2% daily
        priceChange = (Math.random() - 0.5) * data.volatility * data.price;
      } else if (data.market === "commodities") {
        // Commodities: Medium volatility, affected by supply/demand
        priceChange =
          (Math.random() - 0.5) * data.volatility * data.price * 1.5;
      } else {
        // Stocks: Standard volatility
        priceChange = (Math.random() - 0.5) * data.volatility * data.price;
      }

      data.price = Math.max(0.01, data.price + priceChange);

      // Generate expert signals based on market conditions
      let signal = this.generateMarketSpecificSignal(symbol, data, currentHour);

      if (Math.abs(signal) > 0.15) {
        // Only strong signals
        const strategy = this.selectExpertStrategy(
          data.market,
          data.category,
          signal,
        );

        signals.push({
          symbol,
          signal,
          price: data.price,
          market: data.market,
          confidence: Math.abs(signal),
          action: signal > 0.2 ? "BUY" : signal < -0.2 ? "SELL" : "HOLD",
          strategy,
          reasoning: this.generateReasoning(symbol, data, signal, strategy),
        });
      }
    }

    // Save signals for monitoring
    await fs.writeFile(
      this.signalsFile,
      JSON.stringify(
        {
          timestamp: new Date(),
          activeMarkets: this.getActiveMarkets(),
          signals: signals.filter((s) => s.action !== "HOLD"),
          marketExposure: this.wallet.marketExposure,
        },
        null,
        2,
      ),
    );

    return signals
      .filter((s) => s.action !== "HOLD")
      .sort((a, b) => b.confidence - a.confidence);
  }

  generateMarketSpecificSignal(symbol, data, hour) {
    let signal = 0;

    // Market-specific analysis
    switch (data.market) {
      case "crypto":
        // Crypto patterns: More volatile, momentum-driven
        signal += (Math.random() - 0.5) * 0.8;
        if (hour >= 14 && hour <= 18) signal += 0.2; // Afternoon pump
        if (data.category === "altcoin") signal *= 1.3; // Altcoins more volatile
        break;

      case "stocks":
        // Stock patterns: Earnings, sector rotation, market sentiment
        signal += (Math.random() - 0.5) * 0.6;
        if (hour >= 9 && hour <= 10) signal += 0.15; // Opening momentum
        if (hour >= 15 && hour <= 16) signal += 0.1; // Closing action
        if (data.category === "tech") signal *= 1.1; // Tech leadership
        break;

      case "forex":
        // Forex patterns: Economic news, carry trades, correlations
        signal += (Math.random() - 0.5) * 0.5;
        if (hour >= 8 && hour <= 12) signal += 0.1; // London/NY overlap
        if (data.category === "major") signal *= 1.05; // Major pairs more stable
        break;

      case "commodities":
        // Commodity patterns: Supply/demand, inflation, geopolitics
        signal += (Math.random() - 0.5) * 0.7;
        if (data.category === "precious") signal += 0.1; // Flight to safety
        if (data.category === "energy") signal *= 1.2; // Energy volatility
        break;

      case "indices":
        // Index patterns: Broad market sentiment, sector rotation
        signal += (Math.random() - 0.5) * 0.55;
        if (data.category === "tech") signal *= 1.15; // Tech heavy indices
        break;
    }

    // Apply learning from past performance
    const marketPerformance = this.getMarketPerformance(data.market);
    if (marketPerformance.winRate > 60) {
      signal *= 1.2; // More aggressive in profitable markets
    } else if (marketPerformance.winRate < 40) {
      signal *= 0.8; // More conservative in losing markets
    }

    return Math.max(-1, Math.min(1, signal));
  }

  selectExpertStrategy(market, category, signal) {
    // AI selects the best strategy based on market and conditions
    const marketStrategies = Object.keys(this.expertStrategies).filter(
      (strategy) =>
        this.expertStrategies[strategy].markets.includes(market) ||
        this.expertStrategies[strategy].markets.includes("all"),
    );

    // Select best performing strategy for this market
    let bestStrategy = marketStrategies[0];
    let bestScore = -1;

    for (const strategy of marketStrategies) {
      const stats = this.expertStrategies[strategy];
      const totalTrades = stats.wins + stats.losses;
      if (totalTrades > 0) {
        const score = stats.wins / totalTrades + stats.totalPnL / 100;
        if (score > bestScore) {
          bestScore = score;
          bestStrategy = strategy;
        }
      }
    }

    return (
      bestStrategy ||
      marketStrategies[Math.floor(Math.random() * marketStrategies.length)]
    );
  }

  generateReasoning(symbol, data, signal, strategy) {
    const reasons = [];

    if (data.market === "crypto") {
      if (signal > 0) reasons.push("Crypto momentum building");
      else reasons.push("Crypto correction expected");
    } else if (data.market === "stocks") {
      if (signal > 0) reasons.push("Bullish stock pattern");
      else reasons.push("Bearish technical setup");
    } else if (data.market === "forex") {
      if (signal > 0) reasons.push("Currency strength emerging");
      else reasons.push("Currency weakness detected");
    }

    reasons.push(`Strategy: ${strategy}`);
    reasons.push(`Market: ${data.market}`);

    return reasons.join(" | ");
  }

  getActiveMarkets() {
    const active = [];
    for (const market of [
      "stocks",
      "crypto",
      "forex",
      "commodities",
      "indices",
    ]) {
      if (this.isMarketOpen(market)) {
        active.push(market);
      }
    }
    return active;
  }

  getMarketPerformance(market) {
    let wins = 0,
      losses = 0,
      totalPnL = 0;

    for (const trade of this.wallet.trades) {
      const asset = this.allMarkets[trade.symbol];
      if (asset && asset.market === market && trade.pnl !== 0) {
        if (trade.pnl > 0) wins++;
        else losses++;
        totalPnL += trade.pnl;
      }
    }

    const totalTrades = wins + losses;
    return {
      winRate: totalTrades > 0 ? (wins / totalTrades) * 100 : 0,
      totalPnL,
      totalTrades,
    };
  }

  // Execute expert trades across all markets
  async executeExpertTrade(signal) {
    const { symbol, action, price, strategy, market } = signal;
    const position = this.wallet.positions.get(symbol) || {
      quantity: 0,
      avgPrice: 0,
    };

    // Dynamic position sizing based on market and account
    let positionSize;
    if (market === "forex") {
      // Forex: Use larger positions due to lower volatility
      positionSize = this.wallet.currentBalance * 0.3;
    } else if (market === "crypto") {
      // Crypto: Smaller positions due to high volatility
      positionSize = this.wallet.currentBalance * 0.15;
    } else {
      // Stocks, commodities, indices: Standard sizing
      positionSize = this.wallet.currentBalance * 0.2;
    }

    // Adjust for price (especially important for forex and crypto)
    let quantity;
    if (price < 1) {
      // For low-priced assets (forex, some crypto)
      quantity = Math.floor(positionSize / price);
    } else {
      // For higher-priced assets
      quantity = Math.max(1, Math.floor(positionSize / price));
    }

    const trade = {
      id: `EXPERT_${Date.now()}`,
      timestamp: new Date(),
      symbol,
      action,
      quantity,
      price,
      strategy,
      market,
      value: quantity * price,
      pnl: 0,
      reasoning: signal.reasoning,
    };

    // Execute the trade
    if (action === "BUY") {
      if (trade.value > this.wallet.currentBalance * 0.9) {
        console.log(`⚠️ Insufficient funds for ${market} trade: ${symbol}`);
        return null;
      }

      // Update position
      const newQuantity = position.quantity + quantity;
      const newAvgPrice =
        position.quantity > 0
          ? (position.quantity * position.avgPrice + trade.value) / newQuantity
          : price;

      this.wallet.positions.set(symbol, {
        quantity: newQuantity,
        avgPrice: newAvgPrice,
        market,
      });

      this.wallet.currentBalance -= trade.value;
    } else if (action === "SELL") {
      if (position.quantity < quantity) {
        trade.quantity = position.quantity;
        trade.value = trade.quantity * price;
      }

      if (trade.quantity === 0) return null;

      // Calculate P&L
      const costBasis = trade.quantity * position.avgPrice;
      trade.pnl = trade.value - costBasis;

      // Update position
      position.quantity -= trade.quantity;
      if (position.quantity === 0) {
        this.wallet.positions.delete(symbol);
      } else {
        this.wallet.positions.set(symbol, position);
      }

      this.wallet.currentBalance += trade.value;
      this.wallet.dailyPnL += trade.pnl;
      this.wallet.totalPnL += trade.pnl;

      // Update strategy performance
      if (trade.pnl > 0) {
        this.expertStrategies[strategy].wins++;
      } else {
        this.expertStrategies[strategy].losses++;
      }
      this.expertStrategies[strategy].totalPnL += trade.pnl;
    }

    // Update market exposure
    this.updateMarketExposure();

    // Record trade
    this.wallet.trades.push(trade);

    // Enhanced logging
    const pnlStr =
      trade.pnl !== 0
        ? ` | P&L: ${trade.pnl >= 0 ? "+" : ""}$${trade.pnl.toFixed(2)}`
        : "";
    console.log(
      `🌍 ${market.toUpperCase()} ${action} ${quantity} ${symbol} @ $${price.toFixed(4)} [${strategy}]${pnlStr}`,
    );

    this.emit("trade", trade);
    return trade;
  }

  updateMarketExposure() {
    // Reset exposure
    for (const market in this.wallet.marketExposure) {
      this.wallet.marketExposure[market] = 0;
    }

    // Calculate current exposure by market
    for (const [symbol, position] of this.wallet.positions) {
      const asset = this.allMarkets[symbol];
      if (asset) {
        const value = position.quantity * asset.price;
        this.wallet.marketExposure[asset.market] += value;
      }
    }
  }

  // Main expert trading cycle
  async runExpertTradingCycle() {
    console.log("\\n🌍 Running expert multi-market trading cycle...");

    const activeMarkets = this.getActiveMarkets();
    console.log(`📊 Active markets: ${activeMarkets.join(", ")}`);

    // Generate expert signals across all markets
    const signals = await this.generateExpertSignals();

    if (signals.length === 0) {
      console.log("📊 No strong signals across any markets this cycle");
      return;
    }

    console.log(
      `🎯 Generated ${signals.length} expert signals across ${new Set(signals.map((s) => s.market)).size} markets`,
    );

    // Execute top signals from different markets for diversification
    const maxTradesPerCycle = 5;
    const marketSignals = new Map();

    // Group signals by market
    signals.forEach((signal) => {
      if (!marketSignals.has(signal.market)) {
        marketSignals.set(signal.market, []);
      }
      marketSignals.get(signal.market).push(signal);
    });

    let tradesExecuted = 0;

    // Execute best signal from each market for diversification
    for (const [market, marketSigs] of marketSignals) {
      if (tradesExecuted >= maxTradesPerCycle) break;

      const bestSignal = marketSigs[0]; // Already sorted by confidence
      const trade = await this.executeExpertTrade(bestSignal);

      if (trade) {
        tradesExecuted++;
        await this.saveState();
      }
    }

    this.displayExpertStats();
  }

  displayExpertStats() {
    const wins = this.wallet.trades.filter((t) => t.pnl > 0).length;
    const totalTrades = this.wallet.trades.length;
    const winRate = totalTrades > 0 ? (wins / totalTrades) * 100 : 0;

    console.log("\\n📊 Expert Multi-Market Trading Stats:");
    console.log(
      `💰 Balance: $${this.wallet.currentBalance.toFixed(2)} | Total P&L: ${this.wallet.totalPnL >= 0 ? "+" : ""}$${this.wallet.totalPnL.toFixed(2)}`,
    );
    console.log(
      `📈 Win Rate: ${winRate.toFixed(1)}% | Total Trades: ${totalTrades}`,
    );

    // Show market exposure
    console.log("🌍 Market Exposure:");
    for (const [market, exposure] of Object.entries(
      this.wallet.marketExposure,
    )) {
      if (exposure > 0) {
        const percentage = (exposure / this.wallet.currentBalance) * 100;
        console.log(
          `   ${market.toUpperCase()}: $${exposure.toFixed(2)} (${percentage.toFixed(1)}%)`,
        );
      }
    }

    // Show best strategies
    const bestStrategies = Object.entries(this.expertStrategies)
      .filter(([_, stats]) => stats.wins + stats.losses > 0)
      .sort((a, b) => b[1].totalPnL - a[1].totalPnL)
      .slice(0, 3);

    if (bestStrategies.length > 0) {
      console.log("🏆 Top Strategies:");
      bestStrategies.forEach(([strategy, stats]) => {
        const winRate = (
          (stats.wins / (stats.wins + stats.losses)) *
          100
        ).toFixed(1);
        console.log(
          `   ${strategy}: ${stats.wins}W/${stats.losses}L (${winRate}%) | P&L: $${stats.totalPnL.toFixed(2)}`,
        );
      });
    }
  }

  async start() {
    await this.loadState();

    console.log("🚀 Starting Expert Multi-Market Trading System");
    console.log(
      "🌍 Trading ALL markets: Stocks, Crypto, Forex, Commodities, Indices",
    );
    console.log("💰 Paper wallet starting balance: $500.00");
    console.log("🎯 AI will become expert across ALL asset classes");
    console.log("⚡ 24/7 trading where markets allow\\n");

    this.isRunning = true;

    // Run expert trading cycles every 20 seconds (more frequent for multiple markets)
    this.tradingInterval = setInterval(() => {
      this.runExpertTradingCycle().catch(console.error);
    }, 20000);

    // Run first cycle immediately
    await this.runExpertTradingCycle();
  }

  stop() {
    if (!this.isRunning) return;

    console.log("\\n🛑 Stopping Expert Multi-Market Trading System");
    clearInterval(this.tradingInterval);
    this.isRunning = false;

    this.displayExpertStats();
    this.saveState().catch(console.error);
  }

  async getCurrentState() {
    return {
      wallet: {
        ...this.wallet,
        positions: Array.from(this.wallet.positions.entries()).map(
          ([symbol, pos]) => ({
            symbol,
            ...pos,
            currentPrice: this.allMarkets[symbol]?.price || 0,
            unrealizedPnL: this.allMarkets[symbol]
              ? (this.allMarkets[symbol].price - pos.avgPrice) * pos.quantity
              : 0,
          }),
        ),
      },
      expertStrategies: this.expertStrategies,
      marketExposure: this.wallet.marketExposure,
      activeMarkets: this.getActiveMarkets(),
      isRunning: this.isRunning,
      lastUpdate: new Date(),
    };
  }
}

module.exports = ExpertMultiMarketTrader;

// Run if called directly
if (require.main === module) {
  const expertTrader = new ExpertMultiMarketTrader();

  expertTrader.start();

  process.on("SIGINT", () => {
    console.log("\\n\\n💤 Shutting down expert trader...");
    expertTrader.stop();
    process.exit(0);
  });

  process.stdin.resume();
}
