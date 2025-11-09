# GROUP7 VIDEO AUTOMATION - System Summary

Complete overview of the Group7 AI Video Factory automation system.

## System Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     GROUP7 VIDEO FACTORY                        │
└─────────────────────────────────────────────────────────────────┘

Input: CSV (agent, slug, hook, insight, cta, voice_file)
   │
   ▼
┌──────────────────┐
│ 1. Voice Gen     │  ElevenLabs TTS API
│ (ElevenLabs)     │  → MP3 @ 44.1kHz, normalized
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│ 2. Canva Render  │  Canva Autofill API
│ (Video Template) │  → MP4 (silent) @ 1080x1920
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│ 3. Merge         │  CloudConvert API
│ (Video + Audio)  │  → MP4 @ CRF 22, AAC 192k, -14 LUFS
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│ 4. Upload        │  Google Drive API (Service Account)
│ (Google Drive)   │  → Permanent storage + sharing
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│ 5. Log           │  Notion API
│ (Production DB)  │  → Track status, links, metadata
└──────────────────┘

Output: Final MP4 in Google Drive + Notion log entry
```

---

## Data Flow Sequence

### Phase 1: Voice Generation (Already Complete)

```
Input: Text script + Voice profile
  │
  ├─→ ElevenLabs API
  │     └─→ Model: eleven_turbo_v2_5
  │     └─→ Settings: stability, similarity_boost, style
  │     └─→ Output: mp3_44100_128
  │
  └─→ Save: Production/Voice/GRP7_{AGENT}_{SLUG}.mp3
```

### Phase 2: Video Rendering (New)

```
Input: hook, insight, cta texts
  │
  ├─→ Canva Autofill API
  │     └─→ Template: CANVA_TEMPLATE_ID
  │     └─→ Replace: hook_text, insight_text, cta_text
  │     └─→ Export: MP4 (silent video)
  │
  ├─→ Poll job status (5s intervals, max 60 polls)
  │     └─→ Wait for "success" status
  │
  └─→ Download URL (temporary, 24h expiry)
```

### Phase 3: Merge (New)

```
Input: Canva MP4 URL + Voice MP3 file
  │
  ├─→ CloudConvert Job
  │     ├─→ Task 1: Import video from URL
  │     ├─→ Task 2: Import audio from file/URL
  │     ├─→ Task 3: Merge
  │     │     ├─→ Video: h264, CRF 22
  │     │     ├─→ Audio: AAC 192k
  │     │     └─→ Normalize: -14 LUFS
  │     └─→ Task 4: Export to URL
  │
  ├─→ Poll job status (5s intervals, max 120 polls)
  │     └─→ Wait for "finished" status
  │
  └─→ Download URL (temporary, 1h expiry)
```

### Phase 4: Upload (New)

```
Input: Merged MP4 URL
  │
  ├─→ Download to temp
  │     └─→ .tmp/GRP7_{AGENT}_{SLUG}.mp4
  │
  ├─→ Google Drive API
  │     ├─→ Auth: Service Account JWT
  │     ├─→ Folder: GDRIVE_OUTPUT_FOLDER_ID
  │     ├─→ Upload: Multipart (metadata + binary)
  │     └─→ Cleanup: Delete temp file
  │
  └─→ Return: webViewLink + fileId
```

### Phase 5: Logging (New)

```
Input: Production metadata
  │
  ├─→ Notion API
  │     ├─→ Database: NOTION_VIDEO_DB_ID
  │     ├─→ Properties:
  │     │     ├─→ Name (title)
  │     │     ├─→ Agent (select)
  │     │     ├─→ Status (select)
  │     │     ├─→ Created (date)
  │     │     ├─→ Canva URL (url)
  │     │     ├─→ Drive Link (url)
  │     │     └─→ File ID (text)
  │     └─→ Create page
  │
  └─→ Return: Notion page URL
