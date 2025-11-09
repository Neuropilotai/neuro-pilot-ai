# GROUP7 — Architecture Overview

## Monorepo layout (target)
```
/apps
  /make-orchestrator        # JSON fanout + idempotency + logging
  /canva-render             # HTTP service to render from Canva template
/packages
  /shared                   # schema, types, utils, logger
/ops                        # scripts, infra, CI helpers
/tests                      # e2e harness + mocks
```

## Data flow (daily at 06:00 ET)

```
 ┌──────────────────────────────────────────────────┐
 │                    Make.com                       │
 │  M1 Scheduler → M2 Ingest (CSV/OneDrive/GDrive)   │
 │  → M3 Parse → M4 Iterator(idempotent)             │
 │  → M5 Claude(script polish) → M6 ElevenLabs(TTS)  │
 │  → M7 Canva Render(API) → M8 CloudConvert(merge)  │
 │  → M9 Upload(Drive) → M10 Metricool(schedule)     │
 │  → M11 Notion(log) → M12 Error Router(Slack+Log)  │
 └──────────────────────────────────────────────────┘
                          │
                          ▼
               ┌────────────────────┐
               │ Local Services     │
               │ /apps/canva-render │  ← HTTP POST /render
               └────────────────────┘
                          │
                          ▼
 ┌───────────┬────────────┬─────────────┬───────────────┬──────────────┬─────────────┐
 │ OpenAI    │ ElevenLabs │ Canva       │ CloudConvert  │ Metricool    │ Notion      │
 │ GPT-4.1   │ TTS        │ Template    │ Merge/Normalize│ Social posts │ Analytics   │
 └───────────┴────────────┴─────────────┴───────────────┴──────────────┴─────────────┘
```

## Component Details

### /apps/canva-render
**Purpose**: HTTP service that renders video from Canva templates
- **Entry point**: `server.js` (Express on port 3001)
- **Endpoints**:
  - `GET /health` - Health check
  - `POST /render` - Render Canva template with data
- **Dependencies**: Canva SDK, @packages/shared
- **Environment**: `CANVA_APP_ID`, `CANVA_TEMPLATE_ID`, `PORT`

### /apps/make-orchestrator
**Purpose**: JSON fanout, idempotency checks, and logging coordinator
- **Entry point**: `index.js`
- **Functions**:
  - Row hash generation (idempotency key)
  - State management
  - Error routing
- **Dependencies**: @packages/shared
- **Environment**: `NOTION_TOKEN`, `LOG_LEVEL`

### /packages/shared
**Purpose**: Common utilities, types, schemas, and logger
- **Exports**:
  - `schema/` - Zod schemas for validation
  - `types/` - TypeScript interfaces
  - `utils/` - Helper functions (hash generation, date formatting)
  - `logger/` - Structured logging (Pino-based)

## Secrets (.env)

### Required Keys
| Variable | Purpose | Source |
|----------|---------|--------|
| `OPENAI_API_KEY` | Claude/GPT script polish | https://platform.openai.com/api-keys |
| `ELEVENLABS_API_KEY` | Text-to-speech generation | https://elevenlabs.io/api |
| `CLOUDCONVERT_API_KEY` | Video merging/normalization | https://cloudconvert.com/api |
| `NOTION_TOKEN` | Analytics and logging | https://www.notion.so/my-integrations |
| `METRICOOL_API_TOKEN` | Social media scheduling | Metricool dashboard |
| `CANVA_APP_ID` | Canva template rendering | https://www.canva.com/developers |
| `CANVA_TEMPLATE_ID` | Specific template ID | Canva template URL |
| `SERVICE_URL_CANVA_RENDER` | Local service endpoint | Default: http://localhost:3001 |

### Storage (Choose One)
**Google Drive**:
- `GOOGLE_CREDENTIALS_JSON` - Service account JSON

**OR OneDrive**:
- `ONEDRIVE_CLIENT_ID`
- `ONEDRIVE_CLIENT_SECRET`
- `ONEDRIVE_TENANT_ID`
- `ONEDRIVE_REFRESH_TOKEN`

### Optional
| Variable | Default | Purpose |
|----------|---------|---------|
| `LOG_LEVEL` | `info` | Logging verbosity |
| `RUN_ENV` | `development` | Runtime environment |
| `FRONTEND_URL` | `http://localhost:3001` | Frontend base URL |

