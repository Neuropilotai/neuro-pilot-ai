# Enterprise Inventory Management System Design

## Current Problem
- Inventory shows all items from all invoices without proper count management
- No way to perform physical inventory counts
- No clear separation between counted vs. uncounted inventory
- No location assignment workflow for new orders

## Enterprise Solution: Perpetual Inventory with Physical Count Snapshots

### Core Concepts

#### 1. **Perpetual Inventory System**
The system continuously tracks inventory movements:
- **Receipts** (from invoices) increase inventory
- **Issues** (usage/consumption) decrease inventory
- **Transfers** (between locations) move inventory
- **Physical Counts** adjust inventory to match reality

#### 2. **Cut-off Date System**
Every physical count has a **cut-off date**:
- All invoices **up to and including** the cut-off date are counted
- Invoices **after** the cut-off date are "pending placement"
- This creates a clear audit trail

#### 3. **Inventory States**

```
┌─────────────────────────────────────────────────────────┐
│                   INVENTORY LIFECYCLE                    │
└─────────────────────────────────────────────────────────┘

Invoice Received
    ↓
[PENDING PLACEMENT] ← Waiting for location assignment
    ↓
Location Assigned
    ↓
[IN STOCK] ← Normal inventory (before count)
    ↓
Physical Count Performed
    ↓
[COUNTED] ← Verified inventory (locked to count date)
    ↓
New Invoices After Count
    ↓
[PENDING PLACEMENT] → Back to the cycle
```

### Database Schema

#### Inventory Counts Table
```sql
CREATE TABLE inventory_counts (
  count_id INT PRIMARY KEY AUTO_INCREMENT,
  count_date DATETIME NOT NULL,
  cut_off_date DATETIME NOT NULL,  -- Last invoice included
  performed_by VARCHAR(100),
  status ENUM('IN_PROGRESS', 'COMPLETED', 'APPROVED'),
  notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  completed_at DATETIME,
  approved_at DATETIME,
  approved_by VARCHAR(100)
);
```

#### Inventory Snapshot Table
```sql
CREATE TABLE inventory_snapshots (
  snapshot_id INT PRIMARY KEY AUTO_INCREMENT,
  count_id INT REFERENCES inventory_counts(count_id),
  item_code VARCHAR(20),
  barcode VARCHAR(20),
  description VARCHAR(255),
  location_id INT,

  -- Physical count data
  counted_quantity DECIMAL(10,2),
  counted_unit VARCHAR(10),

  -- System calculated data (from invoices)
  system_quantity DECIMAL(10,2),

  -- Variance
  variance_quantity DECIMAL(10,2),  -- counted - system
  variance_value DECIMAL(12,2),

  -- Metadata
  counted_by VARCHAR(100),
  counted_at DATETIME,
  notes TEXT
);
```

#### Invoice Items with Status
```sql
CREATE TABLE invoice_items (
  item_id INT PRIMARY KEY AUTO_INCREMENT,
  invoice_number VARCHAR(20),
  invoice_date DATETIME,
  item_code VARCHAR(20),
  barcode VARCHAR(20),
  description VARCHAR(255),
  quantity DECIMAL(10,2),
  unit VARCHAR(10),
  unit_price DECIMAL(10,2),
  line_total DECIMAL(12,2),

  -- Inventory management
  status ENUM('PENDING_PLACEMENT', 'PLACED', 'COUNTED', 'CONSUMED'),
  location_id INT,
  assigned_by VARCHAR(100),
  assigned_at DATETIME,

  -- Links to count
  last_counted_in INT REFERENCES inventory_counts(count_id),

  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

#### Location Assignment Workflow
```sql
CREATE TABLE location_assignments (
  assignment_id INT PRIMARY KEY AUTO_INCREMENT,
  invoice_number VARCHAR(20),
  item_code VARCHAR(20),
  quantity DECIMAL(10,2),
  from_location_id INT,  -- NULL for new receipts
  to_location_id INT,
  assigned_by VARCHAR(100),
  assigned_at DATETIME,
  reason VARCHAR(255),
  status ENUM('PENDING', 'COMPLETED', 'CANCELLED')
);
```

### Workflow Processes

#### Process 1: Receiving New Invoices
```
1. PDF is processed and invoice extracted
2. Invoice items created with status = 'PENDING_PLACEMENT'
3. System notifies: "15 new items need location assignment"
4. Manager reviews and assigns locations
5. Status changes to 'PLACED'
6. Items appear in location's inventory
```

#### Process 2: Physical Inventory Count
```
1. Manager initiates count:
   - Select count date
   - Select cut-off date (last invoice to include)
   - System locks all invoices up to cut-off date

