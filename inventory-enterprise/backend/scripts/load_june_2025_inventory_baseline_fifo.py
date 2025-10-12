#!/usr/bin/env python3
"""
Load July 4, 2025 Inventory Baseline - FIXED FORMAT
Each product can have multiple unit types (Boîte, Unité, Seau, etc.)
"""

import re
import sqlite3
import subprocess
from pathlib import Path

PDF_PATH = '/Users/davidmikulis/Desktop/inventory july 4 2025 $243,339.79 .pdf'
DB_PATH = Path(__file__).parent.parent / 'data' / 'enterprise_inventory.db'

print("="*70)
print("JULY 4, 2025 INVENTORY - FIFO FORMAT")
print("="*70)
print()

# Extract PDF text
print(f"📄 Reading PDF...")
result = subprocess.run([
    'node', '-e',
    f'''const pdf = require('pdf-parse');
const fs = require('fs');
const buf = fs.readFileSync('{PDF_PATH}');
pdf(buf).then(data => console.log(data.text));'''
], capture_output=True, text=True, cwd=str(Path(__file__).parent.parent))

text = result.stdout
lines = [line.strip() for line in text.split('\n')]
print(f"📝 Extracted {len(lines)} lines\n")

# Parse items - multi-line format
items = []
i = 0
while i < len(lines):
    line = lines[i]
    
    # Look for product code
    if line.startswith('#') and '|' in line:
        code_match = re.match(r'#(\d+)', line)
        if not code_match:
            i += 1
            continue
        
        product_code = code_match.group(1)
        
        # Skip customer number
        if product_code == '450112':
            i += 1
            continue
        
        # Get description (previous line)
        if i == 0:
            i += 1
            continue
        description = lines[i-1]
        
        # Parse all unit types for this product
        i += 1
        while i < len(lines) - 3:
            # Check if next line is a unit type
            if lines[i] not in ['Boîte', 'Unité', 'Seau', 'Caisse']:
                break
            
            unit_type = lines[i]
            
            # Next line should be unit price
            i += 1
            if i >= len(lines):
                break
            price_match = re.match(r'([\d,]+)\s*\$', lines[i])
            if not price_match:
                break
            unit_price = float(price_match.group(1).replace(',', '.'))
            
            # Next line should be quantity
            i += 1
            if i >= len(lines):
                break
            
            # Check if quantity or dash (no quantity)
            if lines[i] in ['–', '−', ''] or not lines[i]:
                # Skip this unit type (no quantity)
                i += 1  # Skip total line
                continue
            
            try:
                quantity = int(lines[i])
            except ValueError:
                # Not a quantity, back up
                i -= 2
                break
            
            # Next line should be total
            i += 1
            if i >= len(lines):
                break
            total_match = re.match(r'([\d\s,]+)\s*\$', lines[i])
            if not total_match:
                # Back up
                i -= 3
                break
            total_str = total_match.group(1).replace(' ', '').replace(',', '.')
            total = float(total_str)
            
            # Add item
            items.append({
                'code': product_code,
                'description': description,
                'unit_type': unit_type,
                'unit_price': unit_price,
                'quantity': quantity,
                'total': total
            })
            
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

# Show samples
print("Sample items:")
for item in items[:10]:
    print(f"  #{item['code']}: {item['description'][:50]}")
    print(f"    {item['unit_type']}: {item['quantity']} × ${item['unit_price']:.2f} = ${item['total']:.2f}")

print(f"\nReady to import {len(items)} items")