```

---

## Folder Structure

```
Group7/
├── .env                              # Environment variables (git-ignored)
├── GROUP7_ENV_TEMPLATE.env          # Template for setup
│
├── config/
│   ├── assets.json                  # Brand colors, agents, settings
│   └── voices/                      # Voice profiles (7 agents)
│       ├── lyra7.voice.json
│       ├── atlas.voice.json
│       ├── nova.voice.json
│       ├── cipher.voice.json
│       ├── echo.voice.json
│       ├── quantum.voice.json
│       └── nexus.voice.json
│
├── payloads/                        # API request/response templates
│   ├── canva_render.json
│   ├── cloudconvert_mux.json
│   └── gdrive_upload.json
│
├── scripts/                         # Individual service scripts
│   ├── poll-utils.mjs               # HTTP & polling utilities
│   ├── canva-render.mjs             # Canva API integration
│   ├── cloudconvert-merge.mjs       # CloudConvert API integration
│   ├── upload-gdrive.mjs            # Google Drive upload
│   ├── notion-log.mjs               # Notion logging
│   └── env-check.mjs                # Environment validation
│
├── ops/
│   ├── run-one.mjs                  # Master orchestrator script
│   └── scripts/
│       ├── say.js                   # Local TTS CLI (voice gen)
│       └── test-all-voices.sh       # Test all 7 voices
│
├── make/                            # Make.com automation blueprints
│   ├── MAKE_VIDEO_MIN_PIPELINE_GOOGLE.json
│   └── MAKE_VIDEO_MIN_PIPELINE_ONEDRIVE.json
│
├── Production/                      # Output directories
│   ├── Voice/                       # MP3 voice files
│   ├── Video/                       # Final MP4 videos
│   ├── Final/                       # (Future: post-processed)
│   └── logs/
│       └── video_runs.jsonl         # Production log
│
├── out/                             # Local test outputs
│
└── docs/                            # Documentation
    ├── DEPLOYMENT_GUIDE.md          # Complete setup guide
    ├── VALIDATION_GUIDE.md          # Quality checks
    ├── GROUP7_VIDEO_AUTOMATION_SUMMARY.md  # This file
    ├── MAKE_QUICK_START.md          # Make.com automation
    └── QUICK_REFERENCE.md           # Command cheatsheet
```

---

## Daily Production Timeline

Example: 7 videos (one per agent) produced daily at 9:00 AM

```
09:00:00  START: Batch job triggered (CSV or Make.com)
          │
09:00:05  Voice Gen: All 7 MP3s generated (5s each, parallel)
          │  ├─→ GRP7_Lyra_2025_11_02.mp3
          │  ├─→ GRP7_Atlas_2025_11_02.mp3
          │  ├─→ ... (5 more)
          │
09:01:00  Canva Render: Video 1 started
09:01:30  Canva Render: Complete (30s render time)
09:01:35  CloudConvert: Merge started
09:02:15  CloudConvert: Complete (40s merge time)
09:02:20  Google Drive: Upload started
09:02:30  Google Drive: Complete (10s upload time)
09:02:31  Notion: Log entry created
          │
          [Repeat for videos 2-7, sequential or parallel]
          │
09:20:00  END: All 7 videos complete
          │
          Total time: ~20 minutes for 7 videos
          Cost: ~$0.14 total ($0.02 per video)
