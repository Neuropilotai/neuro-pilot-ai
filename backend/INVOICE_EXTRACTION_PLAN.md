# Invoice Extraction & Accuracy Plan

## Current Status
- **54 JSON files** in gfs_orders folder
- **84 PDF files** in OneDrive
- **30 PDFs not extracted** yet
- **39 invoices missing order dates**
- **Target: 100% extraction accuracy**

## OneDrive Link
https://1drv.ms/f/c/613dd27101141ec1/EhOahKqtqcVNvx8b5GSOFzkBd1ngJR3DWIWi6wi-AJoztg?e=HOOeqI

## Missing PDFs to Extract (30 invoices)

### January 2025 Invoices (9018 series):
- 9018357843 (Jan 18)
- 9018357846 (Jan 18) - **YOU MENTIONED THIS ONE**
- 9018587875, 9018587876, 9018587877, 9018587878, 9018587879

### January 2025 Invoices (9019 series):
- 9019074588, 9019074590, 9019074591, 9019074592
- 9019325643, 9019325646, 9019325647
- 9019558528, 9019558752, 9019558774, 9019558775, 9019558776, 9019558777
- 9019805895, 9019805903, 9019805904, 9019805906, 9019805907, 9019805909, 9019805910, 9019805911

### February-March 2025 Invoices (9020 series):
- 9020060120, 9020060122, 9020060123, 9020060124
- 9020316838, 9020316841, 9020316842
- 9020563793, 9020563802
- 9020806184

## Invoices with Missing Order Dates (39 invoices)

These invoices exist but need order dates extracted:
- 9021033005, 9021033009
- 9021053495
- 9021570043
- 9021819128, 9021819130, 9021819131
- 9022080517, 9022080518, 9022080519
- 9022144275
- 9022353897, 9022353899, 9022353900
- 9022613260, 9022613264, 9022613266, 9022613270, 9022613272
- 9022864308, 9022864312, 9022864313, 9022864314, 9022864315, 9022864316
- 9023102238, 9023102239, 9023102240, 9023102241, 9023102242
- 9023349211
- 9023602785
- 9023843552, 9023843557, 9023843558, 9023843559
- 9024082412
- 9024309029
- 9026031906

## Action Plan

### Step 1: Download All PDFs from OneDrive
Use rclone or manual download to get all 84 PDFs to `./data/pdfs/`

### Step 2: Extract Missing 30 PDFs
Run improved PDF extractor on the 30 missing invoices

### Step 3: Re-extract 39 Invoices with Missing Dates
Use enhanced date extraction to find order dates in these PDFs

### Step 4: Verify 100% Accuracy
- All 84 invoices extracted
- All order dates present
- All items extracted
- All GL categories assigned

### Step 5: Identify Missing Weekly Invoices
Generate report showing which weeks have no invoices since Jan 1, 2025

## Expected Result
- **84 invoices** fully extracted
- **100% accuracy** on all fields
- **Complete weekly coverage** report
- **All items categorized** with GL codes
