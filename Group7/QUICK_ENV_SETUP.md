# ⚡ Quick Environment Setup for Shotstack System

## 🚨 Missing Variables (Add to `.env`)

### **1. Google Drive Service Account (Required)**

```bash
# Add these to your .env file:
GDRIVE_OUTPUT_FOLDER_ID=1xxxxxxxxxxxxxxxxxxxxx
GDRIVE_SERVICE_EMAIL=your-service-account@your-project.iam.gserviceaccount.com
GDRIVE_PRIVATE_KEY_BASE64=base64-encoded-private-key
```

**How to get these:**

1. **Create Google Cloud Project**: https://console.cloud.google.com/
2. **Enable Google Drive API**: APIs & Services → Enable APIs → Drive API
3. **Create Service Account**:
   - IAM & Admin → Service Accounts → Create
   - Name: `group7-video-uploader`
   - Role: None needed (will grant folder access)
4. **Create JSON Key**:
   - Click on service account
   - Keys → Add Key → Create New Key → JSON
   - Download the JSON file
5. **Extract credentials**:
   ```bash
   # From the downloaded JSON, get:
   GDRIVE_SERVICE_EMAIL = "client_email" field

   # Encode the private_key:
   echo -n "YOUR_PRIVATE_KEY_FROM_JSON" | base64
   # This gives you GDRIVE_PRIVATE_KEY_BASE64
   ```
6. **Create Google Drive Folder**:
   - Go to Google Drive
   - Create folder: "Group7 Videos"
   - Share folder with service account email (Editor access)
   - Copy folder ID from URL: `https://drive.google.com/drive/folders/FOLDER_ID_HERE`

### **2. Fix API Keys (If Invalid)**

Your API keys are set but returning 401. You may need to refresh them:

#### **OpenAI** (Currently returning 401)
```bash
OPENAI_API_KEY=sk-proj-xxxxxxxxxxxxxxxxxxxxx
```
Get new key: https://platform.openai.com/api-keys

#### **ElevenLabs** (Currently returning 401)
```bash
ELEVENLABS_API_KEY=elv_xxxxxxxxxxxxxxxxxxxxx
```
Get new key: https://elevenlabs.io/app/settings/api-keys

#### **Shotstack** ✅ (Already working!)
```bash
SHOTSTACK_API_KEY=prod_xxxxxxxxxxxxxxxxxxxxx  # ✅ Valid!
SHOTSTACK_REGION=us
SHOTSTACK_STAGE=v1
```

### **3. Optional - Notion Database (For Logging)**

```bash
NOTION_TOKEN=ntn_xxxxxxxxxxxxxxxxxxxxx
NOTION_VIDEO_DB_ID=xxxxxxxxxxxxxxxxxxxxxxxx
```

**How to get these:**

1. **Create Notion Integration**: https://www.notion.so/my-integrations
2. **Create Database** in Notion with these properties:
   - Title (title)
   - Agent (select)
   - Hook (rich_text)
   - Insight (rich_text)
   - Video URL (url)
   - Status (select)
   - Created (date)
3. **Share database** with your integration
4. **Copy database ID** from URL: `https://notion.so/DATABASE_ID_HERE?v=...`

---

## 🚀 Quick Setup Script

Run this after adding the variables:

```bash
# 1. Verify environment
node scripts/env-check-shotstack.mjs

# 2. Run system test
node test-complete-pipeline.mjs

# 3. Test voice generation (if ElevenLabs key is fixed)
node scripts/elevenlabs.mjs test Lyra "Hello from Group7"

# 4. Test Shotstack render
npm run shotstack:test
```

---

## 📝 Minimal Working `.env` (Shotstack Only)

If you just want to test Shotstack without other services:

```bash
# Required for Shotstack
SHOTSTACK_API_KEY=prod_xxxxxxxxxxxxxxxxxxxxx
SHOTSTACK_REGION=us
SHOTSTACK_STAGE=v1

# Required for voice (if using ElevenLabs)
ELEVENLABS_API_KEY=elv_xxxxxxxxxxxxxxxxxxxxx

# Required for script generation (if using GPT-4)
OPENAI_API_KEY=sk-proj-xxxxxxxxxxxxxxxxxxxxx

# Required for uploads
GDRIVE_OUTPUT_FOLDER_ID=1xxxxxxxxxxxxxxxxxxxxx
GDRIVE_SERVICE_EMAIL=service@project.iam.gserviceaccount.com
GDRIVE_PRIVATE_KEY_BASE64=base64-encoded-key

# Optional - for logging
NOTION_TOKEN=ntn_xxxxxxxxxxxxxxxxxxxxx
NOTION_VIDEO_DB_ID=xxxxxxxxxxxxxxxxxxxxxxxx
```

---

## ✅ Current Status

Based on your test results:

| Component | Status | Action Needed |
|-----------|--------|---------------|
| Shotstack API | ✅ Working | None - ready to use! |
| File Structure | ✅ Complete | None |
| Video Template | ✅ Valid | None |
| Production Dir | ✅ Ready | None |
| Google Drive | ❌ Missing | Add 3 variables above |
| ElevenLabs | ❌ Invalid | Refresh API key |
| OpenAI | ❌ Invalid | Refresh API key |

---

## 🎯 Next Steps

1. **Add Google Drive credentials** to `.env`
2. **Refresh ElevenLabs key** (if needed)
3. **Refresh OpenAI key** (if needed)
4. **Re-run tests**: `node test-complete-pipeline.mjs`
5. **Generate first video**: `node ops/run-one-shotstack.mjs --agent=Lyra`

---

## 💡 Pro Tip

You can test **just Shotstack rendering** without the full pipeline:

```bash
# This will work with just SHOTSTACK_API_KEY:
npm run shotstack:test
```

This creates a test video using sample audio and text!
