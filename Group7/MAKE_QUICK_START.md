# Make.com Voice Pipeline - Quick Start

## ✅ What's Ready

1. **API Keys Configured**:
   - ✅ ElevenLabs: `sk_d8f05fcec826119f04fb0dd0877988207996a5d1bcd42f7b`
   - ✅ OpenAI: Configured
   - ✅ Notion: Configured

2. **Voice Profiles** (7 agents, all tested):
   - ✅ Lyra-7 → Rachel (21m00Tcm4TlvDq8ikWAM)
   - ✅ Atlas → Adam (pNInz6obpgDQGcFmaJgB)
   - ✅ Nova → Domi (AZnzlk1XvdvUeBnXmlld)
   - ✅ Cipher → Adam (pNInz6obpgDQGcFmaJgB)
   - ✅ Echo → Bella (EXAVITQu4vr4xnSDxMaL)
   - ✅ Quantum → Callum (N2lVS1w4EtoT3dr4eOWO)
   - ✅ Nexus → George (JBFqnCBsd6RMkjVDRZzb)

3. **CSV Files in Google Drive**:
   - ✅ `GROUP7_VOICE_PRODUCTION_BATCH.csv` (7 production scripts)
   - ✅ `GROUP7_VOICE_BATCH.csv` (7 test scripts)

4. **Folder Structure**:
   ```
   Google Drive/Group7/
   ├── GROUP7_VOICE_PRODUCTION_BATCH.csv
   └── Production/
       └── Voice/ ← MP3 outputs go here
   ```

5. **Make.com Blueprints Ready**:
   - ✅ `make/MAKE_MINIMAL_VOICE_PIPELINE_GOOGLE.json`
   - ✅ `make/MAKE_MINIMAL_VOICE_PIPELINE_ONEDRIVE.json`

---

## 🚀 3-Step Setup

### Step 1: Get Your File IDs from Google Drive

1. Open https://drive.google.com
2. Navigate to `My Drive` → `Group7`
3. Right-click `GROUP7_VOICE_PRODUCTION_BATCH.csv` → "Get link"
4. Copy the ID from the URL:
   ```
   https://drive.google.com/file/d/[COPY_THIS_PART]/view
   ```
   Save this as your **CSV_FILE_ID**

5. Open the `Production/Voice` folder
6. Look at the URL in your browser:
   ```
   https://drive.google.com/drive/folders/[COPY_THIS_PART]
   ```
   Save this as your **VOICE_FOLDER_ID**

### Step 2: Import to Make.com

1. Go to https://make.com/scenarios
2. Click "..." → "Import Blueprint"
3. Upload: `make/MAKE_MINIMAL_VOICE_PIPELINE_GOOGLE.json`
4. Click "Save"

### Step 3: Configure & Run

In the imported scenario, set these 3 variables:

| Variable | Value |
|----------|-------|
| `CSV_FILE_ID` | [Paste from Step 1 #4] |
| `VOICE_FOLDER_ID` | [Paste from Step 1 #6] |
| `ELEVENLABS_API_KEY` | `sk_d8f05fcec826119f04fb0dd0877988207996a5d1bcd42f7b` |

Then click **"Run once"** and watch it generate 7 MP3 files!

---

## 🎉 Expected Output

After running, you should see in `Google Drive/Group7/Production/Voice/`:

- `GRP7_LYRA_001.mp3` (Lyra's intro)
- `GRP7_ATLAS_002.mp3` (Atlas's intro)
- `GRP7_NOVA_003.mp3` (Nova's intro)
- `GRP7_CIPHER_004.mp3` (Cipher's intro)
- `GRP7_ECHO_005.mp3` (Echo's intro)
- `GRP7_QUANTUM_006.mp3` (Quantum's intro)
- `GRP7_NEXUS_007.mp3` (Nexus's intro)

---

## 🧪 Local Testing (Optional)

Test voice generation locally before using Make.com:

```bash
cd /Users/davidmikulis/neuro-pilot-ai/Group7

# Test Lyra
node ops/scripts/say.js "Group Seven. We build." config/voices/lyra7.voice.json

# Test Atlas
node ops/scripts/say.js "Infrastructure is power." config/voices/atlas.voice.json

# Check output
ls -lh out/
afplay out/VOICE_*.mp3
```

---

## 📊 CSV Format

Your CSV must have these 3 columns:

```csv
agent,script,outfile_slug
Lyra-7,"Your voiceover text here",output_filename
Atlas,"Another voiceover text",another_filename
```

Agent names must be exactly: `Lyra-7`, `Atlas`, `Nova`, `Cipher`, `Echo`, `Quantum`, `Nexus`

---

## 🔧 Troubleshooting

**Issue**: "Voice not found"
**Fix**: Voice IDs are already updated in blueprints. This shouldn't happen.

**Issue**: "File not found"
**Fix**: Double-check your `CSV_FILE_ID` is correct from Google Drive URL.

**Issue**: "Permission denied"
**Fix**: Make sure Make.com has Google Drive access when you first connect.

---

## 💰 Cost Per Run

- ElevenLabs Turbo v2.5: ~$0.15 per 1000 characters
- 7 voices × ~100 chars each = **~$0.10 per batch**

---

**Ready to generate voices!** 🎙️

---

## 🎬 Full Video Pipeline (NEW!)

The voice pipeline above generates MP3 audio. To create complete videos with Canva visuals:

### Blueprint: Video Production

Import: `make/MAKE_VIDEO_MIN_PIPELINE_GOOGLE.json`

**Required Variables:**
- `CANVA_ACCESS_TOKEN` - Your Canva API token
- `CANVA_TEMPLATE_ID` - Your video template ID
- `CLOUDCONVERT_API_KEY` - CloudConvert API key
- `GOOGLE_DRIVE_FOLDER_ID` - Video output folder ID
- `NOTION_VIDEO_DB_ID` - Notion database ID
- `VOICE_FILE_URL` - URL to MP3 file (from voice pipeline)

**Input Format:**
```json
{
  "agent": "Lyra",
  "slug": "test01",
  "hook": "Most people wait for the future.",
  "insight": "We don't. We build it.",
  "cta": "Follow Group7"
}
```

**Flow:**
1. Canva renders video with your text (30-60s)
2. CloudConvert merges video + voice (30-90s)
3. Uploads final MP4 to Google Drive (10-30s)
4. Logs result to Notion

**Total time: ~2-3 minutes per video**

### Local Testing

Test the full pipeline locally:
```bash
# First, generate voice
node ops/scripts/say.js "Test message" config/voices/lyra7.voice.json
mv out/VOICE_*.mp3 Production/Voice/GRP7_Lyra_test01.mp3

# Then run full video pipeline
npm run run:one -- \
  --agent Lyra \
  --slug test01 \
  --hook "Most people wait" \
  --insight "We build" \
  --cta "Follow Group7"
```

**For detailed setup**: See `DEPLOYMENT_GUIDE.md`

---

**Complete automation ready!** 🚀
