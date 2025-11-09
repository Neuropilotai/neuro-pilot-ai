# Make.com Setup Guide - Group 7 Automation
## Step-by-Step Module Configuration

---

## 🚀 Phase 1: Account Setup

### Step 1: Create Make.com Account

1. **Go to:** https://www.make.com/en/register
2. **Sign up** with: neuro.pilot.ai@gmail.com (recommended)
3. **Choose plan:**
   - **Start with Free** (100 operations/month - good for testing)
   - **Upgrade to Pro** ($29/month, 10,000 ops) when ready to launch
4. **Verify email** and log in

---

## 📐 Phase 2: Create Scenario

### Step 1: New Scenario

1. **Click:** "Create a new scenario" (big + button)
2. **Name it:** "Group 7 Daily Video Pipeline"
3. **Description:** "Automated daily content production: CSV → Canva → ElevenLabs → CloudConvert → Metricool → Notion"
4. **Click:** "Continue"

You'll see a blank canvas with a circular "+" button.

---

## ⏰ MODULE 1: Schedule Trigger

### What it does:
Triggers the entire workflow daily at 6:00 AM EST.

### Setup:

1. **Click** the "+" button in center
2. **Search:** "Schedule"
3. **Select:** "Schedule" (clock icon)
4. **Choose:** "Every day"

### Configuration:

**Time:**
- Hour: `6`
- Minute: `0`
- Timezone: `America/Toronto` (or `America/New_York`)

**Advanced:**
- Days: Monday through Sunday (all checked)
- Start date: 2025-10-31 (tomorrow)

**Click:** "OK"

### What you see:
A clock icon appears. This is Module 1.

---

## 📥 MODULE 2: Google Drive - Download CSV

### What it does:
Downloads the daily CSV file containing all 7 video scripts.

### Setup:

1. **Click** the "+" to the RIGHT of Module 1
2. **Search:** "Google Drive"
3. **Select:** "Google Drive"
4. **Choose action:** "Download a File"

### Connection:

**First time:**
1. **Click:** "Add" next to Connection
2. **Name:** "Google Drive - neuro.pilot.ai"
3. **Click:** "Save"
4. **Authorize:** Sign in with neuro.pilot.ai@gmail.com
5. **Allow** Make.com access

### Configuration:

**Select method:** "By Path"

**File path:**
```
/Group7/Production/CSV_Inputs/GROUP7_CANVA_BATCH_2025-10-30.csv
```

**For dynamic dates (after testing):**
```
/Group7/Production/CSV_Inputs/GROUP7_CANVA_BATCH_{{formatDate(now; "YYYY-MM-DD")}}.csv
```

**Click:** "OK"

### Test:
**Click:** "Run this module only"
- You should see: "Successfully processed 1 item"
- Expand the output - you'll see the CSV content

---

## 📊 MODULE 3: Parse CSV

### What it does:
Converts CSV text into structured data (7 rows, one per video).

### Setup:

1. **Click** the "+" after Module 2
2. **Search:** "CSV"
3. **Select:** "CSV"
4. **Choose action:** "Parse CSV"

### Configuration:

**CSV:**
- Click in the field
- Select from Module 2: `Data` (should auto-populate)

**Delimiter:** `Comma`

**CSV contains headers:** ✅ YES (checked)

**Advanced settings:**
- Quote character: `"`
- Escape character: `\`
- Skip empty lines: ✅ YES

**Click:** "OK"

### Test:
**Click:** "Run this module only"
- You should see: "Successfully processed 1 bundle with 7 items"
- Expand to see 7 rows of data with columns: HOOK, INSIGHT, CTA, VOICEOVER, etc.

---

## 🔄 MODULE 4: Iterator

### What it does:
Processes each of the 7 videos one at a time (loops through CSV rows).

### Setup:

1. **Click** the "+" after Module 3
2. **Search:** "Iterator"
3. **Select:** "Iterator" (Flow Control)

### Configuration:

**Array:**
- Click in field
- Select from Module 3: `Array[]` (the whole parsed CSV)

**Click:** "OK"

### What you see:
A looping icon appears. Everything after this runs 7 times (once per video).

---

## 🎨 MODULE 5: Canva - Create Design (OPTIONAL - If using Canva API)

### What it does:
Generates silent video from Canva template using CSV data.

### ⚠️ Note:
**Canva doesn't have a native Make.com module.** You have 3 options:

#### Option A: HTTP Module (API Call)
**If you have Canva API access:**

1. **Click** "+" after Iterator
2. **Search:** "HTTP"
3. **Select:** "HTTP" → "Make a request"

**Configuration:**
- URL: `https://api.canva.com/v1/designs`
- Method: `POST`
- Headers:
  ```
  Authorization: Bearer YOUR_CANVA_API_KEY
  Content-Type: application/json
  ```
