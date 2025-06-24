#!/usr/bin/env node

/**
 * 🎯 Webhook Data Collector for TradingView Alerts
 * 
 * Collects AI Score, trade results, and performance data from PineScript alerts
 * Feeds data to reinforcement learning agent for strategy optimization
 */

const express = require('express');
const fs = require('fs').promises;
const path = require('path');

class WebhookDataCollector {
    constructor() {
        this.app = express();
        this.port = 3012;
        this.dataPath = './TradingDrive/feedback_data';
        this.tradesPath = path.join(this.dataPath, 'trades.json');
        this.performancePath = path.join(this.dataPath, 'performance.json');
        
        // Initialize Express middleware
        this.app.use(express.json());
        this.app.use(express.urlencoded({ extended: true }));
        
        // Performance tracking
        this.totalTrades = 0;
        this.winningTrades = 0;
        this.totalProfit = 0;
        this.maxDrawdown = 0;
        this.currentDrawdown = 0;
        this.equity = 500; // Starting with $500 challenge
        
        this.setupRoutes();
        this.ensureDirectories();
    }

    async ensureDirectories() {
        try {
            await fs.mkdir(this.dataPath, { recursive: true });
            console.log('📁 Feedback data directory ready');
        } catch (error) {
            console.error('Directory creation error:', error.message);
        }
    }

