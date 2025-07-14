const fs = require('fs').promises;
const path = require('path');
const EventEmitter = require('events');

class AutonomousTradingSystem extends EventEmitter {
    constructor() {
        super();
        this.tradingDataFile = path.join(__dirname, 'autonomous_trading_data.json');
        this.signalsFile = path.join(__dirname, 'trading_signals.json');
        
        // Paper wallet state
        this.wallet = {
            startingBalance: 500,
            currentBalance: 500,
            positions: new Map(),
            trades: [],
            dailyPnL: 0,
            totalPnL: 0,
            learningMetrics: {
                successfulPatterns: [],
                failedPatterns: [],
                winRate: 0,
                avgWinAmount: 0,
                avgLossAmount: 0,
                bestStrategy: null
            }
        };
        
        // Trading strategies the AI is learning
        this.strategies = {
            momentum: { wins: 0, losses: 0, totalPnL: 0 },
            meanReversion: { wins: 0, losses: 0, totalPnL: 0 },
            breakout: { wins: 0, losses: 0, totalPnL: 0 },
            aiSignals: { wins: 0, losses: 0, totalPnL: 0 }
        };
        
        // Market simulation data
        this.marketData = {
            'AAPL': { price: 185.50, volatility: 0.02, trend: 1 },
            'MSFT': { price: 425.30, volatility: 0.015, trend: 1 },
            'GOOGL': { price: 155.75, volatility: 0.025, trend: 0 },
            'TSLA': { price: 245.80, volatility: 0.04, trend: -1 },
            'NVDA': { price: 875.25, volatility: 0.035, trend: 1 },
            'META': { price: 485.90, volatility: 0.03, trend: 0 },
            'AMZN': { price: 175.20, volatility: 0.02, trend: 1 }
        };
        
        this.isRunning = false;
        this.tradingInterval = null;
        this.learningInterval = null;
    }
    
    async loadState() {
        try {
            const data = await fs.readFile(this.tradingDataFile, 'utf8');
            const saved = JSON.parse(data);
            this.wallet = {
                ...saved.wallet,
                positions: new Map(saved.wallet.positions || [])
            };
            this.strategies = saved.strategies || this.strategies;
            console.log('📊 Loaded previous trading state');
        } catch (error) {
            console.log('🆕 Starting fresh autonomous trading system');
        }
    }
    
    async saveState() {
        const toSave = {
            wallet: {
                ...this.wallet,
                positions: Array.from(this.wallet.positions.entries())
            },
            strategies: this.strategies,
            lastUpdate: new Date()
        };
        await fs.writeFile(this.tradingDataFile, JSON.stringify(toSave, null, 2));
    }
    
    // AI Learning: Analyze patterns and improve
    analyzeTradingPatterns() {
        const recentTrades = this.wallet.trades.slice(-20);
        
        if (recentTrades.length < 5) return;
        
        // Calculate metrics for learning
        const wins = recentTrades.filter(t => t.pnl > 0);
        const losses = recentTrades.filter(t => t.pnl < 0);
        
        this.wallet.learningMetrics.winRate = (wins.length / recentTrades.length) * 100;
        this.wallet.learningMetrics.avgWinAmount = wins.length > 0 
            ? wins.reduce((sum, t) => sum + t.pnl, 0) / wins.length 
            : 0;
        this.wallet.learningMetrics.avgLossAmount = losses.length > 0
            ? Math.abs(losses.reduce((sum, t) => sum + t.pnl, 0) / losses.length)
            : 0;
        
        // Find best performing strategy
        let bestStrategy = null;
        let bestScore = -Infinity;
        
        for (const [name, stats] of Object.entries(this.strategies)) {
            const totalTrades = stats.wins + stats.losses;
            if (totalTrades > 0) {
                const score = (stats.wins / totalTrades) * 100 + (stats.totalPnL / 1000);
                if (score > bestScore) {
                    bestScore = score;
                    bestStrategy = name;
                }
            }
        }
        
        this.wallet.learningMetrics.bestStrategy = bestStrategy;
        
        console.log(`🧠 AI Learning Update:`);
        console.log(`   Win Rate: ${this.wallet.learningMetrics.winRate.toFixed(1)}%`);
        console.log(`   Best Strategy: ${bestStrategy || 'Still learning...'}`);
    }
    
