#!/usr/bin/env python3
"""Test script to verify line item calculations"""

import sqlite3
import pandas as pd

DATABASE_PATH = "data/enterprise_inventory.db"
TEST_INVOICE = "9026547323"

conn = sqlite3.connect(DATABASE_PATH)

# Test query - same as in the main script
query = """
SELECT
    ili.invoice_number,
    ili.description as item_name,
    ili.line_total as total_price
FROM invoice_line_items ili
WHERE ili.invoice_number = ?
"""

df = pd.read_sql_query(query, conn, params=(TEST_INVOICE,))
conn.close()

print(f"Invoice: {TEST_INVOICE}")
print(f"Number of line items: {len(df)}")
print(f"Sum of line_total: ${df['total_price'].sum():,.2f}")
print(f"\nFirst 10 items:")
print(df.head(10))
