# Database Schema Comparison Report

**Generated**: 2025-10-09T12:08:51.869Z

## Executive Summary

- **Old Database**: ../../backend/data/enterprise_inventory.db (34 tables)
- **New Database**: db/inventory_enterprise.db (40 tables)
- **Common Tables**: 8
- **Removed Tables**: 26
- **New Tables**: 32

## Removed Tables (in old, not in new)

- `ai_agent_actions` (0 rows)
- `ai_anomalies` (0 rows)
- `ai_consumption_history` (0 rows)
- `ai_learning_data` (60 rows)
- `ai_query_log` (1 rows)
- `ai_reorder_policy` (0 rows)
- `ai_variance_insights` (2 rows)
- `consumption_forecasts` (1 rows)
- `counting_sheets` (0 rows)
- `credit_memos` (3 rows)
- `duplicate_attempts` (0 rows)
- `integration_log` (2 rows)
- `inventory_alerts` (0 rows)
- `inventory_audit_log` (7536 rows)
- `inventory_config` (7 rows)
- `inventory_consumption` (0 rows)
- `inventory_min_max` (0 rows)
- `iot_events` (2 rows)
- `item_categories` (13 rows)
- `location_master` (10 rows)
- `migrations` (1 rows)
- `par_level_history` (0 rows)
- `par_level_recommendations` (0 rows)
- `purchase_orders` (2 rows)
- `reorder_alerts` (0 rows)
- `usage_patterns` (0 rows)

## New Tables (in new, not in old)

- `ai_autotrain_jobs` (0 rows)
- `ai_command_results` (0 rows)
- `ai_consumption_derived` (0 rows)
- `ai_feedback` (0 rows)
- `ai_feedback_daily_rollup` (0 rows)
- `ai_forecasts` (0 rows)
- `ai_governance_reports` (0 rows)
- `ai_health_predictions` (0 rows)
- `ai_models` (0 rows)
- `ai_policy` (0 rows)
- `ai_policy_history` (0 rows)
- `ai_security_findings` (0 rows)
- `ai_training_jobs` (0 rows)
- `ai_tuning_proposals` (0 rows)
- `count_documents` (0 rows)
- `documents` (0 rows)
- `inventory_count_rows` (0 rows)
- `inventory_snapshot_items` (0 rows)
- `owner_console_events` (0 rows)
- `permissions` (24 rows)
- `rbac_audit_log` (0 rows)
- `role_permissions` (45 rows)
- `roles` (4 rows)
- `sso_audit_log` (0 rows)
- `sso_providers` (0 rows)
- `storage_locations` (10 rows)
- `tenant_users` (0 rows)
- `tenants` (1 rows)
- `transaction_log` (0 rows)
- `users` (0 rows)
- `webhook_deliveries` (0 rows)
- `webhook_endpoints` (0 rows)

## Critical Table Comparisons

### item_master

**Row counts**: Old = 1833, New = 1833

**Schema changes**:
- Common fields: 6
- Removed fields: 11
- Added fields: 8

**Removed fields**: description, category_id, subcategory_id, brand, manufacturer, pack_size, current_unit_price, last_price_update, is_perishable, requires_refrigeration, is_active

**Added fields**: item_id, item_name, item_name_fr, category, par_level, reorder_point, unit_cost, active

#### Old Schema

```
item_code TEXT PRIMARY KEY
barcode TEXT
description TEXT NOT NULL
category_id INTEGER
subcategory_id INTEGER
unit TEXT
brand TEXT
manufacturer TEXT
pack_size TEXT
current_unit_price REAL
last_price_update TEXT
is_perishable INTEGER DEFAULT 0
requires_refrigeration INTEGER DEFAULT 0
is_active INTEGER DEFAULT 1
created_at TEXT DEFAULT CURRENT_TIMESTAMP
updated_at TEXT DEFAULT CURRENT_TIMESTAMP
version INTEGER DEFAULT 1
```

#### New Schema

