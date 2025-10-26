#!/usr/bin/env python3
"""Check what's actually in the Excel file"""

import pandas as pd
import openpyxl

EXCEL_FILE = "/Users/davidmikulis/Desktop/GFS_Fiscal_Reports/GFS_Accounting_FY26-P01_September_2025.xlsx"

# Read with pandas
df = pd.read_excel(EXCEL_FILE, sheet_name=0)

print(f"Number of rows: {len(df)}")
print(f"Columns: {list(df.columns)}")
print(f"\nFirst 5 rows:")
print(df.head())
print(f"\nLast 5 rows (before GRAND TOTAL):")
print(df.tail())
print(f"\nSum of 'Other Costs' column: ${df['Other Costs'].sum():,.2f}")
print(f"\nSum of 'Total Invoice Amount' column: ${df['Total Invoice Amount'].sum():,.2f}")

# Check specific invoice
invoice_rows = df[df['Invoice #'] == '9026547323']
if len(invoice_rows) > 0:
    print(f"\nInvoice 9026547323:")
    for col in ['60110010 BAKE', '60110020 BEV + ECO', 'Other Costs', 'Total Invoice Amount']:
        if col in invoice_rows.columns:
            print(f"  {col}: ${invoice_rows[col].iloc[0]:,.2f}")
