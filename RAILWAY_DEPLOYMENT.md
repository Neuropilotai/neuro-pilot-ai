# Railway Deployment Guide - Neuro.Pilot.AI

## 🚀 Quick Deploy

1. **Connect GitHub** - Link your repository to Railway
2. **Set Environment Variables** - Add required keys in Railway dashboard
3. **Deploy** - Railway will automatically deploy from main branch

## 📋 Required Environment Variables

Add these in Railway Dashboard → Settings → Environment Variables:

### Core Configuration
```
NODE_ENV=production
AI_AGENTS_ENABLED=true
TRADING_ENABLED=false
RESUME_ENABLED=true
RAILWAY_DEPLOYMENT=true
```

### API Keys (Required)
```
OPENAI_API_KEY=sk-proj-...
OPENAI_ORG_ID=org-...
OPENAI_PROJECT_ID=proj_...
STRIPE_SECRET_KEY=sk_live_... (or sk_test_... for testing)
```

### Security Keys (Generate secure random strings)
```
API_SECRET_KEY=your-secure-random-key-here
WEBHOOK_API_KEY=your-webhook-key-here
```

### Optional Services
```
NOTION_TOKEN=ntn_... (if using Notion integration)
SMTP_USER=your-email@gmail.com (for notifications)
SMTP_PASS=your-app-password
```

## 🛠️ Deployment Configuration

The following files are configured for Railway:

- **`railway.json`** - Main Railway configuration
- **`nixpacks.toml`** - Build configuration (Node 20)
- **`Procfile`** - Process definition
- **`railway-server-production.js`** - Production server

## 🔍 Health Checks

Railway will monitor these endpoints:
- **`/api/health`** - Application health status
- **`/api/status`** - Service feature status

## 📊 Monitoring

Once deployed, monitor your application:
1. **Railway Dashboard** - View logs and metrics
2. **Health Endpoint** - `https://your-app.railway.app/api/health`
3. **Status Endpoint** - `https://your-app.railway.app/api/status`

## 🔐 Security Notes

- ✅ Environment variables are properly isolated
- ✅ Production secrets are not in code
- ✅ Rate limiting enabled
- ✅ CORS configured for Railway domains
- ✅ Helmet security headers active

## 🚨 Important

1. **Never commit** `.env.deployment` or files with real API keys
2. **Use Railway's environment variables** for all secrets
3. **Test thoroughly** before switching to live Stripe keys
4. **Monitor logs** for any deployment issues

## 📞 Support

If deployment fails:
1. Check Railway logs for errors
2. Verify all required environment variables are set
3. Ensure API keys are valid and have proper permissions
4. Check that your repository is properly connected