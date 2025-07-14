# 🏔️ Mining Camp Inventory System - Complete Setup Guide

## Quick Start (5 minutes)

### Step 1: Create Your Google Sheet
1. Go to [Google Sheets](https://sheets.google.com)
2. Click the **"+"** to create a new spreadsheet
3. Name it: **"Mining Camp Inventory System"**

### Step 2: Import Your GFS Order Data
1. In your new sheet, go to **File → Import**
2. Click **Upload** and select your `GFS_Order_July4_2025.csv` file
3. Choose **"Replace current sheet"** when prompted
4. Click **Import data**

### Step 3: Install the Inventory System
1. Go to **Extensions → Apps Script**
2. Delete any existing code in the editor
3. Copy ALL the code from the file `google_apps_script_code.gs`
4. Paste it into the Apps Script editor
5. Click the **💾 Save** button (or press Ctrl+S / Cmd+S)
6. Name the project: **"Camp Inventory System"**

### Step 4: Run Initial Setup
1. In the Apps Script editor, make sure `setupInventorySystem` is selected in the dropdown
2. Click the **▶️ Run** button
3. When prompted, click **Review permissions**
4. Choose your Google account
5. Click **Advanced** → **Go to Camp Inventory System (unsafe)**
6. Click **Allow**
7. Wait for "Execution completed" message (about 30 seconds)

### Step 5: Return to Your Spreadsheet
1. Go back to your Google Sheets tab
2. You should see multiple new sheets created
3. A new menu **"🏔️ Camp Inventory"** appears in the menu bar

## 📊 Understanding Your New System

### Sheets Created:

1. **Dashboard** - Overview of inventory status and alerts
2. **Inventory_Master** - All products with stock levels and locations
3. **Order_History** - Track all orders placed and received
4. **AI_Suggestions** - Smart ordering recommendations
5. **Menu_Calendar** - 4-week rotating menu schedule
6. **AI_Log** - System activity and alerts
7. **Settings** - System configuration
8. **Count_[Location]** - Printable inventory count sheets for each storage area

### First-Time Configuration

#### 1. Assign Storage Locations
- Go to **Inventory_Master** sheet
- In column F (Location), click each cell
- Select appropriate location from dropdown:
  - Dry Storage 1/2
  - Walk-in Cooler
  - Reach-in Fridge 1/2
  - Walk-in Freezer
  - Chest Freezer 1/2
  - Chemical Storage
  - Paper Goods
  - Kitchen Active

#### 2. Set Min/Max Stock Levels
- Column H: **Min Stock** - Minimum quantity before reordering
- Column I: **Max Stock** - Maximum quantity to have on hand
- System has set initial values based on your order quantities
- Adjust based on your experience

#### 3. Mark Emergency Proteins
- In column Q (Notes), add "Emergency protein" for critical protein items
- This triggers 30-day buffer monitoring

## 🤖 Using AI Features

### Generate Order Suggestions
1. Click **🏔️ Camp Inventory → 🤖 Generate AI Suggestions**
2. System analyzes:
   - Current stock levels
   - Usage patterns
   - Min/max thresholds
   - Emergency protein requirements
3. Review suggestions in **AI_Suggestions** sheet

### Create Orders
1. After generating suggestions, click **📦 Create New Order**
2. System shows summary of items to order
3. Click **Yes** to create order
4. Order appears in **Order_History** with PENDING status

### Process Deliveries
1. When order arrives, click **✅ Process Delivery**
2. Select the order to process
3. Enter received quantities
4. System updates inventory automatically

## 📋 Daily Operations

### Print Count Sheets
1. Click **🏔️ Camp Inventory → 🖨️ Prepare Sheets for Printing**
2. Enter location name or "ALL"
3. Go to **File → Print** to print sheets
4. Staff write physical counts on sheets

### Update Inventory from Counts
1. Open the Count_[Location] sheet
2. Enter physical counts in column E
3. System calculates differences automatically
4. Review and investigate large discrepancies

### Monitor Dashboard
- Check daily for:
  - 🔴 Out of stock items
  - 🟠 Critical low stock
  - 🟡 Low stock warnings
  - 📅 Days until next order
  - 🥩 Emergency protein days

## 📅 Weekly Workflow

### Sunday/Monday - Place Orders
1. Update inventory counts
2. Generate AI suggestions
3. Review and adjust quantities
4. Create new order
5. Submit to GFS before cutoff

### Wednesday - New Rotation Starts
1. Brief incoming team on inventory status
2. Review pending orders
3. Check emergency supplies

### Friday Noon - Order Cutoff
1. Last chance to modify orders
2. Confirm delivery schedule
3. Plan for any shortages

### When Orders Arrive
1. Process delivery in system
2. Update actual received quantities
3. Note any substitutions or shortages
4. File delivery paperwork

## 🚨 Handling Common Scenarios

### Train/Freight Delays
1. Check emergency protein stock
2. Review AI suggestions for critical items
3. Consider air freight for essentials
4. Update delivery dates in Order_History

### Menu Changes
1. Update Menu_Calendar sheet
2. Adjust min/max levels for affected items
3. Generate new AI suggestions

### Unexpected High Occupancy
1. Go to Settings sheet
2. Update camp capacity numbers
3. System adjusts suggestions accordingly

## 💡 Pro Tips

1. **Accurate Counts = Better Predictions**
   - Do physical counts weekly
   - Enter counts same day
   - Investigate discrepancies

2. **Emergency Buffer Management**
   - Keep 30+ days of protein
   - Monitor Dashboard daily
   - Order early for critical items

3. **Seasonal Adjustments**
   - Increase stock before bad weather
   - Account for holiday preferences
   - Plan for delivery delays

4. **Using Notes Effectively**
   - Record substitutions
   - Note quality issues
   - Track expiry dates
   - Document waste reasons

## 🔧 Troubleshooting

### "Formula Parse Error"
- Make sure you're using English Google Sheets
- Check regional settings match formula format

### Count Sheets Not Updating
- Refresh the page (F5)
- Check formulas in row 5
- Ensure location names match exactly

### AI Suggestions Empty
- Verify inventory data exists
- Check min/max levels are set
- Ensure usage rate calculations work

### Orders Not Calculating
- Check Order_History formulas
- Verify product IDs match
- Ensure dates are formatted correctly

## 📞 Getting Help

### In the System
- Click **🏔️ Camp Inventory → ❓ Help**
- Hover over column headers for descriptions
- Check AI_Log for system messages

### For Technical Issues
1. Note the error message
2. Check which sheet/cell has issues
3. Try refreshing the browser
4. Contact IT support if needed

## 🎯 Success Metrics

Track these KPIs to measure system effectiveness:
- Zero stockouts per month
- 30+ days emergency protein maintained
- Order accuracy >95%
- Waste reduction vs. previous system
- Time saved on ordering process

## 🚀 Advanced Features

### Custom Reports
- Use Google Sheets pivot tables
- Create charts from Dashboard data
- Export to PDF for management

### Integration Ideas
- Connect to accounting system
- Email alerts for critical stock
- Mobile app for count entry
- Barcode scanning (future)

---

**Remember**: The system learns from your data. The more you use it, the better the predictions become. Start simple, be consistent with data entry, and let the AI help optimize your inventory management.

**Need help?** The system is designed to be self-explanatory, but don't hesitate to explore all menu options and experiment with the features. Your feedback helps improve the system for all remote camps.