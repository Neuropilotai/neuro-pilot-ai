# Group7 D-ID Video Factory - Quick Start

## Production Status: ✅ READY

Your autonomous video factory is fully operational with D-ID talking heads!

**Successfully generated:** 8 videos (testing phase complete)

## Generate a Video (Single Command)

```bash
# With predefined script (fastest)
node ops/run-one-did.mjs \
  --agent=Lyra \
  --hook="Your attention-grabbing hook" \
  --insight="Your valuable insight (25-35 words)" \
  --cta="Your call to action" \
  --did-tts

# Let GPT-4 generate the script
node ops/run-one-did.mjs --agent=Lyra

# With ElevenLabs voice (higher quality)
node ops/run-one-did.mjs \
  --agent=Lyra \
  --hook="Your hook" \
  --insight="Your insight" \
  --cta="Your CTA"
```

## Output Locations

**Videos:** Production/Video/*.mp4
**Logs:** Production/logs/*.json  
**Audio (temp):** Production/Audio/*.mp3 (auto-cleaned)

## Video Specifications

- Format: MP4 (H.264)
- Size: 3-4 MB average
- Duration: 20-30 seconds
- Resolution: 1080p
- Avatar: Lyra with lip-sync
- Render Time: 10 seconds average

## System Status

✅ All 8 required API keys configured
✅ D-ID integration working (10s renders)
✅ Environment validated
✅ Local storage operational
✅ Production-ready

## Quick Commands

```bash
# Environment check
node scripts/env-check.mjs

# Generate video
node ops/run-one-did.mjs --agent=Lyra --did-tts

# View latest video
ls -t Production/Video/*.mp4 | head -1
```

---
**System Version:** v2.0 (D-ID)
**Last Updated:** 2025-11-03
