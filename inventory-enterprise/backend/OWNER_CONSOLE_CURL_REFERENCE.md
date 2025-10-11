# Owner Console - cURL Command Reference

Complete set of curl commands to test every endpoint used by the Owner Super Console.

## Setup

```bash
# Step 1: Login to get token
LOGIN_RESPONSE=$(curl -s -X POST http://127.0.0.1:8083/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"neuro.pilot.ai@gmail.com","password":"Admin123!@#"}')

# Step 2: Extract token
TOKEN=$(echo $LOGIN_RESPONSE | grep -o '"accessToken":"[^"]*"' | cut -d'"' -f4)

echo "Token: $TOKEN"
```

---

## Dashboard Tab

### System Health
```bash
curl -s http://127.0.0.1:8083/health | jq .
```

### Forecast Coverage
```bash
curl -s -H "Authorization: Bearer $TOKEN" \
  "http://127.0.0.1:8083/api/owner/forecast/daily" | jq .
```

### Stockout Risk
```bash
curl -s -H "Authorization: Bearer $TOKEN" \
  "http://127.0.0.1:8083/api/owner/forecast/stockout" | jq .
```

### Owner Dashboard
```bash
curl -s -H "Authorization: Bearer $TOKEN" \
  "http://127.0.0.1:8083/api/owner/dashboard" | jq .
```

### Last AI Training
```bash
curl -s -H "Authorization: Bearer $TOKEN" \
  "http://127.0.0.1:8083/api/owner/forecast/comments?limit=1&applied=true" | jq .
```

---

## Inventory Tab

### List Items (Paginated)
```bash
curl -s -H "Authorization: Bearer $TOKEN" \
  "http://127.0.0.1:8083/api/inventory/items?page=1&limit=25" | jq .
```

### Search Items
```bash
curl -s -H "Authorization: Bearer $TOKEN" \
  "http://127.0.0.1:8083/api/inventory/items?search=apple" | jq .
```

### Get Item Details
```bash
curl -s -H "Authorization: Bearer $TOKEN" \
  "http://127.0.0.1:8083/api/inventory/items?item_code=APPLE" | jq .
```

---

## Locations Tab

### List All Locations
```bash
curl -s -H "Authorization: Bearer $TOKEN" \
  "http://127.0.0.1:8083/api/owner/console/locations" | jq .
```

### Filter Inventory by Location
```bash
curl -s -H "Authorization: Bearer $TOKEN" \
  "http://127.0.0.1:8083/api/inventory/items?location=COOLER-1" | jq .
```

### Update Location (PATCH)
```bash
curl -s -X PATCH -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"location_name":"Updated Name","sequence":5}' \
  "http://127.0.0.1:8083/api/owner/console/locations/LOC-123" | jq .
```

---

## PDFs Tab

### List All PDFs
```bash
curl -s -H "Authorization: Bearer $TOKEN" \
  "http://127.0.0.1:8083/api/owner/pdfs?status=all" | jq .
```

### List Unprocessed PDFs Only
```bash
curl -s -H "Authorization: Bearer $TOKEN" \
  "http://127.0.0.1:8083/api/owner/pdfs?status=unprocessed" | jq .
```

### List Processed PDFs Only
```bash
curl -s -H "Authorization: Bearer $TOKEN" \
  "http://127.0.0.1:8083/api/owner/pdfs?status=processed" | jq .
```

### Filter PDFs by Cutoff Date
```bash
curl -s -H "Authorization: Bearer $TOKEN" \
  "http://127.0.0.1:8083/api/owner/pdfs?status=unprocessed&cutoff=2025-10-01" | jq .
```

### Preview/Stream PDF
```bash
curl -s -H "Authorization: Bearer $TOKEN" \
  "http://127.0.0.1:8083/api/owner/pdfs/123/preview" \
  -o /tmp/invoice.pdf
```

### Mark PDFs as Processed (Bulk)
```bash
curl -s -X POST -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "invoiceIds": [123, 456, 789],
    "countId": "count_1234567890_abcd1234",
    "processedAt": "2025-10-10T10:00:00Z"
  }' \
  "http://127.0.0.1:8083/api/owner/pdfs/mark-processed" | jq .
```

### Search PDFs
```bash
curl -s -H "Authorization: Bearer $TOKEN" \
  "http://127.0.0.1:8083/api/owner/console/pdfs/search?q=9018357843&limit=20" | jq .
```

---

## Count Tab

### Start New Count
```bash
curl -s -X POST -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "startingLocationId": "COOLER-1",
    "notes": "Monthly inventory count"
  }' \
  "http://127.0.0.1:8083/api/owner/console/counts/start" | jq .
```

### Add Item to Count
```bash
COUNT_ID="count_1234567890_abcd1234"

curl -s -X POST -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "itemCode": "APPLE-FUJI",
    "quantity": 50,
    "locationId": "COOLER-1",
    "notes": "Fresh stock"
  }' \
  "http://127.0.0.1:8083/api/owner/console/counts/$COUNT_ID/add-item" | jq .
```

