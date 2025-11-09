#!/bin/bash
# Test Lyra-7 Voice Generation
# Quick validation of ElevenLabs integration with voice profile

set -euo pipefail

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo "🎙️  Testing Lyra-7 Voice Generation"
echo "════════════════════════════════════════"
echo

# Load environment
if [ -f "../../.env" ]; then
  export $(grep -v '^#' ../../.env | xargs)
  echo -e "${GREEN}✅ Loaded .env${NC}"
else
  echo -e "${RED}❌ .env not found${NC}"
  echo "Run: cp ../../.env.template ../../.env"
  exit 1
fi

# Validate required vars
if [ -z "${ELEVENLABS_API_KEY:-}" ]; then
  echo -e "${RED}❌ ELEVENLABS_API_KEY not set${NC}"
  exit 1
fi

if [ -z "${ELEVENLABS_VOICE_ID_LYRA:-}" ]; then
  echo -e "${RED}❌ ELEVENLABS_VOICE_ID_LYRA not set${NC}"
  exit 1
fi

echo -e "${GREEN}✅ Environment variables loaded${NC}"
echo

# Test script from voice profile
TEST_SCRIPT="Group Seven. We don't wait… we build. While you sleep — we're engineering tomorrow."

echo "📝 Test Script:"
echo "   \"${TEST_SCRIPT}\""
echo

# Make API request
echo "🚀 Calling ElevenLabs API..."
OUTPUT_FILE="lyra7_test_$(date +%s).mp3"

HTTP_CODE=$(curl -s -w "%{http_code}" -o "${OUTPUT_FILE}" \
  -X POST "https://api.elevenlabs.io/v1/text-to-speech/${ELEVENLABS_VOICE_ID_LYRA}" \
  -H "xi-api-key: ${ELEVENLABS_API_KEY}" \
  -H "Content-Type: application/json" \
  -d '{
    "model_id": "'"${ELEVENLABS_MODEL_ID:-eleven_turbo_v2_5}"'",
    "text": "'"${TEST_SCRIPT}"'",
    "voice_settings": {
      "stability": 0.70,
      "similarity_boost": 0.75,
      "style": 0.45,
      "use_speaker_boost": true
    },
    "optimize_streaming_latency": 3,
    "output_format": "'"${ELEVENLABS_OUTPUT_FORMAT:-mp3_44100_128}"'",
    "apply_voice_settings": true
  }')

echo

# Check result
if [ "${HTTP_CODE}" -eq 200 ]; then
  FILE_SIZE=$(stat -f%z "${OUTPUT_FILE}" 2>/dev/null || stat -c%s "${OUTPUT_FILE}" 2>/dev/null || echo "0")

  if [ "${FILE_SIZE}" -gt 1000 ]; then
    echo -e "${GREEN}✅ SUCCESS!${NC}"
    echo
    echo "📊 Results:"
    echo "   File: ${OUTPUT_FILE}"
    echo "   Size: ${FILE_SIZE} bytes"
    echo "   Voice: ${ELEVENLABS_VOICE_ID_LYRA} (Lyra-7)"
    echo "   Model: ${ELEVENLABS_MODEL_ID:-eleven_turbo_v2_5}"
    echo
    echo "🎧 Play with:"
    echo "   afplay ${OUTPUT_FILE}  # macOS"
    echo "   mpg123 ${OUTPUT_FILE}  # Linux"
    echo
  else
    echo -e "${RED}❌ FAILED: File too small (${FILE_SIZE} bytes)${NC}"
    echo "Response may not contain valid audio"
    cat "${OUTPUT_FILE}"
    rm -f "${OUTPUT_FILE}"
    exit 1
  fi
else
  echo -e "${RED}❌ FAILED: HTTP ${HTTP_CODE}${NC}"
  echo
  echo "Response:"
  cat "${OUTPUT_FILE}"
  echo
  rm -f "${OUTPUT_FILE}"
  exit 1
fi

echo "════════════════════════════════════════"
echo "Next steps:"
echo "1. Listen to the generated audio"
echo "2. If voice sounds good, update voice profile"
echo "3. Run full pipeline test: npm run e2e:dry"
echo
