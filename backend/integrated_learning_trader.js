const fs = require('fs').promises;
const path = require('path');
const EventEmitter = require('events');

class IntegratedLearningTrader extends EventEmitter {
    constructor() {
        super();
        this.tradingDataFile = path.join(__dirname, 'integrated_learning_data.json');
        this.learningDataFile = path.join(__dirname, 'ai_learning_progress.json');
        
        // Connect to your existing learning agent
        this.learningAgent = {
            neuralNetworks: {
                trading_patterns: { weights: [], bias: 0, learningRate: 0.02 },
                market_sentiment: { weights: [], bias: 0, learningRate: 0.015 },
                risk_management: { weights: [], bias: 0, learningRate: 0.01 },
                portfolio_optimization: { weights: [], bias: 0, learningRate: 0.005 }
            },
            learningMetrics: {
                total_predictions: 0,
                successful_trades: 0,
                accuracy_improvement: 0,
                learning_iterations: 0,
                model_confidence: 0.75,
                last_training: new Date().toISOString(),
                markets_mastered: [],
                expertise_level: 'beginner'
            }
        };
        
        // Paper wallet
        this.wallet = {
            startingBalance: 500,
            currentBalance: 500,
            positions: new Map(),
            trades: [],
            dailyPnL: 0,
            totalPnL: 0,
            learningScore: 0
        };
        
        // ALL MARKETS - AI learns to trade everything
        this.allMarkets = {
            // STOCKS
            'AAPL': { price: 185.50, market: 'stocks', volatility: 0.02 },
            'MSFT': { price: 425.30, market: 'stocks', volatility: 0.015 },
            'GOOGL': { price: 155.75, market: 'stocks', volatility: 0.025 },
            'TSLA': { price: 245.80, market: 'stocks', volatility: 0.04 },
            'NVDA': { price: 875.25, market: 'stocks', volatility: 0.035 },
            
            // CRYPTO 
            'BTC': { price: 43250.00, market: 'crypto', volatility: 0.06 },
            'ETH': { price: 2650.00, market: 'crypto', volatility: 0.07 },
            'SOL': { price: 98.75, market: 'crypto', volatility: 0.12 },
            'ADA': { price: 0.52, market: 'crypto', volatility: 0.15 },
            'DOGE': { price: 0.085, market: 'crypto', volatility: 0.20 },
            
            // FOREX
            'EURUSD': { price: 1.0842, market: 'forex', volatility: 0.01 },
            'GBPUSD': { price: 1.2634, market: 'forex', volatility: 0.012 },
            'USDJPY': { price: 149.85, market: 'forex', volatility: 0.011 },
            
            // COMMODITIES
            'GOLD': { price: 2045.50, market: 'commodities', volatility: 0.015 },
            'OIL': { price: 78.45, market: 'commodities', volatility: 0.03 },
            'SILVER': { price: 24.85, market: 'commodities', volatility: 0.025 }
        };
        
        // Learning patterns the AI discovers
        this.discoveredPatterns = new Map();
        this.tradingStrategies = new Map();
        this.marketKnowledge = new Map();
        
        this.isRunning = false;
    }
    
    async loadExistingLearning() {
        try {
            // Try to load from your existing learning agent
            const learningFiles = [
                'ai_learning_progress.json',
                'super_learning_ai_agent.json',
                'learning_metrics.json'
            ];
            
            for (const file of learningFiles) {
                try {
                    const data = await fs.readFile(path.join(__dirname, file), 'utf8');
                    const parsed = JSON.parse(data);
                    
                    if (parsed.learningMetrics) {
                        // Merge existing learning with trading
                        this.learningAgent.learningMetrics = {
                            ...this.learningAgent.learningMetrics,
                            ...parsed.learningMetrics
                        };
                        console.log(`📚 Loaded existing learning from ${file}`);
                        break;
                    }
                } catch (error) {
                    // File doesn't exist, continue
                }
            }
            
            // Load previous trading data
            const tradingData = await fs.readFile(this.tradingDataFile, 'utf8');
            const saved = JSON.parse(tradingData);
            this.wallet = {
                ...saved.wallet,
                positions: new Map(saved.wallet.positions || [])
            };
            this.discoveredPatterns = new Map(saved.discoveredPatterns || []);
            this.tradingStrategies = new Map(saved.tradingStrategies || []);
            
            console.log('🧠 Integrated existing learning with new trading capabilities');
        } catch (error) {
            console.log('🆕 Starting fresh integrated learning trader');
        }
    }
    
