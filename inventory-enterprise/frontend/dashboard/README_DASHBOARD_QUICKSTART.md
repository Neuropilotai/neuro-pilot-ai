# 📊 Dashboard Quick Start (60 Seconds)

## 🚀 Start in 3 Commands

```bash
# 1. Navigate to dashboard
cd ~/neuro-pilot-ai/inventory-enterprise/frontend/dashboard

# 2. Install & configure
npm ci
cp .env.local.example .env.local

# 3. Start dashboard
npm run dev
```

Dashboard will open at: **http://localhost:3000**

## 🔧 Configuration

The `.env.local` file connects to your backend:

```bash
VITE_API_URL=http://localhost:8083
VITE_WS_URL=ws://localhost:8083
```

### Using Different Backend Port

If your backend runs on a different port:

```bash
# Edit .env.local
VITE_API_URL=http://localhost:3001
VITE_WS_URL=ws://localhost:3001

# Restart dashboard
npm run dev
```

## 🔐 Login

**Default Credentials:**
- Email: `admin@neuro-pilot.ai`
- Password: `Admin123!@#`

## ✅ Verify Live Data

### 1. Check Connection Status

Look for the green indicator in the top-right:
- 🟢 Connected to backend
- 🔴 Disconnected (check backend is running)

### 2. View Real-Time Updates

Navigate to **AI Insights** → you should see:
- Live forecast updates
- Real-time metrics streaming
- WebSocket connection status

### 3. Test Features

- **Inventory**: View and manage items
- **AI Forecasting**: Generate predictions
- **Reports**: View executive summaries
- **Compliance**: Check security status
- **Settings**: Manage users and roles

## 🔍 Troubleshooting

### Dashboard shows "Cannot connect to server"

**Solution**: Verify backend is running
```bash
curl http://localhost:8083/health
```

Expected response:
```json
{"status":"ok",...}
```

If not running:
```bash
cd ~/neuro-pilot-ai/inventory-enterprise/backend
PORT=8083 npm run start:all
```

### CORS Errors in Browser Console

**Solution**: Check backend CORS configuration
```bash
# backend/.env should include:
CORS_ORIGIN=http://localhost:3000,http://localhost:8083
```

Restart backend after changing.

### WebSocket Connection Failed

**Solution**: Verify WebSocket URL
```bash
# frontend/dashboard/.env.local
VITE_WS_URL=ws://localhost:8083

# Test WebSocket manually
wscat -c ws://localhost:8083/ai/realtime
```

### Dashboard is Blank/White Screen

**Solution**: Check browser console for errors
1. Open DevTools (F12)
2. Check Console tab for errors
3. Check Network tab for failed requests

Common fixes:
```bash
# Clear cache
rm -rf node_modules/.vite
npm run dev

# Reinstall dependencies
rm -rf node_modules
npm ci
npm run dev
```

### Port 3000 Already in Use

**Solution**: Use different port
```bash
PORT=3001 npm run dev
```

Dashboard will open at http://localhost:3001

## 📱 Features Overview

### Dashboard Home
- System health summary
- Quick stats (inventory, users, forecasts)
- Recent activity feed

### Inventory Management
- Item list with search/filter
- Stock level monitoring
- Low stock alerts
- Bulk operations

### AI Forecasting
- Generate forecasts for items
- View prediction accuracy
- Historical trends
- Consumption analysis

### Executive Insights
- Weekly summaries (English/French)
- Performance metrics
- Trend analysis
- Recommendations

### Compliance Dashboard
- ISO 27001 status
- SOC 2 compliance
- OWASP Top 10 checks
- Security findings

### User Management
- Create/edit users
- Assign roles (Viewer/Analyst/Manager/Admin)
- Multi-tenant support
- Activity logs

## 🎨 Development

### Hot Reload

The dashboard auto-reloads on code changes:
```bash
# Edit any file in src/
# Browser refreshes automatically
```

### Build for Production

```bash
npm run build

# Output in dist/
# Serve with any static server
npx serve dist
```

### Run Tests

```bash
npm run test
```

## 📚 API Integration Examples

### Fetch Inventory
```javascript
const response = await fetch('http://localhost:8083/api/inventory', {
  headers: {
    'Authorization': `Bearer ${token}`
  }
});
const items = await response.json();
```

### Generate Forecast
```javascript
const response = await fetch('http://localhost:8083/api/ai/forecast/train', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`
  },
  body: JSON.stringify({
    item_code: 'APPLE-GALA',
    model_type: 'prophet'
  })
});
```

### WebSocket Connection
```javascript
const ws = new WebSocket('ws://localhost:8083/ai/realtime');

ws.onmessage = (event) => {
  const data = JSON.parse(event.data);
  console.log('Real-time update:', data);
};
```

## 🔗 Useful Links

- **Backend API**: http://localhost:8083
- **Health Check**: http://localhost:8083/health
- **Metrics**: http://localhost:8083/metrics
- **WebSocket**: ws://localhost:8083/ai/realtime

## 🎉 You're Ready!

The dashboard is now connected to your backend and ready to use.

**Quick Actions:**
1. Login with admin credentials
2. Navigate to Inventory → Add your first item
3. Go to AI Forecasting → Train a model
4. Check Executive Insights → View system summary

---

**Port**: 3000 (dashboard), 8083 (backend)
**Version**: v2.7.0
**Status**: Production Ready