```
item_id INTEGER PRIMARY KEY
item_code TEXT NOT NULL
item_name TEXT NOT NULL
item_name_fr TEXT
category TEXT
unit TEXT DEFAULT 'each'
barcode TEXT
par_level REAL DEFAULT 0
reorder_point REAL DEFAULT 0
unit_cost REAL DEFAULT 0
active INTEGER DEFAULT 1
created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
version INTEGER DEFAULT 1
```

### inventory_counts

**Row counts**: Old = 0, New = 0

**Schema changes**:
- Common fields: 5
- Removed fields: 8
- Added fields: 7

**Removed fields**: cut_off_date, performed_by, completed_at, approved_at, approved_by, total_items_counted, total_locations, total_variance_value

**Added fields**: count_name, count_type, counted_by, updated_at, version, closed_at, closed_by

#### Old Schema

```
count_id INTEGER PRIMARY KEY
count_date TEXT NOT NULL
cut_off_date TEXT NOT NULL
performed_by TEXT NOT NULL
status TEXT NOT NULL DEFAULT 'IN_PROGRESS'
notes TEXT
created_at TEXT DEFAULT CURRENT_TIMESTAMP
completed_at TEXT
approved_at TEXT
approved_by TEXT
total_items_counted INTEGER DEFAULT 0
total_locations INTEGER DEFAULT 0
total_variance_value REAL DEFAULT 0
```

#### New Schema

```
count_id INTEGER PRIMARY KEY
count_name TEXT NOT NULL
count_date DATE NOT NULL
count_type TEXT DEFAULT 'periodic'
status TEXT DEFAULT 'pending'
counted_by INTEGER
notes TEXT
created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
version INTEGER DEFAULT 1
closed_at TIMESTAMP
closed_by TEXT
```

### inventory_count_items

**Row counts**: Old = 1596, New = 0

**Schema changes**:
- Common fields: 5
- Removed fields: 8
- Added fields: 4

**Removed fields**: id, count_date, expected_quantity, counted_quantity, counted_units, variance, variance_value, sequence_number

**Added fields**: count_item_id, count_id, quantity, updated_at

#### Old Schema

```
id INTEGER PRIMARY KEY
count_date TEXT NOT NULL
item_code TEXT NOT NULL
expected_quantity REAL
counted_quantity REAL
counted_units REAL
variance REAL
variance_value REAL
location TEXT
notes TEXT
created_at TEXT DEFAULT CURRENT_TIMESTAMP
sequence_number INTEGER DEFAULT 0
version INTEGER DEFAULT 1
```

#### New Schema

```
count_item_id INTEGER PRIMARY KEY
count_id INTEGER
item_code TEXT NOT NULL
quantity REAL DEFAULT 0
location TEXT
notes TEXT
created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
version INTEGER DEFAULT 1
```

### invoice_items

**Row counts**: Old = 7536, New = 0

**Schema changes**:
- Common fields: 4
- Removed fields: 15
- Added fields: 7

**Removed fields**: item_id, invoice_number, invoice_date, barcode, description, unit, line_total, status, location_id, assigned_by, assigned_at, last_counted_in, batch_number, expiry_date, updated_at

**Added fields**: invoice_item_id, invoice_id, item_name, total_price, tax_amount, line_number, version

#### Old Schema

```
item_id INTEGER PRIMARY KEY
invoice_number TEXT NOT NULL
invoice_date TEXT NOT NULL
item_code TEXT NOT NULL
barcode TEXT
description TEXT NOT NULL
quantity REAL NOT NULL
unit TEXT NOT NULL
unit_price REAL NOT NULL
line_total REAL NOT NULL
status TEXT NOT NULL DEFAULT 'PENDING_PLACEMENT'
location_id INTEGER
assigned_by TEXT
assigned_at TEXT
last_counted_in INTEGER
batch_number TEXT
expiry_date TEXT
created_at TEXT DEFAULT CURRENT_TIMESTAMP
updated_at TEXT DEFAULT CURRENT_TIMESTAMP
```

#### New Schema

```
invoice_item_id INTEGER PRIMARY KEY
invoice_id INTEGER
item_code TEXT NOT NULL
item_name TEXT
quantity REAL DEFAULT 0
unit_price REAL DEFAULT 0
total_price REAL DEFAULT 0
tax_amount REAL DEFAULT 0
line_number INTEGER
created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
version INTEGER DEFAULT 1
```