- Body:
  ```json
  {
    "design_type": "Video",
    "template_id": "YOUR_TEMPLATE_ID",
    "elements": {
      "hook_text": "{{4.HOOK}}",
      "insight_text": "{{4.INSIGHT}}",
      "cta_text": "{{4.CTA}}"
    },
    "export_format": "mp4"
  }
  ```

#### Option B: Zapier Integration Bridge
Use Make.com → Zapier → Canva

#### Option C: Manual Canva + Start from Module 6
**For testing, skip Canva for now.** Assume you have MP4 files already.

**For this guide, we'll skip to Module 6 (ElevenLabs) and assume videos exist.**

---

## 🎙️ MODULE 6: ElevenLabs - Text to Speech

### What it does:
Converts voiceover script to MP3 audio file.

### Setup:

1. **Click** "+" after Iterator (or after Canva if you set it up)
2. **Search:** "HTTP" (ElevenLabs has no native module)
3. **Select:** "HTTP" → "Make a request"

### Configuration:

**URL:**
```
https://api.elevenlabs.io/v1/text-to-speech/{{voice_id}}
```

**Method:** `POST`

**Headers:**
Click "Add item" for each:
```
xi-api-key: YOUR_ELEVENLABS_API_KEY
Content-Type: application/json
Accept: audio/mpeg
```

**Body type:** `Raw`

**Content type:** `JSON (application/json)`

**Request content:**
```json
{
  "text": "{{4.VOICEOVER}}",
  "model_id": "eleven_turbo_v2",
  "voice_settings": {
    "stability": 0.75,
    "similarity_boost": 0.80,
    "style": 0.50,
    "use_speaker_boost": true
  }
}
```

**Parse response:** `No`

**Timeout:** 180 seconds

### Voice ID Mapping:

**Add a Router module BEFORE this:**

1. **Click** "+" before HTTP module
2. **Add:** "Router"
3. **Add 4 routes:**

**Route 1 (Lyra):**
- Filter: `{{4.AUTOTAG}} contains "LYRA"`
- Voice ID: `21m00Tcm4TlvDq8ikWAM` (Rachel)

**Route 2 (Atlas/Cipher/Quantum):**
- Filter: `{{4.AUTOTAG}} contains "ATLAS" OR contains "CIPHER" OR contains "QUANTUM"`
- Voice ID: `TX3LPaxmHKxFdv7VOQHJ` (Onyx)

**Route 3 (Nova/Nexus):**
- Filter: `{{4.AUTOTAG}} contains "NOVA" OR contains "NEXUS"`
- Voice ID: `EXAVITQu4vr4xnSDxMaL` (Bella/Nova)

**Route 4 (Echo):**
- Filter: `{{4.AUTOTAG}} contains "ECHO"`
- Voice ID: `XB0fDUnXU5powFXDhCwa` (Charlotte)

### Test:
**Run this module only**
- You should get binary audio data
- File size: ~200-400 KB per voiceover

---

## 💾 MODULE 7: Google Drive - Upload Voice File

### What it does:
Saves the MP3 voiceover to Google Drive.

### Setup:

1. **Click** "+" after ElevenLabs HTTP module
2. **Search:** "Google Drive"
3. **Select:** "Google Drive" → "Upload a File"

### Configuration:

**Connection:** (use existing from Module 2)

**Folder:** "By Path"
```
/Group7/Production/Voice/{{formatDate(now; "YYYY-MM-DD")}}
```

**File name:**
```
{{4.AUTOTAG}}_VO.mp3
```

**Data:**
- Select from Module 6 (HTTP): `Data`

**Click:** "OK"

### Test:
**Run and check:** File appears in Google Drive under Voice/2025-10-30/

