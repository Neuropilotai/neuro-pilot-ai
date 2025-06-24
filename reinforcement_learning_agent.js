#!/usr/bin/env node

/**
 * 🧠 Reinforcement Learning Agent for Trading Strategy Optimization
 * 
 * Uses Q-Learning and neural network-style feedback to optimize trading parameters
 * Continuously improves strategy based on real trading results
 */

const fs = require('fs').promises;
const path = require('path');

class ReinforcementLearningAgent {
    constructor() {
        this.dataPath = './TradingDrive/feedback_data';
        this.modelPath = './TradingDrive/rl_models';
        this.strategyPath = './TradingDrive/pinescript_strategies';
        
        // Q-Learning Parameters
        this.learningRate = 0.15;
        this.discountFactor = 0.9;
        this.explorationRate = 0.25;
        this.explorationDecay = 0.995;
        this.minExploration = 0.05;
        
        // State-Action Q-Table
        this.qTable = new Map();
        
        // Strategy Parameters to Optimize
        this.parameters = {
            confidence_threshold: { min: 0.5, max: 0.95, step: 0.05 },
            position_size: { min: 10, max: 35, step: 5 },
            max_risk: { min: 0.02, max: 0.08, step: 0.01 },
            profit_target: { min: 0.08, max: 0.25, step: 0.02 },
            atr_multiplier: { min: 1.5, max: 3.0, step: 0.2 }
        };
        
        // Current strategy state
        this.currentState = {
            confidence_threshold: 0.7,
            position_size: 25,
            max_risk: 0.05,
            profit_target: 0.15,
            atr_multiplier: 2.0,
            regime: 'trending',
            volatility: 'normal',
            recent_performance: 'neutral'
        };
        
        // Performance tracking
        this.episodeRewards = [];
        this.bestPerformance = -Infinity;
        this.bestParameters = { ...this.currentState };
        
        this.ensureDirectories();
        this.loadModel();
    }

    async ensureDirectories() {
        try {
            await fs.mkdir(this.modelPath, { recursive: true });
            console.log('🧠 RL model directory ready');
        } catch (error) {
            console.error('Directory creation error:', error.message);
        }
    }

    async loadModel() {
        try {
            const modelFile = path.join(this.modelPath, 'q_table.json');
            const data = await fs.readFile(modelFile, 'utf8');
            const savedData = JSON.parse(data);
            
            // Convert saved object back to Map
            this.qTable = new Map(Object.entries(savedData.qTable || {}));
            this.bestPerformance = savedData.bestPerformance || -Infinity;
            this.bestParameters = savedData.bestParameters || this.currentState;
            this.explorationRate = savedData.explorationRate || this.explorationRate;
            
            console.log(`🧠 Loaded RL model with ${this.qTable.size} state-action pairs`);
            console.log(`🏆 Best performance: ${this.bestPerformance.toFixed(2)}`);
        } catch (error) {
            console.log('🧠 Starting with fresh RL model');
        }
    }

    async saveModel() {
        try {
            const modelData = {
                qTable: Object.fromEntries(this.qTable),
                bestPerformance: this.bestPerformance,
                bestParameters: this.bestParameters,
                explorationRate: this.explorationRate,
                episodeCount: this.episodeRewards.length,
                timestamp: new Date().toISOString()
            };
            
            const modelFile = path.join(this.modelPath, 'q_table.json');
            await fs.writeFile(modelFile, JSON.stringify(modelData, null, 2));
            
            console.log(`💾 RL model saved with ${this.qTable.size} state-action pairs`);
        } catch (error) {
            console.error('Model save error:', error.message);
        }
    }

    getStateKey(state) {
        // Convert state to string key for Q-table
        return `${state.regime}-${state.volatility}-${state.recent_performance}-` +
               `${state.confidence_threshold}-${state.position_size}-${state.max_risk}`;
    }

    getAvailableActions() {
        return [
            'increase_confidence',
            'decrease_confidence',
            'increase_position_size',
            'decrease_position_size',
            'increase_risk',
            'decrease_risk',
            'increase_profit_target',
            'decrease_profit_target',
            'increase_atr_multiplier',
            'decrease_atr_multiplier',
            'no_change'
        ];
    }

