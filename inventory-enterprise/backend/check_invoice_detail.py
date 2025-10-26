#!/usr/bin/env python3
import pandas as pd

df = pd.read_excel('/Users/davidmikulis/Desktop/GFS_Fiscal_Reports/GFS_Accounting_FY26-P01_September_2025.xlsx')
print(f"All invoice numbers: {df['Invoice #'].tolist()}")
print()

# Try to find any invoice
first_invoice = df[df['Invoice #'].notna()].iloc[0]
print(f"First invoice number: {first_invoice['Invoice #']}")
print(f"Total Invoice Amount: ${first_invoice['Total Invoice Amount']:,.2f}")
print(f"Other Costs: ${first_invoice['Other Costs']:,.2f}")
print(f"Food & Freight Reimb.: ${first_invoice['Total Food & Freight Reimb.']:,.2f}")
print(f"Reimb. Other: ${first_invoice['Total Reimb. Other']:,.2f}")
