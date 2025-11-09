# Make.com Quick Start - 30 Minutes
## Simplified Setup for Group 7 Automation

---

## ⚡ Fast Track (Test First, Scale Later)

**Goal:** Get 1 video working end-to-end in 30 minutes.

---

## 📋 Pre-Flight Checklist

Before you start, have these ready:

- [ ] Make.com account (sign up at make.com - FREE plan OK for testing)
- [ ] Google Drive CSV uploaded ✅ (you have this)
- [ ] ElevenLabs API key (get from: https://elevenlabs.io/account)
- [ ] Metricool account (sign up at metricool.com - FREE plan OK)

**Skip for now:**
- Canva API (we'll use pre-made videos)
- CloudConvert (merge manually first time)
- Notion (add after testing)

---

## 🎯 Phase 1: Minimal Working Pipeline (15 min)

### Step 1: Create Scenario (2 min)

1. Go to https://make.com
2. Click **"Create a new scenario"**
3. Name: **"Group 7 - Test"**
4. Click **"Continue"**

---

### Step 2: Add Schedule (1 min)

1. Click **"+"** in center
2. Search: **"Schedule"**
3. Select **"Schedule"**
4. Choose: **"Every day"**
5. Time: **6:00 AM**
6. Timezone: **America/Toronto**
7. Click **"OK"**

✅ You'll see a clock icon

---

### Step 3: Get CSV from Google Drive (3 min)

1. Click **"+"** to the right of clock
2. Search: **"Google Drive"**
3. Choose: **"Download a File"**
4. Click **"Add"** next to Connection
5. Sign in with: **neuro.pilot.ai@gmail.com**
6. Allow access
7. **Select method:** "By Path"
8. **File path:**
   ```
   /Group7/Production/CSV_Inputs/GROUP7_CANVA_BATCH_2025-10-30.csv
   ```
9. Click **"OK"**

**Test it:**
- Click **"Run this module only"** (play button on the module)
- Should say: "Successfully processed 1 item"
- Expand output - you'll see CSV content

✅ If it works, continue. If error, check path is correct.

---

### Step 4: Parse CSV (1 min)

1. Click **"+"** after Google Drive
2. Search: **"CSV"**
3. Choose: **"Parse CSV"**
4. **CSV field:** Click and select `Data` from Module 2 (should auto-fill)
5. **Delimiter:** Comma
6. **CSV contains headers:** ✅ YES
7. Click **"OK"**

**Test it:**
- Click **"Run this module only"**
- Should show: "1 bundle with 7 items"
- You'll see 7 rows with HOOK, INSIGHT, CTA, VOICEOVER, etc.

---

### Step 5: Add Iterator (1 min)

1. Click **"+"** after CSV module
2. Search: **"Iterator"**
3. Choose: **"Iterator"**
4. **Array:** Select `Array[]` from Module 3
5. Click **"OK"**

✅ Everything after this will run 7 times

---

### Step 6: Generate Voiceover (5 min)

**Get your ElevenLabs API key:**
1. Go to: https://elevenlabs.io/account
2. Copy your API key

**Add HTTP module:**

1. Click **"+"** after Iterator
2. Search: **"HTTP"**
3. Choose: **"Make a request"**

**Configure:**

**URL:**
```
https://api.elevenlabs.io/v1/text-to-speech/21m00Tcm4TlvDq8ikWAM
```
(This is Rachel's voice ID)

**Method:** POST

**Headers** - Click "Add item" 3 times:
| Name | Value |
|------|-------|
| xi-api-key | YOUR_API_KEY_HERE |
| Content-Type | application/json |
| Accept | audio/mpeg |

**Body type:** Raw

**Content type:** JSON (application/json)

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

**Parse response:** No

Click **"OK"**

**Test:**
- Click **"Run this module only"**
- Wait ~10 seconds
- Should see: Binary data (~200-400 KB)
- ✅ That's your MP3!

---

### Step 7: Save to Google Drive (2 min)

1. Click **"+"** after HTTP module
2. Search: **"Google Drive"**
3. Choose: **"Upload a File"**
4. **Connection:** (reuse existing)
5. **Folder:** By Path
   ```
   /Group7/Production/Voice/2025-10-30
   ```
6. **File name:**
   ```
   {{4.AUTOTAG}}_VO.mp3
   ```
7. **Data:** Select `Data` from Module 5 (HTTP)
8. Click **"OK"**

**Test:**
- Click **"Run this module only"**
- Go to Google Drive
- Check: `/Group7/Production/Voice/2025-10-30/`
- You should see: `GRP7_LYRA_001_VO.mp3`

✅ **SUCCESS!** You just automated voiceover generation!

---

## 🎉 Phase 1 Complete!

**What you've done:**
- ✅ CSV downloaded from Google Drive
- ✅ Parsed into 7 rows
- ✅ Generated voiceover for first video
- ✅ Saved MP3 to Google Drive

**Test the full flow:**
1. Click **"Run once"** (bottom left)
2. Watch it run through all modules
3. Check Google Drive - should have 7 MP3 files now!

**Time:** 15 minutes
**Cost:** $0 (free tiers)

---

## 🎯 Phase 2: Add Scheduling to Metricool (10 min)

### Step 8: Schedule Post

**Get Metricool API token:**
1. Go to: https://metricool.com
2. Sign up (free plan is OK for testing)
3. Go to: Settings → API → Copy token

**Add module:**

1. Click **"+"** after Google Drive upload
2. Search: **"HTTP"**
3. Choose: **"Make a request"**

**Configure:**

**URL:**
```
https://api.metricool.com/v1/post
```

**Method:** POST

**Headers:**
| Name | Value |
|------|-------|
| Authorization | Bearer YOUR_METRICOOL_TOKEN |
| Content-Type | application/json |

**Body type:** Raw

**Content type:** JSON

**Request content:**
```json
{
  "social_network": "tiktok",
  "message": "{{4.CAPTION}}\n\n{{4.HASHTAGS}}",
  "scheduled_at": "{{4.POST_TIME_EST}}",
  "comment": "{{4.PIN_COMMENT}}"
}
```

**Note:** You'll need to upload video file separately to Metricool first (manual for now)

Click **"OK"**

---

## ✅ What You Have Now

**Working automation:**
- Schedule: 6:00 AM daily
- Downloads CSV
- Parses 7 videos
- Generates 7 voiceovers
- Saves to Google Drive
- (Ready to add: Video merge, Metricool, Notion)

**Runtime:** ~2-3 minutes for 7 voiceovers
**Cost:** $0.60 per day (ElevenLabs)

---

## 📈 Phase 3: Scale Up (Add Later)

Once Phase 1 works, add:

1. **CloudConvert** (merge video + audio) - 5 min
2. **Metricool** (schedule posts) - 5 min
3. **Notion** (log videos) - 5 min
4. **Error handlers** - 5 min

**See:** `MAKECOM_SETUP_GUIDE_COMPLETE.md` for full instructions

---

## 🆘 Troubleshooting

**"CSV not found"**
- Wait 1 minute for Google Drive sync
- Check path is exactly: `/Group7/Production/CSV_Inputs/GROUP7_CANVA_BATCH_2025-10-30.csv`

**"Invalid API key" (ElevenLabs)**
- Copy key again from elevenlabs.io/account
- Make sure no extra spaces
- Key starts with `sk_...`

**"Data not found" (in mapping)**
- Click the field
- Look for dropdown with previous modules
- Select the right output (usually called "Data")

**Module stuck "Running..."**
- Wait 30 seconds
- If still stuck, click "Stop" and try again
- Check internet connection

---

## ✅ Quick Win Checklist

- [ ] Make.com account created
- [ ] Scenario created
- [ ] Module 1: Schedule (6 AM)
- [ ] Module 2: Google Drive (CSV)
- [ ] Module 3: Parse CSV
- [ ] Module 4: Iterator
- [ ] Module 5: ElevenLabs (voice)
- [ ] Module 6: Google Drive (save MP3)
- [ ] Test successful (1 MP3 created)
- [ ] Full run successful (7 MP3s created)

---

## 🎯 Next Steps

**Today:**
1. ✅ Complete Phase 1 (voiceovers)
2. Test with 1 video
3. Test with all 7 videos

**Tomorrow:**
1. Add video merging (CloudConvert)
2. Add Metricool scheduling
3. Add Notion logging

**This Week:**
1. Run daily for 7 days
2. Monitor & optimize
3. Scale to full automation

---

**Need help?** Check the full guide: `MAKECOM_SETUP_GUIDE_COMPLETE.md`

**Ready?** Start with Step 1 now! 🚀