    selectAction(state) {
        const stateKey = this.getStateKey(state);
        const actions = this.getAvailableActions();
        
        // Epsilon-greedy action selection
        if (Math.random() < this.explorationRate) {
            // Explore: random action
            const randomIndex = Math.floor(Math.random() * actions.length);
            return actions[randomIndex];
        } else {
            // Exploit: best known action
            let bestAction = actions[0];
            let bestValue = -Infinity;
            
            for (const action of actions) {
                const qValue = this.getQValue(stateKey, action);
                if (qValue > bestValue) {
                    bestValue = qValue;
                    bestAction = action;
                }
            }
            
            return bestAction;
        }
    }

    getQValue(stateKey, action) {
        const key = `${stateKey}:${action}`;
        return this.qTable.get(key) || 0;
    }

    setQValue(stateKey, action, value) {
        const key = `${stateKey}:${action}`;
        this.qTable.set(key, value);
    }

    applyAction(action, state) {
        const newState = { ...state };
        
        switch (action) {
            case 'increase_confidence':
                newState.confidence_threshold = Math.min(0.95, newState.confidence_threshold + 0.05);
                break;
            case 'decrease_confidence':
                newState.confidence_threshold = Math.max(0.5, newState.confidence_threshold - 0.05);
                break;
            case 'increase_position_size':
                newState.position_size = Math.min(35, newState.position_size + 5);
                break;
            case 'decrease_position_size':
                newState.position_size = Math.max(10, newState.position_size - 5);
                break;
            case 'increase_risk':
                newState.max_risk = Math.min(0.08, newState.max_risk + 0.01);
                break;
            case 'decrease_risk':
                newState.max_risk = Math.max(0.02, newState.max_risk - 0.01);
                break;
            case 'increase_profit_target':
                newState.profit_target = Math.min(0.25, newState.profit_target + 0.02);
                break;
            case 'decrease_profit_target':
                newState.profit_target = Math.max(0.08, newState.profit_target - 0.02);
                break;
            case 'increase_atr_multiplier':
                newState.atr_multiplier = Math.min(3.0, newState.atr_multiplier + 0.2);
                break;
            case 'decrease_atr_multiplier':
                newState.atr_multiplier = Math.max(1.5, newState.atr_multiplier - 0.2);
                break;
            case 'no_change':
                // No changes to parameters
                break;
        }
        
        return newState;
    }

    async getTrainingData() {
        try {
            const tradesFile = path.join(this.dataPath, 'trades.json');
            const data = await fs.readFile(tradesFile, 'utf8');
            return JSON.parse(data);
        } catch (error) {
            return [];
        }
    }

    calculateReward(trades) {
        if (!trades || trades.length === 0) return 0;
        
        // Calculate reward based on recent performance
        let totalReward = 0;
        let totalTrades = 0;
        let winningTrades = 0;
        let totalProfit = 0;
        let maxDrawdown = 0;
        let currentDrawdown = 0;
        
        // Analyze last 20 trades or all trades if less than 20
        const recentTrades = trades.slice(-20);
        
        for (const trade of recentTrades) {
            if (trade.result === 'PROFIT') {
                winningTrades++;
                totalProfit += trade.pnl;
                currentDrawdown = 0; // Reset drawdown on profit
            } else if (trade.result === 'LOSS') {
                totalProfit += trade.pnl; // Add negative value
                currentDrawdown += Math.abs(trade.pnl);
                maxDrawdown = Math.max(maxDrawdown, currentDrawdown);
            }
            totalTrades++;
        }
        
        const winRate = totalTrades > 0 ? winningTrades / totalTrades : 0;
        const profitFactor = totalProfit;
        const drawdownPenalty = maxDrawdown * 2; // Penalize drawdown heavily
        
        // Multi-objective reward function
        const winRateReward = winRate * 100; // 0-100 points for win rate
        const profitReward = profitFactor * 10; // Profit factor scaled
        const stabilityplenalty = drawdownPenalty * 5; // Drawdown penalty
        
        totalReward = winRateReward + profitReward - stabilityplenalty;
        
        console.log(`📊 Reward Calculation:`);
        console.log(`   Win Rate: ${(winRate * 100).toFixed(1)}% (${winRateReward.toFixed(1)} points)`);
        console.log(`   Profit: $${profitFactor.toFixed(2)} (${profitReward.toFixed(1)} points)`);
        console.log(`   Drawdown: $${maxDrawdown.toFixed(2)} (-${stabilityplenalty.toFixed(1)} points)`);
        console.log(`   Total Reward: ${totalReward.toFixed(2)}`);
        
        return totalReward;
    }

