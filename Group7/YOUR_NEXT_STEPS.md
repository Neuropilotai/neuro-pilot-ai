# 🎯 YOUR NEXT STEPS — Personalized Setup Guide

**You're 60% there! Here's exactly what to do next.**

---

## ✅ What You Already Have

```bash
✓ OpenAI API Key
✓ ElevenLabs API Key
✓ Google Drive Token
✓ Canva App ID (AAG3cyS3k2Q)
✓ Canva App Secret
✓ CloudConvert Token
✓ Metricool Token
✓ Notion Token
✓ Timezone set (America/Toronto)
```

**Great foundation! Now let's complete the setup.**

---

## 🚀 Your 3-Step Path to First Video

### **STEP 1: Get Missing IDs (20 minutes)**

Run the helper script:

```bash
cd /Users/davidmikulis/neuro-pilot-ai/Group7
./get-missing-ids.sh
```

This will guide you through getting:
- ✓ Metricool Social Account IDs (TikTok, Instagram, YouTube)
- ✓ Google Drive Folder IDs
- ✓ Notion Database IDs
- ✓ Canva Template ID

Or do it manually (instructions in the script).

---

### **STEP 2: Complete .env File (10 minutes)**

Create your `.env` file:

```bash
cd /Users/davidmikulis/neuro-pilot-ai/Group7

# Copy template
cp .env.example .env

# Edit with your preferred editor
nano .env
# or
code .env
# or
vim .env
```

**Fill in these sections:**

```bash
# ==========================================
# APIs (YOU HAVE THESE) ✓
# ==========================================
OPENAI_API_KEY=sk-...                    # ✓ You have this
ELEVENLABS_API_KEY=...                   # ✓ You have this
GOOGLE_DRIVE_TOKEN=...                   # ✓ You have this
CANVA_APP_ID=AAG3cyS3k2Q                 # ✓ You have this
CANVA_APP_SECRET=...                     # ✓ You have this
CLOUDCONVERT_TOKEN=...                   # ✓ You have this
METRICOOL_TOKEN=...                      # ✓ You have this
NOTION_TOKEN=...                         # ✓ You have this

# ==========================================
# IDs (GET FROM STEP 1) ✗
# ==========================================
# Canva Template
CANVA_TEMPLATE_ID=                       # ✗ Create template, get ID

# Google Drive Folders
DRIVE_ROOT_FOLDER_ID=                    # ✗ Create /Group7/ folder
DRIVE_SCRIPTS_FOLDER_ID=                 # ✗ Create /Group7/Scripts/
DRIVE_VOICE_FOLDER_ID=                   # ✗ Create /Group7/Voice/
DRIVE_VIDEOS_FOLDER_ID=                  # ✗ Create /Group7/Production/Videos/
DRIVE_ANALYTICS_FOLDER_ID=               # ✗ Create /Group7/Analytics/

# Metricool Social Accounts
TIKTOK_ACCOUNT_ID=                       # ✗ Get from Metricool API
INSTAGRAM_ACCOUNT_ID=                    # ✗ Get from Metricool API
YOUTUBE_ACCOUNT_ID=                      # ✗ Get from Metricool API

# Notion Databases
VIDEO_PRODUCTION_LOG_DB_ID=              # ✗ Create database, get ID
ANALYTICS_INSIGHTS_DB_ID=                # ✗ Create database, get ID
ERROR_LOG_DB_ID=                         # ✗ Create database, get ID
CONFIG_CHANGELOG_DB_ID=                  # ✗ Create database, get ID

# ==========================================
# Other Settings (OPTIONAL)
# ==========================================
NOTIFICATION_EMAIL=your-email@example.com
```

---

### **STEP 3: Validate & Test (15 minutes)**

```bash
cd /Users/davidmikulis/neuro-pilot-ai/Group7

# 1. Install dependencies
npm install

# 2. Validate configuration
./validate-deployment.sh

# Expected output: ✅ All checks passed!

# 3. Start Canva render service
npm run dev

# Keep this running in one terminal
```

**In another terminal:**

```bash
# Test the service
curl http://localhost:3001/health

# Expected: {"status":"ok","service":"canva-render-service",...}
```

**Test voice generation:**

