# GROUP7 DAILY RUNBOOK - What Happens Each Day

## Timeline Overview

```
00:00 ────────────────────────────────────────────────────────────
       System idle, previous day's content published

02:00 ═══════════════════════════════════════════════════════════
       🧠 LEARNING LOOP STARTS
       ├─ Fetch last 7 days performance from Notion
       ├─ Query Metricool for engagement metrics
       ├─ Calculate scores (engagement × views / 100)
       ├─ Rank top 5 videos and top 3 agents
       ├─ Generate recommendations
       ├─ Call GPT-4 to create optimized prompts
       └─ Save adapted_prompts.json
       ⏱️  Duration: ~5-10 minutes

06:00 ═══════════════════════════════════════════════════════════
       📹 DAILY PRODUCTION STARTS
       Load optimized prompts from learning loop
       
06:05 ▶ Agent 1: Lyra-7 (scheduled for 09:00 EST)
       ├─ Generate voice MP3
       ├─ Render Canva video
       ├─ Merge audio + video
       ├─ Upload to Google Drive
       ├─ Schedule on Metricool for 09:00
       └─ Log to Notion
       ⏱️  Duration: ~3 minutes

06:10 ▶ Agent 2: Atlas (scheduled for 11:00 EST)
       [Same pipeline]
       
06:15 ▶ Agent 3: Nova (scheduled for 13:00 EST)
       [Same pipeline]
       
06:20 ▶ Agent 4: Cipher (scheduled for 15:00 EST)
       [Same pipeline]
       
06:25 ▶ Agent 5: Echo (scheduled for 17:00 EST)
       [Same pipeline]
       
06:30 ▶ Agent 6: Quantum (scheduled for 19:00 EST)
       [Same pipeline]
       
06:35 ▶ Agent 7: Nexus (scheduled for 21:00 EST)
       [Same pipeline]
       
06:40 ✅ ALL VIDEOS PRODUCED AND SCHEDULED
       Total time: ~35 minutes
       Output: 7 videos in Google Drive
       Status: 7 posts scheduled in Metricool

09:00 ─────────────────────────────────────────────────────────
       📤 Lyra-7 video publishes to TikTok/Instagram

11:00 ─────────────────────────────────────────────────────────
       📤 Atlas video publishes

13:00 ─────────────────────────────────────────────────────────
       📤 Nova video publishes

15:00 ─────────────────────────────────────────────────────────
       📤 Cipher video publishes

17:00 ─────────────────────────────────────────────────────────
       📤 Echo video publishes

19:00 ─────────────────────────────────────────────────────────
       📤 Quantum video publishes

21:00 ─────────────────────────────────────────────────────────
       📤 Nexus video publishes

Every 💓 HOURLY HEARTBEAT
Hour  ├─ Check API health (5 services)
       ├─ Measure latency
       ├─ Log to heartbeat_latest.json
       └─ Alert if degraded

18:00 ═══════════════════════════════════════════════════════════
       📊 DAILY STATUS REPORT
       ├─ Count videos produced (last 24h)
       ├─ Calculate success rate
       ├─ Measure storage usage
       ├─ Generate report
       └─ Log to Notion System DB
       ⏱️  Duration: ~1 minute

23:59 ────────────────────────────────────────────────────────────
       Day complete. Repeat tomorrow.
```

---

## Detailed Process: Learning Loop (02:00 AM)

```javascript
Step 1: Analyze Performance (2-3 min)
  ├─ Fetch Notion videos (last 7 days, status=success)
  ├─ For each video:
  │   ├─ Get Metricool stats (views, likes, comments, shares)
  │   ├─ Calculate engagement = (likes+comments+shares)/views × 100
  │   └─ Calculate score = engagement × (views/100)
  ├─ Sort by score (descending)
  ├─ Group by agent
  └─ Save analysis_latest.json

Step 2: Adapt Prompts (3-5 min)
  ├─ Load analysis results
  ├─ Identify top video (highest score)
  ├─ Identify top agent (highest avg score)
  ├─ Build GPT-4 system prompt:
  │   "Replicate patterns from top video..."
  │   "Maintain each agent's unique voice..."
  ├─ Call OpenAI API
  ├─ Parse JSON response (7 new scripts)
  └─ Save adapted_prompts.json

Step 3: Commit Changes (optional, 1 min)
  ├─ If AUTO_COMMIT=true:
  │   ├─ git add Production/logs/learning/*.json
  │   ├─ git commit -m "chore: nightly learning"
  │   └─ git push (if AUTO_PUSH=true)
  └─ Else: skip
```

---

## Detailed Process: Daily Production (06:00 AM)

