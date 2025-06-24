# 🚂 Railway Deployment Guide - NEURO.PILOT.AI

Your resume business is now ready for 24/7 deployment! Follow these simple steps:

## 🔧 Step 1: Create Railway Account

1. Go to [railway.app](https://railway.app)
2. Sign up with your GitHub account
3. Verify your email

## 📂 Step 2: Deploy from GitHub

1. **Push to GitHub** (if not already done):
   ```bash
   # Create GitHub repository
   gh repo create neuro-pilot-ai --public
   
   # Or manually create at github.com and then:
   git remote add origin https://github.com/yourusername/neuro-pilot-ai.git
   git push -u origin main
   ```

2. **Deploy on Railway**:
   - Click "Deploy from GitHub repo"
   - Select your `neuro-pilot-ai` repository
   - Railway will auto-detect Node.js and deploy!

## ⚙️ Step 3: Configure Environment Variables

In Railway dashboard, go to **Variables** and add:

### 🟢 Required (Essential for your business):
```
PORT=8000
NODE_ENV=production
EMAIL_USER=Neuro.Pilot.AI@gmail.com
EMAIL_PASS=wlkdwzkogdnvjcnp
FRONTEND_URL=https://your-app-name.railway.app
```

### 🟡 Optional (For advanced features):
```
STRIPE_SECRET_KEY=sk_live_your_stripe_key
STRIPE_PUBLISHABLE_KEY=pk_live_your_publishable_key
OPENAI_API_KEY=your_openai_key
```

## 🚀 Step 4: Deploy!

1. Railway will automatically deploy when you push to main branch
2. Your app will be live at: `https://your-app-name.railway.app`
3. Test the resume order page: `https://your-app-name.railway.app/resume-order`

## 💰 Step 5: Business Benefits

✅ **Always Online** - No more offline concerns  
✅ **Auto-scaling** - Handles traffic spikes  
✅ **Free SSL** - Secure HTTPS automatically  
✅ **Global CDN** - Fast worldwide access  
✅ **$5/month** - Much cheaper than current setup  

## 🔄 Auto-Deployment

Every time you commit code:
```bash
git add .
git commit -m "Update resume system"
git push
```
Railway automatically deploys the updates!

## 📊 Monitoring

- **Railway Dashboard**: Monitor usage, logs, metrics
- **Your Business**: Orders processed 24/7 even when your computer is off
- **Revenue**: Never lose money due to downtime

## 🆘 Need Help?

1. **Railway Logs**: Check the deployment logs in Railway dashboard
2. **Test Endpoint**: Visit `https://your-app.railway.app/api/agents/status`
3. **Support**: Railway has excellent Discord community support

## 🎯 Next Steps After Deployment

1. Update your domain (optional): Point your custom domain to Railway
2. Test all resume order flows
3. Configure Stripe for real payments
4. Monitor your first 24/7 orders!

Your resume business will now run **24/7 without your computer** for just **$5/month**! 🎉