---

## 🎬 MODULE 8: CloudConvert - Merge Video + Audio

### What it does:
Combines silent Canva video with ElevenLabs voiceover.

### Setup:

1. **Click** "+" after Module 7
2. **Search:** "CloudConvert"
3. **Select:** "CloudConvert"
4. **Choose action:** "Convert a File"

### Connection:

1. **Click:** "Add"
2. **Name:** "CloudConvert API"
3. **API Key:** Get from https://cloudconvert.com/dashboard/api/v2/keys
4. **Click:** "Save"

### Configuration:

**Input file:**
- Select: "From URL"
- URL: (Canva video URL or existing video file URL)

**Input format:** `mp4`

**Output format:** `mp4`

**Options (click "Show advanced settings"):**

```json
{
  "audio_codec": "aac",
  "audio_bitrate": 192,
  "video_codec": "h264",
  "width": 1080,
  "height": 1920,
  "fps": 30,
  "audio_loudness": "-14 LUFS",
  "audio_normalize": true,
  "audio_input": "{{7.id}}"
}
```

**Map audio file:**
- Audio source: Module 7 (Google Drive file ID)

**Click:** "OK"

### Test:
This will take 2-3 minutes per video.

---

## 📤 MODULE 9: Metricool - Schedule Post

### What it does:
Schedules the final video for publishing on TikTok/Instagram/YouTube.

### Setup:

1. **Click** "+" after CloudConvert
2. **Search:** "HTTP" (Metricool has no native module)
3. **Select:** "HTTP" → "Make a request"

### Connection Setup (First Time):

**Get Metricool API Token:**
1. Go to: https://metricool.com/api/
2. Sign in
3. Copy your API token

### Configuration:

**URL:**
```
https://api.metricool.com/v1/post
```

**Method:** `POST`

**Headers:**
```
Authorization: Bearer YOUR_METRICOOL_API_TOKEN
Content-Type: multipart/form-data
```

**Body type:** `Multipart/form-data`

**Fields (click "Add item" for each):**

| Key | Value |
|-----|-------|
| file | {{8.output.url}} (CloudConvert output) |
| text | {{4.CAPTION}}<br><br>{{4.HASHTAGS}} |
| platforms | ["tiktok","instagram","youtube_shorts"] |
| scheduled_at | {{4.POST_TIME_EST}} |
| first_comment | {{4.PIN_COMMENT}} |

**Click:** "OK"

### Test:
Check Metricool dashboard - video should appear as "Scheduled"

---

## 📝 MODULE 10: Notion - Create Video Log Entry

### What it does:
Logs the video to your Notion Video Log database.

### Setup:

1. **Click** "+" after Module 9
2. **Search:** "Notion"
3. **Select:** "Notion"
4. **Choose action:** "Create a Database Item"

### Connection:

1. **Click:** "Add"
2. **Sign in** with Notion
3. **Allow** access to your workspace

### Configuration:

**Database ID:**
```
YOUR_NOTION_DATABASE_ID
```
(Get this from Notion - copy database link, extract ID)

**Properties (map each field):**

| Notion Property | Make.com Value |
|----------------|----------------|
| Video ID | {{4.AUTOTAG}} |
| Agent | {{4.AUTOTAG}} (extract agent name) |
| Theme | (manually map based on agent) |
| Status | Scheduled |
| Batch Date | {{formatDate(now; "YYYY-MM-DD")}} |
| Post Time (EST) | {{4.POST_TIME_EST}} |
| Platforms | TikTok, Instagram, YouTube |
| Voiceover Script | {{4.VOICEOVER}} |
| Caption | {{4.CAPTION}} |
| Hashtags | {{split(4.HASHTAGS; " ")}} |
| Video File | {{8.output.url}} |
| Voice File | {{7.id}} |
| Metricool Post ID | {{9.data.post_id}} |
| Views (24h) | 0 |
| Engagement Rate | 0 |
| Completion Rate | 0 |

**Click:** "OK"

---

## ⚠️ MODULE 11: Error Handler

### What it does:
Catches errors and logs them instead of stopping the entire workflow.

### Setup:

1. **Right-click** on any module
2. **Select:** "Add error handler"
3. **Choose:** "Ignore"

**Or for logging errors:**

