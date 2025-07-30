#!/bin/bash

echo "🚀 NEURO.PILOT.AI SYSTEM SELECTOR"
echo "© 2025 David Mikulis. All Rights Reserved."
echo ""
echo "Select which system to start:"
echo ""
echo "1) 🏕️  Inventory System Only (Port 8083)"
echo "2) 📈 Trading System Only (Port 8084)" 
echo "3) 📄 Resume System Only (Port 8085)"
echo "4) 📊 Dashboard Only (Port 8086)"
echo "5) 🔄 All Systems (Multiple Ports)"
echo "6) 🛑 Stop All Systems"
echo ""
read -p "Enter your choice (1-6): " choice

case $choice in
  1)
    echo "Starting Inventory System..."
    npm run inventory
    ;;
  2)
    echo "Starting Trading System..."
    npm run trading
    ;;
  3)
    echo "Starting Resume System..."
    npm run resume
    ;;
  4)
    echo "Starting Dashboard..."
    npm run dashboard-only
    ;;
  5)
    echo "Starting All Systems..."
    npm run start
    ;;
  6)
    echo "Stopping all systems..."
    pkill -f "node.*js" 2>/dev/null || true
    echo "✅ All systems stopped"
    ;;
  *)
    echo "Invalid choice. Please run again."
    ;;
esac