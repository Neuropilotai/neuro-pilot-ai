# ✅ Group 7 Automation Setup - COMPLETE
**Date:** 2025-10-30
**Status:** Ready for Make.com deployment

---

## 📦 Files Created (Local)

### 1. Production Data
- ✅ `GROUP7_CANVA_BATCH_2025-10-30.csv` (7 videos, 5.7 KB)
  - Location: `/Users/davidmikulis/neuro-pilot-ai/`
  - Contains: Voiceover scripts, captions, hashtags, posting schedule

### 2. Notion Database Files
- ✅ `NOTION_VIDEO_LOG_DATABASE_SCHEMA.json`
  - Complete database structure with 30+ properties
  - 7 pre-configured views (All Videos, By Agent, Top Performers, etc.)

- ✅ `NOTION_DATABASE_SETUP_GUIDE.md`
  - Step-by-step setup instructions
  - Property configurations
  - Formula definitions
  - Integration checklist

### 3. Google Drive Configuration
- ✅ `GOOGLE_DRIVE_PATHS.md`
  - Path mappings for Make.com
  - Folder structure reference
  - Upload instructions

---

## ☁️ Google Drive Setup (Complete)

### Folder Structure Created:
```
Google Drive/Group7/
├── Production/
│   ├── CSV_Inputs/
│   │   └── ✅ GROUP7_CANVA_BATCH_2025-10-30.csv (uploaded)
│   ├── Voice/          (ready for ElevenLabs output)
│   ├── Videos/         (ready for final MP4s)
│   ├── Captions/       (ready for SRT files)
│   └── Thumbnails/     (ready for thumbnails)
├── Config/             (for POLICY_JSON versions)
└── Analytics/
    ├── Daily_Reports/
    └── Weekly_Reviews/
```

**Syncing:** Google Drive is now syncing. Check drive.google.com in ~30 seconds to verify.

---

## 🎯 What You Have Now

### Complete 7-Video Batch for 2025-10-30:

| Video ID | Agent | Theme | Post Time |
|----------|-------|-------|-----------|
| GRP7_LYRA_001 | Lyra-7 | Creative Architect | 19:30 EST |
| GRP7_ATLAS_002 | Atlas-7 | Strategic Intelligence | 20:00 EST |
| GRP7_NOVA_003 | Nova-7 | Research Intelligence | 11:30 EST |
| GRP7_CIPHER_004 | Cipher-7 | Security Intelligence | 19:00 EST |
| GRP7_ECHO_005 | Echo-7 | Communication Intelligence | 15:00 EST |
| GRP7_QUANTUM_006 | Quantum-7 | Optimization Intelligence | 21:00 EST |
| GRP7_NEXUS_007 | Nexus-7 | Integration Intelligence | 20:00 EST |

**Platforms:** TikTok, Instagram, YouTube (all 7 videos)
**Total Runtime:** ~3 minutes of content (25-27 sec each)

---

## 📋 Next Steps (In Order)

### Step 1: Verify Google Drive Sync
```bash
# Check if file appears in web browser
open "https://drive.google.com/drive/folders/"
# Navigate to: My Drive → Group7 → Production → CSV_Inputs
```
**Expected:** You should see `GROUP7_CANVA_BATCH_2025-10-30.csv`

---

### Step 2: Set Up Notion Databases

1. **Open Notion** (notion.so)
2. **Create New Page** → "Group 7 Automation"
3. **Follow guide:** `NOTION_DATABASE_SETUP_GUIDE.md`
4. **Create 3 databases:**
   - Video Log (30 properties, 7 views)
   - Engagement Review Queue
   - Analytics Reports