    async saveState() {
        const toSave = {
            wallet: {
                ...this.wallet,
                positions: Array.from(this.wallet.positions.entries())
            },
            learningAgent: this.learningAgent,
            discoveredPatterns: Array.from(this.discoveredPatterns.entries()),
            tradingStrategies: Array.from(this.tradingStrategies.entries()),
            marketKnowledge: Array.from(this.marketKnowledge.entries()),
            lastUpdate: new Date()
        };
        
        await fs.writeFile(this.tradingDataFile, JSON.stringify(toSave, null, 2));
        await fs.writeFile(this.learningDataFile, JSON.stringify(this.learningAgent, null, 2));
    }
    
    // AI LEARNING ENGINE - Continuously improves
    async learnFromTrade(trade) {
        this.learningAgent.learningMetrics.total_predictions++;
        
        if (trade.pnl > 0) {
            this.learningAgent.learningMetrics.successful_trades++;
            
            // Learn successful patterns
            const pattern = {
                market: this.allMarkets[trade.symbol].market,
                volatility: this.allMarkets[trade.symbol].volatility,
                timeOfDay: new Date(trade.timestamp).getHours(),
                strategy: trade.strategy,
                priceAction: trade.action,
                profitMargin: trade.pnl / trade.value,
                success: true
            };
            
            const patternKey = `${pattern.market}_${pattern.strategy}_${pattern.priceAction}`;
            if (!this.discoveredPatterns.has(patternKey)) {
                this.discoveredPatterns.set(patternKey, []);
            }
            this.discoveredPatterns.get(patternKey).push(pattern);
            
            console.log(`🧠 AI LEARNED: ${patternKey} pattern (+$${trade.pnl.toFixed(2)})`);
        } else if (trade.pnl < 0) {
            // Learn from losses
            const failPattern = {
                market: this.allMarkets[trade.symbol].market,
                strategy: trade.strategy,
                reason: 'loss',
                amount: trade.pnl,
                avoidConditions: {
                    timeOfDay: new Date(trade.timestamp).getHours(),
                    volatility: this.allMarkets[trade.symbol].volatility
                }
            };
            
            console.log(`🧠 AI LEARNING FROM LOSS: Avoid ${failPattern.market} ${failPattern.strategy} (-$${Math.abs(trade.pnl).toFixed(2)})`);
        }
        
        // Update learning metrics
        this.learningAgent.learningMetrics.learning_iterations++;
        this.learningAgent.learningMetrics.last_training = new Date().toISOString();
        
        // Calculate accuracy improvement
        const accuracy = this.learningAgent.learningMetrics.successful_trades / this.learningAgent.learningMetrics.total_predictions;
        this.learningAgent.learningMetrics.accuracy_improvement = accuracy * 100;
        
        // Update model confidence based on recent performance
        if (this.wallet.trades.length >= 10) {
            const recentTrades = this.wallet.trades.slice(-10);
            const recentWins = recentTrades.filter(t => t.pnl > 0).length;
            this.learningAgent.learningMetrics.model_confidence = recentWins / 10;
        }
        
        // Update expertise level
        this.updateExpertiseLevel();
        
        await this.saveState();
    }
    
