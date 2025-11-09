# Neuro.Pilot.AI Commissary POS

**Complete Point of Sale system for camp commissary operations**

Version: V21.1
Status: ✅ Production Ready

---

## Overview

The POS system replaces Clover for commissary sales with:

- **Cash & External Card** payments (pluggable PSP ready)
- **Zero mock data** - all endpoints live
- **Inventory-aware sales** - automatic stock decrements
- **Tax & discount engine** - server-side calculation
- **Shift register control** - opening/closing with X/Z reports
- **PDF exports** - Z reports and sales summaries
- **Offline queue** - network resilience with retry logic

---

## Quick Start

### 1. Database Setup

Run migrations (idempotent, safe to re-run):

```bash
# Connect to your PostgreSQL database
psql $DATABASE_URL

# Run POS migrations
\i inventory-enterprise/backend/db/migrations/011_pos_core.sql
\i inventory-enterprise/backend/db/migrations/012_pos_inventory.sql

# Verify tables created
\dt pos_*
```

### 2. Start Server

```bash
cd inventory-enterprise/backend
node server-v21_1.js
```

Server will mount POS routes at:
- `/api/pos/catalog`
- `/api/pos/registers`
- `/api/pos/orders`
- `/api/pos/payments`
- `/api/pos/reports`
- `/api/pdfs/pos`

### 3. Open POS Interface

```bash
# Serve the POS frontend
open public/pos.html
```

Or access via deployed backend:
`https://inventory-backend-7-agent-build.up.railway.app/pos.html`

### 4. Run Smoke Tests

```bash
# Test all POS endpoints
./scripts/smoke-test-pos.sh

# With custom credentials
EMAIL=admin@example.com PASS=secret ./scripts/smoke-test-pos.sh
```

---

## API Endpoints

All endpoints require JWT authentication (minimum role: `staff`).

### Catalog

**GET /api/pos/catalog**
Get sellable items and recipes

Query params:
- `search` - Text search
- `category` - Filter by category
- `limit` - Results per page (default: 100)
- `offset` - Pagination offset
- `markup` - Recipe price markup multiplier (default: 1.30)

```bash
curl -H "Authorization: Bearer $TOKEN" \
  "https://your-api.com/api/pos/catalog?search=apple&limit=10"
```

Response:
```json
{
  "success": true,
  "data": {
    "items": [
      {
        "kind": "item",
        "sku": "APPL-GRSMITH",
        "name": "Apple - Granny Smith",
        "category": "Produce",
        "uom": "EA",
        "price_cents": 125,
        "vendor": "Sysco",
        "in_stock": true
      }
    ],
    "recipes": [
      {
        "kind": "recipe",
        "code": "SANDWICH-HAM",
        "name": "Ham & Cheese Sandwich",
        "category": "Prepared Foods",
        "portion_size": 1,
        "portion_uom": "EA",
        "cost_cents": 350,
        "price_cents": 455
      }
    ]
  }
}
```

**GET /api/pos/catalog/quick**
Get quick-access tiles (most popular items)

**PUT /api/pos/catalog/quick**
Update quick tiles configuration

### Registers & Shifts

**GET /api/pos/registers/registers**
List all cash registers

**POST /api/pos/registers/registers**
Create new register

```bash
curl -X POST -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"Front Desk","device_id":"REG-001"}' \
  https://your-api.com/api/pos/registers/registers
```

**POST /api/pos/registers/shifts/open**
Open new shift (enforces one open shift per register)

```bash
curl -X POST -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"register_id":1,"opening_float_cents":10000}' \
  https://your-api.com/api/pos/registers/shifts/open
```

**POST /api/pos/registers/shifts/close**
Close shift and generate Z report

```bash
curl -X POST -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"shift_id":123,"closing_cash_cents":15000,"notes":"All good"}' \
  https://your-api.com/api/pos/registers/shifts/close
```

**GET /api/pos/registers/shifts/current?register_id=1**
Get current open shift for register

### Orders

**POST /api/pos/orders**
Create new order

```bash
curl -X POST -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"shift_id":123}' \
  https://your-api.com/api/pos/orders
```