2. System generates count sheets by location:
   - All items with status 'PLACED'
   - Where invoice_date <= cut_off_date
   - Grouped by location

3. Counter performs physical count:
   - Scans barcode or enters item code
   - Enters actual counted quantity
   - System calculates variance

4. Review variances:
   - Items with >5% variance flagged for recount
   - Manager approves adjustments

5. Count completion:
   - All counted items marked with count_id
   - Snapshot saved for audit
   - System calculates new baseline

6. Post-count:
   - Invoices after cut-off date remain 'PENDING_PLACEMENT'
   - New workflow starts for these items
```

#### Process 3: Viewing Inventory

**View Mode: Current Inventory (Live)**
```javascript
SELECT
  item_code,
  barcode,
  description,
  location,
  SUM(quantity) as on_hand,
  status
FROM invoice_items
WHERE status IN ('PLACED', 'COUNTED')
GROUP BY item_code, location
ORDER BY location, description
```

**View Mode: As of Last Count**
```javascript
SELECT
  item_code,
  description,
  location,
  counted_quantity as on_hand,
  counted_at
FROM inventory_snapshots
WHERE count_id = (SELECT MAX(count_id) FROM inventory_counts WHERE status = 'APPROVED')
```

**View Mode: Pending Placement**
```javascript
SELECT
  invoice_number,
  invoice_date,
  item_code,
  description,
  quantity,
  'Needs Location Assignment' as status
