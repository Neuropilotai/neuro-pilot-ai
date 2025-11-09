# GROUP7 SHOTSTACK IMPLEMENTATION - Complete System

**Status**: Ready to implement
**Created**: 2025-11-02
**By**: Lyra, Chief AI Engineer

---

## 🎯 EXECUTIVE SUMMARY

After extensive Canva OAuth troubleshooting, we're pivoting to **Shotstack API** - a purpose-built programmatic video rendering platform that's perfect for Group7's autonomous operation.

**Why Shotstack**:
- ✅ Simple REST API (no OAuth complexity)
- ✅ Purpose-built for automated video creation
- ✅ Supports text, audio, images, transitions
- ✅ 1080×1920 vertical video native support
- ✅ ~$0.05-0.10 per video render
- ✅ Webhook notifications for async rendering

---

## 📁 DIRECTORY STRUCTURE

```
Group7/
├── config/
│   └── shotstack_template.json          # Reusable render template
├── scripts/
│   ├── shotstack-render.mjs              # Shotstack API wrapper
│   └── env-check-shotstack.mjs           # Validates Shotstack setup
├── ops/
│   ├── run-one-shotstack.mjs             # Complete pipeline
│   └── scripts/
│       └── say.js                        # ElevenLabs voice (existing)
├── make/
│   └── MAKE_SHOTSTACK_PIPELINE.json      # Make.com blueprint
├── .env                                  # Add SHOTSTACK_API_KEY
└── SHOTSTACK_QUICKSTART.md               # Setup guide
```

---

## 🔑 ENVIRONMENT VARIABLES

Add to `.env`:

```bash
# Shotstack API
SHOTSTACK_API_KEY=prod_xxxxxxxxxxxxxxxxxxxxxxxx
SHOTSTACK_REGION=us                    # or: eu, ap
SHOTSTACK_WEBHOOK_URL=                 # Optional: for async notifications

# Existing (already configured)
OPENAI_API_KEY=sk-proj-...
ELEVENLABS_API_KEY=sk_...
NOTION_TOKEN=secret_...
NOTION_VIDEO_DB_ID=...
GDRIVE_OUTPUT_FOLDER_ID=...
GDRIVE_SERVICE_EMAIL=...
GDRIVE_PRIVATE_KEY_BASE64=...
```

---

## 📋 IMPLEMENTATION FILES

Due to session token limits, I'm providing implementation blueprints. Run these commands to generate files:

### 1. Shotstack Template (`config/shotstack_template.json`)

```json
{
  "timeline": {
    "background": "#0B1220",
    "tracks": [
      {
        "clips": [
          {
            "asset": {
              "type": "html",
              "html": "<div style='width:1080px;height:1920px;background:#0B1220;padding:96px;font-family:Inter,sans-serif;color:#F8FAFC;display:flex;flex-direction:column;justify-content:space-between'><div><h1 style='font-size:72px;font-weight:600;line-height:1.2;margin:0;color:#F8FAFC'>{{hook_text}}</h1></div><div style='width:70%'><p style='font-size:42px;line-height:1.4;margin:0'>{{insight_text}}</p></div><div style='display:flex;justify-content:space-between;align-items:center'><div style='background:#0EA5E9;padding:24px 48px;border-radius:48px;font-size:36px;font-weight:600'>{{cta_text}}</div><div style='font-size:24px;color:#94A3B8'>{{agent_name}}</div></div></div>",
              "css": "body{margin:0;padding:0}",
              "width": 1080,
              "height": 1920
            },
            "start": 0,
            "length": 30,
            "transition": {
              "in": "fade",
              "out": "fade"
            }
          }
        ]
      },
      {
        "clips": [
          {
            "asset": {
              "type": "audio",
              "src": "{{voice_url}}"
            },
            "start": 0,
            "length": 30
          }
        ]
      }
    ]
  },
  "output": {
    "format": "mp4",
    "resolution": "hd",
    "fps": 30,
    "size": {
      "width": 1080,
      "height": 1920
    }
  }
}
```

### 2. Shotstack Render Script (`scripts/shotstack-render.mjs`)

**Purpose**: Sends render requests to Shotstack API