## Observability

### Structured Logging
Each Make.com step (M1-M12) emits compact JSON:
```json
{
  "run_id": "a3f2c1d4",
  "row_hash": "5e8a92bf3c1d",
  "step": "M5_claude_polish",
  "status": "success",
  "ms": 1234,
  "timestamp": "2025-11-02T14:30:00Z"
}
```

### Error Handling
- **Router**: M12 Error Router
- **Destinations**:
  - Slack channel: `#group7-errors`
  - Notion database: "Incidents"
- **Context**: Full stack trace, input data hash, step name

## Idempotency

### Key Generation
```javascript
const rowHash = SHA256(
  agent_id + post_time + hook + insight + cta
).slice(0, 12);
```

### Storage
- Stored with each artifact (video file, Notion row)
- Checked before processing to prevent duplicates
- TTL: 90 days in Notion "Processed" database

## Data Flow Details

### Daily Workflow (06:00 ET)
1. **M1 Scheduler** - Triggers daily run via webhook
2. **M2 Ingest** - Fetches CSV from OneDrive/Google Drive
3. **M3 Parse** - Validates and structures data
4. **M4 Iterator** - Loops through rows, checks idempotency
5. **M5 Claude** - Polishes script for engagement
6. **M6 ElevenLabs** - Generates voiceover audio
7. **M7 Canva Render** - Calls local service to render video
8. **M8 CloudConvert** - Merges audio + video, normalizes
9. **M9 Upload** - Stores final video in Drive
10. **M10 Metricool** - Schedules social media posts
11. **M11 Notion** - Logs analytics and status
12. **M12 Error Router** - Handles failures, sends alerts

### External API Contracts

#### Canva Render Service (Local)
```
POST /render
Content-Type: application/json

{
  "template_id": "DAF_abc123",
  "data": {
    "agent_name": "Lyra",
    "hook_text": "...",
    "insight_text": "...",
    "cta_text": "..."
  },
  "row_hash": "5e8a92bf3c1d"
}

Response 200:
{
  "video_url": "https://export.canva.com/...",
  "duration_ms": 15000
}
```

#### ElevenLabs TTS
- Voice: "Rachel" (configurable per row)
- Format: MP3, 44.1kHz
- Speed: 1.0x (normal)

#### CloudConvert
- Input: MP4 (video) + MP3 (audio)
- Output: MP4 H.264, AAC audio, 1080p
- Normalization: -16 LUFS

#### Metricool
- Platform: Instagram, TikTok, YouTube Shorts
- Schedule: +2 hours from generation time
- Caption: Auto-generated from script

#### Notion
- Database: "Video Production Log"
- Fields: `row_hash`, `status`, `timestamp`, `video_url`, `metrics`

## Migration Plan

### Current State Assessment
The repository currently has:
- Root-level services in `/backend`, `/frontend`, `/inventory-enterprise`
- No clear monorepo structure for GROUP7
- GROUP7 files in `/Group7/` folder

### Target State
Migrate to clean monorepo layout:
```
/Group7/                    # New root for GROUP7 project
  /apps/
    /canva-render/
    /make-orchestrator/
  /packages/
    /shared/
  /ops/
    /scripts/
  /tests/
    /e2e/
  package.json              # Workspace root
  .env.template
  ARCHITECTURE.md           # This file
```

### Migration Steps
1. **Create monorepo structure** (non-breaking)
   ```bash
   mkdir -p Group7/{apps/{canva-render,make-orchestrator},packages/shared,ops/scripts,tests/e2e}
   ```

2. **Move existing GROUP7 code** (if any) into `/apps`
   - Audit `/Group7/App/` for existing Canva code
   - Move to `/Group7/apps/canva-render/`

3. **Create workspace package.json**
   ```json
   {
     "name": "group7-monorepo",
     "private": true,
     "workspaces": [
       "apps/*",
       "packages/*"
     ]
   }
   ```

4. **Initialize shared package**
   - Create `/packages/shared/package.json`
   - Add common utilities, types, logger

5. **Setup ops scripts**
   - Move validation scripts to `/ops/scripts/`
   - Add CI/CD helpers

