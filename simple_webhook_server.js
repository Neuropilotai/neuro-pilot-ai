#!/usr/bin/env node

/**
 * 🎯 Simple Webhook Server for TradingView
 * Quick fix for webhook endpoint issues
 */

const express = require('express');
const fs = require('fs').promises;
const path = require('path');

const app = express();
const port = 3014; // Using different port to avoid conflicts

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Enable CORS
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
    next();
});

// Main webhook endpoint for TradingView
app.post('/webhook/tradingview', async (req, res) => {
    try {
        console.log('🚨 TradingView Alert Received:', JSON.stringify(req.body, null, 2));
        
        const alertData = req.body;
        
        // Log the trade data
        const tradeData = {
            timestamp: new Date().toISOString(),
            symbol: alertData.symbol || 'UNKNOWN',
            action: alertData.action || 'UNKNOWN',
            price: parseFloat(alertData.price) || 0,
            ai_score: parseFloat(alertData.ai_score) || 0,
            confidence: parseFloat(alertData.confidence) || 0,
            regime: alertData.regime || 'UNKNOWN',
            risk_mode: alertData.risk_mode || 'UNKNOWN',
            quantity: parseFloat(alertData.quantity) || 0,
            result: alertData.result || 'PENDING',
            pnl: parseFloat(alertData.pnl) || 0
        };
        
        console.log('💰 Processed Trade:', tradeData);
        
        // Save to file
        const dataDir = './TradingDrive/webhook_logs';
        try {
            await fs.mkdir(dataDir, { recursive: true });
            const logFile = path.join(dataDir, 'trades.json');
            
            let trades = [];
            try {
                const data = await fs.readFile(logFile, 'utf8');
                trades = JSON.parse(data);
            } catch (e) {
                // File doesn't exist yet
            }
            
            trades.push(tradeData);
            await fs.writeFile(logFile, JSON.stringify(trades, null, 2));
            
            console.log('✅ Trade data saved to file');
        } catch (error) {
            console.error('❌ File save error:', error.message);
        }
        
        res.status(200).json({ 
            status: 'success', 
            message: 'Trade alert received',
            data: tradeData
        });
        
    } catch (error) {
        console.error('❌ Webhook error:', error.message);
        res.status(500).json({ 
            status: 'error', 
            message: error.message 
        });
    }
});

// Test GET endpoint to verify server is working
app.get('/webhook/tradingview', (req, res) => {
    res.json({
        status: 'active',
        message: 'TradingView webhook endpoint is ready',
        method: 'Use POST requests to send alerts',
        url: `http://localhost:${port}/webhook/tradingview`
    });
});

// Health check
app.get('/health', (req, res) => {
    res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        port: port
    });
});

// Root endpoint
app.get('/', (req, res) => {
    res.json({
        name: 'TradingView Webhook Server',
        version: '1.0.0',
        endpoints: {
            webhook: `http://localhost:${port}/webhook/tradingview`,
            health: `http://localhost:${port}/health`
        }
    });
});

// Start server
app.listen(port, () => {
    console.log(`🎯 Simple Webhook Server started on port ${port}`);
    console.log(`📡 TradingView webhook URL: http://localhost:${port}/webhook/tradingview`);
    console.log(`🏥 Health check: http://localhost:${port}/health`);
    console.log(`✅ Ready to receive TradingView alerts!`);
});

// Handle graceful shutdown
process.on('SIGINT', () => {
    console.log('\n🛑 Shutting down webhook server...');
    process.exit(0);
});

process.on('SIGTERM', () => {
    console.log('\n🛑 Received SIGTERM, shutting down...');
    process.exit(0);
});