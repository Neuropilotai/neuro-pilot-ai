# Group 7 AI Video Factory - Production Deployment Guide

## Overview

This guide will take you from zero to fully automated daily video production in approximately **60 minutes**.

**What you're deploying:**
- 12-module Make.com automation scenario
- Daily 6 AM EST trigger
- 7 AI-generated videos per day (one per Group 7 agent)
- Multi-platform posting (TikTok, Instagram, YouTube)
- Full analytics tracking in Notion

**Total setup time:** 60 minutes
**Monthly cost:** ~$30 + platform subscriptions (~$80 total)
**Videos produced:** 210/month (7/day × 30 days)

---

## Prerequisites Checklist

Before starting, ensure you have:

- ✅ Make.com Pro account ($9/month) - https://www.make.com/en/pricing
- ✅ Google Account (neuro.pilot.ai@gmail.com)
- ✅ OpenAI Platform account with GPT-4 API access
- ✅ ElevenLabs account with API access + character credits
- ✅ Canva Pro account ($12.99/month) with API access
- ✅ CloudConvert account (free tier OK for 7 videos/day)
- ✅ Metricool account (free tier or Pro $20/month)
- ✅ Notion workspace with admin access
- ✅ Social media accounts: TikTok, Instagram, YouTube
- ✅ 60 minutes of uninterrupted time

---

## 10-Step Production Deployment

### **STEP 1: Gather All API Keys (15 minutes)**

**1.1 OpenAI API Key**
1. Go to: https://platform.openai.com/api-keys
2. Click **"Create new secret key"**
3. Name: `Group 7 Video Factory`
4. Copy key (starts with `sk-proj-...`)
5. Verify GPT-4 access: https://platform.openai.com/settings/organization/limits
6. Save to: `GROUP7_ENV_TEMPLATE.env` → `OPENAI_API_KEY`

**1.2 ElevenLabs API Key**
1. Go to: https://elevenlabs.io/app/settings/api-keys
2. Click **"Generate API Key"**
3. Name: `Make.com Group 7`
4. Copy key (starts with `sk_...`)
5. Verify credits: Need ~210,000 characters/month
6. Save to: `ELEVENLABS_API_KEY`

**1.3 Canva API Key**
1. Go to: https://www.canva.com/developers/apps
2. Click **"Create an app"**
3. App name: `Group 7 Video Automation`
4. Select: **"Canva Apps SDK"**
5. Click **"Create app"**
6. Copy **"Client ID"** → Save to `CANVA_API_KEY`
7. Note: May require Canva Enterprise for full API access

**1.4 CloudConvert API Key**
1. Go to: https://cloudconvert.com/dashboard/api/v2/keys
2. Click **"Create new API Key"**
3. Name: `Group 7 Video Merge`
4. Copy key (starts with `eyJ0eXAi...`)
5. Free tier: 25 minutes/day (enough for 7 videos)
6. Save to: `CLOUDCONVERT_API_KEY`

**1.5 Metricool API Token**
1. Go to: https://app.metricool.com/settings/integrations/api
2. Click **"Generate API Token"**
3. Copy token
4. Save to: `METRICOOL_API_TOKEN`
5. Get Brand ID from URL: `app.metricool.com/YOUR_BRAND_ID/...`
6. Save to: `METRICOOL_BRAND_ID`

**1.6 Notion API Key**
1. Go to: https://www.notion.so/my-integrations
2. Click **"+ New integration"**
3. Name: `Group 7 Video Analytics`
4. Associated workspace: Select your workspace
5. Click **"Submit"**
6. Copy **"Internal Integration Token"** (starts with `secret_...`)
7. Save to: `NOTION_API_KEY`

✅ **Checkpoint:** You should have 6 API keys saved in your .env file

---

### **STEP 2: Create Notion Analytics Database (5 minutes)**