FROM invoice_items
WHERE status = 'PENDING_PLACEMENT'
ORDER BY invoice_date DESC
```

### User Interface Design

#### Dashboard View
```
┌───────────────────────────────────────────────────────────┐
│  INVENTORY MANAGEMENT DASHBOARD                           │
├───────────────────────────────────────────────────────────┤
│                                                            │
│  Last Physical Count: Jan 15, 2025                        │
│  Cut-off Date: Jan 14, 2025 11:59 PM                     │
│  Items Counted: 5,783                                      │
│  Total Value: $1,247,890.45                               │
│                                                            │
│  ⚠️  15 Items Pending Location Assignment                 │
│  📦 3 New invoices received since last count              │
│                                                            │
│  [View Current Inventory] [View Last Count Snapshot]      │
│  [Start New Count] [Assign Locations]                     │
│                                                            │
└───────────────────────────────────────────────────────────┘
```

#### Inventory Count Screen
```
┌───────────────────────────────────────────────────────────┐
│  NEW PHYSICAL INVENTORY COUNT                             │
├───────────────────────────────────────────────────────────┤
│                                                            │
│  Count Date: [Jan 31, 2025 ▼]                            │
│                                                            │
│  Cut-off Date (Last Invoice): [Jan 30, 2025 11:59 PM ▼]  │
│                                                            │
│  Invoices Included:                                        │
│  └─ Invoices from Jan 15 - Jan 30: 45 invoices           │
│  └─ Total Items to Count: 6,234                          │
│                                                            │
│  Invoices Excluded (After Cut-off):                       │
│  └─ Invoice 9026031906 (Jan 31) - 45 items               │
│  └─ These will remain in "Pending Placement"             │
│                                                            │
│  [Generate Count Sheets] [Cancel]                         │
│                                                            │
└───────────────────────────────────────────────────────────┘
```

#### Location Assignment Screen
```
┌───────────────────────────────────────────────────────────┐
│  PENDING LOCATION ASSIGNMENTS                             │
├───────────────────────────────────────────────────────────┤
│                                                            │
│  Invoice 9026031906 - Received: Jan 31, 2025             │
│                                                            │
│  Item                        Qty  Unit  Assign To         │
│  ──────────────────────────────────────────────────────   │
│  10857692 - Apple Golden Del  21  CS   [Select Location▼]│
│  10857721 - Apple Red Delicio 11  CS   [Select Location▼]│
│  11228654 - Banana Green      41  CS   [Select Location▼]│
│                                                            │
│  Quick Assign All To: [Walk-in Cooler #1 ▼] [Apply]      │
│                                                            │
│  [Save Assignments] [Save as Draft]                       │
│                                                            │
└───────────────────────────────────────────────────────────┘
```

### Advanced Features

#### 1. **FIFO (First-In-First-Out) Tracking**
```javascript
// Track receipt date for each batch
{
  item_code: "10857692",
  batches: [
    { invoice: "9020806183", date: "2025-01-15", qty: 21, location: "Cooler-A" },
    { invoice: "9021570039", date: "2025-01-20", qty: 15, location: "Cooler-A" },
    { invoice: "9022080519", date: "2025-01-25", qty: 18, location: "Cooler-A" }
  ]
}

// When issuing, always take from oldest batch first
```

#### 2. **Variance Analysis**
```javascript
// Automatic alerts for significant variances
if (Math.abs(variance_percent) > 5) {
  alert("High variance detected: " + item_code);
  require_manager_approval = true;
}

// Track variance trends
SELECT
  item_code,
  AVG(variance_quantity) as avg_variance,
  COUNT(*) as times_counted
FROM inventory_snapshots
GROUP BY item_code
HAVING ABS(avg_variance) > 2
```

#### 3. **Cycle Counting**
Instead of full counts, count different locations on rotation:
```javascript
{
  cycle_id: 1,
  locations: ["Cooler-A", "Freezer-1"],
  scheduled_date: "2025-02-01",
  frequency: "WEEKLY",
  status: "SCHEDULED"
}
```

#### 4. **Mobile Counting App**
- Barcode scanner integration
- Offline mode for warehouse
- Real-time variance calculation
- Photo documentation of discrepancies

### Implementation Priority

**Phase 1: Core System (Week 1-2)**
1. ✅ Add invoice status tracking (PENDING_PLACEMENT → PLACED)
2. ✅ Create cut-off date logic for counts
3. ✅ Build location assignment UI
4. ✅ Generate count sheets by location

**Phase 2: Physical Count (Week 3-4)**
1. ✅ Count entry interface
2. ✅ Variance calculation
3. ✅ Snapshot creation
4. ✅ Approval workflow

**Phase 3: Advanced Features (Week 5-6)**
1. ✅ FIFO batch tracking
2. ✅ Cycle counting
3. ✅ Mobile app
4. ✅ Analytics & reports

### Key Benefits

1. **Accuracy**: Clear separation between counted and uncounted inventory
2. **Audit Trail**: Every count is permanently recorded with date/time/user
3. **Compliance**: Meets food safety and financial audit requirements
4. **Efficiency**: Only assign locations for new items, not re-assign existing
5. **Flexibility**: Supports both full counts and cycle counts
6. **Traceability**: Can recreate inventory at any point in time

### Example Scenario

**January 15, 2025 - Full Physical Count**
- Manager sets cut-off: Jan 14, 11:59 PM
- System includes invoices: 9020806183 through 9024309029 (50 invoices)
- Counter physically counts all 5,783 items
- Variances reviewed and approved
- Snapshot saved

**January 31, 2025 - New Invoice Received**
- Invoice 9026031906 arrives (190 items)
- Status: PENDING_PLACEMENT
- Manager assigns locations: 150 items to Cooler-A, 40 to Freezer-1
- Status changes to: PLACED
- These items will be included in NEXT count

**February 15, 2025 - Next Count**
- Manager sets cut-off: Feb 14, 11:59 PM
- System includes: Items from last count + new items placed Jan 15-Feb 14
- Cycle repeats

---

## Would you like me to implement this system?

I can start with Phase 1 and build:
1. Invoice status tracking
2. Location assignment workflow
3. Cut-off date logic
4. Count preparation screens

This will give you an enterprise-grade system that any auditor would approve!