```

---

## Error Handling & Recovery

### Retry Strategy

All API calls use exponential backoff:
- **Retry 1**: After 5 seconds
- **Retry 2**: After 15 seconds
- **Retry 3**: After 30 seconds
- **Max retries**: 3 attempts per operation

### Idempotency

Every operation uses `external_id = {agent}-{slug}`:
- Prevents duplicate processing
- Safe to re-run failed jobs
- CloudConvert tags jobs for tracking
- Notion logs can be updated (not duplicated)

### Failure Modes

| Stage | Failure | Recovery |
|-------|---------|----------|
| Voice Gen | API error | Retry with backoff; check API key |
| Canva Render | Template not found | Verify CANVA_TEMPLATE_ID |
| Canva Render | Timeout (> 5 min) | Check Canva status page |
| CloudConvert | Job fails | Check CloudConvert dashboard for error |
| Google Drive | 401 Unauthorized | Regenerate JWT; check SA key |
| Google Drive | 403 Forbidden | Verify folder sharing with SA |
| Notion | Database not found | Check NOTION_VIDEO_DB_ID |

### Logs

All operations logged to:
- **Console**: Real-time progress
- **JSONL**: `Production/logs/video_runs.jsonl`
- **Notion**: Per-video status and links

---

## Performance Characteristics

### Throughput

- **Sequential**: ~3 min per video
- **Parallel (Make.com)**: ~7 videos in 20 min
- **Rate limits**:
  - Canva: 100 req/min (autofill endpoint)
  - CloudConvert: 5 jobs concurrently (free tier)
  - Google Drive: 1000 req/100s (SA)
  - Notion: 3 req/s

### Scalability

Current system can handle:
- **Daily**: 100+ videos (limited by CloudConvert credits)
- **Weekly**: 700+ videos
- **Monthly**: 3000+ videos

Bottlenecks:
1. CloudConvert credits (free tier: 25/day)
2. Make.com operations (free tier: 1000 ops/month)
3. Google Drive storage (free tier: 15GB)

### Optimization Opportunities

1. **Batch processing**: Run multiple videos in parallel
2. **CloudConvert workers**: Upgrade to Pro plan (unlimited concurrent jobs)
3. **Canva caching**: Reuse rendered videos with same template/text
4. **Drive compression**: Use lower CRF (bigger files) or higher (smaller)

---

## Security & Compliance

### Secrets Management

All secrets stored in `.env`:
- ✅ Never committed to git (`.gitignore` configured)
- ✅ Base64-encoded private keys (Google Drive SA)
- ✅ Masked in logs (show only last 4 chars)
- ✅ Rotatable without code changes

### API Permissions

Minimum required permissions:
- **Canva**: Read designs + Autofill
- **CloudConvert**: Create jobs + Read jobs
- **Google Drive**: Create files + Read files (in shared folder only)
- **Notion**: Read database + Create pages

### Data Retention

- **Canva exports**: 24 hours (temporary URL)
- **CloudConvert exports**: 1 hour (temporary URL)
- **Google Drive**: Permanent (until manually deleted)
- **Notion logs**: Permanent (database entries)
- **Local temps**: Deleted immediately after use

---

## Cost Breakdown (Detailed)

### Variable Costs (Per Video)

| Service | Unit | Rate | Usage | Cost |
|---------|------|------|-------|------|
| ElevenLabs | 1000 chars | $0.15 | ~100 chars | $0.015 |
| CloudConvert | Conversion minute | $0.008 | ~1 min | $0.008 |
| **Total** | | | | **$0.023** |

### Fixed Costs (Monthly Subscriptions)

| Service | Plan | Cost | Notes |
|---------|------|------|-------|
| Canva | Pro | $12.99 | Unlimited renders |
| Google Drive | 100GB | $1.99 | Optional (15GB free) |
| Notion | Free | $0.00 | Team plan: $8/user if needed |
| ElevenLabs | Starter | $5.00 | 30k chars/month |
| **Total** | | **~$20/month** | + $0.02 per video |

### Break-Even Analysis

- **100 videos/month**: $20 fixed + $2.30 variable = **$22.30 total** = $0.22/video
- **500 videos/month**: $20 fixed + $11.50 variable = **$31.50 total** = $0.06/video
- **1000 videos/month**: $20 fixed + $23 variable = **$43 total** = $0.04/video

**Economies of scale**: Cost per video decreases with volume.

---

## Monitoring & Alerts

### Health Metrics

Monitor these daily:
1. **Success rate**: % of videos completing without errors
2. **Processing time**: Average time per video
3. **API errors**: Count of failed API calls
4. **Storage usage**: GB used in Google Drive
5. **Credit balance**: CloudConvert remaining credits

### Recommended Alerts

- ❌ Any video fails after 3 retries
- ⚠️  Processing time > 10 minutes per video
- ⚠️  CloudConvert balance < 10 credits
- ⚠️  Google Drive storage > 80% full
- ℹ️  Daily batch complete (success notification)

### Dashboard

Use Notion database as real-time dashboard:
- Filter by date range
- Group by agent
- Count by status
- Track error patterns

---

## Next: Automation with Make.com

See `MAKE_QUICK_START.md` for:
- Importing blueprints
- Configuring variables
- Scheduling scenarios
- Handling errors

**System ready for production!** 🚀
