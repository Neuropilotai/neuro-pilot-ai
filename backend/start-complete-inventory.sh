#!/bin/bash

# Complete Inventory System Startup
# Starts all required components with one command

echo ""
echo "🚀 STARTING COMPLETE INVENTORY SYSTEM WITH AI AGENTS"
echo "================================================================================"
echo ""

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to check if process is running
check_running() {
    if pgrep -f "$1" > /dev/null; then
        echo -e "${GREEN}✅ $2 is running${NC}"
        return 0
    else
        echo -e "${YELLOW}⚠️  $2 is not running${NC}"
        return 1
    fi
}

# Stop existing processes
echo -e "${BLUE}📋 Stopping existing processes...${NC}"
pkill -f "node.*inventory" 2>/dev/null
pkill -f "node.*monitor" 2>/dev/null
sleep 2

# Create logs directory
mkdir -p logs

echo ""
echo -e "${BLUE}🔧 Initializing system components...${NC}"
echo ""

# 1. Setup multi-location system if not already done
if [ ! -f ".multilocation_initialized" ]; then
    echo -e "${BLUE}📍 Setting up multi-location system...${NC}"
    node setup_multilocation_system.js > logs/setup_multilocation.log 2>&1
    if [ $? -eq 0 ]; then
        touch .multilocation_initialized
        echo -e "${GREEN}✅ Multi-location system initialized${NC}"
    else
        echo -e "${YELLOW}⚠️  Multi-location setup had issues, check logs/setup_multilocation.log${NC}"
    fi
else
    echo -e "${GREEN}✅ Multi-location system already initialized${NC}"
fi

echo ""
echo -e "${BLUE}🚀 Starting background services...${NC}"
echo ""

# 2. Start main inventory system API
echo -e "${BLUE}📡 Starting Inventory API Server...${NC}"
nohup node server.js > logs/inventory_api.log 2>&1 &
API_PID=$!
sleep 3
if check_running "server.js" "Inventory API"; then
    echo "   PID: $API_PID"
    echo "   Logs: logs/inventory_api.log"
fi

# 3. Start AI monitoring agent (continuous monitoring)
echo ""
echo -e "${BLUE}🤖 Starting AI Monitoring Agent...${NC}"
cat > ai_monitor_service.js << 'EOF'
const AIInventoryMonitor = require('./ai_inventory_monitor');

async function runContinuousMonitoring() {
    const monitor = new AIInventoryMonitor();
    await monitor.initialize();

    console.log('🤖 AI Monitoring Agent Started');
    console.log('📊 Monitoring interval: Every 5 minutes');
    console.log('');

    // Run monitoring every 5 minutes
    setInterval(async () => {
        try {
            const timestamp = new Date().toISOString();
            console.log(`\n[${timestamp}] Running inventory check...`);
            await monitor.monitorInventory();
        } catch (err) {
            console.error('Error during monitoring:', err.message);
        }
    }, 5 * 60 * 1000); // 5 minutes

    // Run immediately on start
    setTimeout(async () => {
        try {
            await monitor.monitorInventory();
        } catch (err) {
            console.error('Error during initial monitoring:', err.message);
        }
    }, 5000);
}

runContinuousMonitoring().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
});
EOF

nohup node ai_monitor_service.js > logs/ai_monitor.log 2>&1 &
MONITOR_PID=$!
sleep 2
if check_running "ai_monitor_service.js" "AI Monitor"; then
    echo "   PID: $MONITOR_PID"
    echo "   Logs: logs/ai_monitor.log"
fi

# 4. Start OneDrive PDF monitoring (if configured)
echo ""
if [ -f "monitor_onedrive_pdfs.js" ]; then
    echo -e "${BLUE}📁 Starting OneDrive PDF Monitor...${NC}"
    nohup node monitor_onedrive_pdfs.js > logs/onedrive_monitor.log 2>&1 &
    PDF_PID=$!
    sleep 2
    if check_running "monitor_onedrive_pdfs.js" "OneDrive Monitor"; then
        echo "   PID: $PDF_PID"
        echo "   Logs: logs/onedrive_monitor.log"
    fi
fi

# Save PIDs for later shutdown
cat > .inventory_pids << EOF
API_PID=$API_PID
MONITOR_PID=$MONITOR_PID
PDF_PID=${PDF_PID:-}
EOF

echo ""
echo "================================================================================"
echo -e "${GREEN}✅ COMPLETE INVENTORY SYSTEM STARTED${NC}"
echo "================================================================================"
echo ""
echo "📊 Active Services:"
echo ""
check_running "server.js" "Inventory API Server" && echo "   → http://localhost:3000"
check_running "ai_monitor_service.js" "AI Monitoring Agent" && echo "   → Checking inventory every 5 minutes"
check_running "monitor_onedrive_pdfs.js" "OneDrive PDF Monitor" && echo "   → Auto-importing new invoices"

echo ""
echo "📝 Logs:"
echo "   • API Server: tail -f logs/inventory_api.log"
echo "   • AI Monitor: tail -f logs/ai_monitor.log"
echo "   • OneDrive: tail -f logs/onedrive_monitor.log"
echo ""
echo "🛑 Stop all services:"
echo "   ./stop-complete-inventory.sh"
echo ""
echo "📊 View live AI monitoring:"
echo "   tail -f logs/ai_monitor.log"
echo ""
