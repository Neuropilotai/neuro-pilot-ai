# Google Drive Setup for GFS Orders

## Quick Setup Guide

### Option 1: Using Google Drive Web Interface (Easiest)

1. **Create a Google Drive Folder:**
   - Go to https://drive.google.com
   - Create a new folder called `GFS_Orders_Inventory`
   - Share it with your email

2. **Upload Orders:**
   - Simply drag and drop your GFS order files (JSON/CSV) into this folder
   - Or use Google Sheets to create orders directly

3. **Enable API Access:**
   - Go to https://console.cloud.google.com
   - Create a new project or select existing
   - Enable Google Drive API
   - Create credentials (OAuth2 or Service Account)

### Option 2: Using Google Sheets (Best for Manual Entry)

1. **Create a Google Sheet:**
   - Name it "GFS Orders Tracker"
   - Create columns: Order Date, Item Name, Quantity, Unit, Price, Supplier

2. **Use Google Apps Script:**
   - Tools → Script editor
   - Add the provided script to auto-export to JSON

### Option 3: Email Integration (Automatic)

1. **Set up Gmail Filter:**
   - Forward GFS order emails to a specific folder
   - Use the AI agent to parse emails automatically

## Environment Variables

Add these to your `.env` file:

```bash
# For Service Account (Recommended for automation)
GOOGLE_SERVICE_ACCOUNT_KEY='{"type":"service_account",...}'

# OR for OAuth2
GOOGLE_CLIENT_ID=your-client-id
GOOGLE_CLIENT_SECRET=your-client-secret
GOOGLE_REDIRECT_URI=http://localhost:8083/auth/google/callback

# Optional: Specific folder ID
GOOGLE_DRIVE_FOLDER_ID=your-folder-id
```

## Integration with Inventory System

1. **Add to your inventory system:**
```javascript
const { GoogleDriveSync, AIDataCollector } = require('./google-drive-sync');

// Initialize on startup
const driveSync = new GoogleDriveSync();
const aiCollector = new AIDataCollector(driveSync);

// Start automatic sync
aiCollector.start();
```

2. **Manual sync command:**
```javascript
// Add this route to your Express app
app.post('/api/sync-gfs-orders', async (req, res) => {
  try {
    const count = await driveSync.syncGFSOrders();
    res.json({ success: true, ordersSync: count });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
```

## How It Works

1. **Upload**: You upload GFS orders to Google Drive (manually or via email)
2. **Sync**: AI agent checks every 5 minutes for new files
3. **Process**: New orders are automatically imported into inventory
4. **Update**: Inventory levels are adjusted based on orders

## Benefits

- ✅ Access orders from anywhere
- ✅ Automatic backups in cloud
- ✅ Version history for all orders
- ✅ Share with team members
- ✅ Works on mobile devices
- ✅ Free up to 15GB

## Alternative: GitHub Repository

If you prefer using GitHub:

1. Create a private repository: `gfs-orders-data`
2. Upload orders as JSON files
3. Use GitHub API to fetch:

```javascript
// Fetch from GitHub
const response = await fetch('https://api.github.com/repos/YOUR_USERNAME/gfs-orders-data/contents/orders');
const files = await response.json();
```

## Next Steps

1. Choose your preferred method (Google Drive recommended)
2. Set up credentials
3. Test with a few orders
4. Enable automatic sync

Need help? The system will guide you through the setup process!