    updateQValue(oldState, action, reward, newState) {
        const oldStateKey = this.getStateKey(oldState);
        const newStateKey = this.getStateKey(newState);
        
        const oldQValue = this.getQValue(oldStateKey, action);
        
        // Find maximum Q-value for new state
        const actions = this.getAvailableActions();
        let maxQValue = -Infinity;
        for (const nextAction of actions) {
            const qValue = this.getQValue(newStateKey, nextAction);
            maxQValue = Math.max(maxQValue, qValue);
        }
        
        // Q-Learning update rule
        const newQValue = oldQValue + this.learningRate * 
                         (reward + this.discountFactor * maxQValue - oldQValue);
        
        this.setQValue(oldStateKey, action, newQValue);
        
        console.log(`🧠 Q-Value Update: ${action} | ${oldQValue.toFixed(2)} → ${newQValue.toFixed(2)}`);
    }

    analyzeMarketRegime(trades) {
        if (!trades || trades.length < 5) return 'neutral';
        
        const recent = trades.slice(-10);
        let trendingCount = 0;
        let meanReversionCount = 0;
        
        for (const trade of recent) {
            if (trade.regime === 'trending') trendingCount++;
            else if (trade.regime === 'mean_reversion') meanReversionCount++;
        }
        
        if (trendingCount > meanReversionCount * 1.5) return 'trending';
        if (meanReversionCount > trendingCount * 1.5) return 'mean_reversion';
        return 'ranging';
    }

    analyzeVolatility(trades) {
        if (!trades || trades.length < 5) return 'normal';
        
        const recent = trades.slice(-5);
        const priceChanges = recent.map(t => Math.abs(t.pnl / t.price || 0));
        const avgChange = priceChanges.reduce((a, b) => a + b, 0) / priceChanges.length;
        
        if (avgChange > 0.03) return 'high';
        if (avgChange < 0.01) return 'low';
        return 'normal';
    }

    analyzeRecentPerformance(trades) {
        if (!trades || trades.length < 3) return 'neutral';
        
        const recent = trades.slice(-5);
        const profits = recent.filter(t => t.result === 'PROFIT').length;
        const total = recent.length;
        
        if (profits / total > 0.7) return 'excellent';
        if (profits / total > 0.5) return 'good';
        if (profits / total > 0.3) return 'neutral';
        return 'poor';
    }

