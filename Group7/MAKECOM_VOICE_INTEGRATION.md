# Make.com + ElevenLabs Voice Integration Guide

Complete guide for integrating Lyra-7 voice profile with Make.com scenario.

---

## Prerequisites

- ✅ Make.com Pro account
- ✅ ElevenLabs API key
- ✅ Voice profile created (`config/lyra7_voice_profile.json`)
- ✅ Environment variables configured

---

## Step 1: Add ElevenLabs Variables to Make.com

Navigate to: **Make.com → Scenario → Settings → Environment Variables**

Add these variables:

```env
ELEVENLABS_API_KEY=your_actual_key_here
ELEVENLABS_MODEL_ID=eleven_turbo_v2_5
ELEVENLABS_VOICE_ID_LYRA=rachel
ELEVENLABS_OUTPUT_FORMAT=mp3_44100_128
```

For other agents, add:
```env
ELEVENLABS_VOICE_ID_ATLAS=adam
ELEVENLABS_VOICE_ID_NOVA=domi
ELEVENLABS_VOICE_ID_CIPHER=adam
ELEVENLABS_VOICE_ID_ECHO=bella
ELEVENLABS_VOICE_ID_QUANTUM=callum
ELEVENLABS_VOICE_ID_NEXUS=george
```

---

## Step 2: Create HTTP Module for ElevenLabs

### Module Configuration

**Module Type:** HTTP → Make a request

**Settings:**
- **URL:** `https://api.elevenlabs.io/v1/text-to-speech/{{ELEVENLABS_VOICE_ID_LYRA}}`
- **Method:** POST
- **Headers:**
  ```
  xi-api-key: {{ELEVENLABS_API_KEY}}
  Content-Type: application/json
  ```

**Request Body (Raw JSON):**
```json
{
  "model_id": "{{ELEVENLABS_MODEL_ID}}",
  "text": "{{2.voiceover_text}}",
  "voice_settings": {
    "stability": 0.70,
    "similarity_boost": 0.75,
    "style": 0.45,
    "use_speaker_boost": true
  },
  "optimize_streaming_latency": 3,
  "output_format": "{{ELEVENLABS_OUTPUT_FORMAT}}",
  "apply_voice_settings": true
}
```

**Parse Response:**
- ✅ Enable "Download file"
- **Filename:** `{{agent_id}}_{{sequence}}_VO.mp3`
- **Destination:** Google Drive or OneDrive

---

## Step 3: Map Variables from Iterator

Replace `{{2.voiceover_text}}` with your CSV/Notion data:

**If using CSV Iterator:**
```
{{2.voiceover_text}} → Column "script" or "voiceover"
{{agent_id}} → Column "agent"
{{sequence}} → Column "sequence"
```

**If using Notion Iterator:**
```
{{2.voiceover_text}} → Property "Script"
{{agent_id}} → Property "Agent"
{{sequence}} → Property "Sequence"
```

---

## Step 4: Dynamic Voice Selection

To use different voices per agent, use a **Router** or **Switch** module:

### Option A: Router (Recommended)

```
Module: Router

Route 1: Agent = "Lyra"
  → Voice ID: {{ELEVENLABS_VOICE_ID_LYRA}}

Route 2: Agent = "Atlas"
  → Voice ID: {{ELEVENLABS_VOICE_ID_ATLAS}}

Route 3: Agent = "Nova"
  → Voice ID: {{ELEVENLABS_VOICE_ID_NOVA}}

... (continue for all agents)
```

### Option B: Formula in URL

Replace the voice ID in the URL with a formula:

```
{{if(agent = "Lyra", ELEVENLABS_VOICE_ID_LYRA, if(agent = "Atlas", ELEVENLABS_VOICE_ID_ATLAS, ELEVENLABS_VOICE_ID_LYRA))}}
```

---

## Step 5: Error Handling

Add **Error Handler** after ElevenLabs module:

```
On Error:
  1. Log to Notion "Incidents" database
  2. Send Slack notification
  3. Retry with fallback voice (optional)
```

**Fallback Voice Logic:**
```json
{
  "voice_id": "{{if(error, 'Rachel', ELEVENLABS_VOICE_ID_LYRA)}}"
}
```

---

## Step 6: Test the Module

1. **Run Once** with test data:
   ```json
   {
     "agent": "Lyra",
     "sequence": 1,
     "voiceover_text": "Group Seven. We don't wait… we build."
   }
   ```

2. **Check Output:**
   - ✅ MP3 file generated
   - ✅ File size > 10KB
   - ✅ Uploaded to Drive

3. **Listen to Audio:**
   - Download from Drive
   - Verify voice quality
   - Check timing (should be ~3-5 seconds for test line)

---

## Step 7: Full Scenario Integration

### Workflow Position