```bash
# Quick test
curl -X POST https://api.elevenlabs.io/v1/text-to-speech/21m00Tcm4TlvDq8ikWAM \
  -H "xi-api-key: YOUR_ELEVENLABS_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"text":"Testing voice generation for Lyra","model_id":"eleven_turbo_v2_5","voice_settings":{"stability":0.65,"similarity_boost":0.75}}' \
  --output test-voice.mp3

# Play it (macOS)
afplay test-voice.mp3
```

If you hear a voice → **Success!** ✅

---

## 🎬 What Happens After Setup

Once you complete Steps 1-3:

1. **Import Make.com Scenario** (15 min)
   - File: `MAKECOM_VIDEO_FACTORY_SCENARIO.json`
   - Import to Make.com
   - Configure with your API keys

2. **Run First Test** (20 min)
   - Manual test with 1 agent (Lyra)
   - Verify voice → video → post → log

3. **Go Live** (1 min)
   - Enable Make.com scheduler
   - System runs daily at 6:00 AM

**Total time:** ~60 minutes from now to first video

---

## 📋 Quick Reference: Missing IDs

### **Metricool Account IDs**

```bash
# Get via API
curl -X GET https://api.metricool.com/v1/accounts \
  -H "Authorization: Bearer YOUR_METRICOOL_TOKEN" | jq

# Or use the helper script
./get-missing-ids.sh
```

### **Google Drive Folder IDs**

1. Create folders in Google Drive:
   - `/Group7/`
   - `/Group7/Scripts/`
   - `/Group7/Voice/`
   - `/Group7/Production/Videos/`
   - `/Group7/Analytics/`

2. For each folder:
   - Right-click → Share → "Anyone with link can view"
   - Copy URL: `https://drive.google.com/drive/folders/FOLDER_ID_HERE`
   - Extract `FOLDER_ID_HERE` (32 chars after `/folders/`)

### **Notion Database IDs**

1. Create databases using `NOTION_DATABASE_SCHEMAS.json`
2. Create integration: https://www.notion.so/my-integrations
3. Share databases with integration
4. Get IDs from database URLs (32-char hex)

### **Canva Template ID**

1. Canva → Create Design → 1080 x 1920 px
2. Add text elements: `hook_text`, `insight_text`, `cta_text`, `agent_name`
3. Save as template
4. Copy ID from URL

---

## 🆘 Troubleshooting

### "I can't find my Google Drive folder ID"
→ Open folder → URL bar → `https://drive.google.com/drive/folders/ID_IS_HERE`

### "Metricool API returns 401"
→ Verify token in Metricool dashboard → Settings → API

### "Notion database not found"
→ Make sure you shared database with integration

### "Canva template ID doesn't work"
→ Verify you're using the template ID, not the design ID

---

## 📞 Resources

All in this folder (`/Group7/`):

- **QUICKSTART.md** — 60-minute guided setup
- **DEPLOYMENT_GUIDE.md** — Full detailed instructions
- **NOTION_DATABASE_SCHEMAS.json** — Copy these to Notion
- **validate-deployment.sh** — Check everything is configured
- **get-missing-ids.sh** — Helper to get IDs

---

## ✅ Your Checklist

Complete these in order:

- [ ] Run `./get-missing-ids.sh` to get remaining IDs
- [ ] Create Google Drive folders and get IDs
- [ ] Create Canva template and get ID
- [ ] Connect Metricool accounts and get IDs
- [ ] Create 4 Notion databases and get IDs
- [ ] Fill in all values in `.env` file
- [ ] Run `npm install`
- [ ] Run `./validate-deployment.sh` (should pass)
- [ ] Start Canva service: `npm run dev`
- [ ] Test voice generation (hear audio)
- [ ] Read **QUICKSTART.md** for next steps
- [ ] Import Make.com scenario
- [ ] Run manual test (1 video)
- [ ] Enable scheduler → Go live!

---

## 🎯 Bottom Line

**You have:** API keys ✅
**You need:** Configuration IDs (folders, databases, accounts)
**Time needed:** 60 minutes
**Next action:** Run `./get-missing-ids.sh`

---

**You're closer than you think. Let's get your first video live today! 🚀**

---

Last updated: 2025-01-15
