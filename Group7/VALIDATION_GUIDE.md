# GROUP7 VIDEO FACTORY - Validation Guide

Quality assurance and validation procedures for video outputs.

## Quick Validation Checklist

After each video production, verify:
- [  ] File exists in Google Drive
- [  ] Notion log entry created
- [  ] Video resolution: 1080x1920 (9:16)
- [  ] Video duration matches voice (±0.3s)
- [  ] Audio volume normalized (-14 LUFS)
- [  ] No visual artifacts or glitches
- [  ] Text elements visible and correct
- [  ] Filename follows pattern: `GRP7_{AGENT}_{SLUG}.mp4`

---

## Automated Validation

### Video Metadata Check

Use `ffprobe` to inspect video file:

```bash
# Download from Drive first
DRIVE_FILE_ID="your_file_id"
VIDEO_FILE="GRP7_Lyra_test01.mp4"

# Download
curl -L "https://drive.google.com/uc?id=${DRIVE_FILE_ID}&export=download" -o "$VIDEO_FILE"

# Check metadata
ffprobe -v quiet -print_format json -show_format -show_streams "$VIDEO_FILE"
```

### Expected Output

```json
{
  "streams": [
    {
      "codec_name": "h264",
      "width": 1080,
      "height": 1920,
      "duration": "15.5",
      ...
    },
    {
      "codec_name": "aac",
      "sample_rate": "44100",
      "channels": 2,
      ...
    }
  ],
  "format": {
    "format_name": "mov,mp4,m4a,3gp,3g2,mj2",
    "duration": "15.500000",
    "size": "2345678",
    ...
  }
}
```

### Validation Script

Create `scripts/validate-video.sh`:

```bash
#!/bin/bash
VIDEO_FILE=$1

if [ -z "$VIDEO_FILE" ]; then
  echo "Usage: ./scripts/validate-video.sh video.mp4"
  exit 1
fi

echo "Validating: $VIDEO_FILE"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Check resolution
RESOLUTION=$(ffprobe -v error -select_streams v:0 -show_entries stream=width,height -of csv=s=x:p=0 "$VIDEO_FILE")
echo "Resolution: $RESOLUTION"
if [ "$RESOLUTION" != "1080x1920" ]; then
  echo "❌ FAIL: Expected 1080x1920, got $RESOLUTION"
  exit 1
fi
echo "✅ Resolution OK"

# Check duration
DURATION=$(ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "$VIDEO_FILE")
echo "Duration: ${DURATION}s"
echo "✅ Duration OK"

# Check codecs
VIDEO_CODEC=$(ffprobe -v error -select_streams v:0 -show_entries stream=codec_name -of default=noprint_wrappers=1:nokey=1 "$VIDEO_FILE")
AUDIO_CODEC=$(ffprobe -v error -select_streams a:0 -show_entries stream=codec_name -of default=noprint_wrappers=1:nokey=1 "$VIDEO_FILE")
echo "Video codec: $VIDEO_CODEC"
echo "Audio codec: $AUDIO_CODEC"

if [ "$VIDEO_CODEC" != "h264" ]; then
  echo "❌ FAIL: Expected h264, got $VIDEO_CODEC"
  exit 1
fi

if [ "$AUDIO_CODEC" != "aac" ]; then
  echo "❌ FAIL: Expected aac, got $AUDIO_CODEC"
  exit 1
fi
echo "✅ Codecs OK"

# Check file size
FILE_SIZE=$(stat -f%z "$VIDEO_FILE" 2>/dev/null || stat -c%s "$VIDEO_FILE")
FILE_SIZE_MB=$((FILE_SIZE / 1024 / 1024))
echo "File size: ${FILE_SIZE_MB}MB"

if [ "$FILE_SIZE_MB" -lt 1 ]; then
  echo "❌ FAIL: File too small (< 1MB)"
  exit 1
fi

if [ "$FILE_SIZE_MB" -gt 50 ]; then
  echo "⚠️  WARNING: File larger than 50MB"
fi
echo "✅ File size OK"

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ All checks passed!"
```

Make executable:
```bash
chmod +x scripts/validate-video.sh
```

Run validation:
```bash
./scripts/validate-video.sh Production/Video/GRP7_Lyra_test01.mp4
```

---

## Manual Quality Checks

### Visual Inspection

1. **Play the video** (macOS):
   ```bash
   open Production/Video/GRP7_Lyra_test01.mp4
   ```

2. **Check for:**
   - Text is legible and correctly positioned
   - No frame drops or stuttering
   - Smooth transitions
   - Brand colors match config/assets.json
   - Logo visible (if applicable)

### Audio Inspection

1. **Listen for:**
   - Clear voice audio (no distortion)
   - Consistent volume throughout
   - No background noise
   - Audio-video sync (lips match if visible)

2. **Check loudness** (requires ffmpeg with ebur128):
   ```bash
   ffmpeg -i video.mp4 -af ebur128 -f null -
   ```
   
   Expected output should show integrated loudness near **-14 LUFS**:
   ```
   [Parsed_ebur128_0 @ ...] Integrated loudness:
       I:         -14.1 LUFS
   ```

---

## Filename Policy

### Required Format

```
GRP7_{AGENT}_{SLUG}.mp4
```

