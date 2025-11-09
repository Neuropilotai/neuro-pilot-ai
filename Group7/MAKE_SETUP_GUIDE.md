# Make.com Voice Pipeline Setup Guide

## ✅ Prerequisites Complete
- [x] ElevenLabs API Key configured
- [x] Voice profiles updated with valid IDs
- [x] CSV files uploaded to Google Drive
- [x] Make.com blueprints ready to import

## 📋 Step-by-Step Setup

### Step 1: Get Your CSV File ID

1. Go to https://drive.google.com
2. Navigate to `Group7` folder
3. Find `GROUP7_VOICE_PRODUCTION_BATCH.csv`
4. Right-click → "Get link" → "Copy link"
5. Extract the File ID from the URL:
   ```
   https://drive.google.com/file/d/1ABC...XYZ/view
                                   ^^^^^^^^^ This is your CSV_FILE_ID
   ```

### Step 2: Get Your Output Folder ID

1. In Google Drive, navigate to `Group7/Production/Voice` folder
2. Right-click the `Voice` folder → "Get link" → "Copy link"
3. Extract the Folder ID:
   ```
   https://drive.google.com/drive/folders/1XYZ...ABC
                                           ^^^^^^^^^ This is your VOICE_FOLDER_ID
   ```

### Step 3: Import Blueprint to Make.com

1. Go to https://make.com/scenarios
2. Click "..." (three dots) → "Import Blueprint"
3. Select file: `make/MAKE_MINIMAL_VOICE_PIPELINE_GOOGLE.json`
4. Click "Save"

### Step 4: Configure Scenario Variables

In your imported scenario, set these variables:

| Variable Name | Value |
|--------------|-------|
| `CSV_FILE_ID` | Your CSV file ID from Step 1 |
| `ELEVENLABS_API_KEY` | `sk_d8f05fcec826119f04fb0dd0877988207996a5d1bcd42f7b` |
| `GOOGLE_DRIVE_VOICE_FOLDER_ID` | Your Voice folder ID from Step 2 |

### Step 5: Test the Scenario

1. Click "Run once" in Make.com
2. Watch the execution:
   - Module 1: Webhook triggers
   - Module 2: Downloads CSV from Drive
   - Module 3: Parses CSV rows
   - Module 4: Iterates through each row
   - Module 5: Calls ElevenLabs API for TTS
   - Module 6: Uploads MP3 to Drive
3. Check your `Group7/Production/Voice` folder for 7 new MP3 files:
   - `GRP7_LYRA_001.mp3`
   - `GRP7_ATLAS_002.mp3`
   - `GRP7_NOVA_003.mp3`
   - `GRP7_CIPHER_004.mp3`
   - `GRP7_ECHO_005.mp3`
   - `GRP7_QUANTUM_006.mp3`
   - `GRP7_NEXUS_007.mp3`

## 🎤 Voice Mapping

The blueprint automatically maps agents to their ElevenLabs voices:

| Agent | Voice Name | Voice ID |
|-------|-----------|----------|
| Lyra-7 | Rachel | 21m00Tcm4TlvDq8ikWAM |
| Atlas | Adam | pNInz6obpgDQGcFmaJgB |
| Nova | Domi | AZnzlk1XvdvUeBnXmlld |
| Cipher | Adam | pNInz6obpgDQGcFmaJgB |
| Echo | Bella | EXAVITQu4vr4xnSDxMaL |
| Quantum | Callum | N2lVS1w4EtoT3dr4eOWO |
| Nexus | George | JBFqnCBsd6RMkjVDRZzb |

## 🔧 Troubleshooting

### "Voice not found" error
- The voice IDs in the blueprint are already updated
- If you get this error, check your ElevenLabs account has access to these pre-made voices

### "File not found" error
- Double-check your `CSV_FILE_ID` is correct
- Ensure the Make.com Google Drive connection has permission to access the file

### "Permission denied" on upload
- Verify the `GOOGLE_DRIVE_VOICE_FOLDER_ID` is correct
- Ensure Make.com has write permission to the folder

### CSV format issues
- Ensure your CSV has exactly 3 columns: `agent`, `script`, `outfile_slug`
- Agent names must match: `Lyra-7`, `Atlas`, `Nova`, `Cipher`, `Echo`, `Quantum`, `Nexus`

## 🚀 Production Usage

Once tested successfully:

1. **Schedule the scenario** to run automatically
2. **Update your CSV** in Google Drive with new scripts
3. **Add more rows** to generate more voices in one batch
4. **Monitor operations** in Make.com dashboard

## 💰 Cost Estimate

ElevenLabs Turbo v2.5 costs approximately:
- ~$0.15 per 1000 characters
- Average script: ~100 characters = ~$0.015 per voice
- 7 voices in this batch: ~$0.10 total

## ✅ Success Checklist

- [ ] CSV file uploaded to Google Drive
- [ ] File ID and Folder ID obtained
- [ ] Blueprint imported to Make.com
- [ ] Variables configured
- [ ] Test run successful
- [ ] 7 MP3 files generated in Voice folder
- [ ] Audio quality verified

---

**Ready to generate!** 🎙️
