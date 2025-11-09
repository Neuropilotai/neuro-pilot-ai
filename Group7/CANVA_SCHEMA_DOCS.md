# Canva Data Schema Documentation

## Overview
This CSV schema defines the structure for bulk video generation in the Group7 AI Video Factory. Each row represents one video to be produced.

## Schema Fields

### Core Identifiers
| Field | Type | Required | Description | Example |
|-------|------|----------|-------------|---------|
| `agent` | String | ✅ | AI agent name (Lyra, Atlas, Nova, Cipher, Echo, Quantum, Nexus) | `Lyra` |
| `date` | Date | ✅ | Production date (YYYY-MM-DD format) | `2025-01-15` |
| `sequence` | Integer | ✅ | Daily sequence number (1-7) | `1` |

### Video Content
| Field | Type | Required | Max Length | Description | Example |
|-------|------|----------|------------|-------------|---------|
| `hook` | String | ✅ | 60 chars | Attention-grabbing opening line | `"AI is eating the world"` |
| `insight` | String | ✅ | 200 chars | Core message with data/emotion | `"90% of Fortune 500 will use autonomous agents by 2026..."` |
| `cta` | String | ✅ | 80 chars | Call to action | `"Build your AI today"` |
| `caption` | String | ✅ | 150 chars | Social media caption | `"The AI revolution isn't coming. It's here..."` |
| `hashtags` | String | ✅ | 300 chars | 8-12 hashtags, comma or space-separated | `"#AI #Automation #TechLeadership"` |

### Scheduling
| Field | Type | Required | Description | Example |
|-------|------|----------|-------------|---------|
| `post_time` | Time | ✅ | Post time in HH:MM format (EST/America/Toronto) | `09:00` |

### Voice Settings
| Field | Type | Required | Description | Example |
|-------|------|----------|-------------|---------|
| `voice_id` | String | ✅ | ElevenLabs voice ID | `21m00Tcm4TlvDq8ikWAM` |
| `voice_url` | URL | ⚪️ | Google Drive URL for pre-generated voice (optional) | `https://drive.google.com/file/d/...` |

### Branding
| Field | Type | Required | Description | Example |
|-------|------|----------|-------------|---------|
| `brand_primary` | Hex Color | ⚪️ | Primary brand color (defaults to `#0B1220`) | `#0B1220` |
| `brand_accent` | Hex Color | ⚪️ | Accent brand color (defaults to `#0EA5E9`) | `#0EA5E9` |

### Status Tracking
| Field | Type | Required | Description | Allowed Values |
|-------|------|----------|-------------|----------------|
| `status` | Enum | ✅ | Processing status | `pending`, `processing`, `completed`, `failed`, `scheduled`, `posted` |

---

## Usage Examples

### 1. Bulk Import to Make.com
```bash
# Upload CSV to Google Drive
# In Make.com, use Google Sheets "Watch Rows" trigger
# Map columns to Canva render variables
```

### 2. Generate Daily Scripts with GPT
```javascript
// Make.com HTTP module with OpenAI
{
  "prompt": "Generate 7 viral video scripts for date {{date}}. Return CSV-compatible JSON.",
  "agents": ["Lyra", "Atlas", "Nova", "Cipher", "Echo", "Quantum", "Nexus"],
  "style": "2025 AI trend + data insight + emotional hook + CTA"
}
```

### 3. Map to Canva Template Variables
In Canva template, create text variables:
- `{{hook}}` → Large bold text at top
- `{{insight}}` → Medium body text
- `{{cta}}` → Button or bottom text
- `{{agent}}` → Logo/watermark area

Brand colors auto-applied via API.

---

## Validation Rules

### Hook Rules
- ✅ Max 10 words
- ✅ Must start with power word (Stop, Your, The, AI, etc.)
- ✅ No punctuation except ! or ?
- ❌ No emojis in hook (save for caption)

### Insight Rules
- ✅ Include data point or statistic
- ✅ Create urgency or FOMO
- ✅ 20-40 words optimal
- ✅ End with consequence or benefit

### CTA Rules
- ✅ Action verb first (Build, Start, Stop, Master, etc.)
- ✅ Max 5 words
- ✅ Avoid generic "Learn more"

### Hashtag Strategy
- ✅ 8-12 hashtags total
- ✅ Mix: 3 broad (#AI), 4 medium (#AIAutomation), 3 niche (#AIAgents)
- ✅ Order by volume (high → low)
- ❌ No banned or spam hashtags

### Timing Strategy
Best post times (EST):
- **Morning**: 9:00-10:00 (commute)
- **Lunch**: 11:30-13:00 (break)
- **Afternoon**: 14:00-15:00 (procrastination)
- **Evening**: 16:30-19:30 (after-work)
- **Night**: 21:00-22:00 (scroll time)

Avoid: 6:00-8:00, 12:00-12:30, 20:00-20:30

---

## Error Handling

### Missing Required Fields
```json
{
  "error": "validation_failed",
  "field": "hook",
  "message": "Hook is required and cannot be empty"
}
```

### Invalid Date Format
```json
{
  "error": "invalid_date",
  "field": "date",
  "expected": "YYYY-MM-DD",
  "received": "01-15-2025"
}
```

### Duplicate Sequence
```json
{
  "error": "duplicate_key",
  "key": "2025-01-15_Lyra_1",
  "message": "Video with this date-agent-sequence already exists"
}
```

---

## Canva Template Requirements

Your Canva template must include:

1. **Text Elements** (named variables):
   - `hook_text`
   - `insight_text`
   - `cta_text`
   - `agent_name`

2. **Brand Colors** (auto-mapped):
   - `primary` → Background/main text
   - `accent` → Highlights/CTA buttons
   - `light` → Secondary text/overlays

3. **Audio Track** (optional):
   - Timeline slot for voice import
   - Background music at -22dB

4. **Export Settings**:
   - Format: MP4
   - Resolution: 1080x1920 (9:16 portrait)
   - FPS: 30
   - Duration: 15-60 seconds

---

## Integration Checklist

- [ ] CSV uploaded to Google Drive `/Group7/Scripts/`
- [ ] Make.com scenario connected to Google Sheets
- [ ] Canva template ID configured in `.env`
- [ ] ElevenLabs voice IDs validated
- [ ] Notion database created with matching schema
- [ ] Metricool account connected with platform auth
- [ ] Test run with 1 video before full batch
- [ ] Monitoring/alerts configured for failures

---

## Sample Query (Google Sheets)

Get all pending videos for today:
```sql
=QUERY(A:N, "SELECT * WHERE M = 'pending' AND B = DATE(NOW())", 1)
```

Get performance by agent:
```sql
=QUERY(VideoLog!A:Z, "SELECT A, AVG(V), AVG(W), AVG(X) WHERE M = 'posted' GROUP BY A", 1)
```
(Assumes columns V=views, W=likes, X=shares)

---

## Best Practices

1. **Daily Review**: Check GPT-generated scripts before render
2. **A/B Testing**: Rotate hook styles weekly
3. **Trend Jacking**: Update hashtags based on trending topics
4. **Voice Variety**: Rotate voices to prevent listener fatigue
5. **Time Optimization**: Adjust post times based on analytics
6. **Batch Processing**: Generate full week on Sunday night
7. **Quality Gates**: Reject videos with <80 LUFS or >60s length

---

## Support

Questions? Check:
- `MAKECOM_VIDEO_FACTORY_SCENARIO.json` for workflow logic
- `canva-render-service.ts` for API implementation
- `VOICE_SETTINGS_TABLE.json` for voice config
- `DEPLOYMENT_GUIDE.md` for setup instructions