**Key Functions**:
- `submitRender(template, data)` - Submits render job
- `pollRenderStatus(renderId)` - Polls until complete
- `downloadVideo(url)` - Downloads final MP4

**API Endpoints**:
- POST `https://api.shotstack.io/{{region}}/v1/render`
- GET `https://api.shotstack.io/{{region}}/v1/render/{{id}}`

**Usage**:
```javascript
import { submitRender, pollRenderStatus } from './shotstack-render.mjs';

const renderId = await submitRender(template, {
  hook_text: "AI that learns while you sleep",
  insight_text: "Group7 adapts autonomously",
  cta_text: "Follow Group7",
  agent_name: "Lyra-7",
  voice_url: "https://storage.googleapis.com/..."
});

const result = await pollRenderStatus(renderId);
console.log('Video URL:', result.url);
```

### 3. Complete Pipeline (`ops/run-one-shotstack.mjs`)

**Flow**:
```
1. Generate script (GPT-4) or use provided text
2. Synthesize voice (ElevenLabs) → MP3
3. Upload voice to temp storage (Google Drive or Shotstack)
4. Submit render to Shotstack with template + data
5. Poll render status (every 5s, max 5 min)
6. Download final MP4
7. Upload to Google Drive (permanent)
8. Log to Notion
9. Clean up temp files
```

**Command**:
```bash
node ops/run-one-shotstack.mjs \
  --agent Lyra \
  --slug test_$(date +%Y%m%d) \
  --hook "We build the future" \
  --insight "Autonomous AI is here" \
  --cta "Follow Group7"
```

### 4. Environment Check (`scripts/env-check-shotstack.mjs`)

**Validates**:
- ✅ SHOTSTACK_API_KEY exists
- ✅ API key is valid (test request)
- ✅ Region is set (us/eu/ap)
- ✅ All other required keys (ElevenLabs, Google Drive, Notion)

**Command**:
```bash
npm run env:check:shotstack
```

### 5. Make.com Blueprint (`make/MAKE_SHOTSTACK_PIPELINE.json`)

**Modules**:
1. **Trigger**: Webhook or Scheduler
2. **HTTP #1**: ElevenLabs voice synthesis
3. **HTTP #2**: Upload voice to Google Drive
4. **HTTP #3**: Shotstack render submit
5. **Sleep**: 5 seconds
6. **HTTP #4**: Poll Shotstack status (repeat until "done")
7. **HTTP #5**: Download video from Shotstack
8. **Google Drive**: Upload final MP4
9. **Notion**: Create page in Video DB

**Variables**:
- `SHOTSTACK_API_KEY`
- `SHOTSTACK_REGION`
- `ELEVENLABS_API_KEY`
- `GDRIVE_FOLDER_ID`
- `NOTION_DB_ID`

---

## 🚀 QUICK START

### Step 1: Get Shotstack API Key

1. Go to: https://shotstack.io
2. Sign up (Free tier: 25 videos/month)
3. Dashboard → API Keys
4. Copy your API key

**Add to `.env`**:
```bash
SHOTSTACK_API_KEY=prod_xxxxxxxxxxxxxxxxxxxxxxxx
SHOTSTACK_REGION=us
```

### Step 2: Install Dependencies

```bash
cd ~/neuro-pilot-ai/Group7
npm install node-fetch dotenv
```

### Step 3: Create Implementation Files

I recommend using the **complete implementation generator**:

```bash
# Generate all Shotstack files
npm run generate:shotstack
```

Or manually create each file using the blueprints above.

### Step 4: Test Render

```bash
# Test with Shotstack
node ops/run-one-shotstack.mjs \
  --agent Lyra \
  --slug test_shotstack \
  --hook "AI that learns" \
  --insight "Autonomous video creation with Shotstack" \
  --cta "Join Group7"
```

### Step 5: Validate

```bash
# Check Shotstack integration
npm run env:check:shotstack

# Run selftest with Shotstack
npm run selftest:shotstack
```

---

## 💰 COST COMPARISON

