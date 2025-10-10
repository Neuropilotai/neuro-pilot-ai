#!/bin/bash

# Enterprise Inventory System - Quick Start Script
# Usage: ./start.sh

echo "════════════════════════════════════════════════════════════"
echo "         ENTERPRISE INVENTORY SYSTEM - QUICK START"
echo "════════════════════════════════════════════════════════════"
echo ""

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "❌ Error: Node.js is not installed!"
    echo "   Please install Node.js first: https://nodejs.org"
    exit 1
fi

# Check if we're in the right directory
if [ ! -f "enterprise-secure-inventory.js" ]; then
    echo "❌ Error: Not in the backend directory!"
    echo "   Please run this script from the backend folder."
    exit 1
fi

# Make sure the startup script is executable
chmod +x start-inventory-system.js

# Clear any stale lock files
rm -f *.lock 2>/dev/null

echo "🔧 Checking npm dependencies..."
if [ ! -d "node_modules" ]; then
    echo "📦 Installing dependencies..."
    npm install
fi

echo ""
echo "🚀 Starting Enterprise Inventory System..."
echo "   This will launch:"
echo "   • Main inventory server"
echo "   • AI monitoring system"
echo "   • Financial auditing"
echo "   • System reconciliation"
echo ""
echo "Press Ctrl+C to stop all services"
echo "────────────────────────────────────────────────────────────"
echo ""

# Start the system
node start-inventory-system.js