6. **Migrate .env variables**
   - Create `/Group7/.env.template` with all required keys
   - Document in this file

### Rollback Plan
All changes are additive - existing Neuro.Pilot.AI services remain untouched in:
- `/backend/`
- `/frontend/`
- `/inventory-enterprise/`

GROUP7 monorepo is isolated in `/Group7/` and can be deleted without affecting other services.

## Testing Strategy

### E2E Dry Run
Located in `/tests/e2e/dry-run.mjs`:
- Mocks all external APIs
- Simulates full workflow M1-M12
- Validates idempotency
- Checks output artifacts

### Smoke Tests
Located in `/ops/scripts/smoke-test.mjs`:
- HEAD requests to all external APIs
- Port availability checks
- Service health endpoints

### Environment Validation
Located in `/ops/scripts/env-check.mjs`:
- Verifies all required env vars
- Masks sensitive data in logs
- Generates config checksum

## Runtime Requirements

- **Node.js**: 20.x LTS
- **Package Manager**: pnpm (for workspace support)
- **TypeScript**: 5.x with strict mode
- **External Services**:
  - Make.com (Enterprise plan for webhooks)
  - Canva (Pro account with API access)
  - ElevenLabs (Creator plan or higher)
  - CloudConvert (API credits)
  - Notion (workspace with API enabled)
  - Metricool (Business plan)

## Performance Targets

- **Canva Render**: < 10s per video
- **TTS Generation**: < 5s per script
- **CloudConvert**: < 15s per merge
- **Total Pipeline**: < 45s per video (end-to-end)
- **Concurrent Runs**: Up to 5 videos simultaneously

## Security Considerations

- All API keys stored in environment variables (never committed)
- Canva render service requires API key authentication
- Rate limiting on all endpoints (100 req/min)
- Input validation using Zod schemas
- CORS restricted to Make.com webhooks only
- Notion tokens scoped to specific databases
- CloudConvert sandboxing enabled

## Cost Estimates (Monthly)

| Service | Estimated Cost | Notes |
|---------|----------------|-------|
| OpenAI GPT-4 | $30-50 | 1 video/day = 30 calls |
| ElevenLabs | $22 | Creator plan |
| CloudConvert | $10-20 | ~500 minutes/month |
| Notion | $0 | Free tier sufficient |
| Metricool | $50 | Business plan |
| Canva Pro | $13 | Annual subscription |
| Make.com | $29 | Core plan (10k ops/month) |
| **Total** | **~$154-184/mo** | |

## Troubleshooting

### Common Issues

1. **Canva Render Timeout**
   - Check `SERVICE_URL_CANVA_RENDER` is reachable
   - Verify Canva API quota not exceeded
   - Inspect `/health` endpoint response

2. **Idempotency Collision**
   - Check Notion "Processed" database
   - Verify row_hash generation matches
   - Clear old entries (>90 days)

3. **Make.com Webhook Fails**
   - Verify webhook URL is HTTPS
   - Check CORS headers allow Make.com
   - Inspect Make.com execution logs

4. **ElevenLabs Voice Error**
   - Confirm voice name matches available voices
   - Check API quota and billing
   - Try fallback voice "Rachel"

5. **CloudConvert Merge Fails**
   - Verify input formats (MP4 + MP3)
   - Check video duration matches audio
   - Inspect CloudConvert job logs

### Debug Commands
```bash
# Check all services
npm run smoke

# Validate environment
npm run env:check

# Test dry run (no external calls)
npm run e2e:dry

# Tail service logs
tail -f Group7/apps/canva-render/logs/app.log

# Check Notion database sync
node ops/scripts/notion-debug.mjs
```

## Next Steps

1. **Implement /apps/canva-render service**
   - Express server with `/health` and `/render` endpoints
   - Canva SDK integration
   - Error handling and retry logic

2. **Create /packages/shared utilities**
   - Row hash generation
   - Zod schemas
   - Pino logger setup

3. **Build Make.com blueprint**
   - JSON scenario export
   - Webhook configurations
   - Error handling flows

4. **Setup monitoring**
   - Grafana dashboard for metrics
   - Slack alerts for failures
   - Notion analytics queries

5. **Production deployment**
   - Railway/Fly.io for canva-render service
   - Environment variable management
   - CI/CD with GitHub Actions