**POST /api/pos/orders/:orderId/line**
Add line item to order

```bash
curl -X POST -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"kind":"item","sku_or_code":"APPL-GRSMITH","qty":2}' \
  https://your-api.com/api/pos/orders/456/line
```

**DELETE /api/pos/orders/:orderId/line/:lineId**
Remove line item

**POST /api/pos/orders/:orderId/discount**
Apply discount to order

```bash
curl -X POST -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"type":"percent","value":10}' \
  https://your-api.com/api/pos/orders/456/discount
```

**POST /api/pos/orders/:orderId/void**
Void unpaid order

**GET /api/pos/orders/:orderId**
Get order details with lines and payments

### Payments

**POST /api/pos/payments/:orderId/capture**
Capture payment (cash or external card)

```bash
# Cash payment
curl -X POST -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"method":"cash","amount_cents":1000}' \
  https://your-api.com/api/pos/payments/456/capture

# External card payment
curl -X POST -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"method":"external_card","amount_cents":1000,"ref":"VISA-1234"}' \
  https://your-api.com/api/pos/payments/456/capture
```

When order is fully paid, inventory decrements automatically via database trigger.

**POST /api/pos/payments/:orderId/refund**
Refund payment

```bash
curl -X POST -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"amount_cents":500,"reason":"Customer complaint"}' \
  https://your-api.com/api/pos/payments/456/refund
```

### Reports

**GET /api/pos/reports/x?shift_id=123**
Generate X report (running shift totals)

Response includes:
- Gross sales, discounts, tax, net sales
- Payment method breakdown (cash/card)
- Tax breakdown by rate
- Top selling items

**GET /api/pos/reports/z/:shiftId**
Get Z report for closed shift

**GET /api/pos/reports/sales**
Get sales data with filters

Query params:
- `from_date` - Start date (YYYY-MM-DD)
- `to_date` - End date (YYYY-MM-DD)
- `register_id` - Filter by register (optional)
- `limit` / `offset` - Pagination

**GET /api/pos/reports/sales/export**
Export sales data as CSV

### PDFs

**POST /api/pdfs/pos/z-report**
Generate Z report PDF

```bash
curl -X POST -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"shift_id":123}' \
  https://your-api.com/api/pdfs/pos/z-report \
  --output z-report.pdf
```

**POST /api/pdfs/pos/sales-summary**
Generate sales summary PDF

```bash
curl -X POST -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"from_date":"2025-01-01","to_date":"2025-01-31"}' \
  https://your-api.com/api/pdfs/pos/sales-summary \
  --output sales-summary.pdf
```

---

## Inventory Integration

When an order is marked as **paid**, inventory is automatically decremented:

### Direct Items
```sql
-- Order line: kind='item', sku='APPL-GRSMITH', qty=2
-- Result: items.qty_on_hand decremented by 2 for 'APPL-GRSMITH'
```

### Recipes (BOM Expansion)
```sql
-- Order line: kind='recipe', code='SANDWICH-HAM', qty=1
-- Recipe ingredients:
--   - BREAD-WHITE: 2 slices
--   - HAM-SLICED: 3 oz
--   - CHEESE-CHEDDAR: 1 oz
-- Result: All ingredient SKUs decremented by recipe qty * BOM qty
```

### Tracking

All inventory decrements are logged in `pos_inventory_deltas` table:

```sql
SELECT
  item_sku,
  SUM(delta_qty) as total_sold,
  COUNT(DISTINCT order_id) as order_count
FROM pos_inventory_deltas
WHERE applied_at >= '2025-01-01'
GROUP BY item_sku
ORDER BY total_sold DESC;
```

---

## Tax & Discount Engine

### Taxes

Configured in `pos_taxes` table:

```sql
INSERT INTO pos_taxes (org_id, site_id, name, rate_pct, scope)
VALUES (1, 1, 'Sales Tax', 8.50, 'all');
```

- `scope='all'` - Applies to all items and recipes
- `scope='item'` - Items only
- `scope='recipe'` - Recipes only

Multiple tax rates are cumulative (e.g., state + local).

### Discounts

