#!/bin/bash

echo "🔥 Starting Super Gig Opportunity Dashboard..."
echo ""

# Kill any existing processes on port 3030
lsof -ti:3030 | xargs kill -9 2>/dev/null

# Start the dashboard
cd /Users/davidmikulis/neuro-pilot-ai
node super-gig-opportunity-dashboard.js