5. **Copy Database IDs** (you'll need these for Make.com)

**Time estimate:** 15-20 minutes

---

### Step 3: Set Up Make.com Scenario

1. **Go to:** make.com → Create new scenario
2. **Name it:** "Group 7 Daily Content Pipeline"
3. **Add modules in this order:**

#### Core Production Flow:
```
M1: Schedule (06:00 EST daily)
    ↓
M2: Google Drive > Download CSV
    File: /Group7/Production/CSV_Inputs/GROUP7_CANVA_BATCH_{{date}}.csv
    ↓
M3: Parse CSV (built-in)
    ↓
M4: Canva > Bulk Create from CSV
    Template ID: [Your Canva template]
    ↓
M5: Iterator (process each video)
    ↓
M5.1: ElevenLabs TTS
       ↓
M5.2: CloudConvert (merge video + audio)
       ↓
M5.3: Metricool Schedule
       ↓
M5.4: Google Drive Upload (Voice, Video, Captions)
       ↓
M5.5: Notion Create Page (Video Log)
```

**Time estimate:** 45-60 minutes

---

### Step 4: Test with 1 Video

**Before running full batch:**
1. Create a test CSV with just 1 row (Lyra-7)
2. Run Make.com scenario manually
3. Verify each module executes successfully
4. Check outputs in Google Drive and Notion

---

### Step 5: Configure API Credentials

You'll need these API keys:

- [ ] **Canva Pro** - Template ID + API key
- [ ] **ElevenLabs** - API key (get from: elevenlabs.io/account)
- [ ] **CloudConvert** - API key (get from: cloudconvert.com/dashboard)
- [ ] **Metricool** - API token (get from: metricool.com/api)
- [ ] **Google Drive** - OAuth connection (via Make.com)
- [ ] **Notion** - Integration token (via Make.com)

**Cost estimate:** ~$165-195/month (see previous breakdown)

---

## 🆘 If You Get Stuck

### Common Issues:

**"CSV not found in Google Drive"**
- Wait 1-2 minutes for sync
- Check file exists in browser (drive.google.com)
- Verify path in Make.com module is correct

**"Canva template not found"**
- You need to create a 1080x1920 Canva template first
- Add text layers: "hook_text", "insight_text", "cta_text"
- Get template ID from Canva URL

**"ElevenLabs voice not found"**
- Voice names: Rachel, Onyx, Nova, Echo (or Adam, Bella, etc.)
- Get voice IDs from: elevenlabs.io/voice-library
- Update in automation JSON

**"Notion database ID invalid"**
- Copy link to database view
- Extract ID from URL (between / and ?)
- Format: `abc123def456ghi789`

---

## 📊 What Happens When You Run It

### Timeline (for 7 videos):

```
06:00 AM - Trigger fires
06:01 AM - CSV downloaded from Google Drive
06:02 AM - Canva generates 7 silent MP4s (~3 min)
06:05 AM - ElevenLabs generates 7 voiceovers (~2 min)
06:07 AM - CloudConvert merges video + audio (~7 min)
06:14 AM - Files uploaded to Google Drive (~2 min)
06:16 AM - Metricool schedules all 7 posts
06:17 AM - Notion logs created
06:18 AM - ✅ DONE
```

**Total automation runtime:** ~18 minutes
**Your time required:** 0 minutes (fully automated)

### Then throughout the day:

- **11:30 AM** - Nova-7 publishes (TikTok/IG/YouTube)
- **3:00 PM** - Echo-7 publishes
- **7:00 PM** - Cipher-7 publishes
- **7:30 PM** - Lyra-7 publishes
- **8:00 PM** - Atlas-7 + Nexus-7 publish
- **9:00 PM** - Quantum-7 publishes

---

## 🎉 You're Ready!

**What you've accomplished:**
- ✅ 7 complete video scripts with timing
- ✅ Professional captions (<200 chars each)
- ✅ Optimized hashtag strategy
- ✅ Google Drive folder structure
- ✅ CSV uploaded and ready
- ✅ Notion database templates
- ✅ Complete automation blueprint

**What's next:**
1. Set up Notion databases (15 min)
2. Build Make.com scenario (45 min)
3. Get API keys (30 min)
4. Test with 1 video (15 min)
5. **LAUNCH!** 🚀

---

**Questions?** Check the setup guides or let me know what you need help with next!