### Attach PDF to Count
```bash
curl -s -X POST -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "documentId": 123,
    "invoiceNumber": "9018357843",
    "notes": "Weekly delivery"
  }' \
  "http://127.0.0.1:8083/api/owner/console/counts/$COUNT_ID/attach-pdf" | jq .
```

### Get Count Details
```bash
curl -s -H "Authorization: Bearer $TOKEN" \
  "http://127.0.0.1:8083/api/owner/console/counts/$COUNT_ID" | jq .
```

### Close Count
```bash
curl -s -X POST -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"notes": "Count complete - verified all items"}' \
  "http://127.0.0.1:8083/api/owner/console/counts/$COUNT_ID/close" | jq .
```

---

## AI Console Tab

### Reorder Recommendations (Top N)
```bash
curl -s -H "Authorization: Bearer $TOKEN" \
  "http://127.0.0.1:8083/api/owner/ai/reorder/top?n=10" | jq .
```

### Anomaly Watchlist
```bash
curl -s -H "Authorization: Bearer $TOKEN" \
  "http://127.0.0.1:8083/api/owner/ai/anomalies/recent?window=7d" | jq .
```

### System Upgrade Advisor
```bash
curl -s -H "Authorization: Bearer $TOKEN" \
  "http://127.0.0.1:8083/api/owner/ai/upgrade/advice" | jq .
```

### Submit Feedback Comment
```bash
curl -s -X POST -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "comment": "coffee 1.5 cups per person",
    "source": "owner_console"
  }' \
  "http://127.0.0.1:8083/api/owner/forecast/comment" | jq .
```

### Train AI (Apply All Pending Comments)
```bash
curl -s -X POST -H "Authorization: Bearer $TOKEN" \
  "http://127.0.0.1:8083/api/owner/forecast/train" | jq .
```

### Train AI (Specific Comment)
```bash
COMMENT_ID=123

curl -s -X POST -H "Authorization: Bearer $TOKEN" \
  "http://127.0.0.1:8083/api/owner/forecast/train/$COMMENT_ID" | jq .
```

### Get Feedback History
```bash
curl -s -H "Authorization: Bearer $TOKEN" \
  "http://127.0.0.1:8083/api/owner/forecast/comments?limit=50" | jq .
```

### Get Pending Comments Only
```bash
curl -s -H "Authorization: Bearer $TOKEN" \
  "http://127.0.0.1:8083/api/owner/forecast/comments?applied=false&limit=50" | jq .
```

### Get Applied Comments Only
```bash
curl -s -H "Authorization: Bearer $TOKEN" \
  "http://127.0.0.1:8083/api/owner/forecast/comments?applied=true&limit=50" | jq .
```

---

## Forecast Tab

### Get Population Stats
```bash
curl -s -H "Authorization: Bearer $TOKEN" \
  "http://127.0.0.1:8083/api/owner/forecast/population" | jq .
```

### Update Population
```bash
curl -s -X POST -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "total_count": 275,
    "indian_count": 12
  }' \
  "http://127.0.0.1:8083/api/owner/forecast/population" | jq .
```

### Daily Forecast (All Predictions)
```bash
curl -s -H "Authorization: Bearer $TOKEN" \
  "http://127.0.0.1:8083/api/owner/forecast/daily" | jq .
```

### Breakfast Demand
```bash
curl -s -H "Authorization: Bearer $TOKEN" \
  "http://127.0.0.1:8083/api/owner/forecast/breakfast" | jq .
```

### Beverage Demand
```bash
curl -s -H "Authorization: Bearer $TOKEN" \
  "http://127.0.0.1:8083/api/owner/forecast/beverage" | jq .
```

### Stockout Forecast (With Risk Levels)
```bash
curl -s -H "Authorization: Bearer $TOKEN" \
  "http://127.0.0.1:8083/api/owner/forecast/stockout" | jq .
```

### Update Breakfast Profile
```bash
curl -s -X POST -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "bread_slices_per_person": 2.5,
    "eggs_per_person": 1.5,
    "bacon_strips_per_person": 2
  }' \
  "http://127.0.0.1:8083/api/owner/forecast/breakfast/profile" | jq .
```

### Update Beverage Profile
```bash
curl -s -X POST -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "coffee_cups_per_person": 1.5,
    "creamer_oz_per_cup": 0.6,
    "milk_oz_per_person": 4
  }' \
  "http://127.0.0.1:8083/api/owner/forecast/beverage/profile" | jq .
```

### Calculate Beverage Demands (Custom)
```bash
curl -s -H "Authorization: Bearer $TOKEN" \
  "http://127.0.0.1:8083/api/owner/forecast/beverage/calculate?population=300&coffee_cups_per_person=1.8" | jq .
```