    // Generate AI trading signals
    async generateAISignal() {
        const signals = [];
        
        // Update market prices with realistic movements
        for (const [symbol, data] of Object.entries(this.marketData)) {
            const priceChange = (Math.random() - 0.5) * data.volatility * data.price;
            data.price += priceChange;
            
            // AI Signal Generation Logic
            const rsi = 50 + (Math.random() - 0.5) * 50; // Simplified RSI
            const macdSignal = Math.random() - 0.5; // Simplified MACD
            const volume = Math.random(); // Normalized volume
            
            // Combine indicators for signal
            let signal = 0;
            if (rsi < 30) signal += 0.3; // Oversold
            if (rsi > 70) signal -= 0.3; // Overbought
            if (macdSignal > 0.1) signal += 0.2;
            if (macdSignal < -0.1) signal -= 0.2;
            if (volume > 0.7) signal += 0.1; // High volume
            
            // Apply trend bias
            signal += data.trend * 0.2;
            
            // Apply learning from past performance
            if (this.wallet.learningMetrics.winRate < 40) {
                // If losing too much, be more conservative
                signal *= 0.5;
            } else if (this.wallet.learningMetrics.winRate > 60) {
                // If winning, be slightly more aggressive
                signal *= 1.2;
            }
            
            signals.push({
                symbol,
                signal,
                price: data.price,
                confidence: Math.abs(signal),
                action: signal > 0.2 ? 'BUY' : signal < -0.2 ? 'SELL' : 'HOLD',
                strategy: this.selectStrategy(signal, rsi, macdSignal)
            });
        }
        
        // Save signals for monitoring
        await fs.writeFile(this.signalsFile, JSON.stringify({
            timestamp: new Date(),
            signals: signals.filter(s => s.action !== 'HOLD')
        }, null, 2));
        
        return signals.filter(s => s.action !== 'HOLD').sort((a, b) => b.confidence - a.confidence);
    }
    
    selectStrategy(signal, rsi, macd) {
        // AI selects strategy based on market conditions
        if (Math.abs(signal) > 0.4) return 'aiSignals';
        if (rsi < 30 || rsi > 70) return 'meanReversion';
        if (macd > 0.2 || macd < -0.2) return 'momentum';
        return 'breakout';
    }
    