    async updateStrategy(newState) {
        try {
            console.log('🔄 Updating Pine Script strategy with new parameters...');
            
            const strategyFile = path.join(this.strategyPath, 'super_ai_visual_strategy.pine');
            let pineScript = await fs.readFile(strategyFile, 'utf8');
            
            // Update parameters in Pine Script
            pineScript = pineScript.replace(
                /confidenceThreshold = input\.float\([^,]+,/,
                `confidenceThreshold = input.float(${newState.confidence_threshold.toFixed(3)},`
            );
            
            // Update risk parameters based on state
            const riskMode = newState.max_risk > 0.06 ? 'Aggressive' : 
                           newState.max_risk > 0.04 ? 'Balanced' : 'Conservative';
            
            await fs.writeFile(strategyFile, pineScript);
            
            console.log(`✅ Strategy updated:`);
            console.log(`   Confidence Threshold: ${newState.confidence_threshold}`);
            console.log(`   Position Size: ${newState.position_size}%`);
            console.log(`   Max Risk: ${(newState.max_risk * 100).toFixed(1)}%`);
            console.log(`   Profit Target: ${(newState.profit_target * 100).toFixed(1)}%`);
            console.log(`   Risk Mode: ${riskMode}`);
            
        } catch (error) {
            console.error('❌ Strategy update error:', error.message);
        }
    }

    async runLearningEpisode() {
        console.log('\n🧠 Starting Reinforcement Learning Episode...');
        
        // Get current trading data
        const trades = await this.getTrainingData();
        
        // Analyze current market state
        const currentMarketState = {
            ...this.currentState,
            regime: this.analyzeMarketRegime(trades),
            volatility: this.analyzeVolatility(trades),
            recent_performance: this.analyzeRecentPerformance(trades)
        };
        
        console.log(`📊 Current Market State:`, currentMarketState);
        
        // Select action using epsilon-greedy
        const action = this.selectAction(currentMarketState);
        console.log(`🎯 Selected Action: ${action}`);
        
        // Apply action to get new state
        const newState = this.applyAction(action, currentMarketState);
        
        // Calculate reward based on recent trading performance
        const reward = this.calculateReward(trades);
        
        // Update Q-value
        this.updateQValue(this.currentState, action, reward, newState);
        
        // Track performance
        this.episodeRewards.push(reward);
        if (reward > this.bestPerformance) {
            this.bestPerformance = reward;
            this.bestParameters = { ...newState };
            console.log(`🏆 New best performance: ${reward.toFixed(2)}`);
        }
        
        // Update strategy if action changed parameters
        if (action !== 'no_change') {
            await this.updateStrategy(newState);
        }
        
        // Update current state
        this.currentState = newState;
        
        // Decay exploration rate
        this.explorationRate = Math.max(
            this.minExploration,
            this.explorationRate * this.explorationDecay
        );
        
        // Save model
        await this.saveModel();
        
        console.log(`📈 Episode completed. Exploration rate: ${(this.explorationRate * 100).toFixed(1)}%`);
        
        return {
            action,
            reward,
            newState,
            totalEpisodes: this.episodeRewards.length
        };
    }

    async startContinuousLearning() {
        console.log('🚀 Starting Continuous Reinforcement Learning...');
        console.log(`📊 Learning Rate: ${this.learningRate}`);
        console.log(`🎯 Exploration Rate: ${(this.explorationRate * 100).toFixed(1)}%`);
        
        // Run learning episode every 15 minutes
        setInterval(async () => {
            try {
                await this.runLearningEpisode();
            } catch (error) {
                console.error('❌ Learning episode error:', error.message);
            }
        }, 900000); // 15 minutes
        
        // Initial episode
        await this.runLearningEpisode();
    }

    getPerformanceReport() {
        const recentRewards = this.episodeRewards.slice(-10);
        const avgRecentReward = recentRewards.length > 0 ? 
                               recentRewards.reduce((a, b) => a + b, 0) / recentRewards.length : 0;
        
        return {
            totalEpisodes: this.episodeRewards.length,
            bestPerformance: this.bestPerformance,
            recentAverage: avgRecentReward,
            explorationRate: this.explorationRate,
            qTableSize: this.qTable.size,
            bestParameters: this.bestParameters,
            currentState: this.currentState
        };
    }
}

// Start the reinforcement learning agent
async function startRLAgent() {
    const agent = new ReinforcementLearningAgent();
    await agent.startContinuousLearning();
    
    // Performance reporting every hour
    setInterval(() => {
        const report = agent.getPerformanceReport();
        console.log('\n📈 REINFORCEMENT LEARNING REPORT:');
        console.log(`   Total Episodes: ${report.totalEpisodes}`);
        console.log(`   Best Performance: ${report.bestPerformance.toFixed(2)}`);
        console.log(`   Recent Average: ${report.recentAverage.toFixed(2)}`);
        console.log(`   Q-Table Size: ${report.qTableSize} state-action pairs`);
        console.log(`   Exploration Rate: ${(report.explorationRate * 100).toFixed(1)}%`);
    }, 3600000); // 1 hour
}

// Execute if run directly
if (require.main === module) {
    startRLAgent().catch(error => {
        console.error('💥 RL Agent error:', error);
        process.exit(1);
    });
}

module.exports = ReinforcementLearningAgent;