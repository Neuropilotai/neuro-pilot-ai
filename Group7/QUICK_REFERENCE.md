# GROUP7 Voice Pipeline - Quick Reference

## 🎤 Generate Voice Locally

**Single voice:**
```bash
cd ~/neuro-pilot-ai/Group7
node --env-file=.env ops/scripts/say.js "Your text here" config/voices/lyra7.voice.json
```

**Test all 7 voices:**
```bash
./ops/scripts/test-all-voices.sh
```

## 📊 Use Production CSV

**Location:**
```
Google Drive/Group7/GROUP7_VOICE_PRODUCTION_BATCH.csv
```

**Format:**
```csv
agent,script,outfile_slug
Lyra-7,"Your script text",output_filename
```

## 🔧 Make.com Setup

**Blueprint location:**
```
make/MAKE_MINIMAL_VOICE_PIPELINE_GOOGLE.json
```

**Required variables:**
- `CSV_FILE_ID` - From Google Drive CSV file URL
- `VOICE_FOLDER_ID` - From Production/Voice folder URL
- `ELEVENLABS_API_KEY` - Already configured: `sk_d8f05fcec826119f04fb...`

## 🎧 Voice Profiles

| Agent | File | Voice |
|-------|------|-------|
| Lyra-7 | config/voices/lyra7.voice.json | Rachel (calm) |
| Atlas | config/voices/atlas.voice.json | Adam (authoritative) |
| Nova | config/voices/nova.voice.json | Domi (energetic) |
| Cipher | config/voices/cipher.voice.json | Adam (deliberate) |
| Echo | config/voices/echo.voice.json | Bella (warm) |
| Quantum | config/voices/quantum.voice.json | Callum (analytical) |
| Nexus | config/voices/nexus.voice.json | George (methodical) |

## 📁 Important Paths

**Local:**
```
~/neuro-pilot-ai/Group7/
├── .env (API keys)
├── config/voices/ (7 profiles)
├── ops/scripts/say.js (TTS CLI)
├── make/ (Make.com blueprints)
└── out/ (local test outputs)
```

**Google Drive:**
```
/My Drive/Group7/
├── GROUP7_VOICE_PRODUCTION_BATCH.csv
└── Production/Voice/ (MP3 outputs)
```

## 🚀 Common Commands

```bash
# Test one voice
node --env-file=.env ops/scripts/say.js "Test" config/voices/lyra7.voice.json

# Test all voices
./ops/scripts/test-all-voices.sh

# List outputs
ls -lh out/

# Play output (macOS)
afplay out/VOICE_*.mp3

# Open Google Drive
open "https://drive.google.com"

# Open Make.com
open "https://make.com/scenarios"
```

## 📚 Documentation

- **MAKE_QUICK_START.md** - 3-step Make.com setup
- **MAKE_SETUP_GUIDE.md** - Detailed setup & troubleshooting
- **VOICE_TEST_SUCCESS.md** - Test results & verification
- **VOICE_README.md** - Complete system documentation

## 💰 Costs

- ElevenLabs Turbo v2.5: ~$0.15 per 1000 characters
- Average voice: ~100 characters = ~$0.015 per voice
- Batch of 7 voices: ~$0.10 total

## 🔍 Troubleshooting

**"Voice not found"**
→ Voice IDs are correct, check ElevenLabs account status

**"Module warning"**
→ Fixed! "type": "module" added to package.json

**Files overwriting**
→ Use test-all-voices.sh script (includes delays)

**Can't find CSV in Drive**
→ File is at /My Drive/Group7/GROUP7_VOICE_PRODUCTION_BATCH.csv

## ✅ Status

🟢 **PRODUCTION READY**

All systems tested and operational. Ready for Make.com integration.
