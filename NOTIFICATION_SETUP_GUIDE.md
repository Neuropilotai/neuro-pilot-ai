# 📧 NOTIFICATION SYSTEM SETUP GUIDE

## Option 1: Gmail Notifications (Recommended)

### Step 1: Enable 2-Factor Authentication
1. Go to https://myaccount.google.com/security
2. Enable 2-Step Verification if not already enabled

### Step 2: Generate App Password
1. Go to https://myaccount.google.com/apppasswords
2. Select "Mail" and your device
3. Click "Generate"
4. Copy the 16-character password

### Step 3: Update .env file
```bash
# Email Notifications
EMAIL_NOTIFICATIONS=true
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your.email@gmail.com
SMTP_PASS=your-16-char-app-password
EMAIL_FROM=noreply@neuropilot.ai
NOTIFICATION_EMAIL=your.email@gmail.com
```

## Option 2: Slack Notifications

### Step 1: Create Slack Webhook
1. Go to https://api.slack.com/apps
2. Click "Create New App" > "From scratch"
3. Name: "Neuro-Pilot-AI"
4. Select your workspace

### Step 2: Enable Incoming Webhooks
1. Go to "Incoming Webhooks" in sidebar
2. Toggle "Activate Incoming Webhooks" ON
3. Click "Add New Webhook to Workspace"
4. Select channel (e.g., #gig-approvals)
5. Copy the webhook URL

### Step 3: Update .env file
```bash
# Slack Notifications
SLACK_NOTIFICATIONS=true
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/YOUR/WEBHOOK/URL
SLACK_CHANNEL=#gig-approvals
```

## Option 3: Discord Notifications

### Step 1: Create Discord Webhook
1. Open Discord, go to your server
2. Right-click the channel > Edit Channel
3. Go to "Integrations" > "Webhooks"
4. Click "New Webhook"
5. Name: "Neuro-Pilot-AI"
6. Copy webhook URL

### Step 2: Update .env file
```bash
# Discord Notifications
DISCORD_NOTIFICATIONS=true
DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/YOUR/WEBHOOK
```

## Testing Notifications

```bash
# Test webhook endpoint
curl -X POST http://localhost:3009/webhook/test \
  -H "X-API-Key: neuro-pilot-webhook-key" \
  -H "Content-Type: application/json" \
  -d '{"message": "Test notification"}'
```

You'll receive notifications for:
- ✅ New gig submissions
- ✅ Gig approvals/rejections
- ✅ Deployment status updates
- ✅ Agent performance alerts
- ✅ System alerts