    // Execute trades autonomously
    async executeTrade(signal) {
        const { symbol, action, price, strategy } = signal;
        const position = this.wallet.positions.get(symbol) || { quantity: 0, avgPrice: 0 };
        
        // Determine position size based on confidence and account size (smaller account adjustments)
        const maxPositionValue = this.wallet.currentBalance * 0.2; // Max 20% per position for smaller account
        const baseQuantity = Math.max(1, Math.floor(maxPositionValue / price)); // Minimum 1 share
        const quantity = Math.max(1, Math.floor(baseQuantity * signal.confidence)); // Minimum 1 share
        
        if (quantity === 0) return null;
        
        const trade = {
            id: `TRADE_${Date.now()}`,
            timestamp: new Date(),
            symbol,
            action,
            quantity,
            price,
            strategy,
            value: quantity * price,
            pnl: 0
        };
        
        if (action === 'BUY') {
            // Check if we have enough cash (adjust for smaller account)
            if (trade.value > this.wallet.currentBalance * 0.8) {
                console.log(`⚠️ Insufficient funds for ${symbol} trade ($${trade.value.toFixed(2)} needed, $${this.wallet.currentBalance.toFixed(2)} available)`);
                return null;
            }
            
            // Update position
            const newQuantity = position.quantity + quantity;
            const newAvgPrice = position.quantity > 0
                ? ((position.quantity * position.avgPrice) + trade.value) / newQuantity
                : price;
            
            this.wallet.positions.set(symbol, {
                quantity: newQuantity,
                avgPrice: newAvgPrice
            });
            
            // Deduct from balance
            this.wallet.currentBalance -= trade.value;
            
        } else if (action === 'SELL') {
            if (position.quantity < quantity) {
                // Adjust quantity to available position
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
            
            // Add proceeds to balance
            this.wallet.currentBalance += trade.value;
            
            // Update P&L
            this.wallet.dailyPnL += trade.pnl;
            this.wallet.totalPnL += trade.pnl;
            
            // Update strategy performance
            if (trade.pnl > 0) {
                this.strategies[strategy].wins++;
            } else {
                this.strategies[strategy].losses++;
            }
            this.strategies[strategy].totalPnL += trade.pnl;
        }
        
        // Record trade
        this.wallet.trades.push(trade);
        
        // Log trade
        const pnlStr = trade.pnl !== 0 ? ` | P&L: ${trade.pnl >= 0 ? '+' : ''}$${trade.pnl.toFixed(2)}` : '';
        console.log(`🤖 ${action} ${quantity} ${symbol} @ $${price.toFixed(2)} [${strategy}]${pnlStr}`);
        
        // Emit trade event
        this.emit('trade', trade);
        
        return trade;
    }
    
    // Main autonomous trading loop
    async runTradingCycle() {
        console.log('\n🔄 Running autonomous trading cycle...');
        
        // Generate AI signals
        const signals = await this.generateAISignal();
        
        if (signals.length === 0) {
            console.log('📊 No trading signals generated this cycle');
            return;
        }
        
        console.log(`📡 Generated ${signals.length} trading signals`);
        
        // Execute top signals
        const maxTradesPerCycle = 3;
        let tradesExecuted = 0;
        
        for (const signal of signals.slice(0, maxTradesPerCycle)) {
            const trade = await this.executeTrade(signal);
            if (trade) {
                tradesExecuted++;
                await this.saveState();
            }
        }
        
        // Analyze and learn
        if (this.wallet.trades.length > 0 && this.wallet.trades.length % 10 === 0) {
            this.analyzeTradingPatterns();
        }
        
        // Display current stats
        this.displayStats();
    }
    
    displayStats() {
        const wins = this.wallet.trades.filter(t => t.pnl > 0).length;
        const totalTrades = this.wallet.trades.length;
        const winRate = totalTrades > 0 ? (wins / totalTrades) * 100 : 0;
        
        console.log('\n📊 Autonomous Trading Stats:');
        console.log(`💰 Balance: $${this.wallet.currentBalance.toFixed(2)} | Total P&L: ${this.wallet.totalPnL >= 0 ? '+' : ''}$${this.wallet.totalPnL.toFixed(2)}`);
        console.log(`📈 Win Rate: ${winRate.toFixed(1)}% | Total Trades: ${totalTrades}`);
        console.log(`🎯 Best Strategy: ${this.wallet.learningMetrics.bestStrategy || 'Learning...'}`);
        
        // Show open positions
        if (this.wallet.positions.size > 0) {
            console.log('📦 Open Positions:');
            for (const [symbol, pos] of this.wallet.positions) {
                const currentPrice = this.marketData[symbol].price;
                const unrealizedPnL = (currentPrice - pos.avgPrice) * pos.quantity;
                console.log(`   ${symbol}: ${pos.quantity} shares @ $${pos.avgPrice.toFixed(2)} | Unrealized: ${unrealizedPnL >= 0 ? '+' : ''}$${unrealizedPnL.toFixed(2)}`);
            }
        }
    }
    
    // Start autonomous trading
    async start() {
        if (this.isRunning) {
            console.log('⚠️ Autonomous trading is already running');
            return;
        }
        
        await this.loadState();
        
        console.log('🚀 Starting Autonomous Trading System');
        console.log('🧠 AI will learn and improve trading strategies');
        console.log('💰 Paper wallet starting balance: $500.00');
        console.log('🎯 Goal: See what AI can generate in one week');
        console.log('⚡ No manual approval required - fully autonomous\n');
        
        this.isRunning = true;
        
        // Run trading cycles every 30 seconds
        this.tradingInterval = setInterval(() => {
            this.runTradingCycle().catch(console.error);
        }, 30000);
        
        // Run learning analysis every 2 minutes
        this.learningInterval = setInterval(() => {
            this.analyzeTradingPatterns();
            this.saveState().catch(console.error);
        }, 120000);
        
        // Run first cycle immediately
        await this.runTradingCycle();
    }
    
    // Stop autonomous trading
    stop() {
        if (!this.isRunning) return;
        
        console.log('\n🛑 Stopping Autonomous Trading System');
        
        clearInterval(this.tradingInterval);
        clearInterval(this.learningInterval);
        this.isRunning = false;
        
        this.displayStats();
        this.saveState().catch(console.error);
    }
    
    // Get current state for dashboard
    async getCurrentState() {
        return {
            wallet: {
                ...this.wallet,
                positions: Array.from(this.wallet.positions.entries()).map(([symbol, pos]) => ({
                    symbol,
                    ...pos,
                    currentPrice: this.marketData[symbol].price,
                    unrealizedPnL: (this.marketData[symbol].price - pos.avgPrice) * pos.quantity
                }))
            },
            strategies: this.strategies,
            isRunning: this.isRunning,
            lastUpdate: new Date()
        };
    }
}

// Export for use by other modules
module.exports = AutonomousTradingSystem;

// Run if called directly
if (require.main === module) {
    const tradingSystem = new AutonomousTradingSystem();
    
    // Start autonomous trading
    tradingSystem.start();
    
    // Handle graceful shutdown
    process.on('SIGINT', () => {
        console.log('\n\n💤 Shutting down autonomous trading...');
        tradingSystem.stop();
        process.exit(0);
    });
    
    // Keep process alive
    process.stdin.resume();
}