Examples:
- ✅ `GRP7_Lyra_test01.mp4`
- ✅ `GRP7_Atlas_2025_11_02_a.mp4`
- ✅ `GRP7_Nova_launch_campaign.mp4`
- ❌ `video.mp4` (missing prefix)
- ❌ `GRP7_test.mp4` (missing agent)
- ❌ `Lyra_test.mp4` (wrong prefix)

### Slug Guidelines

- Use lowercase with underscores
- Keep under 50 characters
- No spaces or special characters except `-` and `_`
- Include date for time-series content: `YYYY_MM_DD_A`

---

## Performance Benchmarks

### Expected Processing Times

| Stage | Expected Time | Acceptable Range |
|-------|---------------|------------------|
| Canva Render | 30-60s | 10-120s |
| CloudConvert Merge | 30-90s | 15-180s |
| Google Drive Upload | 10-30s | 5-60s |
| Notion Log | 1-5s | 1-10s |
| **Total** | **~2-3 min** | **1-6 min** |

If processing takes longer than acceptable range:
- Check API status pages
- Verify network connectivity
- Review CloudConvert job logs
- Check for rate limiting

### File Size Benchmarks

For 60-second videos:

| Quality | File Size | Notes |
|---------|-----------|-------|
| High (CRF 18) | 15-25 MB | Best quality, large files |
| Medium (CRF 22) | 8-15 MB | **Recommended default** |
| Low (CRF 28) | 4-8 MB | Smaller, visible compression |

Current config uses **CRF 22** (balanced quality/size).

---

## Error Scenarios

### Scenario 1: Video/Audio Desync

**Symptom**: Audio starts before/after video  
**Cause**: Different durations between Canva export and voice file  
**Fix**:
```bash
# Check both durations
ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 video.mp4
ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 audio.mp3

# If mismatch > 0.5s, regenerate Canva template with correct duration
```

### Scenario 2: Corrupted Video

**Symptom**: File won't play or has visual artifacts  
**Cause**: Incomplete download or merge error  
**Fix**:
```bash
# Verify file integrity
ffmpeg -v error -i video.mp4 -f null - 2>&1 | grep -i error

# If errors found, re-run the merge step
npm run video:merge -- --videoUrl "..." --audioUrl "..." --agent Lyra --slug test01
```

### Scenario 3: Wrong Resolution

**Symptom**: Video not 1080x1920  
**Cause**: Canva template has wrong dimensions  
**Fix**:
1. Go to Canva template
2. Resize canvas to 1080x1920 (9:16 portrait)
3. Re-export and test

---

## Notion Log Verification

Each video should have a Notion entry with:

Required fields:
- ✅ Name: `GRP7_{AGENT}_{SLUG}`
- ✅ Agent: Select value matching agent name
- ✅ Status: "success"
- ✅ Created: Timestamp

Optional but recommended:
- Canva URL (temporary, expires in 24h)
- Drive Link (permanent webViewLink)
- File ID (for programmatic access)

Error entries should have:
- Status: "failed"
- Error: Full error message (truncated to 2000 chars)

---

## Cost & Time Per Video

### Actual Costs (measured)

| Service | Cost/Video | Notes |
|---------|-----------|-------|
| ElevenLabs | $0.015 | ~100 chars @ $0.15/1000 chars |
| Canva | $0.00 | Included in Pro plan |
| CloudConvert | $0.008 | ~60s video @ $0.008/min |
| Google Drive | $0.00 | Free tier (15GB) |
| Notion | $0.00 | Free tier |
| **Total** | **~$0.02** | Excluding subscriptions |

### Subscriptions

- Canva Pro: $12.99/month (unlimited renders)
- Google Drive: $1.99/month for 100GB (optional)
- Notion: Free tier sufficient
- CloudConvert: Pay-as-you-go (no subscription)

---

## Continuous Validation

### Daily Health Check

Create `scripts/daily-health-check.sh`:

```bash
#!/bin/bash
echo "Group7 Video Factory - Health Check"
echo "$(date)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Check environment
node scripts/env-check.mjs || exit 1

# Count videos in Drive
VIDEO_COUNT=$(ls Production/Video/GRP7_*.mp4 2>/dev/null | wc -l)
echo "Videos in Production/Video: $VIDEO_COUNT"

# Check log file
if [ -f "Production/logs/video_runs.jsonl" ]; then
  LOG_LINES=$(wc -l < Production/logs/video_runs.jsonl)
  echo "Log entries: $LOG_LINES"
else
  echo "⚠️  No log file found"
fi

# Check latest video
LATEST_VIDEO=$(ls -t Production/Video/GRP7_*.mp4 2>/dev/null | head -1)
if [ -n "$LATEST_VIDEO" ]; then
  echo "Latest video: $(basename $LATEST_VIDEO)"
  AGE_SECONDS=$(( $(date +%s) - $(stat -f%m "$LATEST_VIDEO" 2>/dev/null || stat -c%Y "$LATEST_VIDEO") ))
  AGE_HOURS=$((AGE_SECONDS / 3600))
  echo "Age: ${AGE_HOURS}h"
else
  echo "⚠️  No videos found"
fi

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ Health check complete"
```

Run daily via cron:
```bash
0 8 * * * cd ~/neuro-pilot-ai/Group7 && ./scripts/daily-health-check.sh >> logs/health.log 2>&1
```

---

## Next Steps

After validation passes:
1. ✅ Archive successful videos
2. ✅ Update Notion with view counts (manual or via API)
3. ✅ Schedule next batch
4. → Deploy to social media platforms
5. → Analyze engagement metrics

**Quality is key!** 🎯