```javascript
For each agent in schedule:
  
  Step 1: Voice Generation (20-30 sec)
    ├─ Load voice profile config/voices/{agent}.voice.json
    ├─ Get script from adapted_prompts.json
    ├─ Call ElevenLabs API
    ├─ Save MP3 to Production/Voice/GRP7_{agent}_{date}.mp3
    └─ Verify file size > 10KB
  
  Step 2: Canva Render (30-60 sec)
    ├─ Call Canva Autofill API
    │   ├─ Template: CANVA_TEMPLATE_ID
    │   ├─ Data: hook_text, insight_text, cta_text
    │   └─ Get job_id
    ├─ Poll status every 5s (max 60 polls)
    ├─ Wait for status = "success"
    └─ Get export URL (valid 24h)
  
  Step 3: CloudConvert Merge (30-90 sec)
    ├─ Create job:
    │   ├─ Task 1: Import Canva MP4
    │   ├─ Task 2: Import voice MP3
    │   ├─ Task 3: Merge (h264, AAC 192k, -14 LUFS)
    │   └─ Task 4: Export to URL
    ├─ Poll status every 5s (max 120 polls)
    ├─ Wait for status = "finished"
    └─ Get export URL (valid 1h)
  
  Step 4: Google Drive Upload (10-30 sec)
    ├─ Download merged MP4 to .tmp/
    ├─ Generate Service Account JWT
    ├─ Upload via multipart POST
    ├─ Get webViewLink and fileId
    ├─ Delete temp file
    └─ Verify upload success
  
  Step 5: Metricool Schedule (5 sec)
    ├─ Call Metricool API
    ├─ Post data:
    │   ├─ video_url: Google Drive link
    │   ├─ caption: "{agent} insight + hashtags"
    │   ├─ scheduled_time: {agent's time slot}
    │   └─ external_id: "{agent}-{date}"
    └─ Get post_id
  
  Step 6: Notion Log (2 sec)
    ├─ Create page in Video Production DB
    ├─ Properties:
    │   ├─ Name: GRP7_{agent}_{date}
    │   ├─ Agent: {agent}
    │   ├─ Status: success
    │   ├─ Drive Link: webViewLink
    │   └─ Created: timestamp
    └─ Get notion_page_id
  
  Total per video: ~2-3 minutes
  Total for 7 videos: ~20-30 minutes (sequential)
```

---

## Error Scenarios & Recovery

### Scenario 1: Canva Render Timeout
**Symptom**: Poll reaches 60 attempts (5 min) without success
**Recovery**:
- Retry entire video production (max 2 retries)
- If still fails, skip to next agent
- Log failure to Notion (status = failed)
- Alert via configured channel

### Scenario 2: CloudConvert Job Fails
**Symptom**: Job status = "error"
**Recovery**:
- Check CloudConvert dashboard for error details
- Common causes: Invalid video URL, out of credits
- Retry with exponential backoff
- If persistent, manual intervention required

### Scenario 3: Metricool Publishing Fails
**Symptom**: HTTP 401 or 403
**Recovery**:
- Verify METRICOOL_API_KEY is valid
- Check profile permissions
- Video still saved in Drive
- Can manually publish later

### Scenario 4: Learning Loop Fails
**Symptom**: No adapted_prompts.json generated
**Recovery**:
- Scheduler uses previous day's prompts
- Or falls back to defaults
- System continues operating
- Fix learning loop for next night

---

## Manual Overrides

### Skip Learning Loop (use custom prompts)
```bash
# Create custom prompts
cat > Production/logs/learning/adapted_prompts.json << 'EOF'
{
  "scripts": [
    {"agent": "Lyra-7", "hook": "...", "insight": "...", "cta": "..."},
    ...
  ]
}
EOF

# Run scheduler (will use your custom prompts)
npm run schedule:daily
```

### Skip Scheduler (produce one video)
```bash
npm run run:one -- \
  --agent Lyra \
  --slug custom_2025_11_02 \
  --hook "Your hook" \
  --insight "Your insight" \
  --cta "Your CTA"
```

### Force Re-Analysis (debug learning)
```bash
# Delete cache
rm Production/logs/learning/analysis_latest.json

# Re-run analysis
npm run learn:analyze

# Check results
cat Production/logs/learning/analysis_latest.json | jq .topVideos
```

---

## Monitoring Checklist

### Daily (automated):
- ✅ Learning loop completes
- ✅ 7 videos produced
- ✅ 7 posts scheduled
- ✅ Status report generated

### Weekly (manual review):
- Review top videos: `cat Production/logs/learning/analysis_latest.json | jq .topVideos`
- Check engagement trends
- Verify storage usage: `du -sh Production/Video/`
- Review failure rate: `npm run monitor:status`

### Monthly (strategic):
- Compare month-over-month engagement
- Analyze agent performance trends
- Adjust posting times if needed
- Add new agents or platforms

---

## Success Metrics

**Daily:**
- Videos produced: 7/7 ✅
- Success rate: > 85% ✅
- Avg processing time: < 5 min/video ✅

**Weekly:**
- Total views: Trending up ✅
- Engagement rate: > 3% ✅
- System uptime: > 99% ✅

**Monthly:**
- Content improvement: +10-20% engagement ✅
- Cost per video: < $0.20 ✅
- Manual interventions: < 5/month ✅

---

**The system runs itself. You just watch it improve.** 🚀
