# 🎬 Group7 Shotstack AI Video Automation System

**Complete Production-Ready Video Pipeline by Neuro.Pilot.AI**

Autonomous video creation system that transforms text into professional vertical videos using AI voice generation (ElevenLabs) and programmatic video rendering (Shotstack API).

---

## 🚀 Quick Start

### Prerequisites

- Node.js 20+
- Valid API keys for:
  - OpenAI (GPT-4)
  - ElevenLabs (Text-to-Speech)
  - Shotstack (Video Rendering)
  - Google Drive (Storage)
  - Notion (Logging - optional)

### Installation

```bash
# 1. Install dependencies
npm install dotenv

# 2. Copy and configure environment variables
cp .env.example .env
nano .env

# 3. Validate environment
node scripts/env-check-shotstack.mjs

# 4. Run test render
npm run shotstack:test
```

---

## 📦 System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    INPUT TRIGGERS                           │
│  • CLI Command                                              │
│  • Make.com Webhook                                         │
│  • Cron Schedule                                            │
│  • Manual Execution                                         │
└──────────────────┬──────────────────────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────────────────────┐
│              STEP 1: SCRIPT GENERATION                      │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  OpenAI GPT-4 API                                   │   │
│  │  • Generate compelling hook (6-10 words)            │   │
│  │  • Generate valuable insight (15-20 words)          │   │
│  │  • Agent-specific personality and tone              │   │
│  └─────────────────────────────────────────────────────┘   │
└──────────────────┬──────────────────────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────────────────────┐
│            STEP 2: VOICE GENERATION                         │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  ElevenLabs TTS API                                 │   │
│  │  • Convert text to speech                           │   │
│  │  • Agent-specific voice profiles:                   │   │
│  │    - Lyra: Rachel (Professional)                    │   │
│  │    - Atlas: Josh (Confident)                        │   │
│  │    - Nova: Lily (Energetic)                         │   │
│  │    - Cipher: Charlie (Analytical)                   │   │
│  │    - Echo: Bella (Warm)                             │   │
│  │    - Quantum: George (Authoritative)                │   │
│  │    - Nexus: Chris (Clear)                           │   │
│  │  • Output: MP3 audio file                           │   │
│  └─────────────────────────────────────────────────────┘   │
└──────────────────┬──────────────────────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────────────────────┐
│          STEP 3: AUDIO STORAGE (TEMP)                       │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  Google Drive Upload                                │   │
│  │  • Upload MP3 to temporary folder                   │   │
│  │  • Generate public download URL                     │   │
│  │  • Required for Shotstack API access                │   │
│  └─────────────────────────────────────────────────────┘   │
└──────────────────┬──────────────────────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────────────────────┐
│            STEP 4: VIDEO RENDERING                          │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  Shotstack API                                      │   │
│  │  • Submit render job with:                          │   │
│  │    - HTML5 video template (1080x1920)               │   │
│  │    - Dynamic text (hook, insight, CTA)              │   │
│  │    - Voice audio track                              │   │
│  │    - Brand colors and animations                    │   │
│  │  • Poll render status (queued → processing → done)  │   │
│  │  • Download rendered MP4                            │   │
│  └─────────────────────────────────────────────────────┘   │
└──────────────────┬──────────────────────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────────────────────┐
│          STEP 5: VIDEO STORAGE (PERMANENT)                  │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  Google Drive Upload                                │   │
│  │  • Upload MP4 to production folder                  │   │
│  │  • Generate shareable link                          │   │
│  │  • Organize by agent and date                       │   │
│  └─────────────────────────────────────────────────────┘   │
└──────────────────┬──────────────────────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────────────────────┐
│              STEP 6: LOGGING & TRACKING                     │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  Notion Database                                    │   │
│  │  • Log video metadata                               │   │
│  │  • Track agent, hook, insight, video URL           │   │
│  │  • Status and timestamps                            │   │
│  │  • Enable analytics and learning loop               │   │
│  └─────────────────────────────────────────────────────┘   │
└──────────────────┬──────────────────────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────────────────────┐
│                      OUTPUT                                 │
│  • MP4 video (1080x1920, 30fps, 30 seconds)                │
│  • Google Drive shareable link                              │
│  • Notion database entry                                    │
│  • JSON result metadata                                     │
└─────────────────────────────────────────────────────────────┘
```

---

## 🎯 Core Components

### 1. **Environment Validation** (`scripts/env-check-shotstack.mjs`)
- Validates all required API keys
- Tests API connectivity and credentials
- Provides detailed health check reports

### 2. **Voice Generation** (`scripts/elevenlabs.mjs`)
- Standalone ElevenLabs TTS integration
- Agent-specific voice profiles
- Configurable voice settings (stability, similarity)
- CLI and programmatic API

### 3. **Video Rendering** (`scripts/shotstack-render.mjs`)
- Shotstack API integration
- Submit, poll, download workflow
- Configurable timeouts and retries
- Template-based rendering

### 4. **Cloud Storage** (`scripts/upload-gdrive.mjs`)
- Google Drive JWT authentication
- Multipart file uploads
- Automatic public URL generation

### 5. **Database Logging** (`scripts/notion-log.mjs`)
- Notion API integration
- Structured video metadata storage
- Supports analytics and reporting

### 6. **Master Orchestrator** (`ops/run-one-shotstack.mjs`)
- End-to-end pipeline automation
- Error handling and retries
- Progress logging with timestamps
- JSON result output

### 7. **Video Template** (`config/shotstack_template.json`)
- HTML5-based video design
- Responsive typography and animations
- Brand colors (#0B1220, #0EA5E9, #F8FAFC)
- 1080x1920 vertical format

### 8. **Learning Loop** (`ops/learning/`)
- Performance analytics
- Prompt optimization
- A/B testing support
- Weekly engagement reports

---

## 🎨 Video Specifications

| Property | Value |
|----------|-------|
| **Format** | MP4 (H.264) |
| **Resolution** | 1080x1920 (portrait) |
| **Duration** | 30 seconds |
| **FPS** | 30 |
| **Background** | Linear gradient (#0B1220 → #1E293B) |
| **Primary Color** | #0EA5E9 (sky blue) |
| **Text Color** | #F8FAFC (slate white) |
| **Font** | Inter SemiBold |
| **Animations** | Fade in, slide up transitions |

---

## 📋 Environment Variables

Create a `.env` file with the following keys:

```bash
# ===== OpenAI API =====
OPENAI_API_KEY=sk-proj-...

