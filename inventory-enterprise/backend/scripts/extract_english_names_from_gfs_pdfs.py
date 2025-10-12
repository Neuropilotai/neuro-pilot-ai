#!/usr/bin/env python3
"""
Extract English product names from GFS invoice PDFs
Match by product code and update inventory_items table
"""

import subprocess
import re
import sqlite3
from pathlib import Path
from collections import defaultdict

# Paths
GFS_PDF_DIR = Path('/Users/davidmikulis/Library/CloudStorage/OneDrive-Personal/GFS Order PDF')
DB_PATH = Path(__file__).parent.parent / 'data' / 'enterprise_inventory.db'
NODE_DIR = Path(__file__).parent.parent

print("="*70)
print("EXTRACT ENGLISH NAMES FROM GFS INVOICES")
print("="*70)
print()

# Get all PDF files
pdf_files = sorted(GFS_PDF_DIR.glob('*.pdf'))
print(f"📁 Found {len(pdf_files)} PDF files\n")

# Build product mapping: code -> English name
product_names = defaultdict(set)
total_items = 0

print("📄 Processing PDFs...")
for i, pdf_path in enumerate(pdf_files):
    try:
        # Extract PDF text
        result = subprocess.run([
            'node', '-e',
            f'''const pdf = require('pdf-parse');
const fs = require('fs');
const buf = fs.readFileSync('{pdf_path}');
pdf(buf).then(data => console.log(data.text));'''
        ], capture_output=True, text=True, cwd=str(NODE_DIR), timeout=10)

        if result.returncode != 0:
            continue

        text = result.stdout
        lines = text.split('\n')

        # Parse line items
        # GFS invoice format (concatenated):
        # 97523092APPLE MCINTOSH 120-140CTPR35.2370.46CS21x18.18 KGPacker
        # Pattern: [7-digit code][qty][DESCRIPTION in CAPS][category][price info]
        for line in lines:
            line = line.strip()

            # Match: 7-digit code followed by 1-3 digit quantity, then CAPS description
            match = re.match(r'^(\d{7})\d{1,3}([A-Z][A-Z\s/\-\.\&\',]+?)(?:PR|MT|DY|FZ|GR|BK|DR|CL)[A-Z\d]', line)
            if match:
                code = match.group(1)
                description = match.group(2).strip()

                # Clean up description
                description = re.sub(r'\s+', ' ', description)
                # Keep original capitalization (already in title case from GFS)

                product_names[code].add(description)
                total_items += 1

        if (i + 1) % 10 == 0:
            print(f"  Progress: {i + 1}/{len(pdf_files)} PDFs, {len(product_names)} unique products")

    except Exception as e:
        print(f"  ⚠️  Error processing {pdf_path.name}: {e}")
        continue

print(f"\n✅ Extracted {total_items} line items")
print(f"📦 Found {len(product_names)} unique product codes\n")

# Show sample products
print("Sample English names:")
for i, (code, names) in enumerate(list(product_names.items())[:10]):
    # Use most common/longest name
    best_name = max(names, key=len) if names else ''
    print(f"  #{code}: {best_name}")

print()

# Update database
conn = sqlite3.connect(str(DB_PATH))
cursor = conn.cursor()

# Get current inventory items
cursor.execute('''
    SELECT item_code, item_name
    FROM inventory_items
    WHERE is_active = 1
''')
inventory_items = {row[0]: row[1] for row in cursor.fetchall()}

updated = 0
no_match = 0
already_english = 0

print("📝 Updating inventory with English names...\n")

for code, current_name in inventory_items.items():
    # Check if we have an English name for this product
    if code in product_names:
        # Use longest/most complete name
        english_name = max(product_names[code], key=len)

        # Only update if different
        if english_name != current_name:
            cursor.execute('''
                UPDATE inventory_items
                SET item_name = ?, updated_at = datetime('now')
                WHERE item_code = ?
            ''', (english_name, code))
            updated += 1

            if updated <= 15:
                print(f"  #{code}")
                print(f"    Old: {current_name}")
                print(f"    New: {english_name}")
                print()
        else:
            already_english += 1
    else:
        no_match += 1

conn.commit()
conn.close()

print(f"✅ Update complete!")
print(f"  📝 Updated: {updated} items")
print(f"  ✓ Already English: {already_english} items")
print(f"  ⚠️  No match found: {no_match} items")
print()
print("="*70)
print("✅ ENGLISH NAMES EXTRACTED FROM GFS INVOICES")
print("="*70)
