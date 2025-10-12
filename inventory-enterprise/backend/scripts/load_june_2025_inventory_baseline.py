#!/usr/bin/env python3
"""
Load July 4, 2025 Inventory Baseline from Gordon Food Service PDF
Total expected value: $243,339.79
"""

import re
import sqlite3
import subprocess
from pathlib import Path

PDF_PATH = '/Users/davidmikulis/Desktop/inventory july 4 2025 $243,339.79 .pdf'
DB_PATH = Path(__file__).parent.parent / 'data' / 'enterprise_inventory.db'

print("="*70)
print("JULY 4, 2025 INVENTORY BASELINE IMPORT")
print("="*70)
print()

# Extract PDF text using pdf-parse
print(f"📄 Reading PDF: {PDF_PATH}")
result = subprocess.run([
    'node', '-e',
    f'''const pdf = require('pdf-parse');
const fs = require('fs');
const buf = fs.readFileSync('{PDF_PATH}');
pdf(buf).then(data => console.log(data.text));'''
], capture_output=True, text=True, cwd=str(Path(__file__).parent.parent))

if result.returncode != 0:
    print(f"❌ Error extracting PDF: {result.stderr}")
    exit(1)

text = result.stdout
lines = text.split('\n')
print(f"📝 Extracted {len(lines)} lines from PDF\n")

# Parse line items
items = []
i = 0
while i < len(lines):
    line = lines[i].strip()
    
    # Look for product code lines starting with #
    if line.startswith('#'):
        code_match = re.match(r'#(\d+)', line)
        if not code_match:
            i += 1
            continue

        product_code = code_match.group(1)

        # Skip customer number (#450112)
        if product_code == '450112':
            i += 1
            continue

        # Get description from previous line
        if i == 0:
            i += 1
            continue
        description = lines[i-1].strip()
        if not description:
            i += 1
            continue
        
        # Parse all price lines for this product (can have multiple unit types)
        # Move to next line
        i += 1
        parsed_any = False

        while i < len(lines):
            price_line = lines[i].strip()

            # Check if this is a price line
            price_match = re.match(r'(Boîte|Unité|Seau|Caisse)([\d,]+)\s*\$(.*?)\s*\$', price_line)
            if not price_match:
                # Not a price line, done with this product
                break

            parsed_any = True
            unit_type = price_match.group(1)
            unit_price_str = price_match.group(2).replace(',', '.')
            qty_total_raw = price_match.group(3)

            # Skip lines with no price (e.g., "$/kg–")
            if '–' in qty_total_raw or '−' in qty_total_raw:
                i += 1
                continue

            # Clean: remove ALL whitespace and non-breaking spaces
            qty_total_clean = re.sub(r'[\s\xa0]+', '', qty_total_raw)

            # Replace comma with period for decimal
            qty_total_clean = qty_total_clean.replace(',', '.')

            try:
                unit_price = float(unit_price_str)
            except ValueError:
                i += 1
                continue

            # Try different split points to find qty and total
            best_qty = 0
            best_total = 0
            best_error = float('inf')

            for split_idx in range(1, min(4, len(qty_total_clean) - 2)):  # Qty is 1-3 digits
                try:
                    test_qty = float(qty_total_clean[:split_idx])
                    test_total = float(qty_total_clean[split_idx:])

                    # Verify: unit_price × qty should equal total
                    expected_total = unit_price * test_qty
                    error = abs(expected_total - test_total)

                    if error < 0.02 and error < best_error:
                        best_qty = test_qty
                        best_total = test_total
                        best_error = error
                except ValueError:
                    continue

            # Use best match
            qty = int(round(best_qty))
            total = best_total

            if qty > 0 and total > 0 and best_error < 0.02:
                items.append({
                    'code': product_code,
                    'description': description,
                    'unit_type': unit_type,
                    'unit_price': unit_price,
                    'quantity': qty,
                    'total': total
                })

            i += 1

        # If we didn't parse anything, skip forward
        if not parsed_any:
            i += 1
    else:
        i += 1

print(f"✅ Parsed {len(items)} line items\n")

# Calculate totals
total_qty = sum(item['quantity'] for item in items)
total_value = sum(item['total'] for item in items)

print(f"📦 Total Quantity: {total_qty:,}")
print(f"💰 Total Value: ${total_value:,.2f}")
print(f"🎯 Expected: $243,339.79")
print(f"📊 Difference: ${abs(total_value - 243339.79):,.2f}\n")

# Import into database
print("📥 Importing into database...\n")
conn = sqlite3.connect(str(DB_PATH))
cursor = conn.cursor()

imported = 0
updated = 0
skipped = 0

for item in items:
    try:
        # Check if item exists
        cursor.execute('SELECT item_id FROM inventory_items WHERE item_code = ?', (item['code'],))
        existing = cursor.fetchone()
        
        if existing:
            # Update
            cursor.execute('''
                UPDATE inventory_items 
                SET item_name = ?,
                    current_quantity = ?,
                    unit_cost = ?,
                    unit = ?,
                    updated_at = datetime('now')
                WHERE item_code = ?
            ''', (item['description'], item['quantity'], item['unit_price'], 
                  'CS' if item['unit_type'] == 'Boîte' else 'EA', item['code']))
            updated += 1
        else:
            # Insert
            cursor.execute('''
                INSERT INTO inventory_items (
                    item_code, item_name, current_quantity, unit_cost, unit,
                    category, par_level, reorder_point, is_active,
                    created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
            ''', (item['code'], item['description'], item['quantity'], item['unit_price'],
                  'CS' if item['unit_type'] == 'Boîte' else 'EA', 
                  'Food', 0, 0, 1))
            imported += 1
        
        if (imported + updated) % 50 == 0:
            print(f"  Progress: {imported + updated} items...")
            
    except Exception as e:
        print(f"❌ Error processing {item['code']}: {e}")
        skipped += 1

conn.commit()
conn.close()

print(f"\n✅ Import complete!")
print(f"  📦 New items: {imported}")
print(f"  🔄 Updated items: {updated}")
print(f"  ⚠️  Skipped: {skipped}\n")

# Verify
conn = sqlite3.connect(str(DB_PATH))
cursor = conn.cursor()
cursor.execute('''
    SELECT COUNT(*), SUM(current_quantity), SUM(current_quantity * unit_cost)
    FROM inventory_items
    WHERE is_active = 1 AND unit_cost > 0
''')
result = cursor.fetchone()
conn.close()

print("🔍 Verification:")
print(f"  Items: {result[0]}")
print(f"  Total Quantity: {result[1] or 0:,.0f}")
print(f"  Total Value: ${result[2] or 0:,.2f}")
print(f"  Expected: $243,339.79")
print(f"  Difference: ${abs((result[2] or 0) - 243339.79):,.2f}\n")

print("="*70)
print("✅ IMPORT COMPLETE")
print("="*70)