# ===== ElevenLabs API =====
ELEVENLABS_API_KEY=elv_...

# ===== Shotstack API =====
SHOTSTACK_API_KEY=prod_...
SHOTSTACK_REGION=us
SHOTSTACK_STAGE=v1

# ===== Google Drive API =====
GDRIVE_OUTPUT_FOLDER_ID=1xxxxxxxxxxxxxx
GDRIVE_TEMP_FOLDER_ID=1xxxxxxxxxxxxxx     # Optional, uses OUTPUT if not set
GDRIVE_SERVICE_EMAIL=your-service-account@project.iam.gserviceaccount.com
GDRIVE_PRIVATE_KEY_BASE64=base64-encoded-private-key

# ===== Notion API (Optional) =====
NOTION_TOKEN=ntn_...
NOTION_VIDEO_DB_ID=xxxxxxxxxxxxxxxx

# ===== Branding =====
BRAND_COLOR=#0EA5E9
LOGO_PATH=./assets/logo_group7.png
```

### 🔑 Getting API Keys

1. **OpenAI**: https://platform.openai.com/api-keys
2. **ElevenLabs**: https://elevenlabs.io/api
3. **Shotstack**: https://dashboard.shotstack.io/register
4. **Google Drive**: https://console.cloud.google.com/ (Service Account)
5. **Notion**: https://www.notion.so/my-integrations

---

## 💻 CLI Usage

### Run Complete Pipeline

```bash
# With auto-generated script
node ops/run-one-shotstack.mjs --agent=Lyra

# With custom content
node ops/run-one-shotstack.mjs \
  --agent=Lyra \
  --hook="AI will transform everything" \
  --insight="Autonomous creators are already here, building the future" \
  --slug=lyra_2024_custom
```

### Individual Scripts

```bash
# Validate environment
npm run env:check:shotstack

# Test ElevenLabs voice
node scripts/elevenlabs.mjs test Lyra "Hello from Group7"

# List available voices
node scripts/elevenlabs.mjs list

# Show agent voice mapping
node scripts/elevenlabs.mjs agents

# Validate Shotstack credentials
npm run shotstack:validate