---

## Settings Tab

### Get Metrics (Prometheus Format)
```bash
curl -s http://127.0.0.1:8083/metrics
```

### Get Metrics (JSON via API)
```bash
curl -s http://127.0.0.1:8083/api/metrics
```

### Get Console Session Info
```bash
curl -s -H "Authorization: Bearer $TOKEN" \
  "http://127.0.0.1:8083/api/owner/console/session" | jq .
```

### Get AI Status Summary
```bash
curl -s -H "Authorization: Bearer $TOKEN" \
  "http://127.0.0.1:8083/api/owner/console/ai/status" | jq .
```

---

## Testing Workflows

### Complete Month-End Workflow
```bash
# 1. Start count
COUNT_RESPONSE=$(curl -s -X POST -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"notes":"Month-end count"}' \
  "http://127.0.0.1:8083/api/owner/console/counts/start")

COUNT_ID=$(echo $COUNT_RESPONSE | jq -r '.countId')
echo "Started count: $COUNT_ID"

# 2. Add item
curl -s -X POST -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"itemCode":"APPLE","quantity":100}' \
  "http://127.0.0.1:8083/api/owner/console/counts/$COUNT_ID/add-item" | jq .

# 3. Attach PDF
curl -s -X POST -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"documentId":123,"invoiceNumber":"9018357843"}' \
  "http://127.0.0.1:8083/api/owner/console/counts/$COUNT_ID/attach-pdf" | jq .

# 4. Get count details (process panel)
curl -s -H "Authorization: Bearer $TOKEN" \
  "http://127.0.0.1:8083/api/owner/console/counts/$COUNT_ID" | jq .

# 5. Close count
curl -s -X POST -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"notes":"Verified all items"}' \
  "http://127.0.0.1:8083/api/owner/console/counts/$COUNT_ID/close" | jq .
```

### Complete AI Training Workflow
```bash
# 1. Submit feedback
curl -s -X POST -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"comment":"coffee 2 cups per person","source":"owner_console"}' \
  "http://127.0.0.1:8083/api/owner/forecast/comment" | jq .

# 2. Train AI
TRAIN_RESPONSE=$(curl -s -X POST -H "Authorization: Bearer $TOKEN" \
  "http://127.0.0.1:8083/api/owner/forecast/train")

echo $TRAIN_RESPONSE | jq .

# 3. Check updated forecast
curl -s -H "Authorization: Bearer $TOKEN" \
  "http://127.0.0.1:8083/api/owner/forecast/daily" | jq .
```

---

## Quick Test Script

Save as `test_console_endpoints.sh`:

```bash
#!/bin/bash
set -e

# Login
LOGIN=$(curl -s -X POST http://127.0.0.1:8083/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"neuro.pilot.ai@gmail.com","password":"Admin123!@#"}')

TOKEN=$(echo $LOGIN | jq -r '.accessToken')

echo "Testing all endpoints..."
echo ""

# Dashboard
echo "1. Dashboard"
curl -s -H "Authorization: Bearer $TOKEN" "http://127.0.0.1:8083/api/owner/dashboard" | jq -r '.success'

# Inventory
echo "2. Inventory"
curl -s -H "Authorization: Bearer $TOKEN" "http://127.0.0.1:8083/api/inventory/items?limit=1" | jq -r '.success // "ok"'

# Locations
echo "3. Locations"
curl -s -H "Authorization: Bearer $TOKEN" "http://127.0.0.1:8083/api/owner/console/locations" | jq -r '.total'

# PDFs
echo "4. PDFs"
curl -s -H "Authorization: Bearer $TOKEN" "http://127.0.0.1:8083/api/owner/pdfs?status=all" | jq -r '.success'

# AI
echo "5. AI Reorder"
curl -s -H "Authorization: Bearer $TOKEN" "http://127.0.0.1:8083/api/owner/ai/reorder/top?n=5" | jq -r '.success'

echo "6. AI Anomalies"
curl -s -H "Authorization: Bearer $TOKEN" "http://127.0.0.1:8083/api/owner/ai/anomalies/recent?window=7d" | jq -r '.success'

echo "7. AI Upgrade"
curl -s -H "Authorization: Bearer $TOKEN" "http://127.0.0.1:8083/api/owner/ai/upgrade/advice" | jq -r '.success'

# Forecast
echo "8. Forecast Daily"
curl -s -H "Authorization: Bearer $TOKEN" "http://127.0.0.1:8083/api/owner/forecast/daily" | jq -r '.success'

echo "9. Forecast Stockout"
curl -s -H "Authorization: Bearer $TOKEN" "http://127.0.0.1:8083/api/owner/forecast/stockout" | jq -r '.success'

echo ""
echo "✅ All endpoints tested"
```

---

**Version**: 3.2.0
**Last Updated**: 2025-10-10
