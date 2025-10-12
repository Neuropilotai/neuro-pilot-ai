#!/usr/bin/env python3
"""
Comprehensive English Name Extractor for GFS Inventory
Extracts ALL product names from GFS PDFs and updates inventory to 100% English
"""

import re
import sqlite3
import subprocess
from pathlib import Path
from collections import defaultdict

# Paths
PDF_DIR = Path('/Users/davidmikulis/Library/CloudStorage/OneDrive-Personal/GFS Order PDF')
DB_PATH = Path(__file__).parent.parent / 'data' / 'enterprise_inventory.db'

print("=" * 80)
print("GFS INVENTORY → 100% ENGLISH TRANSLATION")
print("=" * 80)
print()

# ============================================================================
# STEP 1: Load all inventory items from database
# ============================================================================

conn = sqlite3.connect(str(DB_PATH))
cursor = conn.cursor()

cursor.execute("""
    SELECT item_id, item_code, item_name
    FROM inventory_items
    WHERE is_active = 1 AND item_code NOT LIKE 'ADJUST%'
    ORDER BY item_code
""")

inventory_items = cursor.fetchall()
print(f"📦 Loaded {len(inventory_items)} inventory items from database")

# Create mapping: item_code → item_id, current_name
inventory_map = {}
for item_id, item_code, item_name in inventory_items:
    inventory_map[item_code] = {
        'item_id': item_id,
        'current_name': item_name
    }

print(f"📋 Inventory codes: {len(inventory_map)} unique items")
print()

# ============================================================================
# STEP 2: Extract ALL English names from GFS PDFs
# ============================================================================

print("📄 Scanning GFS PDFs for English product names...")

if not PDF_DIR.exists():
    print(f"❌ ERROR: PDF directory not found: {PDF_DIR}")
    exit(1)

pdf_files = list(PDF_DIR.glob('*.pdf'))
print(f"📂 Found {len(pdf_files)} PDF files in OneDrive")
print()

# Dictionary: item_code → english_name
english_names = defaultdict(list)

# GFS invoice line item patterns
# Format: 97523092APPLE MCINTOSH 120-140CTPR35.2370.46CS
# Pattern: 7-digit code + optional digits + ENGLISH NAME + PR/MT/DY/etc
patterns = [
    # Standard GFS format
    r'^(\d{7})\d{0,3}([A-Z][A-Z\s/\-\.\&\',\(\)0-9]+?)(?:PR|MT|DY|FZ|GR|BK|DR|CL|RF|CS|EA|LB|KG)',
    # Alternate format with spaces
    r'(\d{7})\s+([A-Z][A-Z\s/\-\.\&\',\(\)0-9]{10,80}?)\s+(?:PR|MT|DY|FZ|GR|BK|DR|CL|RF|CS|EA|LB|KG)',
    # Format with item code at start of line
    r'^(\d{7})[^\w]*([A-Z][A-Z\s/\-\.\&\',\(\)0-9]+)',
]

processed_pdfs = 0
total_extracted = 0

for pdf_path in pdf_files:
    try:
        # Extract text using pdf-parse via Node.js
        result = subprocess.run([
            'node', '-e',
            f'''const pdf = require('pdf-parse');
const fs = require('fs');
const buf = fs.readFileSync('{pdf_path}');
pdf(buf).then(data => console.log(data.text));'''
        ], capture_output=True, text=True, cwd=str(Path(__file__).parent.parent), timeout=10)

        if result.returncode != 0:
            continue

        text = result.stdout
        lines = text.split('\n')

        pdf_items_found = 0

        for line in lines:
            line = line.strip()

            # Try each pattern
            for pattern in patterns:
                match = re.match(pattern, line)
                if match:
                    code = match.group(1)
                    name = match.group(2).strip()

                    # Clean up name
                    name = re.sub(r'\s{2,}', ' ', name)  # Remove extra spaces
                    name = name.strip()

                    # Validate name (should be reasonably long and start with letter)
                    if len(name) >= 5 and name[0].isalpha():
                        # Only keep if it's in our inventory
                        if code in inventory_map:
                            english_names[code].append(name)
                            pdf_items_found += 1
                    break

        if pdf_items_found > 0:
            processed_pdfs += 1
            total_extracted += pdf_items_found

    except Exception as e:
        continue