# Run test render
npm run shotstack:test
```

### Package.json Scripts

```bash
npm run shotstack:render          # Run full pipeline
npm run shotstack:test            # Test render with sample data
npm run shotstack:validate        # Validate API credentials
npm run env:check:shotstack       # Environment validation
```

---

## 🔗 Make.com Integration

### Import Blueprint

1. Open Make.com dashboard
2. Create new scenario
3. Click "..." → "Import Blueprint"
4. Upload `make/MAKE_SHOTSTACK_AUTOMATION.json`
5. Configure environment variables in Make.com
6. Activate scenario

### Webhook Trigger

```bash
# Send POST request to Make.com webhook
curl -X POST https://hook.us1.make.com/YOUR_WEBHOOK_ID \
  -H "Content-Type: application/json" \
  -d '{
    "agent": "Lyra",
    "hook": "AI is changing everything",
    "insight": "The future of content creation is autonomous"
  }'
```

### Make.com Environment Variables

Add these in Make.com Data Store or as constants:

- `ELEVENLABS_API_KEY`
- `SHOTSTACK_API_KEY`
- `SHOTSTACK_REGION`
- `GDRIVE_OUTPUT_FOLDER_ID`
- `GDRIVE_TEMP_FOLDER_ID`
- `NOTION_VIDEO_DB_ID`

---

## 📊 Output Format

Each render produces a JSON result file:

```json
{
  "agent": "Lyra",
  "slug": "lyra_20241102_143022",
  "hook": "AI will change everything",
  "insight": "Autonomous creators are already here",
  "video_url": "https://drive.google.com/file/d/abc123/view",
  "created_at": "2024-11-02T14:30:22.000Z",
  "pipeline": "shotstack"
}
```

---

## 🧪 Testing

### 1. Environment Check

```bash
node scripts/env-check-shotstack.mjs
```

Expected output:
```
✅ SHOTSTACK_API_KEY
✅ OPENAI_API_KEY
✅ ELEVENLABS_API_KEY
✅ GDRIVE_OUTPUT_FOLDER_ID
✅ GDRIVE_SERVICE_EMAIL
✅ GDRIVE_PRIVATE_KEY_BASE64

🏥 API Health Checks:
   ✅ Shotstack API - Valid credentials
   ✅ ElevenLabs API - Valid credentials
   ✅ OpenAI API - Valid credentials
   ✅ Notion API - Valid credentials

✅ All checks passed! Group7 is ready to run.
```

### 2. Voice Generation Test

```bash
node scripts/elevenlabs.mjs test Lyra "This is a test of Group7"
```

Expected output:
```
🎤 ELEVENLABS TEXT-TO-SPEECH
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Agent: Lyra
Voice ID: jsCqWAovK2LkecY7zXl4
Model: eleven_turbo_v2
Text: This is a test of Group7

✅ Voice generated in 1245ms
   Size: 42.31 KB
💾 Saved to: ../Production/test_voice_lyra.mp3
   File size: 42.31 KB
```

### 3. Shotstack API Test

```bash
npm run shotstack:test
```

Expected output:
```
📤 Submitting render to Shotstack...
✅ Render submitted: abc123-def456-ghi789

⏳ Polling render status: abc123-def456-ghi789
   Status: queued (0s elapsed)
   Status: processing (5s elapsed)
   Status: processing (10s elapsed)
   Status: done (15s elapsed)
✅ Render complete: https://shotstack-assets.s3.amazonaws.com/abc123.mp4

📥 Downloading video to: ../Production/test_shotstack.mp4
✅ Downloaded: 2.45 MB