1. **Add module:** "Notion" → "Create Database Item"
2. **Database:** "Error Log" (create this in Notion)
3. **Properties:**
   - Error Message: {{error.message}}
   - Module: {{error.module}}
   - Video ID: {{4.AUTOTAG}}
   - Timestamp: {{now}}

**Attach to:** All critical modules (ElevenLabs, CloudConvert, Metricool)

---

## 🧪 Phase 3: Testing

### Test 1: Run with One Video

1. **Disable Iterator:** Right-click → "This module only"
2. **Click:** "Run once"
3. **Watch** each module execute
4. **Check outputs:** Every module should show green checkmark
5. **Verify:**
   - MP3 appears in Google Drive/Voice/
   - Video scheduled in Metricool
   - Entry appears in Notion

### Test 2: Full Batch (7 Videos)

1. **Re-enable all modules**
2. **Click:** "Run once"
3. **Monitor:** Should process 7 videos in ~12-18 minutes
4. **Verify:**
   - 7 MP3 files in Voice folder
   - 7 scheduled posts in Metricool
   - 7 rows in Notion

### Test 3: Schedule

1. **Activate scenario:** Toggle switch in top-right to "ON"
2. **Set schedule:** Daily at 06:00 EST
3. **First run:** Tomorrow morning
4. **Monitor:** Check email for success/failure notifications

---

## 📊 Phase 4: Monitoring

### Enable Notifications:

1. **Scenario settings** (gear icon)
2. **Notifications:**
   - ✅ Email on error
   - ✅ Email on completion
   - ❌ Email on every run (too many)

### Operations Usage:

**Monitor in Make.com dashboard:**
- Free: 100 ops/month
- This scenario: ~70 operations per run (7 videos × ~10 modules)
- Daily: ~70 ops/day = 2,100/month
- **You need:** Pro plan (10,000 ops)

---

## 🎯 Quick Reference - Module Flow

```
[Schedule: 06:00 EST]
        ↓
[Google Drive: Get CSV]
        ↓
[Parse CSV]
        ↓
[Iterator: Loop 7 times]
        ↓
    ┌───[Router: Pick voice by agent]
    │       ↓
    │   [HTTP: ElevenLabs TTS]
    │       ↓
    │   [Google Drive: Save MP3]
    │       ↓
    │   [CloudConvert: Merge video+audio]
    │       ↓
    │   [HTTP: Metricool schedule]
    │       ↓
    └───[Notion: Log video]
```

---

## 🔑 API Keys You'll Need

Before building, get these ready:

- [ ] **Google Drive** - OAuth (via Make.com)
- [ ] **ElevenLabs** - API key from elevenlabs.io/account
- [ ] **CloudConvert** - API key from cloudconvert.com/dashboard
- [ ] **Metricool** - API token from metricool.com/api
- [ ] **Notion** - Integration token (via Make.com OAuth)
- [ ] **Canva** - Template ID (from your Canva template URL)

---

## 💰 Cost Breakdown

**Make.com:** $29/month (Pro plan)
**ElevenLabs:** ~$0.85/day ($25/month)
**CloudConvert:** Free tier (25 conversions/day) or $0.70/day
**Metricool:** $99/month (Pro plan)
**Canva:** $12.99/month (Pro)
**Notion:** $10/month (Team)

**Total:** ~$165-195/month

---

## ✅ Setup Checklist

- [ ] Make.com account created (Pro plan)
- [ ] Scenario created: "Group 7 Daily Video Pipeline"
- [ ] Module 1: Schedule trigger (06:00 EST)
- [ ] Module 2: Google Drive download CSV
- [ ] Module 3: Parse CSV
- [ ] Module 4: Iterator
- [ ] Module 5: (Optional) Canva API
- [ ] Module 6: ElevenLabs HTTP + Router
- [ ] Module 7: Google Drive upload voice
- [ ] Module 8: CloudConvert merge
- [ ] Module 9: Metricool schedule
- [ ] Module 10: Notion log entry
- [ ] Module 11: Error handlers attached
- [ ] Test 1: Single video success
- [ ] Test 2: Full batch (7 videos) success
- [ ] Scenario activated (ON)
- [ ] Notifications configured

---

**Ready to build?** Start with Module 1 and work your way down. Test after each module before adding the next!