Configured in `pos_discounts` table:

```sql
INSERT INTO pos_discounts (org_id, site_id, name, type, value, code)
VALUES (1, 1, 'Summer Sale', 'percent', 15, 'SUMMER15');
```

- `type='percent'` - Percentage discount (value = 15 for 15%)
- `type='fixed'` - Fixed amount (value in dollars, converted to cents)

Apply via API: `POST /api/pos/orders/:orderId/discount`

---

## Shift Operations

### Opening a Shift

1. Create register (once): `POST /api/pos/registers/registers`
2. Open shift: `POST /api/pos/registers/shifts/open`
3. Record opening cash float (e.g., $100.00 = 10000 cents)

Only **one open shift** per register at a time.

### During Shift

- Create orders, add lines, capture payments
- View running totals: `GET /api/pos/registers/shifts/current?register_id=1`
- Generate X report anytime: `GET /api/pos/reports/x?shift_id=123`

### Closing a Shift

1. Count cash drawer
2. Close shift: `POST /api/pos/registers/shifts/close`
3. System generates Z report with:
   - Sales totals
   - Tender breakdown
   - Expected vs actual cash
   - Over/short calculation
4. Z report number auto-increments per register

---

## Keyboard Shortcuts (Frontend)

| Key | Action |
|-----|--------|
| `/` | Focus barcode field |
| `Ctrl+P` | Open payment panel |
| `Ctrl+D` | Apply discount |
| `Ctrl+V` | Void current order |
| `Ctrl+X` | Generate X report |
| `Ctrl+Z` | Close shift (Z report) |
| `Ctrl+N` | New order |
| `Esc` | Close modals |

---

## Offline Mode

The POS frontend supports offline operation:

1. **Catalog Cached** - Items/recipes stored in IndexedDB
2. **Queue Requests** - Failed API calls queued automatically
3. **Auto-Retry** - Exponential backoff retry on reconnect
4. **Visual Status** - Online/Offline pill indicator

Network status: `navigator.onLine` + heartbeat ping to `/health`

---

## Audit & Compliance

All POS operations are logged in `pos_audit_log`:

```sql
SELECT
  event_type,
  user_id,
  details,
  ip_address,
  created_at
FROM pos_audit_log
WHERE org_id = 1
ORDER BY created_at DESC
LIMIT 100;
```

Event types:
- `OPEN_SHIFT` / `CLOSE_SHIFT`
- `ORDER_CREATE` / `ORDER_LINE_ADD` / `ORDER_VOID`
- `PAYMENT_CAPTURE` / `PAYMENT_REFUND`
- `X_REPORT` / `Z_REPORT` / `Z_REPORT_PDF`

---

## Deployment Checklist

- ✅ PostgreSQL 14+ provisioned
- ✅ Migrations run (011, 012)
- ✅ Environment variables set (DATABASE_URL, JWT_SECRET)
- ✅ Server running with POS routes mounted
- ✅ Frontend accessible (pos.html served or deployed)
- ✅ Test credentials created
- ✅ Smoke tests passing
- ✅ Registers created
- ✅ Tax rates configured
- ✅ Opening shift completed successfully

---

## Support & Troubleshooting

### Common Issues

**"Shift already has an open shift"**
- Only one shift can be open per register
- Close existing shift or use that shift ID

**"Order not found or not open"**
- Order may be void or already paid
- Create new order for current shift

**"Inventory not decremented"**
- Check `pos_inventory_deltas` table for entries
- Verify trigger fired: `SELECT * FROM pg_trigger WHERE tgname = 'pos_order_paid_inventory'`

**"PDF generation fails"**
- Ensure `pdfkit` package installed: `npm list pdfkit`
- Check shift is closed before requesting Z report PDF

### Logs

```bash
# Server logs
tail -f logs/server.log

# Audit logs (database)
SELECT * FROM pos_audit_log WHERE created_at > NOW() - INTERVAL '1 hour';

# Metrics
curl http://localhost:8080/metrics | grep pos_
```

---

## License

Copyright © 2025 Neuro.Pilot.AI
All rights reserved.

---

**Happy Selling! 🛒💰**
