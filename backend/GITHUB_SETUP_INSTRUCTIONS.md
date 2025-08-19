# 🚀 GitHub Setup Instructions - GFS Orders

## ✅ Your System is Ready!

The inventory system now has GitHub sync integrated. Here's how to complete the setup:

## Step 1: Create Your GitHub Repository

1. **Go to:** https://github.com/new
2. **Fill in:**
   - Repository name: `gfs-orders-data`
   - Description: "GFS Orders for Camp Inventory System"
   - Choose: Public (easier) or Private
   - ✓ Add a README file
   - Click "Create repository"

## Step 2: Upload Sample Structure

1. **Download the template folder** I created for you:
   - Location: `/backend/gfs-orders-repo-template/`
   - Contains sample structure and order

2. **Upload to GitHub:**
   - Go to your new repo: https://github.com/Neuropilotai/gfs-orders-data
   - Click "Upload files"
   - Drag the entire contents of `gfs-orders-repo-template`
   - Click "Commit changes"

## Step 3: Test the Sync

1. **Check sync status:**

   ```
   curl http://localhost:8083/api/sync/status
   ```

2. **Manual sync:**

   ```
   curl -X POST http://localhost:8083/api/sync/github-orders
   ```

3. **Check if orders loaded:**
   - Visit: http://localhost:8083
   - Login and check GFS Orders tab

## 📱 How to Add New Orders

### From Computer:

1. Go to: https://github.com/Neuropilotai/gfs-orders-data
2. Navigate to `orders/2025/01/`
3. Click "Add file" → "Upload files"
4. Upload your CSV or JSON files

### From Phone:

1. Download GitHub mobile app
2. Navigate to your repo
3. Add files directly from phone

### Via Email (Future):

- Forward orders to a specific email
- AI agent will parse and add automatically

## 🔧 If Using Private Repository

Add this to your `.env` file:

```
GITHUB_TOKEN=your_personal_access_token
```

To get a token:

1. Go to: https://github.com/settings/tokens
2. Generate new token (classic)
3. Select "repo" scope
4. Copy token to .env file

## 📊 Order Formats You Can Use

### Simple CSV:

```csv
Date,Item,Quantity,Unit
2025-01-20,Ground Beef,50,lb
2025-01-20,Chicken Breast,100,lb
```

### Detailed JSON:

```json
{
  "orderNumber": "GFS_20250120_001",
  "orderDate": "2025-01-20",
  "items": [
    {
      "name": "Ground Beef",
      "quantity": 50,
      "unit": "lb"
    }
  ]
}
```

## 🤖 What Happens Automatically

Every 10 minutes, your inventory system:

1. Checks GitHub for new orders
2. Downloads any new files
3. Processes them into inventory
4. Updates stock levels
5. Logs all activities

## ✨ Next Steps

1. Create the GitHub repo (2 minutes)
2. Upload the template structure
3. Test with one order
4. Start uploading real orders!

## 🎯 Quick Links

- **Your Repo:** https://github.com/Neuropilotai/gfs-orders-data
- **Sync Status:** http://localhost:8083/api/sync/status
- **Manual Sync:** POST to http://localhost:8083/api/sync/github-orders
- **Inventory System:** http://localhost:8083

## Need Help?

The system is already integrated and waiting for your GitHub repository. Once you create it and add orders, they'll automatically sync!

Remember: The AI agent checks every 10 minutes, so after uploading orders to GitHub, wait up to 10 minutes or trigger a manual sync.
