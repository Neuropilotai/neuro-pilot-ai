# GROUP7 VIDEO FACTORY - Deployment Guide

Complete setup guide for the Group7 automated video production pipeline.

## Architecture Overview

```
CSV Input → Voice Gen (ElevenLabs) → Canva Render → CloudConvert Merge → Google Drive → Notion Log
```

## Prerequisites

- Node.js 20+
- Active accounts for:
  - Canva (with API access)
  - CloudConvert
  - Google Cloud (Service Account)
  - Notion
  - ElevenLabs (already configured)

---

## Part 1: Environment Setup

### Step 1: Copy Environment Template

```bash
cd ~/neuro-pilot-ai/Group7
cp GROUP7_ENV_TEMPLATE.env .env
```

### Step 2: Verify Existing Keys

You already have these configured:
- ✅ ELEVENLABS_API_KEY
- ✅ OPENAI_API_KEY
- ✅ NOTION_TOKEN

Run validation:
```bash
npm run env:check
```

---

## Part 2: Canva Setup

### Step 1: Create Canva App

1. Go to https://www.canva.com/developers/apps
2. Click "Create an app"
3. Choose "Desktop integration" or "Server-side"
4. Note your **App ID** and **App Secret**

### Step 2: Get Access Token

**Option A: OAuth Flow** (recommended for production)
```bash
# Follow Canva OAuth docs to get user access token
# https://www.canva.com/developers/docs/authentication/oauth/
```

**Option B: Personal Access Token** (for testing)
1. Go to Canva Developer portal
2. Generate a personal access token (expires after 1 year)
3. Save to `.env`

### Step 3: Create Video Template

1. Design your video template in Canva
2. Add text elements named:
   - `hook_text`
   - `insight_text`
   - `cta_text`
3. Publish as template
4. Get template ID from URL: `canva.com/design/[THIS_IS_THE_ID]/...`
5. Add to `.env` as `CANVA_TEMPLATE_ID`

Add to `.env`:
```env
CANVA_APP_ID=your_app_id
CANVA_APP_SECRET=your_app_secret
CANVA_ACCESS_TOKEN=your_access_token
CANVA_TEMPLATE_ID=your_template_id
```

---

## Part 3: CloudConvert Setup

### Step 1: Get API Key

1. Go to https://cloudconvert.com/dashboard/api/v2/keys
2. Click "Create New API Key"
3. Copy the key

Add to `.env`:
```env
CLOUDCONVERT_API_KEY=your_api_key_here
```

### CloudConvert Pricing

- Free tier: 25 conversions/day
- Pay-as-you-go: $0.008 per conversion minute
- For 60s videos: ~$0.008/video

---

## Part 4: Google Drive Setup (Service Account)

### Step 1: Create Service Account