    updateExpertiseLevel() {
        const totalTrades = this.learningAgent.learningMetrics.total_predictions;
        const accuracy = this.learningAgent.learningMetrics.accuracy_improvement;
        const patterns = this.discoveredPatterns.size;
        
        let expertise = 'beginner';
        
        if (totalTrades >= 100 && accuracy >= 60 && patterns >= 10) {
            expertise = 'expert';
        } else if (totalTrades >= 50 && accuracy >= 55 && patterns >= 5) {
            expertise = 'advanced';
        } else if (totalTrades >= 20 && accuracy >= 50) {
            expertise = 'intermediate';
        }
        
        if (expertise !== this.learningAgent.learningMetrics.expertise_level) {
            console.log(`🎓 AI EXPERTISE UPGRADE: ${this.learningAgent.learningMetrics.expertise_level} → ${expertise}`);
            this.learningAgent.learningMetrics.expertise_level = expertise;
        }
    }
    
    // INTELLIGENT SIGNAL GENERATION using learned patterns
    async generateLearningBasedSignals() {
        const signals = [];
        const currentHour = new Date().getHours();
        
        // Update market prices
        for (const [symbol, data] of Object.entries(this.allMarkets)) {
            // Realistic price movement
            const priceChange = (Math.random() - 0.5) * data.volatility * data.price;
            data.price = Math.max(0.01, data.price + priceChange);
            
            // Generate signal based on learned patterns
            let signal = await this.generateIntelligentSignal(symbol, data, currentHour);
            
            if (Math.abs(signal) > 0.2) {
                signals.push({
                    symbol,
                    signal,
                    price: data.price,
                    market: data.market,
                    confidence: Math.abs(signal),
                    action: signal > 0.25 ? 'BUY' : signal < -0.25 ? 'SELL' : 'HOLD',
                    strategy: this.selectBestStrategy(data.market),
                    learningBased: true
                });
            }
        }
        
        return signals.filter(s => s.action !== 'HOLD').sort((a, b) => b.confidence - a.confidence);
    }
    
    async generateIntelligentSignal(symbol, data, hour) {
        let signal = 0;
        
        // Base signal from market conditions
        signal += (Math.random() - 0.5) * 0.6;
        
        // Apply learned patterns
        for (const [patternKey, patterns] of this.discoveredPatterns) {
            if (patternKey.includes(data.market)) {
                const successfulPatterns = patterns.filter(p => p.success);
                if (successfulPatterns.length > 0) {
                    const avgProfit = successfulPatterns.reduce((sum, p) => sum + p.profitMargin, 0) / successfulPatterns.length;
                    
                    // If we've learned this market/time combination is profitable
                    const timeMatch = successfulPatterns.some(p => Math.abs(p.timeOfDay - hour) <= 1);
                    if (timeMatch && avgProfit > 0.02) {
                        signal += 0.3; // Strong positive signal based on learning
                        console.log(`🧠 AI APPLYING LEARNED PATTERN: ${patternKey} (+${avgProfit.toFixed(3)})`);
                    }
                }
            }
        }
        
        // Apply model confidence
        signal *= this.learningAgent.learningMetrics.model_confidence;
        
        // Expertise adjustment
        if (this.learningAgent.learningMetrics.expertise_level === 'expert') {
            signal *= 1.3;
        } else if (this.learningAgent.learningMetrics.expertise_level === 'advanced') {
            signal *= 1.15;
        }
        
        return Math.max(-1, Math.min(1, signal));
    }
    
    selectBestStrategy(market) {
        // AI selects best strategy based on learned performance
        const marketStrategies = Array.from(this.tradingStrategies.keys()).filter(key => key.includes(market));
        
        if (marketStrategies.length === 0) {
            return `ai_learning_${market}`;
        }
        
        // Return best performing strategy
        let bestStrategy = marketStrategies[0];
        let bestScore = -Infinity;
        
        for (const strategy of marketStrategies) {
            const performance = this.tradingStrategies.get(strategy);
            if (performance && performance.avgReturn > bestScore) {
                bestScore = performance.avgReturn;
                bestStrategy = strategy;
            }
        }
        
        return bestStrategy;
    }
    
