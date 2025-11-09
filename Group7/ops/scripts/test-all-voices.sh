#!/bin/bash

# GROUP7 Voice Generation Test Script
# Tests all 7 agent voices and outputs to Production/Voice/

set -e

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🎙️  GROUP7 Voice Generation Test"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Change to project root
cd "$(dirname "$0")/../.."

# Ensure Production/Voice directory exists
mkdir -p Production/Voice

# Test messages for each agent
declare -A test_scripts=(
  ["lyra7"]="We don't wait for the future. We build it—together."
  ["atlas"]="Infrastructure is your moat. Automate it."
  ["nova"]="Ship in days, not months."
  ["cipher"]="Every line of code is a vulnerability—until proven otherwise."
  ["echo"]="Async isn't cold—it's considerate. Work when you're brilliant."
  ["quantum"]="The signal is in the noise. We find it—every time."
  ["nexus"]="Every system connects. We make sure they speak fluently."
)

# Generate voice for each agent
count=0
for voice in lyra7 atlas nova cipher echo quantum nexus; do
  count=$((count + 1))

  echo "[$count/7] Generating ${voice}..."

  # Generate with unique filename
  node --env-file=.env ops/scripts/say.js "${test_scripts[$voice]}" config/voices/${voice}.voice.json

  # Move to Production/Voice with agent name
  latest_file=$(ls -t out/VOICE_*.mp3 | head -1)
  if [ -f "$latest_file" ]; then
    agent_name=$(echo "$voice" | tr '[:lower:]' '[:upper:]')
    cp "$latest_file" "Production/Voice/TEST_${agent_name}_$(date +%Y%m%d).mp3"
    echo "   ✅ Saved to Production/Voice/TEST_${agent_name}_$(date +%Y%m%d).mp3"
  fi

  # Small delay to prevent timestamp collision
  sleep 0.5
done

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ All 7 voices generated successfully!"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "📁 Output location:"
echo "   Production/Voice/"
echo ""
echo "📊 Generated files:"
ls -lh Production/Voice/TEST_*.mp3 2>/dev/null | awk '{print "   " $9 " (" $5 ")"}'
echo ""
echo "🎧 Play all voices:"
echo "   afplay Production/Voice/TEST_*.mp3"
echo ""