print(f"✅ Processed {processed_pdfs} PDFs successfully")
print(f"📝 Extracted {total_extracted} product name occurrences")
print(f"🎯 Found English names for {len(english_names)} unique item codes")
print()

# ============================================================================
# STEP 3: Consolidate multiple names per item (pick best/most common)
# ============================================================================

print("🔧 Consolidating English names...")

final_english_names = {}

for code, names in english_names.items():
    if not names:
        continue

    # Count occurrences of each name
    name_counts = defaultdict(int)
    for name in names:
        name_counts[name] += 1

    # Pick most common name (or longest if tie)
    best_name = max(name_counts.keys(), key=lambda n: (name_counts[n], len(n)))
    final_english_names[code] = best_name

print(f"📚 Consolidated to {len(final_english_names)} unique English names")
print()

# ============================================================================
# STEP 4: Update database with English names
# ============================================================================

print("💾 Updating database...")

updated_count = 0
skipped_count = 0

for code, english_name in final_english_names.items():
    if code in inventory_map:
        current_name = inventory_map[code]['current_name']
        item_id = inventory_map[code]['item_id']

        # Only update if current name is French (has special chars) or significantly different
        needs_update = (
            'É' in current_name or 'È' in current_name or 'Ê' in current_name or
            'À' in current_name or 'Ç' in current_name or 'â' in current_name or
            'é' in current_name or 'è' in current_name or 'ê' in current_name or
            'à' in current_name or 'ç' in current_name or 'ô' in current_name or
            current_name.lower() != english_name.lower()
        )

        if needs_update:
            cursor.execute("""
                UPDATE inventory_items
                SET item_name = ?, updated_at = datetime('now')
                WHERE item_code = ?
            """, (english_name, code))
            updated_count += 1
        else:
            skipped_count += 1

conn.commit()

print(f"✅ Updated {updated_count} items with English names")
print(f"⏭️  Skipped {skipped_count} items (already in English)")
print()

# ============================================================================
# STEP 5: Report on remaining French names
# ============================================================================

cursor.execute("""
    SELECT item_code, item_name
    FROM inventory_items
    WHERE is_active = 1
      AND item_code NOT LIKE 'ADJUST%'
      AND (
        item_name LIKE '%É%' OR item_name LIKE '%È%' OR item_name LIKE '%Ê%' OR
        item_name LIKE '%À%' OR item_name LIKE '%Ç%' OR item_name LIKE '%â%' OR
        item_name LIKE '%é%' OR item_name LIKE '%è%' OR item_name LIKE '%ê%' OR
        item_name LIKE '%à%' OR item_name LIKE '%ç%' OR item_name LIKE '%ô%'
      )
    ORDER BY item_code
""")

remaining_french = cursor.fetchall()

print("=" * 80)
print("📊 TRANSLATION SUMMARY")
print("=" * 80)
print(f"Total Inventory Items: {len(inventory_items)}")
print(f"English Names Found: {len(final_english_names)}")
print(f"Updated in Database: {updated_count}")
print(f"Remaining French Names: {len(remaining_french)}")
print(f"Translation Coverage: {((len(inventory_items) - len(remaining_french)) / len(inventory_items) * 100):.1f}%")
print()

if remaining_french and len(remaining_french) <= 20:
    print("🔍 Items still in French:")
    for code, name in remaining_french[:20]:
        print(f"   {code}: {name}")
elif remaining_french:
    print(f"🔍 {len(remaining_french)} items still in French (showing first 20):")
    for code, name in remaining_french[:20]:
        print(f"   {code}: {name}")
    print(f"   ... and {len(remaining_french) - 20} more")

print()

# ============================================================================
# STEP 6: Sample of updated items
# ============================================================================

cursor.execute("""
    SELECT item_code, item_name
    FROM inventory_items
    WHERE is_active = 1 AND item_code NOT LIKE 'ADJUST%'
    ORDER BY item_code
    LIMIT 10
""")

sample_items = cursor.fetchall()

print("✨ Sample of translated inventory:")
for code, name in sample_items:
    print(f"   {code}: {name}")

conn.close()

print()
print("=" * 80)
print("✅ ENGLISH TRANSLATION COMPLETE!")
print("=" * 80)