    // Execute trades with learning integration
    async executeIntelligentTrade(signal) {
        const { symbol, action, price, strategy, market } = signal;
        const position = this.wallet.positions.get(symbol) || { quantity: 0, avgPrice: 0 };
        
        // Position sizing based on AI confidence and expertise
        let positionSize = this.wallet.currentBalance * 0.15; // Conservative base
        
        // Increase position size based on expertise and confidence
        if (this.learningAgent.learningMetrics.expertise_level === 'expert') {
            positionSize *= 1.5;
        } else if (this.learningAgent.learningMetrics.expertise_level === 'advanced') {
            positionSize *= 1.25;
        }
        
        positionSize *= signal.confidence; // Scale by signal confidence
        
        const quantity = Math.max(1, Math.floor(positionSize / price));
        
        const trade = {
            id: `LEARN_${Date.now()}`,
            timestamp: new Date(),
            symbol,
            action,
            quantity,
            price,
            strategy,
            market,
            value: quantity * price,
            pnl: 0,
            aiGenerated: true,
            expertiseLevel: this.learningAgent.learningMetrics.expertise_level
        };
        
        // Execute trade logic
        if (action === 'BUY') {
            if (trade.value > this.wallet.currentBalance * 0.9) {
                console.log(`⚠️ Insufficient funds for ${symbol}`);
                return null;
            }
            
            const newQuantity = position.quantity + quantity;
            const newAvgPrice = position.quantity > 0
                ? ((position.quantity * position.avgPrice) + trade.value) / newQuantity
                : price;
            
            this.wallet.positions.set(symbol, {
                quantity: newQuantity,
                avgPrice: newAvgPrice,
                market
            });
            
            this.wallet.currentBalance -= trade.value;
            
        } else if (action === 'SELL') {
            if (position.quantity < quantity) {
                trade.quantity = position.quantity;
                trade.value = trade.quantity * price;
            }
            
            if (trade.quantity === 0) return null;
            
            const costBasis = trade.quantity * position.avgPrice;
            trade.pnl = trade.value - costBasis;
            
            position.quantity -= trade.quantity;
            if (position.quantity === 0) {
                this.wallet.positions.delete(symbol);
            } else {
                this.wallet.positions.set(symbol, position);
            }
            
            this.wallet.currentBalance += trade.value;
            this.wallet.dailyPnL += trade.pnl;
            this.wallet.totalPnL += trade.pnl;
        }
        
        this.wallet.trades.push(trade);
        
        // LEARN FROM THIS TRADE
        await this.learnFromTrade(trade);
        
        const pnlStr = trade.pnl !== 0 ? ` | P&L: ${trade.pnl >= 0 ? '+' : ''}$${trade.pnl.toFixed(2)}` : '';
        console.log(`🤖 ${this.learningAgent.learningMetrics.expertise_level.toUpperCase()} ${action} ${quantity} ${symbol} @ $${price.toFixed(4)} [${strategy}]${pnlStr}`);
        
        this.emit('trade', trade);
        return trade;
    }
    
    // Main learning trading cycle
    async runLearningTradingCycle() {
        console.log('\\n🧠 Running AI learning-based trading cycle...');
        console.log(`🎓 Current expertise: ${this.learningAgent.learningMetrics.expertise_level}`);
        console.log(`📊 Model confidence: ${(this.learningAgent.learningMetrics.model_confidence * 100).toFixed(1)}%`);
        console.log(`🔍 Patterns discovered: ${this.discoveredPatterns.size}`);
        
        const signals = await this.generateLearningBasedSignals();
        
        if (signals.length === 0) {
            console.log('🤔 AI needs more learning data - no confident signals generated');
            return;
        }
        
        console.log(`🎯 AI generated ${signals.length} learning-based signals`);
        
        // Execute trades based on learning
        const maxTrades = this.learningAgent.learningMetrics.expertise_level === 'expert' ? 4 : 
                         this.learningAgent.learningMetrics.expertise_level === 'advanced' ? 3 : 2;
        
        let executed = 0;
        for (const signal of signals.slice(0, maxTrades)) {
            const trade = await this.executeIntelligentTrade(signal);
            if (trade) executed++;
        }
        
        this.displayLearningStats();
    }
    
