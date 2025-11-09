# Make.com Blueprint Import - Step by Step
## Get Your Scenario Running in 5 Minutes

---

## 📦 **What You Have:**

✅ Blueprint file: `MAKECOM_BLUEPRINT_GROUP7.json` (in your neuro-pilot-ai folder)

This blueprint contains:
- ⏰ Schedule trigger (6 AM daily)
- 📁 Google Drive CSV download
- 📊 CSV parser
- 🔄 Iterator (loops 7 times)
- 🎙️ ElevenLabs TTS API
- 💾 Google Drive upload (saves MP3s)

---

## 🚀 **Import Instructions (5 minutes)**

### **Step 1: Open the Blueprint File (30 seconds)**

1. Go to your folder: `/Users/davidmikulis/neuro-pilot-ai/`
2. Open: `MAKECOM_BLUEPRINT_GROUP7.json` in TextEdit or VS Code
3. **Select All** (Cmd+A)
4. **Copy** (Cmd+C)

---

### **Step 2: Import to Make.com (1 minute)**

1. Go to: https://us2.make.com/1535156/scenarios
2. Click **"Create a new scenario"** button
3. Look for **"..." menu** in the top-right corner OR bottom-left
4. Click **"Import Blueprint"** (or "Import Scenario")
5. **Paste** the JSON you copied (Cmd+V)
6. Click **"Save"** or **"Import"**

**Alternative if you can't find "Import Blueprint":**
1. Click the **"..." (three dots)** at the bottom-left of the canvas
2. Select **"Import blueprint"**
3. Paste JSON
4. Click "Save"

---

### **Step 3: Connect Google Drive (2 minutes)**

After import, you'll see 6 modules on your canvas. Two of them need Google connection:

**Module 2 (Google Drive - Download):**
1. Click on Module 2 (Google Drive icon)
2. Click **"Add"** next to Connection
3. Name: `Google Drive - Group 7`
4. Click **"Sign in with Google"**
5. Select: `neuro.pilot.ai@gmail.com`
6. Click **"Allow"**
7. Click **"OK"**

**Module 6 (Google Drive - Upload):**
1. Click on Module 6
2. Connection: Select the same connection you just created
3. Click **"OK"**

---

### **Step 4: Add ElevenLabs API Key (1 minute)**

**Get your API key:**
1. Go to: https://elevenlabs.io/account
2. Copy your API key (starts with `sk_...`)

**Update Module 5:**
1. Click on Module 5 (HTTP - ElevenLabs)
2. Find the header: `xi-api-key`
3. Replace `YOUR_ELEVENLABS_API_KEY` with your actual key
4. Click **"OK"**

---

### **Step 5: Test It! (2 minutes)**

**Test Module 2 (Google Drive):**
1. Right-click Module 2
2. Select **"Run this module only"**
3. Should show: "Success - 1 bundle"
4. Expand to see CSV data ✅

**Test the Full Flow:**
1. Click **"Run once"** (bottom-left)
2. Watch modules light up green as they execute
3. Check `/Group7/Production/Voice/2025-10-30/` in Google Drive
4. You should see **7 MP3 files**! 🎉

---

## ✅ **What Happens When You Run It:**

```
06:00 AM - Schedule triggers
06:00:05 - Downloads CSV from Google Drive
06:00:10 - Parses CSV (7 rows)
06:00:15 - Starts Iterator loop
06:00:20 - Video 1: Generates voiceover (ElevenLabs)
06:00:30 - Video 1: Saves MP3 to Google Drive
06:00:35 - Video 2: Generates voiceover
... (repeats for all 7 videos)
06:02:30 - All 7 MP3s saved to Google Drive
06:02:35 - ✅ Complete!
```

**Total runtime:** ~2.5 minutes for 7 voiceovers

---

## 🔧 **Customize After Import (Optional)**

### **Change Voice per Agent:**

The blueprint uses Rachel (voice ID: `21m00Tcm4TlvDq8ikWAM`) for all videos.

To use different voices:
1. Add a **Router** module before Module 5
2. Create routes for each agent:
   - Route 1: If `{{4.AUTOTAG}}` contains "LYRA" → Use Rachel
   - Route 2: If contains "ATLAS" → Use Onyx (TX3LPaxmHKxFdv7VOQHJ)
   - Route 3: If contains "NOVA" → Use Bella (EXAVITQu4vr4xnSDxMaL)
   - Etc.

### **Change Schedule Time:**

1. Click Module 1 (Schedule)
2. Change time from 06:00 to your preferred time
3. Click "OK"

### **Add More Modules:**

After the blueprint works, you can add:
- CloudConvert (merge video + audio)
- Metricool (schedule posts)
- Notion (log videos)

See: `MAKECOM_SETUP_GUIDE_COMPLETE.md` for full instructions

---

## 🆘 **Troubleshooting**

**"Can't find Import Blueprint"**
- Try: Bottom-left corner, click "..." → "Import blueprint"
- Or: Create new scenario first, then look for import option

**"Invalid JSON format"**
- Make sure you copied the ENTIRE file (from `{` to final `}`)
- No extra text before or after the JSON
- Try copying again

**"Google Drive file not found"**
- Check the CSV exists at: `/Group7/Production/CSV_Inputs/GROUP7_CANVA_BATCH_2025-10-30.csv`
- Wait 1-2 minutes for Google Drive to sync
- Update the path in Module 2 if needed

**"ElevenLabs error"**
- Check API key is correct (no extra spaces)
- Verify you have credits in ElevenLabs account
- Make sure key starts with `sk_`

**"No data in Module 4"**
- Test Module 3 first (should show 7 items in array)
- Check CSV parsing worked correctly
- Verify CSV has headers: HOOK, INSIGHT, CTA, VOICEOVER, etc.

---

## 📊 **What You Get:**

After successful run:

**In Google Drive:** `/Group7/Production/Voice/2025-10-30/`
- GRP7_LYRA_001_VO.mp3 (Rachel's voice, ~25 seconds)
- GRP7_ATLAS_002_VO.mp3
- GRP7_NOVA_003_VO.mp3
- GRP7_CIPHER_004_VO.mp3
- GRP7_ECHO_005_VO.mp3
- GRP7_QUANTUM_006_VO.mp3
- GRP7_NEXUS_007_VO.mp3

**Total:** 7 professional AI voiceovers, ready to merge with video!

---

## 🎯 **Next Steps:**

Once voiceovers work:

1. **Add video merging** (CloudConvert module)
2. **Add post scheduling** (Metricool module)
3. **Add logging** (Notion module)
4. **Enable daily schedule** (turn scenario ON)

---

## 💰 **Cost per Run:**

- ElevenLabs: ~$0.85 (7 voiceovers @ $0.12 each)
- Make.com: ~42 operations (well within Pro plan limits)
- Google Drive: Free

**Total:** ~$0.85 per day = $25/month

---

## ✅ **Success Checklist:**

- [ ] Blueprint JSON copied
- [ ] Imported to Make.com
- [ ] Google Drive connected (Module 2 & 6)
- [ ] ElevenLabs API key added (Module 5)
- [ ] Module 2 tested successfully (CSV downloaded)
- [ ] Full scenario tested (7 MP3s created)
- [ ] Files visible in Google Drive

---

**Ready to import?**

1. Open `MAKECOM_BLUEPRINT_GROUP7.json`
2. Copy all the JSON
3. Go to Make.com → Import Blueprint
4. Paste & Save
5. Connect accounts
6. Test!

**Let me know when you have the blueprint imported and I'll help with testing!**
