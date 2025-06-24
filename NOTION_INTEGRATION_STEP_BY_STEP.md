# 🔗 NOTION INTEGRATION STEP-BY-STEP GUIDE

## Step 1: Create Notion Integration

1. **Go to Notion Integrations**
   - Open: https://www.notion.so/my-integrations
   - Click "New integration"

2. **Configure Integration**
   - Name: `Neuro-Pilot-AI Gig Controller`
   - Select your workspace
   - Check these capabilities:
     - ✅ Read content
     - ✅ Update content
     - ✅ Insert content
   - Click "Submit"

3. **Copy Integration Token**
   - Copy the "Internal Integration Token" (starts with `secret_`)
   - Save it somewhere safe

## Step 2: Create Gig Approval Database

1. **Create New Page in Notion**
   - Title: "Neuro-Pilot-AI Gig Control Center"
   - Make it a full-page database

2. **Add Database Properties**
   ```
   - Gig Title (Title)
   - Description (Text)
   - Price (Number - Format: Dollar)
   - Agent (Select: Product Generator, Opportunity Scout, etc.)
   - Risk Score (Select: LOW, MEDIUM, HIGH)
   - Status (Select: Pending Approval, Approved, Rejected, Deployed, Live)
   - Created Date (Date)
   - Approved By (Text)
   - Approval Notes (Text)
   - Revenue Potential (Number - Dollar)
   ```

3. **Share with Integration**
   - Click "Share" button (top right)
   - Search for "Neuro-Pilot-AI Gig Controller"
   - Click "Invite"

4. **Get Database ID**
   - Copy the database URL
   - Extract the ID: `https://notion.so/{workspace}/{DATABASE_ID}?v=xxx`
   - The DATABASE_ID is the 32-character string

## Step 3: Configure Environment

1. **Update .env file**
   ```bash
   NOTION_TOKEN=secret_xxxxxxxxxxxxxxxxxxxxx
   NOTION_DATABASE_ID=xxxxxxxxxxxxxxxxxxxxxxxxxxxxx
   ```

2. **Test Connection**
   ```bash
   node -e "
   const NotionGigController = require('./notion_gig_controller.js');
   const controller = new NotionGigController({
     token: process.env.NOTION_TOKEN,
     databaseId: process.env.NOTION_DATABASE_ID
   });
   controller.initialize().then(() => console.log('✅ Notion Connected!'));
   "
   ```

## Step 4: Enable Notion in Deployment System

The system will now automatically:
- Send new gigs to Notion for approval
- Update status when you approve/reject in Notion
- Track deployment progress