### processed_invoices

**Row counts**: Old = 167, New = 0

**Schema changes**:
- Common fields: 5
- Removed fields: 6
- Added fields: 9

**Removed fields**: id, item_count, pdf_file_hash, content_fingerprint, pdf_file_path, processed_at

**Added fields**: invoice_id, supplier, tax_amount, subtotal, status, pdf_path, notes, created_at, updated_at

#### Old Schema

```
id INTEGER PRIMARY KEY
invoice_number TEXT NOT NULL
invoice_date TEXT
total_amount REAL
item_count INTEGER
pdf_file_hash TEXT
content_fingerprint TEXT
pdf_file_path TEXT
processed_at TEXT DEFAULT CURRENT_TIMESTAMP
processed_by TEXT
version INTEGER DEFAULT 1
```

#### New Schema

```
invoice_id INTEGER PRIMARY KEY
invoice_number TEXT
supplier TEXT
invoice_date DATE
total_amount REAL
tax_amount REAL
subtotal REAL
status TEXT DEFAULT 'processed'
pdf_path TEXT
processed_by INTEGER
notes TEXT
created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
version INTEGER DEFAULT 1
```

### item_locations

**Row counts**: Old = 5, New = 0

**Schema changes**:
- Common fields: 4
- Removed fields: 10
- Added fields: 4

**Removed fields**: location_code, location_name, location_type, quantity_on_hand, min_quantity, max_quantity, reorder_point, last_counted_date, last_counted_qty, notes

**Added fields**: tenant_id, location_id, sequence, is_active

#### Old Schema

```
id INTEGER PRIMARY KEY
item_code TEXT NOT NULL
location_code TEXT NOT NULL
location_name TEXT NOT NULL
location_type TEXT
quantity_on_hand REAL DEFAULT 0
min_quantity REAL DEFAULT 0
max_quantity REAL DEFAULT 0
reorder_point REAL DEFAULT 0
last_counted_date TEXT
last_counted_qty REAL
notes TEXT
created_at TEXT DEFAULT CURRENT_TIMESTAMP
updated_at TEXT DEFAULT CURRENT_TIMESTAMP
```

#### New Schema

```
id TEXT PRIMARY KEY
tenant_id TEXT NOT NULL
location_id TEXT NOT NULL
item_code TEXT NOT NULL
sequence INTEGER NOT NULL DEFAULT 0
is_active INTEGER DEFAULT 1
created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
```

### location_assignments

**Row counts**: Old = 0, New = 0

**Schema changes**:
- Common fields: 5
- Removed fields: 7
- Added fields: 1

**Removed fields**: invoice_number, unit, from_location_id, to_location_id, reason, status, notes

**Added fields**: location_id

#### Old Schema

```
assignment_id INTEGER PRIMARY KEY
invoice_number TEXT NOT NULL
item_code TEXT NOT NULL
quantity REAL NOT NULL
unit TEXT NOT NULL
from_location_id INTEGER
to_location_id INTEGER NOT NULL
assigned_by TEXT NOT NULL
assigned_at TEXT NOT NULL
reason TEXT
status TEXT NOT NULL DEFAULT 'PENDING'
notes TEXT
```

#### New Schema

```
assignment_id INTEGER PRIMARY KEY
item_code TEXT NOT NULL
location_id INTEGER NOT NULL
quantity REAL DEFAULT 0
assigned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
assigned_by INTEGER
```

### Location Tables (location_master → storage_locations)

**location_master** (old): 10 rows

```
location_code TEXT PRIMARY KEY
location_name TEXT
location_name_fr TEXT
location_type TEXT
parent_location TEXT
capacity REAL
temperature_zone TEXT
is_active INTEGER
notes TEXT
created_at TEXT
```

**storage_locations** (new): 10 rows

```
location_id INTEGER PRIMARY KEY
location_name TEXT
location_type TEXT
parent_location_id INTEGER
capacity REAL
active INTEGER
created_at TIMESTAMP
updated_at TIMESTAMP
latitude REAL
longitude REAL
sequence INTEGER
```

