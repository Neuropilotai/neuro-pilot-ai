#!/bin/bash

# 📊 AI Trading Monitor Dashboard
# Real-time monitoring of your $500 challenge

echo "🚀 NEURO.PILOT.AI TRADE MONITOR"
echo "================================"

while true; do
    clear
    echo "📊 LIVE TRADING STATUS - $(date)"
    echo "================================"
    
    # Show AI Performance
    echo "🧠 AI PERFORMANCE:"
    cat TradingDrive/performance_logs/learning_progress.json | jq -r '
    "   Accuracy: " + (.modelAccuracy * 100 | tostring | .[0:5]) + "%",
    "   Learning: " + (.learningProgress * 100 | tostring) + "%", 
    "   Data Points: " + (.performance.dataPointsCollected | tostring),
    "   Models Retrained: " + (.performance.modelsRetrained | tostring)'
    
    echo ""
    echo "💰 CHALLENGE STATUS:"
    
    # Check if challenge progress file exists
    if [ -f "TradingDrive/performance_logs/challenge_progress.json" ]; then
        cat TradingDrive/performance_logs/challenge_progress.json | jq -r '
        "   Current Balance: $" + (.currentBalance | tostring),
        "   Total Trades: " + (.performance.totalTrades | tostring),
        "   Win Rate: " + (.performance.winRate | tostring) + "%",
        "   Profit/Loss: $" + ((.currentBalance - .performance.challengeStartBalance) | tostring)'
    else
        echo "   Starting Balance: $500.00"
        echo "   Status: Initializing..."
        echo "   Trades: 0"
    fi
    
    echo ""
    echo "🔗 MONITORING LINKS:"
    echo "   Web Dashboard: http://localhost:3007"
    echo "   TradingView BTC: https://tradingview.com/chart/?symbol=BTCUSDT&interval=1"
    echo "   TradingView ETH: https://tradingview.com/chart/?symbol=ETHUSDT&interval=1"
    
    echo ""
    echo "📈 LIVE SIGNALS:"
    
    # Show recent signals if any
    if [ -d "TradingDrive/live_signals" ] && [ "$(ls -A TradingDrive/live_signals)" ]; then
        echo "   $(ls -t TradingDrive/live_signals | head -3 | wc -l) recent signals detected"
        ls -t TradingDrive/live_signals | head -1 | xargs -I {} cat "TradingDrive/live_signals/{}" 2>/dev/null | jq -r '"   Latest: " + .action + " " + .symbol + " (" + (.confidence * 100 | tostring) + "%)"' 2>/dev/null || echo "   No recent signals"
    else
        echo "   Waiting for signals..."
    fi
    
    echo ""
    echo "⏰ Updated every 30 seconds. Press Ctrl+C to exit."
    echo "================================"
    
    sleep 30
done