```
M1: Scheduler (06:00 ET)
  ↓
M2: Ingest CSV from Drive
  ↓
M3: Parse CSV
  ↓
M4: Iterator (loop rows)
  ↓
M5: GPT-4 Script Polish
  ↓
M6: ElevenLabs TTS ← YOU ARE HERE
  ↓
M7: Upload MP3 to Drive
  ↓
M8: Canva Render
  ↓
... (continue pipeline)
```

### Module Connections

**Input from M5 (GPT-4):**
- Use `{{5.polished_script}}` as `text` field

**Output to M7 (Upload):**
- Use `{{6.data}}` (binary MP3) for upload
- Filename: `{{agent_id}}_{{sequence}}_{{date}}_VO.mp3`

**Output to M8 (Canva):**
- Pass Drive URL: `{{7.webViewLink}}` to Canva template

---

## Step 8: Advanced Settings

### Voice Settings Customization

For different moods/styles per video, use variables:

```json
{
  "voice_settings": {
    "stability": {{if(mood = "calm", 0.70, 0.50)}},
    "similarity_boost": 0.75,
    "style": {{if(mood = "inspiring", 0.60, 0.30)}},
    "use_speaker_boost": true
  }
}
```

### Output Format Options

```
mp3_44100_128 → Standard quality (recommended)
mp3_44100_192 → High quality (larger files)
pcm_16000     → Raw PCM for processing
pcm_24000     → Higher sample rate PCM
```

### Streaming Latency

```
0 → No optimization (best quality)
1 → Slight optimization
2 → Moderate optimization
3 → Maximum optimization (fastest, recommended)
4 → Extreme optimization (may reduce quality)
```

---

## Troubleshooting

### Issue: "Voice not found"
**Solution:** Check voice ID spelling. Use lowercase names (rachel, adam, bella).

### Issue: "Quota exceeded"
**Solution:** Check ElevenLabs dashboard → Usage. Upgrade plan if needed.

### Issue: "Audio sounds robotic"
**Solution:**
1. Increase `stability` to 0.75-0.85
2. Lower `style` to 0.20-0.30
3. Enable `use_speaker_boost`

### Issue: "Too slow/fast"
**Solution:** Adjust `speed_multiplier` in voice profile (0.85-1.15 range).

### Issue: "Download file not working"
**Solution:**
1. Check "Parse response" is enabled
2. Verify "Download file" checkbox is ON
3. Ensure destination folder has write permissions

---

## Cost Optimization

### Character Limits by Plan

| Plan | Characters/month | Cost |
|------|------------------|------|
| Free | 10,000 | $0 |
| Starter | 30,000 | $5 |
| Creator | 100,000 | $22 |
| Creator+ | 500,000 | $99 |
| Pro | 2,000,000 | $330 |

### Tips to Reduce Usage

1. **Batch similar scripts** - Group multiple lines into one request
2. **Cache common phrases** - Reuse intros/outros
3. **Pre-generate** - Create voiceovers in advance during off-hours
4. **Use turbo model** - Faster and cheaper than multilingual

---

## Example Make.com Module JSON

```json
{
  "name": "ElevenLabs TTS - Lyra",
  "module": "http:ActionSendData",
  "version": 3,
  "parameters": {
    "handleErrors": true,
    "url": "https://api.elevenlabs.io/v1/text-to-speech/{{env.ELEVENLABS_VOICE_ID_LYRA}}",
    "method": "post",
    "headers": [
      {
        "name": "xi-api-key",
        "value": "{{env.ELEVENLABS_API_KEY}}"
      },
      {
        "name": "Content-Type",
        "value": "application/json"
      }
    ],
    "qs": [],
    "body": {
      "type": "raw",
      "content": "{\n  \"model_id\": \"{{env.ELEVENLABS_MODEL_ID}}\",\n  \"text\": \"{{5.polished_script}}\",\n  \"voice_settings\": {\n    \"stability\": 0.70,\n    \"similarity_boost\": 0.75,\n    \"style\": 0.45,\n    \"use_speaker_boost\": true\n  },\n  \"optimize_streaming_latency\": 3,\n  \"output_format\": \"{{env.ELEVENLABS_OUTPUT_FORMAT}}\",\n  \"apply_voice_settings\": true\n}"
    },
    "parseResponse": true,
    "timeout": 30000,
    "downloadFile": true,
    "fileName": "{{2.agent}}_{{2.sequence}}_VO.mp3"
  },
  "mapper": {},
  "metadata": {
    "designer": {
      "x": 300,
      "y": 200
    },
    "restore": {},
    "expect": []
  }
}
```

---

## Next Steps

1. **Test single agent** (Lyra) first
2. **Verify audio quality** - listen to generated MP3
3. **Add other agents** - duplicate module, change voice ID
4. **Connect to Canva** - pass audio URL to video renderer
5. **Monitor usage** - check ElevenLabs dashboard daily

---

**Ready to generate voices!** Run your first test with the provided settings.

For issues, see: https://docs.elevenlabs.io/api-reference
