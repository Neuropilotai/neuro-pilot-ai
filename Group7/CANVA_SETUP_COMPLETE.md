# 🎨 Complete Canva Setup Guide

**Get your Canva integration working in 30 minutes**

---

## ✅ What You Have

```
✓ Canva App ID: AAG3cyS3k2Q
✓ Canva App Secret: (you have this)
```

---

## 🎯 What You Need

1. **Access Token** (for API authentication)
2. **Template ID** (your video design)
3. **Test the integration**

---

## 📋 STEP-BY-STEP SETUP

### **STEP 1: Get Access Token** (5 min)

**Option A: Quick Test Token** ⭐ (Recommended for testing)

1. Go to: https://www.canva.com/developers/apps
2. Click on your app (AAG3cyS3k2Q)
3. Go to **"Authentication"** or **"API Keys"** tab
4. Click **"Generate test token"** or **"Create API key"**
5. Copy the token
6. Add to `.env`:
   ```bash
   CANVA_ACCESS_TOKEN=your_token_here
   ```

⚠️ **Note:** Test tokens expire. For production, use OAuth (Step 2).

---

**Option B: OAuth Flow** (Production-ready)

```bash
cd /Users/davidmikulis/neuro-pilot-ai/Group7

# Make sure dependencies are installed
npm install

# Run OAuth helper
node canva-oauth.js

# Open in browser:
# http://localhost:3001/auth
```

**What happens:**
1. Browser opens Canva authorization
2. You sign in and approve
3. Token displays in browser + console
4. Copy to `.env`

---

### **STEP 2: Create Video Template** (15 min)

#### A) Create New Design

1. Go to: https://www.canva.com
2. Click **"Create a design"**
3. **Custom size:** Enter `1080` x `1920` px
4. Click **"Create new design"**

#### B) Name Your Text Elements (CRITICAL!)

**You MUST add exactly 4 text elements with these names:**

