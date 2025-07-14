const fs = require('fs').promises;
const path = require('path');

class TradingMonitor {
    constructor() {
        this.resultsFile = path.join(__dirname, 'trading_results.json');
        this.paperWallet = {
            startingBalance: 100000,
            currentBalance: 100000,
            positions: new Map(),
            trades: [],
            dailyPnL: 0,
            totalPnL: 0,
            startOfDay: new Date().setHours(0,0,0,0)
        };
    }
    
    async loadState() {
        try {
            const data = await fs.readFile(this.resultsFile, 'utf8');
            const saved = JSON.parse(data);
            this.paperWallet = {
                ...saved,
                positions: new Map(saved.positions || [])
            };
        } catch (error) {
            // No saved state, use defaults
            console.log('📊 Starting fresh paper trading wallet with $100,000');
        }
    }
    
    async saveState() {
        const toSave = {
            ...this.paperWallet,
            positions: Array.from(this.paperWallet.positions.entries())
        };
        await fs.writeFile(this.resultsFile, JSON.stringify(toSave, null, 2));
    }
    
    async executeTrade(symbol, side, quantity, price) {
        const trade = {
            id: `TRADE_${Date.now()}`,
            time: new Date(),
            symbol,
            side,
            quantity,
            price,
            value: quantity * price,
            pnl: 0
        };
        
        if (side === 'BUY') {
            // Calculate cost
            const cost = quantity * price;
            
            // Update position
            const currentPosition = this.paperWallet.positions.get(symbol) || { quantity: 0, avgPrice: 0 };
            const newQuantity = currentPosition.quantity + quantity;
            const newAvgPrice = ((currentPosition.quantity * currentPosition.avgPrice) + cost) / newQuantity;
            
            this.paperWallet.positions.set(symbol, {
                quantity: newQuantity,
                avgPrice: newAvgPrice
            });
            
            // Deduct from cash balance (simplified - in reality would need margin calculations)
            this.paperWallet.currentBalance -= cost;
            
        } else if (side === 'SELL') {
            const position = this.paperWallet.positions.get(symbol);
            
            if (position && position.quantity >= quantity) {
                // Calculate P&L
                const proceeds = quantity * price;
                const cost = quantity * position.avgPrice;
                trade.pnl = proceeds - cost;
                
                // Update position
                position.quantity -= quantity;
                if (position.quantity === 0) {
                    this.paperWallet.positions.delete(symbol);
                } else {
                    this.paperWallet.positions.set(symbol, position);
                }
                
                // Add proceeds to balance
                this.paperWallet.currentBalance += proceeds;
                
                // Update P&L
                this.paperWallet.dailyPnL += trade.pnl;
                this.paperWallet.totalPnL += trade.pnl;
            } else {
                console.log(`❌ Insufficient position in ${symbol} for sell order`);
                return null;
            }
        }
        
        // Record trade
        this.paperWallet.trades.push(trade);
        
        // Save state
        await this.saveState();
        
        console.log(`✅ ${side} ${quantity} ${symbol} @ $${price} | P&L: $${trade.pnl.toFixed(2)}`);
        console.log(`💰 Balance: $${this.paperWallet.currentBalance.toFixed(2)} | Daily P&L: $${this.paperWallet.dailyPnL.toFixed(2)}`);
        
        return trade;
    }
    
    async getResults() {
        await this.loadState();
        
        const wins = this.paperWallet.trades.filter(t => t.pnl > 0).length;
        const totalTrades = this.paperWallet.trades.length;
        const winRate = totalTrades > 0 ? (wins / totalTrades) * 100 : 0;
        
        // Calculate today's trades
        const todayStart = new Date().setHours(0,0,0,0);
        const todayTrades = this.paperWallet.trades.filter(t => 
            new Date(t.time) >= todayStart
        );
        
        return {
            startingBalance: this.paperWallet.startingBalance,
            currentBalance: this.paperWallet.currentBalance,
            trades: todayTrades.slice(-10), // Last 10 trades
            dailyPnL: this.paperWallet.dailyPnL,
            totalPnL: this.paperWallet.totalPnL,
            winRate: winRate,
            totalTrades: todayTrades.length,
            positions: Array.from(this.paperWallet.positions.entries()).map(([symbol, pos]) => ({
                symbol,
                quantity: pos.quantity,
                avgPrice: pos.avgPrice,
                currentValue: pos.quantity * pos.avgPrice // Simplified - would need current market price
            })),
            lastUpdate: new Date()
        };
    }
    
    // Simulate receiving trading signals and executing them
    async simulateTradingActivity() {
        // Common stocks for paper trading
        const symbols = ['AAPL', 'MSFT', 'GOOGL', 'AMZN', 'TSLA', 'NVDA', 'META', 'JPM', 'V', 'WMT'];
        const basePrice = {
            'AAPL': 185.50,
            'MSFT': 425.30,
            'GOOGL': 155.75,
            'AMZN': 175.20,
            'TSLA': 245.80,
            'NVDA': 875.25,
            'META': 485.90,
            'JPM': 195.40,
            'V': 275.60,
            'WMT': 165.30
        };
        
        // Simulate a trading decision
        const symbol = symbols[Math.floor(Math.random() * symbols.length)];
        const side = Math.random() > 0.5 ? 'BUY' : 'SELL';
        const quantity = Math.floor(Math.random() * 50) + 10;
        const priceVariation = (Math.random() - 0.5) * 2; // +/- $1
        const price = basePrice[symbol] + priceVariation;
        
        // Only sell if we have a position
        if (side === 'SELL') {
            const position = this.paperWallet.positions.get(symbol);
            if (!position || position.quantity === 0) {
                // Try to find a stock we do have
                for (const [sym, pos] of this.paperWallet.positions) {
                    if (pos.quantity > 0) {
                        await this.executeTrade(sym, 'SELL', Math.min(quantity, pos.quantity), basePrice[sym] + priceVariation);
                        return;
                    }
                }
                // If no positions, buy instead
                await this.executeTrade(symbol, 'BUY', quantity, price);
                return;
            }
        }
        
        await this.executeTrade(symbol, side, quantity, price);
    }
}

// Export for use by other modules
module.exports = TradingMonitor;

// If run directly, simulate some trading
if (require.main === module) {
    const monitor = new TradingMonitor();
    
    console.log('📈 Starting Trading Monitor...');
    
    // Simulate initial trades
    (async () => {
        await monitor.loadState();
        
        // Execute a few trades
        console.log('\n🤖 Simulating paper trades...\n');
        
        await monitor.executeTrade('AAPL', 'BUY', 100, 185.50);
        await new Promise(r => setTimeout(r, 1000));
        
        await monitor.executeTrade('TSLA', 'BUY', 50, 245.80);
        await new Promise(r => setTimeout(r, 1000));
        
        await monitor.executeTrade('AAPL', 'SELL', 50, 186.25);
        await new Promise(r => setTimeout(r, 1000));
        
        await monitor.executeTrade('NVDA', 'BUY', 25, 875.00);
        
        console.log('\n📊 Current Results:');
        const results = await monitor.getResults();
        console.log(results);
    })();
}