✅ Test render complete!
```

### 4. Full Pipeline Test

```bash
node ops/run-one-shotstack.mjs --agent=Lyra --hook="Test video" --insight="Testing Group7 system"
```

---

## 🛠️ Troubleshooting

### Common Issues

#### 1. Shotstack API Returns 401
- **Cause**: Invalid API key
- **Fix**: Check `SHOTSTACK_API_KEY` in `.env`
- **Verify**: `npm run shotstack:validate`

#### 2. ElevenLabs Voice Generation Fails
- **Cause**: Invalid API key or voice ID
- **Fix**: Verify `ELEVENLABS_API_KEY` and agent voice mapping
- **Verify**: `node scripts/elevenlabs.mjs validate`

#### 3. Google Drive Upload Fails
- **Cause**: Invalid service account credentials
- **Fix**: Check `GDRIVE_SERVICE_EMAIL` and `GDRIVE_PRIVATE_KEY_BASE64`
- **Verify**: Ensure service account has "Editor" access to Drive folders

#### 4. Shotstack Render Timeout
- **Cause**: Render taking longer than expected
- **Fix**: Increase timeout in `pollRenderStatus()` function
- **Default**: 5 minutes (300000ms)

#### 5. Notion Logging Fails
- **Cause**: Invalid database schema or API token
- **Fix**: Ensure Notion database has required properties:
  - Title (title)
  - Agent (select)
  - Hook (rich_text)
  - Insight (rich_text)
  - Video URL (url)
  - Status (select)
  - Created (date)

---

## 📈 Performance Metrics

| Metric | Average | Notes |
|--------|---------|-------|
| **Script Generation** | 2-4s | GPT-4 API call |
| **Voice Generation** | 1-3s | ElevenLabs TTS |
| **Audio Upload** | 1-2s | Google Drive |
| **Video Rendering** | 15-45s | Shotstack processing |
| **Video Download** | 2-5s | Depends on file size |
| **Video Upload** | 3-8s | Google Drive |
| **Notion Logging** | 0.5-1s | Notion API |
| **Total Pipeline** | 25-70s | End-to-end |

---

## 🔄 Learning Loop

The system includes an autonomous learning module that:

1. **Analyzes Performance** (`ops/learning/analyze-performance.mjs`)
   - Queries Notion database for video metrics
   - Calculates engagement scores
   - Identifies high/low performers

2. **Adapts Prompts** (`ops/learning/adapt-prompts.mjs`)
   - A/B tests different prompt styles
   - Optimizes hook and insight generation
   - Adjusts tone and length based on performance

3. **Continuous Improvement** (`ops/learning/learning-loop.mjs`)
   - Runs weekly analysis
   - Updates prompt templates
   - Generates performance reports

### Run Learning Loop

```bash
# Analyze last 7 days of videos
npm run learn:analyze

# Adapt prompts based on performance
npm run learn:adapt

# Run complete learning loop
npm run learn:loop
```

---

## 🎯 Roadmap

- [ ] Support for custom background music
- [ ] Multi-language voice generation
- [ ] Advanced video templates (split-screen, transitions)
- [ ] Automated social media posting (Instagram, TikTok, YouTube)
- [ ] Real-time analytics dashboard
- [ ] AI-powered thumbnail generation
- [ ] Webhook-based retry mechanism
- [ ] Video compression optimization
- [ ] Batch processing for multiple videos

---

## 📚 Additional Documentation

- [Shotstack API Documentation](https://shotstack.io/docs/guide/)
- [ElevenLabs API Documentation](https://elevenlabs.io/docs/api-reference)
- [Google Drive API Documentation](https://developers.google.com/drive/api/guides/about-sdk)
- [Notion API Documentation](https://developers.notion.com/)
- [Make.com Documentation](https://www.make.com/en/help/modules)

---

## 🙋 Support

**Issues or Questions?**
- Email: support@neuro-pilot.ai
- Documentation: ./docs/
- Examples: ./Production/logs/

**Created by**: David Mikulis / Neuro.Pilot.AI
**License**: MIT
**Version**: 1.0.0
**Last Updated**: November 2024

---

## 🎉 Example Output

Here's what a completed video looks like:

```
📊 Pipeline Result:

✅ Script Generated
   Hook: "AI will change everything"
   Insight: "Autonomous creators are already building the future"

✅ Voice Generated
   Agent: Lyra (Rachel voice)
   Duration: 8.2 seconds
   File: 42.3 KB

✅ Video Rendered
   Render ID: abc123-def456-ghi789
   Duration: 30 seconds
   Size: 2.45 MB

✅ Uploaded to Google Drive
   URL: https://drive.google.com/file/d/abc123/view

✅ Logged to Notion
   Page ID: def456-ghi789-jkl012

🎬 DONE! Video ready for distribution.
```

**Watch the video**: [Sample Output](https://drive.google.com/file/d/abc123/view)

---

**Ready to create autonomous AI videos? Let's go! 🚀**

```bash
npm run shotstack:render -- --agent=Lyra
```