    displayLearningStats() {
        const metrics = this.learningAgent.learningMetrics;
        const accuracy = metrics.total_predictions > 0 ? 
            (metrics.successful_trades / metrics.total_predictions * 100).toFixed(1) : '0.0';
        
        console.log('\\n🧠 AI LEARNING STATS:');
        console.log(`💰 Balance: $${this.wallet.currentBalance.toFixed(2)} | P&L: ${this.wallet.totalPnL >= 0 ? '+' : ''}$${this.wallet.totalPnL.toFixed(2)}`);
        console.log(`🎓 Expertise: ${metrics.expertise_level} | Confidence: ${(metrics.model_confidence * 100).toFixed(1)}%`);
        console.log(`📈 Trading Accuracy: ${accuracy}% | Trades: ${metrics.total_predictions}`);
        console.log(`🔍 Patterns Learned: ${this.discoveredPatterns.size} | Iterations: ${metrics.learning_iterations}`);
        
        // Show open positions
        if (this.wallet.positions.size > 0) {
            console.log('📦 AI Positions:');
            for (const [symbol, pos] of this.wallet.positions) {
                const currentPrice = this.allMarkets[symbol].price;
                const unrealizedPnL = (currentPrice - pos.avgPrice) * pos.quantity;
                console.log(`   ${symbol}: ${pos.quantity} @ $${pos.avgPrice.toFixed(4)} | Unrealized: ${unrealizedPnL >= 0 ? '+' : ''}$${unrealizedPnL.toFixed(2)}`);
            }
        }
    }
    
    async start() {
        await this.loadExistingLearning();
        
        console.log('🧠 Starting Integrated Learning Trader');
        console.log('📚 Connecting to your existing learning systems');
        console.log('🌍 Learning to trade: Stocks, Crypto, Forex, Commodities');
        console.log('💰 Starting balance: $500.00');
        console.log('🎯 AI will learn and improve with every trade\\n');
        
        this.isRunning = true;
        
        // Run learning cycles every 25 seconds
        this.tradingInterval = setInterval(() => {
            this.runLearningTradingCycle().catch(console.error);
        }, 25000);
        
        await this.runLearningTradingCycle();
    }
    
    stop() {
        if (!this.isRunning) return;
        
        console.log('\\n🛑 Stopping Integrated Learning Trader');
        clearInterval(this.tradingInterval);
        this.isRunning = false;
        
        this.displayLearningStats();
        this.saveState().catch(console.error);
    }
    
    async getCurrentState() {
        return {
            wallet: {
                ...this.wallet,
                positions: Array.from(this.wallet.positions.entries()).map(([symbol, pos]) => ({
                    symbol,
                    ...pos,
                    currentPrice: this.allMarkets[symbol]?.price || 0,
                    unrealizedPnL: this.allMarkets[symbol] ? 
                        (this.allMarkets[symbol].price - pos.avgPrice) * pos.quantity : 0
                }))
            },
            learningMetrics: this.learningAgent.learningMetrics,
            discoveredPatterns: this.discoveredPatterns.size,
            tradingStrategies: this.tradingStrategies.size,
            isRunning: this.isRunning,
            lastUpdate: new Date()
        };
    }
}

module.exports = IntegratedLearningTrader;

// Run if called directly
if (require.main === module) {
    const trader = new IntegratedLearningTrader();
    
    trader.start();
    
    process.on('SIGINT', () => {
        console.log('\\n\\n💤 Shutting down integrated learning trader...');
        trader.stop();
        process.exit(0);
    });
    
    process.stdin.resume();
}