1. Open Notion workspace
2. Create new page: **"Group 7 - Video Production Analytics"**
3. Create database: `/table` → Full page database
4. Import schema from: `NOTION_VIDEO_DATABASE_SCHEMA.json`

   **Manual schema setup (if import doesn't work):**
   - Add property: **Video ID** (Title)
   - Add property: **Agent** (Select: Lyra, Atlas, Nova, Cipher, Echo, Quantum, Nexus)
   - Add property: **Status** (Select: Generating, Scheduled, Posted, Live, Analyzing, Optimized, Failed)
   - Add property: **Batch Date** (Date)
   - Add property: **Post Time** (Date)
   - Add property: **Platforms** (Multi-select: TikTok, Instagram, YouTube)
   - Add property: **Voiceover Script** (Text)
   - Add property: **Caption** (Text)
   - Add property: **Voice File** (URL)
   - Add property: **Final Video** (URL)
   - Add property: **Metricool Post ID** (Text)
   - Add property: **Views (24h)** (Number)
   - Add property: **Likes** (Number)
   - Add property: **Comments** (Number)
   - Add property: **Shares** (Number)
   - Add property: **Completion Rate (%)** (Number)
   - Add property: **Learning Notes** (Text)

5. Click **"Share"** → **"Invite"** → Select your integration: **"Group 7 Video Analytics"**
6. Copy database ID from URL:
   - URL format: `https://notion.so/xxxxxxxxxxxxxxxxxxxxxxxxxxxxx?v=...`
   - Copy the 32-character ID before `?v=`
7. Save to: `NOTION_VIDEO_DB_ID`

✅ **Checkpoint:** Notion database created and connected to integration

---

### **STEP 3: Configure Google OAuth for Make.com (10 minutes)**

**Follow detailed guide:** `GOOGLE_OAUTH_SETUP_GUIDE.md`

**Quick steps:**
1. Go to: https://console.cloud.google.com/
2. Create project: **"Group 7 Automation"**
3. Enable **Google Drive API**
4. Create **OAuth consent screen** (External, app name: "Group 7 Make.com")
5. Add scopes: `.../auth/drive`
6. Add test user: `neuro.pilot.ai@gmail.com`
7. Create **OAuth Client ID** (Web application)
8. Add redirect URIs:
   - `https://www.integromat.com/oauth/cb/google-restricted`
   - `https://www.make.com/oauth/cb/google-restricted`
9. Copy **Client ID** and **Client Secret**
10. Save for Make.com connection setup

✅ **Checkpoint:** Google OAuth credentials ready

---

### **STEP 4: Create Canva Video Template (10 minutes)**

1. Open Canva Pro: https://www.canva.com/
2. Search templates: **"TikTok Video"** or **"Instagram Reel"**
3. Select vertical video template (1080 × 1920 px)
4. Design 3-section template:
   - **Section 1 (0-3s):** Text element named `hook_text`
   - **Section 2 (3-7s):** Text element named `insight_text`
   - **Section 3 (7-10s):** Text element named `cta_text`
5. Add Group 7 branding:
   - Logo/watermark
   - Brand colors (purple/blue gradient recommended)
   - Font: Bold sans-serif (e.g., Montserrat, Poppins)
6. Save as template
7. Get template ID:
   - Click **"Share"** → **"Template link"**
   - Copy ID from URL: `canva.com/design/TEMPLATE_ID/...`
8. Save to: `CANVA_TEMPLATE_ID`

**Alternative:** Use Canva API to programmatically create templates (advanced)

✅ **Checkpoint:** Canva template ready with named elements

---

### **STEP 5: Connect Social Media to Metricool (5 minutes)**

1. Go to: https://app.metricool.com/
2. Click **"Add profile"**
3. Connect **TikTok**:
   - Select TikTok → Sign in → Authorize
   - Copy profile ID from Metricool API → Save to `TIKTOK_PROFILE_ID`
4. Connect **Instagram**:
   - Select Instagram → Sign in → Authorize
   - Must be Instagram Business/Creator account
   - Copy profile ID → Save to `INSTAGRAM_PROFILE_ID`
5. Connect **YouTube**:
   - Select YouTube → Sign in → Authorize
   - Enable YouTube Shorts posting
   - Copy profile ID → Save to `YOUTUBE_PROFILE_ID`

**Get profile IDs via API:**
```bash
curl -X GET "https://api.metricool.com/v1/profiles" \
  -H "Authorization: Bearer YOUR_METRICOOL_API_TOKEN"
```

✅ **Checkpoint:** All 3 social platforms connected to Metricool

---

### **STEP 6: Import Blueprint to Make.com (5 minutes)**

1. Open: `GROUP7_AI_VIDEO_FACTORY_BLUEPRINT.json` in text editor
2. **Copy entire file** (Cmd+A, Cmd+C)
3. Go to: https://us2.make.com/1535156/scenarios
4. Click **"Create a new scenario"**
5. Click **"..." (three dots)** → **"Import blueprint"**
6. **Paste JSON** (Cmd+V)
7. Click **"Save"**
8. Scenario name: **"Group 7 - AI Video Factory [PRODUCTION]"**
9. Click **"OK"**

You should see **12 modules** on canvas:
1. Schedule (clock icon)
2. HTTP - OpenAI (webhook icon)
3. JSON Parser
4. Iterator (flow control)
5. HTTP - ElevenLabs
6. Google Drive Upload (voice)
7. HTTP - Canva
8. HTTP - CloudConvert
9. Google Drive Upload (video)
10. HTTP - Metricool
11. Notion Create Item
12. Error Handler

✅ **Checkpoint:** Blueprint imported successfully, 12 modules visible

---

### **STEP 7: Configure Module Connections (10 minutes)**

**Module 1 - Schedule (no connection needed)**
- Verify time: 06:00
- Verify timezone: America/Toronto

**Module 2 - OpenAI GPT-4**
1. Click module
2. Headers section → Find `Authorization`
3. Replace `{{OPENAI_API_KEY}}` → Paste your actual API key
4. Click **"OK"**

**Module 5 - ElevenLabs**
1. Click module
2. Headers section → Find `xi-api-key`
3. Replace `{{ELEVENLABS_API_KEY}}` → Paste your actual API key
4. Click **"OK"**

**Module 6 - Google Drive Upload (Voice)**
1. Click module
2. Connection: Click **"Add"**
3. Select **"Use custom OAuth client"**
4. Paste **Client ID** and **Client Secret** from Step 3
5. Click **"Sign in with Google"**
6. Select: `neuro.pilot.ai@gmail.com`
7. Click **"Continue"** on warning (it's your app - safe)
8. Click **"Allow"**
9. Update folder path: `/Group7/Production/Production/Voice`
10. Click **"OK"**

**Module 7 - Canva**
1. Click module
2. Headers → Find `Authorization`
3. Replace `{{CANVA_API_KEY}}` → Paste your API key
4. Body → Find `template_id`
5. Replace `{{CANVA_TEMPLATE_ID}}` → Paste your template ID
6. Click **"OK"**

**Module 8 - CloudConvert**
1. Click module
2. Headers → Find `Authorization`
3. Replace `{{CLOUDCONVERT_API_KEY}}` → Paste your API key
4. Click **"OK"**

**Module 9 - Google Drive Upload (Video)**
1. Click module
2. Connection: Select same connection as Module 6
3. Update folder path: `/Group7/Production/Production/Videos`
4. Click **"OK"**

**Module 10 - Metricool**
1. Click module
2. Headers → Find `Authorization`
3. Replace `{{METRICOOL_API_TOKEN}}` → Paste your token
4. Body → Find `brand_id`
5. Replace `{{METRICOOL_BRAND_ID}}` → Paste your brand ID
6. Body → Find `profiles` array
7. Replace `{{TIKTOK_PROFILE_ID}}`, `{{INSTAGRAM_PROFILE_ID}}`, `{{YOUTUBE_PROFILE_ID}}`
8. Click **"OK"**

**Module 11 - Notion**
1. Click module
2. Connection: Click **"Add"**
3. Paste **Notion API Key** (starts with `secret_...`)
4. Click **"Save"**
5. Database ID: Replace `{{NOTION_VIDEO_DB_ID}}` → Paste your database ID
6. Click **"OK"**

**Module 12 - Error Handler (no connection needed)**
- Verify retry settings: Max 3 retries, 60s interval

✅ **Checkpoint:** All 11 modules configured with real API keys

---

### **STEP 8: Test Individual Modules (10 minutes)**

**Test sequence (right-click each module → "Run this module only"):**

**Test Module 2 (GPT-4):**
1. Right-click Module 2 → **"Run this module only"**
2. Expected output: JSON array with 7 video concepts
3. Verify each concept has: `agent`, `hook_text`, `insight_text`, `cta_text`, `voiceover_script`, `caption`, `hashtags`, `voice_id`
4. If error 401: Check OpenAI API key
5. If error 429: Check API rate limits / billing

**Test Module 5 (ElevenLabs):**
1. First run Module 2-4 (to populate iterator)
2. Right-click Module 5 → **"Run this module only"**
3. Expected: Status 200, fileSize ~17000 bytes (MP3 binary data)
4. If error 401: Check ElevenLabs API key
5. If error 400: Check JSON body format, verify `text` field has content

**Test Module 6 (Google Drive Upload - Voice):**
1. After Module 5 succeeds
2. Right-click Module 6 → **"Run this module only"**
3. Expected: Success message, `webViewLink` URL returned
4. Verify in Google Drive: `/Group7/Production/Production/Voice/`
5. Should see: `GRP7_LYRA_YYYYMMDD_VO.mp3` (or current agent)
6. Download and play MP3 to verify audio quality

**Test Module 11 (Notion):**
1. After previous modules succeed
2. Right-click Module 11 → **"Run this module only"**
3. Expected: Success, Notion page ID returned
4. Open Notion database
5. Verify new row created with video metadata

✅ **Checkpoint:** Core modules tested successfully

---

### **STEP 9: Full End-to-End Test (5 minutes)**

1. Click **"Run once"** (bottom-left of Make.com canvas)
2. Watch modules execute in sequence (green checkmarks should appear)
3. Expected timeline:
   - **00:05** - Module 2: GPT-4 generates 7 concepts
   - **00:10** - Module 3-4: JSON parsed, iterator starts
   - **00:15** - Module 5: First voiceover generated
   - **00:20** - Module 6: First voiceover saved to Drive
   - **00:25** - Module 7: First video rendered in Canva
   - **00:45** - Module 8: First video/audio merged
   - **00:50** - Module 9: First final video saved to Drive
   - **01:00** - Module 10: First post scheduled to Metricool
   - **01:05** - Module 11: First row added to Notion
   - **02:30** - Iterator completes all 7 videos
4. If any module fails:
   - Click module to see error details
   - Check API key / connection
   - Verify field mappings (especially `{{4.agent}}`, `{{5.data}}`, etc.)
   - Check API rate limits / quotas
5. Verify final outputs:
   - **Google Drive:** `/Group7/Production/Production/Voice/` → 7 MP3 files
   - **Google Drive:** `/Group7/Production/Production/Videos/` → 7 MP4 files
   - **Metricool:** 7 scheduled posts (2 hours from now)
   - **Notion:** 7 database rows with metadata

**Common issues:**
- **Module 7 fails:** Check Canva template ID and API key. Canva API may require Enterprise plan.
- **Module 8 fails:** CloudConvert free tier limit (25 min/day). Upgrade if needed.
- **Module 10 fails:** Verify social accounts connected in Metricool, check profile IDs.

✅ **Checkpoint:** Full pipeline runs successfully, 7 videos produced

---

### **STEP 10: Enable Production Schedule (2 minutes)**

1. Review scenario settings:
   - Click **"Scenario settings"** (gear icon, bottom-left)
   - Max errors: 3
   - Auto-commit: ON
   - Sequential processing: OFF (parallel processing for speed)
2. Enable daily schedule:
   - Scenario should be in **"Draft"** mode (gray toggle, top-right)
   - Click toggle to turn **ON** (green)
   - Confirm: "Activate scenario?"
   - Click **"Activate"**
3. Verify schedule:
   - Module 1 (Schedule) shows: **"Next execution: Tomorrow 06:00 EST"**
4. Set up monitoring:
   - Click **"History"** tab (see all past runs)
   - Click **"..." → "Set up notifications"**
   - Email: `neuro.pilot.ai@gmail.com`
   - Notify on: Errors only (or all runs if you want daily confirmations)
5. Final check:
   - Scenario name: **"Group 7 - AI Video Factory [PRODUCTION]"**
   - Status: **ON** (green toggle)
   - Schedule: **Daily 06:00 EST**
   - Last test run: **Success** (green checkmark)

✅ **Checkpoint:** Production automation is LIVE

---

## Post-Deployment Checklist

**Immediate (Day 1):**
- ✅ Monitor first automated run tomorrow at 6:00 AM
- ✅ Check email for Make.com success/error notifications
- ✅ Verify 7 videos posted to all platforms
- ✅ Check Notion database populated with analytics

**Daily (Ongoing):**
- ✅ Review Notion dashboard for performance metrics
- ✅ Check API usage / billing on all platforms
- ✅ Verify Make.com operations count (Pro plan: 10,000/month)
- ✅ Monitor social media engagement

**Weekly:**
- ✅ Analyze top-performing videos in Notion "Top Performers" view
- ✅ Update "Learning Notes" field with insights
- ✅ Review GPT-4 concept quality ratings
- ✅ Refine GPT-4 system prompt if needed (Module 2)

**Monthly:**
- ✅ Review total costs vs. budget
- ✅ Optimize underperforming agents (analyze by agent in Notion)
- ✅ Rotate ElevenLabs voices if audience engagement drops
- ✅ Update Canva templates for seasonal/trending topics
- ✅ Rotate API keys (security best practice)

---

## Cost Breakdown (Monthly Estimates)

| Service | Tier | Cost |
|---------|------|------|
| Make.com | Pro (10K ops/month) | $9.00 |
| OpenAI GPT-4 | Pay-as-you-go | ~$3.00 (210 concept generations) |
| ElevenLabs | Starter (30K chars/month) | $5.00 or Creator ($22) if need more |
| Canva | Pro | $12.99 |
| CloudConvert | Free (25 min/day) | $0.00 (or $8/month for 500 min) |
| Metricool | Free or Pro | $0.00 or $20.00 |
| Notion | Free or Plus | $0.00 or $8/user |
| **TOTAL** | | **$29.99 - $79.99/month** |

**ROI:** 210 videos/month = **$0.14 - $0.38 per video** (fully automated)

---

## Troubleshooting

### **Scenario runs but no videos appear**

**Check:**
1. Module 2 (GPT-4) output: Does it contain 7 valid JSON objects?
2. Module 4 (Iterator): Does `Array` field show 7 items?
3. Module 5 (ElevenLabs): Is `fileSize` > 10000? (Check you got binary MP3, not error JSON)
4. Module 9 (Google Drive): Check `webViewLink` field is populated
5. Folder permissions: Make sure Google OAuth has write access

**Fix:**
- Re-run Module 2 individually, check GPT-4 response format
- Verify Module 3 JSON parsing: Check `{{3.array}}` contains all 7 items
- Re-authorize Google Drive connection if needed

### **ElevenLabs "Insufficient credits" error**

**Symptoms:** Module 5 fails with 402 error

**Fix:**
1. Check ElevenLabs account: https://elevenlabs.io/app/subscription
2. Character quota used/remaining
3. Upgrade to Creator plan ($22/month, 100K chars) if generating >30K chars/month
4. Reduce `voiceover_script` length in GPT-4 prompt (Module 2 system message)

### **Canva API not available**

**Symptoms:** Module 7 fails with 403 or "API not enabled"

**Issue:** Canva API may require Enterprise plan or developer approval

**Workaround:**
1. Remove Module 7 (Canva rendering)
2. Manually create 7 video templates in Canva beforehand
3. Upload as MP4 files to Google Drive
4. Use Google Drive module to download pre-made visuals
5. Merge with voiceover in Module 8 (CloudConvert)

### **Metricool posts not appearing**

**Check:**
1. Profile IDs are correct (from Metricool API `/profiles`)
2. Social accounts still connected in Metricool dashboard
3. Scheduled time is in future (check `{{addHours(now; 2)}}` returns future timestamp)
4. Metricool free tier limits: Max 25 posts/month (upgrade to Pro for unlimited)

**Fix:**
- Re-connect social accounts in Metricool
- Verify profile IDs with API call
- Check scheduled time timezone matches

### **Notion database not updating**

**Check:**
1. Notion integration still connected to database (Share → Integrations)
2. Database ID is correct (32-character ID from URL)
3. Property names match exactly (case-sensitive): `Video ID`, `Agent`, etc.
4. API key has write permissions

**Fix:**
- Re-share database with integration
- Verify database ID: Open database → Share → Copy link → Extract ID
- Check Module 11 field mappings: `databaseId` should be `{{NOTION_VIDEO_DB_ID}}`

### **"Too many operations" error**

**Symptoms:** Make.com stops mid-run with operations limit error

**Cause:** Pro plan: 10,000 operations/month. Each module run = 1 operation.
- Daily run: 12 modules × 7 iterations = ~84 operations/day
- Monthly: 84 × 30 = 2,520 operations (well within limit)

**If hitting limit:**
1. Check for infinite loops (iterator not advancing)
2. Look for duplicate runs (webhook triggered multiple times)
3. Disable unnecessary modules (e.g., Module 12 error handler if not needed)

---

## Next Steps: Optimization & Scaling

**Phase 2 - Learning Loop (Week 2+):**
1. Collect 2 weeks of performance data in Notion
2. Analyze top-performing hooks, insights, CTAs
3. Update GPT-4 system prompt in Module 2 with winning patterns:
   ```
   "Generate concepts similar to these top performers: [paste winning examples]"
   ```
4. A/B test different voices, video lengths, posting times

**Phase 3 - Advanced Features:**
1. Add GPT-4 Vision to analyze competitor videos
2. Implement dynamic voice selection based on agent personality
3. Add trending audio from TikTok API to Canva videos
4. Auto-respond to top comments with GPT-4
5. Add performance-based budget allocation (spend more on high-performing agents)

**Phase 4 - Scale:**
1. Duplicate scenario for different niches (tech, business, wellness, etc.)
2. Increase to 14 videos/day (2 batches: 6 AM + 6 PM)
3. Add more platforms: LinkedIn, Twitter/X, Facebook Reels
4. Build public dashboard with Notion API → Show real-time metrics

---

## Support & Resources

**Official Documentation:**
- Make.com Docs: https://www.make.com/en/help
- OpenAI API: https://platform.openai.com/docs
- ElevenLabs API: https://elevenlabs.io/docs
- Canva API: https://www.canva.com/developers/docs
- Metricool API: https://developer.metricool.com/
- Notion API: https://developers.notion.com/

**Community:**
- Make.com Community: https://community.make.com/
- r/nocode (Reddit)
- r/AutomateYourself (Reddit)

**Need help?**
- Review conversation logs in: `/Users/davidmikulis/neuro-pilot-ai/`
- Check: `GOOGLE_OAUTH_SETUP_GUIDE.md` for Google Drive issues
- Check: `MAKECOM_BLUEPRINT_IMPORT_INSTRUCTIONS.md` for import issues

---

## Security & Compliance

**Data Privacy:**
- All video content stored in Google Drive (encrypted at rest)
- Notion database contains only metadata (no PII)
- API keys never logged in Make.com history
- Social media posting via OAuth (no password storage)

**Compliance:**
- TikTok: Follow Community Guidelines, disclose AI-generated content
- Instagram: Add #AI or "AI-generated" to captions
- YouTube: Mark as "synthetic media" in upload settings

**Backup Strategy:**
1. Export Notion database monthly (CSV backup)
2. Download all videos from Google Drive to local storage
3. Export Make.com scenario JSON (backup blueprint)
4. Store API keys in 1Password/LastPass vault

---

## Success Criteria

**Week 1:**
- ✅ 49 videos produced (7/day × 7 days)
- ✅ Zero manual intervention required
- ✅ <$10 spent on APIs
- ✅ All videos posted successfully to 3 platforms

**Month 1:**
- ✅ 210 videos produced
- ✅ 100K+ total views across platforms
- ✅ 1000+ new followers
- ✅ Notion database fully populated with analytics
- ✅ Top-performing hook identified for each agent

**Month 3:**
- ✅ 630 videos produced
- ✅ 500K+ total views
- ✅ 5000+ followers
- ✅ Viral video (100K+ views) achieved
- ✅ GPT-4 prompt optimized with learning loop data
- ✅ ROI positive (revenue > costs)

---

**You're now running a fully automated AI video factory. Welcome to the future of content creation.**

🚀 **Production deployment complete. First run: Tomorrow 06:00 AM EST.** 🚀