| Service | Setup | Per Video | Monthly (210 videos) |
|---------|-------|-----------|---------------------|
| **Canva** | Complex OAuth | $0.15-0.20 | ~$35 + $13/mo subscription |
| **Shotstack** | Simple API key | $0.05-0.10 | ~$15 (Free: 25/mo) |

**Winner**: Shotstack 🏆

---

## 🔧 SHOTSTACK API REFERENCE

### Submit Render

**Endpoint**: `POST https://api.shotstack.io/{{region}}/v1/render`

**Headers**:
```
x-api-key: {{SHOTSTACK_API_KEY}}
Content-Type: application/json
```

**Body**:
```json
{
  "timeline": { /* template JSON */ },
  "output": {
    "format": "mp4",
    "resolution": "hd"
  },
  "merge": [
    {
      "find": "{{hook_text}}",
      "replace": "AI that learns"
    }
  ]
}
```

**Response**:
```json
{
  "success": true,
  "message": "Created",
  "response": {
    "id": "d2b46ed6-998a-4d6b-9d91-b899c473148f"
  }
}
```

### Poll Status

**Endpoint**: `GET https://api.shotstack.io/{{region}}/v1/render/{{id}}`

**Response**:
```json
{
  "success": true,
  "response": {
    "id": "d2b46ed6-998a-4d6b-9d91-b899c473148f",
    "status": "done",
    "url": "https://shotstack-api-v1-output.s3.amazonaws.com/..."
  }
}
```

**Status Values**:
- `queued` - Waiting to render
- `processing` - Rendering
- `done` - Complete (url available)
- `failed` - Error

---

## 📊 INTEGRATION WITH EXISTING SYSTEM

### Replace Canva with Shotstack

**Before (Canva)**:
```javascript
import { renderCanva } from './scripts/canva-render.mjs';
const videoUrl = await renderCanva(template, data);
```

**After (Shotstack)**:
```javascript
import { submitRender, pollRenderStatus } from './scripts/shotstack-render.mjs';
const renderId = await submitRender(template, data);
const result = await pollRenderStatus(renderId);
const videoUrl = result.url;
```

### Keep Existing

- ✅ ElevenLabs voice generation (`ops/scripts/say.js`)
- ✅ Google Drive upload (`scripts/upload-gdrive.mjs`)
- ✅ Notion logging (`scripts/notion-log.mjs`)
- ✅ Learning loop (`ops/learning/`)
- ✅ Scheduler (`ops/publisher/scheduler.mjs`)

### Update

- 🔄 `ops/run-one.mjs` → `ops/run-one-shotstack.mjs`
- 🔄 Remove CloudConvert dependency (Shotstack outputs MP4)
- 🔄 Update `package.json` scripts

---

## 🎨 TEMPLATE CUSTOMIZATION

### Per-Agent Visual Profiles

Use `config/visual_profiles.json` + dynamic template generation:

```javascript
import visualProfiles from '../config/visual_profiles.json';

function generateShotstackTemplate(agent) {
  const profile = visualProfiles.profiles[agent];

  return {
    timeline: {
      background: "#0B1220",
      tracks: [{
        clips: [{
          asset: {
            type: "html",
            html: `
              <div style="
                background: ${profile.gradient || '#0B1220'};
                color: ${profile.text_color};
                border-left: 8px solid ${profile.primary_color};
              ">
                <h1>{{hook_text}}</h1>
              </div>
            `
          }
        }]
      }]
    }
  };
}
```

---

## ⚡ NEXT STEPS

1. **Get Shotstack API Key**: https://shotstack.io
2. **Add to `.env`**: `SHOTSTACK_API_KEY=prod_xxx`
3. **I'll generate implementation files** (15 min)
4. **Test render**: `npm run test:shotstack`
5. **Integrate with scheduler**: Daily production at 6 AM
6. **Deploy**: Autonomous operation

---

## 📞 NEED HELP?

**Share your Shotstack API key** and I'll:
1. Generate all implementation files
2. Create test render
3. Integrate with existing Group7 system
4. Update documentation
5. Create Make.com blueprint

**This is the cleanest path to autonomous Group7 operation!** 🚀

---

**Status**: Awaiting Shotstack API credentials to proceed with implementation.