**1. Hook Text** (Top - Attention Grabber)
- Add text box at top
- Font: Bold, 72-96 pt
- Color: Accent (#0EA5E9)
- Sample text: "AI is eating the world"
- **Right-click → "Edit element name" → Name:** `hook_text`

**2. Insight Text** (Middle - Core Message)
- Add text box in center
- Font: Medium, 48-60 pt
- Color: Light (#F8FAFC)
- Sample text: "90% of Fortune 500 will use AI agents by 2026"
- **Name:** `insight_text`

**3. CTA Text** (Bottom - Call to Action)
- Add text box at bottom
- Font: Bold, 56-72 pt
- Color: Accent or button style
- Sample text: "Build your AI today"
- **Name:** `cta_text`

**4. Agent Name** (Corner - Branding)
- Add small text in corner
- Font: Regular, 32-40 pt
- Sample text: "Lyra AI"
- **Name:** `agent_name`

#### C) Design Your Template

**Colors (Group7 Brand):**
- Background: `#0B1220` (dark)
- Primary text: `#F8FAFC` (white)
- Accent: `#0EA5E9` (blue)

**Add:**
- Background gradient or solid color
- Logo (optional)
- Shapes/decorations
- Subtle animations (optional)

#### D) Set Duration

- Click timeline at bottom
- Drag to **25-30 seconds**

#### E) Save & Get Template ID

**Method 1: From URL**
1. Look at your browser URL:
   ```
   https://www.canva.com/design/DAGabcdefgh/edit
                                 ↑ THIS IS IT
   ```
2. Copy `DAGabcdefgh` (starts with DAG)

**Method 2: Share as Template**
1. Click **"Share"**
2. Click **"Template link"**
3. Copy the design ID from the link

#### F) Add to .env

```bash
CANVA_TEMPLATE_ID=DAGabcdefgh
```

---

### **STEP 3: Verify Template Elements** (5 min)

Make sure your text elements are named correctly:

```bash
cd /Users/davidmikulis/neuro-pilot-ai/Group7

# Test Canva API
./test-canva-integration.sh
```

**Expected output:**
```
✅ SUCCESS! Canva API is working
Design Details: {
  "id": "DAGabcdefgh",
  "title": "Group7 AI Template",
  ...
}
```

If error → Check:
- Access token not expired
- Template ID correct
- Text elements named exactly: `hook_text`, `insight_text`, `cta_text`, `agent_name`

---

### **STEP 4: Test Render Service** (5 min)

```bash
# Start the Canva render service
npm run dev

# In another terminal, test it
curl http://localhost:3001/health

# Expected:
# {"status":"ok","canva_configured":true}
```

**Full render test:**

```bash
# Test with sample data
curl -X POST http://localhost:3001/render \
  -H "Content-Type: application/json" \
  -d '{
    "design_id": "YOUR_TEMPLATE_ID",
    "data": {
      "hook_text": "AI is eating the world",
      "insight_text": "90% of Fortune 500 will use AI agents by 2026",
      "cta_text": "Build your AI today",
      "agent_name": "Lyra"
    },
    "export": {
      "format": "mp4",
      "quality": "1080p"
    }
  }'
```

**Expected response:**
```json
{
  "success": true,
  "design_id": "DAGabcdefgh",
  "job_id": "...",
  "urls": ["https://..."]
}
```

---

## 📋 Complete Checklist

- [ ] Canva App created (App ID: AAG3cyS3k2Q) ✓
- [ ] Access token generated and added to `.env`
- [ ] Video template created (1080x1920 px)
- [ ] 4 text elements added with correct names:
  - [ ] `hook_text` (top, large)
  - [ ] `insight_text` (middle, medium)
  - [ ] `cta_text` (bottom, button)
  - [ ] `agent_name` (corner, small)
- [ ] Brand colors applied (#0B1220, #0EA5E9, #F8FAFC)
- [ ] Duration set to 25-30 seconds
- [ ] Template ID copied to `.env`
- [ ] API test passed (`./test-canva-integration.sh`)
- [ ] Render service running (`npm run dev`)
- [ ] Test render successful

---

## 🎨 Template Design Tips

### **Hook Text** (Top)
- **Purpose:** Grab attention in first 3 seconds
- **Font:** Bold, sans-serif (e.g., Montserrat Bold, Poppins Bold)
- **Size:** 72-96 pt
- **Color:** Bright accent (#0EA5E9) or white (#F8FAFC)
- **Animation:** Fade in or slide in from top
- **Examples:**
  - "AI is eating the world"
  - "Your manager's job just became obsolete"
  - "Stop calling meetings"

### **Insight Text** (Middle)
- **Purpose:** Deliver the core message/data point
- **Font:** Medium weight, readable (e.g., Inter Medium, Open Sans)
- **Size:** 48-60 pt
- **Color:** White or light (#F8FAFC)
- **Animation:** Fade in after hook
- **Line height:** 1.3-1.5 for readability
- **Examples:**
  - "90% of Fortune 500 will use AI agents by 2026"
  - "Companies using AI automation grow 3.5x faster"

### **CTA Text** (Bottom)
- **Purpose:** Drive action
- **Font:** Bold, impactful
- **Size:** 56-72 pt
- **Style:** Button background or highlighted
- **Color:** Accent (#0EA5E9) on dark background
- **Animation:** Pulse or bounce
- **Examples:**
  - "Build your AI today"
  - "Start your transformation"
  - "Join the revolution"

### **Agent Name** (Corner)
- **Purpose:** Branding/attribution
- **Font:** Regular or light
- **Size:** 32-40 pt
- **Color:** Subtle (50% opacity white)
- **Position:** Bottom-right or top-right corner
- **Examples:**
  - "Lyra AI"
  - "Atlas"
  - "Nova"

---

## 🎬 Example Templates

### **Template Style 1: Minimal Dark**
```
Background: Solid #0B1220
Hook: White bold, top center
Insight: Light blue, center
CTA: Bright blue button, bottom
Agent: Small white text, bottom-right
```

### **Template Style 2: Gradient**
```
Background: Gradient from #0B1220 → #1a2332
Hook: Animated slide-in from left
Insight: Fade-in with subtle glow
CTA: Animated button with pulse
Agent: Corner logo + text
```

### **Template Style 3: Data Visual**
```
Background: Dark with subtle grid pattern
Hook: Large with underline animation
Insight: With data visualization (chart/graph)
CTA: Full-width banner at bottom
Agent: Watermark style
```

---

## 🔧 Troubleshooting

### "Access token invalid"
→ Regenerate token in Canva developer dashboard

### "Design not found"
→ Double-check template ID in .env (starts with DAG)

### "Cannot autofill text"
→ Verify text element names are exact: `hook_text`, `insight_text`, `cta_text`, `agent_name`

### "Export fails"
→ Check template duration (should be 25-30 sec, not too long)

### "Video quality poor"
→ Ensure template is 1080x1920 px, not resized

---

## 📊 Current Status

```
Your .env should now have:

✅ CANVA_APP_ID=AAG3cyS3k2Q
✅ CANVA_APP_SECRET=...
✅ CANVA_ACCESS_TOKEN=...
✅ CANVA_TEMPLATE_ID=DAGabcdefgh
```

---

## 🚀 Next Steps

Once Canva is working:

1. **Test full pipeline** with 1 agent
2. **Create variations** of template for different agents (optional)
3. **Import Make.com scenario** and configure Canva module
4. **Run end-to-end test** (script → voice → render → post)

---

## 📞 Resources

- **Canva Developers:** https://www.canva.com/developers/docs
- **API Reference:** https://www.canva.com/developers/docs/connect-api/
- **Template Guide:** https://www.canva.com/learn/templates/
- **OAuth Guide:** https://www.canva.com/developers/docs/connect-api/authentication/

---

**You're almost there! Canva is the heart of your video production. 🎨**