1. Go to https://console.cloud.google.com
2. Select your project (or create new)
3. Go to **IAM & Admin → Service Accounts**
4. Click **Create Service Account**
5. Name: `group7-uploader`
6. Grant role: **None** (we'll share folders directly)
7. Click **Done**

### Step 2: Create and Download Key

1. Click on the service account you just created
2. Go to **Keys** tab
3. Click **Add Key → Create new key**
4. Choose **JSON** format
5. Download the file (e.g., `group7-sa-key.json`)

### Step 3: Extract and Encode Private Key

```bash
# Extract private key and base64 encode it
cat group7-sa-key.json | jq -r .private_key | base64 | tr -d '\n' > private_key_b64.txt

# Copy the base64 string
cat private_key_b64.txt
```

### Step 4: Get Service Account Email

```bash
cat group7-sa-key.json | jq -r .client_email
```

### Step 5: Share Drive Folder

1. Open Google Drive
2. Navigate to your output folder (e.g., `Group7/Production/Video`)
3. Right-click → **Share**
4. Paste the **service account email** (ends with `@[project].iam.gserviceaccount.com`)
5. Give **Editor** access
6. Click **Share**

### Step 6: Get Folder ID

From the folder URL in Google Drive:
```
https://drive.google.com/drive/folders/[THIS_IS_THE_FOLDER_ID]
```

Add to `.env`:
```env
GDRIVE_OUTPUT_FOLDER_ID=your_folder_id_here
GDRIVE_SERVICE_EMAIL=your-sa@project.iam.gserviceaccount.com
GDRIVE_PRIVATE_KEY_BASE64=your_base64_encoded_private_key
```

**SECURITY NOTE**: Never commit the service account JSON or base64 key to git!

---

## Part 5: Notion Setup

You already have `NOTION_TOKEN` configured. Now create the database:

### Step 1: Create Video Production Database

1. Open Notion
2. Create new page: "Video Production Log"
3. Add a database with these properties:
   - **Name** (Title)
   - **Agent** (Select: Lyra-7, Atlas, Nova, Cipher, Echo, Quantum, Nexus)
   - **Slug** (Text)
   - **Status** (Select: pending, processing, success, failed)
   - **Created** (Date)
   - **Canva URL** (URL)
   - **Drive Link** (URL)
   - **File ID** (Text)
   - **Error** (Text)

### Step 2: Share Database with Integration

1. Click **Share** on the database page
2. Invite your Notion integration
3. Give **Edit** access

### Step 3: Get Database ID

From the database URL:
```
https://www.notion.so/workspace/[THIS_IS_THE_DATABASE_ID]?v=...
```

Add to `.env`:
```env
NOTION_VIDEO_DB_ID=your_database_id_here
```

---

## Part 6: Verification

### Test 1: Environment Check

```bash
npm run env:check
```

Expected output:
```
✅ All required environment variables are set!
```

### Test 2: Voice Generation (Already Working)

```bash
npm run say "Test message" config/voices/lyra7.voice.json
```

### Test 3: Canva Render (Dry Run)

```bash
npm run canva:render -- \
  --templateId $CANVA_TEMPLATE_ID \
  --hook "Test hook" \
  --insight "Test insight" \
  --cta "Test CTA" \
  --agent Lyra \
  --slug test01
```

Expected output:
```json
{
  "status": "success",
  "canvaMp4Url": "https://export-download.canva.com/...",
  "external_id": "lyra-test01",
  "jobId": "..."
}
```

### Test 4: Full Pipeline

First, ensure you have a voice file:
```bash
node --env-file=.env ops/scripts/say.js \
  "Test voiceover for Lyra" \
  config/voices/lyra7.voice.json

mv out/VOICE_*.mp3 Production/Voice/GRP7_Lyra_test01.mp3
```

Then run the full pipeline:
```bash
npm run run:one -- \
  --agent Lyra \
  --slug test01 \
  --hook "Most people wait for the future." \
  --insight "We don't. We build it." \
  --cta "Follow Group7"
```

Expected timeline:
- Canva render: ~30-60s
- CloudConvert merge: ~30-90s
- Drive upload: ~10-30s
- Notion log: ~2s
- **Total: ~2-3 minutes**

---

## Part 7: Troubleshooting

### Issue: "HTTP 401: Unauthorized" on Canva

**Solution**: Check your `CANVA_ACCESS_TOKEN`
- Tokens expire (personal tokens: 1 year, OAuth: refresh needed)
- Re-generate token and update `.env`

### Issue: "Voice not found" on CloudConvert

**Solution**: Ensure voice file exists at expected path:
```bash
ls Production/Voice/GRP7_Lyra_test01.mp3
```

### Issue: "Permission denied" on Google Drive

**Solution**: Verify folder sharing
1. Check service account email in `.env` matches Google Cloud
2. Verify folder is shared with service account (Editor access)
3. Test JWT generation:
```bash
node scripts/upload-gdrive.mjs --help
```

### Issue: "Database not found" on Notion

**Solution**:
1. Verify `NOTION_VIDEO_DB_ID` in `.env`
2. Ensure database is shared with your integration
3. Check integration has edit permissions

### Issue: CloudConvert job fails

**Solution**:
- Check CloudConvert dashboard: https://cloudconvert.com/dashboard
- Verify API key has credits remaining
- Check job error messages in dashboard

---

## Part 8: Production Deployment

### Option A: Local Automation (cron)

```bash
# Add to crontab
crontab -e

# Run daily at 9 AM
0 9 * * * cd ~/neuro-pilot-ai/Group7 && npm run run:one -- --agent Lyra --slug daily_$(date +\%Y\%m\%d)
```

### Option B: Make.com Automation

See `MAKE_QUICK_START.md` for detailed Make.com setup.

---

## Cost Estimate

Per video (60 seconds):
- ElevenLabs: ~$0.015 (voice)
- Canva: Free tier or $12.99/month (unlimited renders)
- CloudConvert: ~$0.008 (merge)
- Google Drive: Free (15GB) or $1.99/month (100GB)
- Notion: Free tier

**Total per video: ~$0.02 + subscriptions**

---

## Next Steps

1. ✅ Complete environment setup
2. ✅ Test each component individually
3. ✅ Run full pipeline test
4. ✅ Verify output in Google Drive
5. ✅ Check Notion log entry
6. → Deploy Make.com automation (see MAKE_QUICK_START.md)
7. → Schedule daily production runs

---

**Need help?** Check:
- `VALIDATION_GUIDE.md` - Quality checks
- `GROUP7_VIDEO_AUTOMATION_SUMMARY.md` - System overview
- `QUICK_REFERENCE.md` - Command reference

**Ready to automate!** 🎬
