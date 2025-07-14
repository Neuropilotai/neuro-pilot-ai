# How to Use the Inventory System

## 1. How to Enter Inventory Counts

### Step-by-Step Instructions:

1. **Open the System**
   - Go to http://localhost:8000/inventory
   - You'll see the "Count Sheets" tab is already selected

2. **Select a Location**
   - Click the "Select Location" dropdown
   - Choose where you're counting (e.g., "Main Freezer", "Walk-in Cooler", "Dry Storage")

3. **Enter Your Name**
   - Type your name in the "Counted By" field
   - This tracks who did the count

4. **Count Your Items**
   - You'll see a table with all items in that location
   - The "System Qty" column shows what the system thinks you have
   - Click in the "Counted Qty" column and enter the actual count
   - The "Variance" column will show the difference (red if different)

5. **Submit the Count**
   - Click the green "Submit Count" button
   - The system will update all quantities
   - You'll get a success message

6. **Optional: Print Backup**
   - Click "Print Sheet" before submitting to keep a paper copy

## 2. How to Import Orders (CSV)

### Simple CSV Format (Recommended):
Create a CSV file with just two columns:
```
Ground Beef,150
Milk,80
Bread,120
Chicken Breast,100
```

### Template CSV Format:
Download the template using the "Download CSV Template" button, then fill it out:
```
Date,Supplier,People,Duration,Item1,Qty1,Item2,Qty2,Item3,Qty3
2024-03-15,Gordon Food Service,280,7,Ground Beef,150,Milk,80,Bread,120
```

### Troubleshooting CSV Import:
- Make sure there are no extra spaces or special characters
- Use simple item names without quotes
- Quantities should be whole numbers
- Save as .csv (not .xlsx)

## 3. Quick Tips

### For Daily Use:
- Count items first thing in the morning
- Enter your actual physical count (not what you think it should be)
- Submit counts right away to keep the system updated

### Setting Up New Items:
1. Go to the "Setup" tab
2. Click "Add New Item"
3. Enter:
   - Item name (e.g., "Ground Beef")
   - Category (e.g., "Food")
   - Unit (e.g., "Pound")
   - Min/Max quantities
   - Reorder point

### Checking What to Order:
1. Go to "Min/Max Report" tab
2. Items in red need reordering
3. Click "Generate Order" to create an order

## Common Issues and Solutions

**Problem: CSV won't import**
- Solution: Use the simple format (item,quantity)
- Make sure no headers or extra columns

**Problem: Can't see items when counting**
- Solution: Items must be assigned to locations in Setup tab

**Problem: Count not saving**
- Solution: Make sure you entered your name and at least one count

## Need More Help?

Contact your system administrator or check the full documentation in CAMP_INVENTORY_README.md