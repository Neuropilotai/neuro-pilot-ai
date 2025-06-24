# Neuro-Pilot-AI Setup Guide

## Complete Setup Instructions for Automated Resume Service

### Prerequisites
- Node.js (v16 or higher)
- npm or yarn
- Notion account
- OpenAI API access
- Stripe account

### Step 1: Environment Setup

1. Copy the environment template:
```bash
cp .env.example .env
```

2. Fill in your API keys in the `.env` file:

#### Notion Setup
1. Go to https://developers.notion.com
2. Create a new integration
3. Copy the Integration Token to `NOTION_TOKEN`
4. Create a parent page in Notion and copy its ID to `NOTION_PARENT_PAGE_ID`

#### OpenAI Setup
1. Go to https://platform.openai.com/api-keys
2. Create a new API key
3. Copy it to `OPENAI_API_KEY`

#### Stripe Setup
1. Go to https://dashboard.stripe.com
2. Get your test keys from the Developers section
3. Copy Secret Key to `STRIPE_SECRET_KEY`
4. Copy Publishable Key to `STRIPE_PUBLISHABLE_KEY`
5. Set up webhook endpoint and copy secret to `STRIPE_WEBHOOK_SECRET`

### Step 2: Install Dependencies

```bash
npm install @notionhq/client openai stripe express dotenv
```

### Step 3: Initialize Notion Databases

Run the Notion setup script:
```bash
node notion-integration-setup.js
```

This will create:
- Resume Orders Database
- Resume Templates Database
- Sample templates

Copy the generated database IDs to your `.env` file.

### Step 4: Test the Integration

```bash
node notion-agent-integration.js
```

### Step 5: Start the Complete Service

```bash
node automated-resume-workflow.js
```

The service will be available at:
- Main site: http://localhost:3001
- Order form: http://localhost:3001/order
- Health check: http://localhost:3001/health

### Step 6: Configure Stripe Webhooks

1. In Stripe Dashboard, go to Webhooks
2. Add endpoint: `https://your-domain.com/webhook`
3. Select events: `payment_intent.succeeded`, `payment_intent.payment_failed`
4. Copy the webhook secret to your `.env` file

### API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/` | GET | Landing page |
| `/order` | GET | Order form |
| `/submit-order` | POST | Process order submission |
| `/status/:orderId` | GET | Check order status |
| `/download/:orderId` | GET | Download completed resume |
| `/webhook` | POST | Stripe webhook handler |
| `/health` | GET | Health check |

### Order Flow

1. **Customer submits order** → Order created in Notion with "Pending" status
2. **Customer completes payment** → Stripe webhook updates status to "Paid"
3. **AI processes resume** → Status changes to "In Progress", then "Completed"
4. **Customer downloads resume** → Status changes to "Delivered"

### Service Pricing

- Professional Resume: $49
- Executive Resume: $99
- ATS Optimized Resume: $69
- Cover Letter: $29

### Automated Processing

The system automatically:
- Monitors for paid orders every 30 seconds
- Generates resumes using AI based on customer info and templates
- Updates order status in real-time
- Provides download links for completed resumes

### Production Deployment

For production deployment:
1. Set `NODE_ENV=production` in your environment
2. Use live Stripe keys instead of test keys
3. Configure proper domain for webhook endpoints
4. Set up SSL certificates
5. Use a process manager like PM2

### Monitoring

Check the health endpoint to monitor service status:
```bash
curl http://localhost:3001/health
```

### Troubleshooting

1. **Notion Integration Issues**: Verify token and database IDs
2. **OpenAI Errors**: Check API key and usage limits
3. **Stripe Webhook Issues**: Verify webhook secret and endpoint URL
4. **Order Processing Stuck**: Check console logs and database status

### Next Steps

1. Test the complete flow with a sample order
2. Configure email notifications
3. Set up production deployment
4. Launch your first gig service

The system is designed to be fully automated - once set up, it will handle orders, payments, and resume generation without manual intervention.