    setupRoutes() {
        // Main webhook endpoint for TradingView alerts
        this.app.post('/webhook/tradingview', async (req, res) => {
            try {
                await this.processTradeAlert(req.body);
                res.status(200).json({ status: 'success', message: 'Trade data received' });
            } catch (error) {
                console.error('❌ Webhook processing error:', error.message);
                res.status(500).json({ status: 'error', message: error.message });
            }
        });

        // Score updates from AI system
        this.app.post('/webhook/ai-score', async (req, res) => {
            try {
                await this.processScoreUpdate(req.body);
                res.status(200).json({ status: 'success', message: 'AI score updated' });
            } catch (error) {
                console.error('❌ AI score processing error:', error.message);
                res.status(500).json({ status: 'error', message: error.message });
            }
        });

        // Health check endpoint
        this.app.get('/health', (req, res) => {
            res.json({
                status: 'active',
                totalTrades: this.totalTrades,
                winRate: this.totalTrades > 0 ? (this.winningTrades / this.totalTrades * 100).toFixed(1) + '%' : '0%',
                equity: this.equity,
                maxDrawdown: (this.maxDrawdown * 100).toFixed(2) + '%'
            });
        });

        // Data retrieval endpoint for learning agent
        this.app.get('/api/training-data', async (req, res) => {
            try {
                const trades = await this.getTradeData();
                const performance = await this.getPerformanceData();
                res.json({ trades, performance });
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });
    }

    async processTradeAlert(alertData) {
        console.log('🚨 Trade Alert Received:', alertData);
        
        // Parse TradingView alert data
        const tradeData = {
            timestamp: new Date().toISOString(),
            symbol: alertData.symbol || 'UNKNOWN',
            action: alertData.action || 'UNKNOWN', // 'BUY', 'SELL', 'CLOSE'
            price: parseFloat(alertData.price) || 0,
            aiScore: parseFloat(alertData.ai_score) || 0,
            confidence: parseFloat(alertData.confidence) || 0,
            regime: alertData.regime || 'UNKNOWN',
            riskMode: alertData.risk_mode || 'UNKNOWN',
            quantity: parseFloat(alertData.quantity) || 0,
            result: alertData.result || 'PENDING', // 'PROFIT', 'LOSS', 'PENDING'
            pnl: parseFloat(alertData.pnl) || 0
        };

        // Update performance metrics
        if (tradeData.result !== 'PENDING') {
            this.updatePerformanceMetrics(tradeData);
        }

        // Save trade data
        await this.saveTradeData(tradeData);
        
        // Calculate feedback metrics
        const feedback = this.calculateFeedback(tradeData);
        
        console.log(`💰 Trade processed: ${tradeData.action} ${tradeData.symbol} @ $${tradeData.price}`);
        console.log(`🧠 AI Score: ${tradeData.aiScore}, Confidence: ${(tradeData.confidence * 100).toFixed(1)}%`);
        console.log(`📊 Feedback Score: ${feedback.score.toFixed(2)}`);
        
        return feedback;
    }

    async processScoreUpdate(scoreData) {
        console.log('🧠 AI Score Update:', scoreData);
        
        const update = {
            timestamp: new Date().toISOString(),
            aiScore: parseFloat(scoreData.ai_score) || 0,
            confidence: parseFloat(scoreData.confidence) || 0,
            regime: scoreData.regime || 'UNKNOWN',
            accuracy: parseFloat(scoreData.accuracy) || 0,
            dataPoints: parseInt(scoreData.data_points) || 0
        };

        await this.saveScoreUpdate(update);
        return update;
    }

    updatePerformanceMetrics(tradeData) {
        this.totalTrades++;
        
        if (tradeData.pnl > 0) {
            this.winningTrades++;
            this.totalProfit += tradeData.pnl;
            this.equity += tradeData.pnl;
            
            // Reset drawdown if profitable
            this.currentDrawdown = 0;
        } else if (tradeData.pnl < 0) {
            this.totalProfit += tradeData.pnl; // Add negative value
            this.equity += tradeData.pnl;
            
            // Update drawdown
            this.currentDrawdown += Math.abs(tradeData.pnl);
            const drawdownPercent = this.currentDrawdown / this.equity;
            if (drawdownPercent > this.maxDrawdown) {
                this.maxDrawdown = drawdownPercent;
            }
        }
    }

    calculateFeedback(tradeData) {
        // Reinforcement Learning Feedback Calculation
        let reward = 0;
        let penalty = 0;
        
        if (tradeData.result === 'PROFIT') {
            // Reward = profit × confidence × ai_score_factor
            const scoreMultiplier = Math.abs(tradeData.aiScore) / 100;
            reward = tradeData.pnl * tradeData.confidence * (1 + scoreMultiplier);
        } else if (tradeData.result === 'LOSS') {
            // Penalty = loss × (1 - confidence) × risk_factor
            const riskMultiplier = tradeData.riskMode === 'Aggressive' ? 1.5 : 
                                 tradeData.riskMode === 'Balanced' ? 1.2 : 1.0;
            penalty = Math.abs(tradeData.pnl) * (1 - tradeData.confidence) * riskMultiplier;
        }
        
        const netScore = reward - penalty;
        
        return {
            reward,
            penalty,
            score: netScore,
            confidence: tradeData.confidence,
            aiScore: tradeData.aiScore,
            regime: tradeData.regime,
            timestamp: tradeData.timestamp
        };
    }

    async saveTradeData(tradeData) {
        try {
            let trades = [];
            try {
                const data = await fs.readFile(this.tradesPath, 'utf8');
                trades = JSON.parse(data);
            } catch (error) {
                // File doesn't exist yet, start with empty array
            }
            
            trades.push(tradeData);
            
            // Keep only last 1000 trades
            if (trades.length > 1000) {
                trades = trades.slice(-1000);
            }
            
            await fs.writeFile(this.tradesPath, JSON.stringify(trades, null, 2));
        } catch (error) {
            console.error('Trade data save error:', error.message);
        }
    }

    async saveScoreUpdate(update) {
        try {
            const scoreUpdatePath = path.join(this.dataPath, 'score_updates.json');
            let updates = [];
            
            try {
                const data = await fs.readFile(scoreUpdatePath, 'utf8');
                updates = JSON.parse(data);
            } catch (error) {
                // File doesn't exist yet
            }
            
            updates.push(update);
            
            // Keep only last 500 score updates
            if (updates.length > 500) {
                updates = updates.slice(-500);
            }
            
            await fs.writeFile(scoreUpdatePath, JSON.stringify(updates, null, 2));
        } catch (error) {
            console.error('Score update save error:', error.message);
        }
    }

    async getTradeData() {
        try {
            const data = await fs.readFile(this.tradesPath, 'utf8');
            return JSON.parse(data);
        } catch (error) {
            return [];
        }
    }

    async getPerformanceData() {
        return {
            totalTrades: this.totalTrades,
            winningTrades: this.winningTrades,
            winRate: this.totalTrades > 0 ? this.winningTrades / this.totalTrades : 0,
            totalProfit: this.totalProfit,
            equity: this.equity,
            maxDrawdown: this.maxDrawdown,
            currentDrawdown: this.currentDrawdown
        };
    }

    async savePerformanceSnapshot() {
        try {
            const performance = await this.getPerformanceData();
            performance.timestamp = new Date().toISOString();
            
            let snapshots = [];
            try {
                const data = await fs.readFile(this.performancePath, 'utf8');
                snapshots = JSON.parse(data);
            } catch (error) {
                // File doesn't exist yet
            }
            
            snapshots.push(performance);
            
            // Keep only last 100 snapshots
            if (snapshots.length > 100) {
                snapshots = snapshots.slice(-100);
            }
            
            await fs.writeFile(this.performancePath, JSON.stringify(snapshots, null, 2));
        } catch (error) {
            console.error('Performance snapshot save error:', error.message);
        }
    }

    startServer() {
        this.app.listen(this.port, () => {
            console.log(`🎯 Webhook Data Collector started on port ${this.port}`);
            console.log(`📡 TradingView webhook URL: http://localhost:${this.port}/webhook/tradingview`);
            console.log(`🧠 AI score update URL: http://localhost:${this.port}/webhook/ai-score`);
            console.log(`📊 Health check: http://localhost:${this.port}/health`);
            console.log(`🔄 Training data API: http://localhost:${this.port}/api/training-data`);
        });

        // Save performance snapshots every 5 minutes
        setInterval(() => {
            this.savePerformanceSnapshot();
        }, 300000);
    }
}

// Start the webhook collector
if (require.main === module) {
    const collector = new WebhookDataCollector();
    collector.startServer();
}

module.exports = WebhookDataCollector;