# 💳 STRIPE SETUP GUIDE - Enable Normal Payment Mode

## 🚀 Quick Setup (5 minutes):

### **1. Create Stripe Account:**
- Go to: https://dashboard.stripe.com/register
- Sign up with your email
- Complete business verification
- Get your API keys

### **2. Get API Keys:**
```bash
# In Stripe Dashboard:
# 1. Go to: Developers → API Keys
# 2. Copy your keys:
#    - Secret key (sk_test_...)
#    - Publishable key (pk_test_...)
```

### **3. Create .env File:**
```bash
# In /Users/davidmikulis/neuro-pilot-ai/backend/.env
STRIPE_SECRET_KEY=sk_test_your_actual_key_here
STRIPE_PUBLISHABLE_KEY=pk_test_your_actual_key_here
```

### **4. Restart Backend:**
```bash
# Stop current server
pkill -f "node server.js"

# Start with Stripe enabled
cd /Users/davidmikulis/neuro-pilot-ai/backend
node server.js
```

## 📋 **Step-by-Step Instructions:**

### **Step 1: Get Your Stripe Keys**
1. **Visit:** https://dashboard.stripe.com/
2. **Create account** (it's free)
3. **Go to:** Developers → API Keys
4. **Copy:** 
   - Secret key (starts with `sk_test_`)
   - Publishable key (starts with `pk_test_`)

### **Step 2: Create Environment File**
Create file: `/Users/davidmikulis/neuro-pilot-ai/backend/.env`
```env
STRIPE_SECRET_KEY=sk_test_YOUR_ACTUAL_SECRET_KEY
STRIPE_PUBLISHABLE_KEY=pk_test_YOUR_ACTUAL_PUBLISHABLE_KEY
STRIPE_WEBHOOK_SECRET=whsec_YOUR_WEBHOOK_SECRET
PORT=8000
```

### **Step 3: Restart Backend Server**
```bash
# Stop current server
pkill -f "node server.js"

# Go to backend directory
cd /Users/davidmikulis/neuro-pilot-ai/backend

# Start server with Stripe
node server.js
```

### **Step 4: Test Payment Flow**
1. Visit: https://62b6-23-233-176-252.ngrok-free.app
2. Fill order form
3. Click payment button
4. Should redirect to real Stripe checkout!

## 🔄 **What Changes When You Enable Stripe:**

### **Before (Test Mode):**
- ❌ No real payments
- ❌ Test confirmation pages
- ❌ "Payment failed" errors

### **After (Normal Mode):**
- ✅ Real Stripe checkout pages
- ✅ Actual payment processing
- ✅ Customer receives real receipts
- ✅ Money goes to your bank account

## 💰 **Stripe Pricing:**
- **2.9% + 30¢** per successful charge
- **No monthly fees**
- **No setup fees**
- **Instant payouts** to your bank

## 🛡️ **Security:**
- **PCI Compliant** (Stripe handles card data)
- **Fraud protection** included
- **Secure checkout** pages
- **HTTPS encrypted** transactions

## 🚀 **Once Configured:**
Your global site will process real payments:
- **Customers pay with real cards**
- **Money goes to your bank account**
- **Professional receipts sent**
- **Automatic payment confirmations**

---

## 🎯 **Ready to Enable Real Payments?**

1. **Get Stripe keys** (5 minutes)
2. **Create .env file** (1 minute) 
3. **Restart backend** (30 seconds)
4. **Test with real payment** (2 minutes)

**Total setup time: ~8 minutes to go from test to production! 🚀**