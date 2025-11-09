# Canva Integration - API vs CLI Apps

## Important Distinction

There are **two different** Canva developer platforms:

### 1. Canva Apps Platform (CLI) ❌ Not what Group7 needs
- **Purpose**: Build interactive apps that run *inside* Canva's editor
- **Use cases**: Custom design tools, templates, UI extensions
- **Created with**: `canva apps create` (CLI)
- **Runs**: In Canva's web interface
- **Not suitable for**: Automated headless video rendering

### 2. Canva REST API (Design API) ✅ What Group7 uses
- **Purpose**: Programmatic design creation and automation
- **Use cases**: Automated video rendering, template autofill, bulk content generation
- **Created with**: Canva Developer Portal (web)
- **Runs**: Server-side, headless automation
- **Perfect for**: Group7's autonomous video factory

---

## Why Group7 Needs REST API (Not CLI Apps)

Group7's workflow:
```
GPT-4 generates script
  ↓
ElevenLabs generates voice
  ↓
Canva REST API renders video ← We need this!
  ↓
CloudConvert merges audio + video
  ↓
Upload to Google Drive
  ↓
Schedule on Metricool
```

**Group7 needs the Canva REST API** for:
- Automated template rendering (autofill API)
- Headless video generation (no browser required)
- Programmatic design exports (MP4)
- Batch processing (7 videos daily)

**Canva CLI Apps would require**:
- Manual interaction in Canva editor
- Browser session for each video
- User clicking buttons
- Cannot run autonomously

---

## Correct Path: Canva REST API Setup

### Option A: Use Existing App (If you have one)

If you already created a Canva app via the developer portal:

1. **Go to**: https://www.canva.com/developers/apps
2. **Find your app** (the one with CANVA_APP_ID you already have)
3. **Get credentials**:
   - App ID (Client ID) - already in .env ✅
   - App Secret (Client Secret) - copy to .env
4. **Generate access token**:
   ```bash
   node canva-oauth.mjs
   # Open http://localhost:3001/auth
   ```

### Option B: Create New REST API App

1. **Go to**: https://www.canva.com/developers
2. **Click**: "Create an app"
3. **Choose**: "Automation" (not "Apps Platform")
4. **Fill in**:
   - Name: "Group7 Video Factory"
   - Type: "Automation"
   - Redirect URI: `http://localhost:3001/oauth/callback`
5. **Select scopes**:
   - `design:content:read`
   - `design:content:write`
   - `asset:read`
   - `asset:write`
6. **Save** and copy:
   - Client ID → `CANVA_APP_ID`
   - Client Secret → `CANVA_APP_SECRET`
7. **Generate token**:
   ```bash
   node canva-oauth.mjs
   ```

---

## What About Canva CLI?

The Canva CLI is useful for:
- Building Canva editor extensions
- Creating custom design tools
- Interactive app development
- Local development/testing of UI apps

**You don't need it for Group7** because:
- Group7 uses REST API (not Apps Platform)
- No interactive UI required
- Fully automated headless rendering
- Server-side only

---

## Quick Decision Tree

**Do you need user interaction in Canva editor?**
- YES → Use Canva Apps Platform (CLI)
- NO → Use Canva REST API (what Group7 needs)

**Do you need automated, headless rendering?**
- YES → Use Canva REST API ✅
- NO → Maybe Canva Apps Platform

**Do you need to run autonomously without browser?**
- YES → Use Canva REST API ✅
- NO → Canva Apps Platform might work

**For Group7**: Always use **Canva REST API** (Design API)

---

## Current Group7 Status

```
✅ Using Canva REST API (correct approach)
✅ CANVA_APP_ID set
❌ CANVA_APP_SECRET needed
❌ CANVA_ACCESS_TOKEN needed
```

**Next steps**:
1. Get CANVA_APP_SECRET from https://www.canva.com/developers/apps
2. Run `node canva-oauth.mjs` to get access token
3. Add both to .env
4. Test with `npm run canva:render`

---

## Summary

**Don't use**: `canva apps create` (wrong platform)
**Do use**: Canva Developer Portal → Create Automation App → Get credentials

**The Canva CLI won't help with Group7's automation needs.**

---

**Next action**: Get CANVA_APP_SECRET from https://www.canva.com/developers/apps and add to .env
