# Owner Super Console - Quick Start Guide

## 🚀 One-Line Launch

```bash
# Access console (server must be running on port 8083)
open http://127.0.0.1:8083/owner-super-console.html
```

**Login**: `neuro.pilot.ai@gmail.com` / `Admin123!@#`

---

## 📋 Daily Workflows

### Morning Routine (5 minutes)

1. **Dashboard** → Check system health & stockout count
2. **Forecast** → Adjust population if needed (±25 people chips)
3. **AI Console** → Review reorder recommendations
4. **Inventory** → Spot-check critical items

### Month-End Count (15 minutes)

1. **Count Tab** → Click "Start Count"
2. **Inventory Tab** → Spot-check items (adds to active count)
3. **PDFs Tab** → Select unprocessed invoices
4. **PDFs Tab** → Click "Include in Count"
5. **Count Tab** → Review process panel → Close count

### AI Training Session (3 minutes)

1. **AI Console** → Enter feedback: `"coffee 1.5 cups/person"`
2. Click **Submit Feedback**
3. Click **Train Now** (applies immediately)
4. **Forecast Tab** → Refresh to see updated predictions

---

## 🎯 Tab Reference

| Tab | Purpose | Key Actions |
|-----|---------|-------------|
| 📊 **Dashboard** | System overview | View health, forecast coverage, stockout risk |
| 📦 **Inventory** | Item management | Search, paginate, spot-check |
| 📍 **Locations** | Storage mapping | List locations, filter items |
| 📄 **PDFs** | Invoice processing | View PDFs, mark as processed, month-end inclusion |
| 🔢 **Count** | Physical inventory | Start count, add items, attach PDFs, close |
| 🤖 **AI Console** | Intelligence layer | Reorder recs, anomalies, feedback, training |
| 📈 **Forecast** | Demand predictions | Adjust population, view predictions, alerts |
| ⚙️ **Settings** | Owner controls | Device binding, export CSV, audit info |

---

## 🔑 Keyboard Shortcuts

- **Tab**: Navigate between fields
- **Enter**: Submit forms / Confirm actions
- **Esc**: Close modals
- **Ctrl+F**: Search (browser native)
- **F5**: Refresh current tab data

---

## 🛠️ Common Tasks

### Spot Check an Item
1. Go to **Inventory** tab
2. Search for item by code/name
3. Click **Spot Check** button next to item
4. Enter counted quantity → OK
5. Item added to active count (if one exists)

### View a PDF Invoice
1. Go to **PDFs** tab
2. Click **👁️ View** button
3. PDF opens in modal
4. Use browser zoom controls
5. Click **✕ Close** or press Esc

### Include Invoices in Count
1. Start a count in **Count** tab
2. Go to **PDFs** tab
3. Check boxes next to unprocessed PDFs
4. Click **✓ Include in Count**
5. Enter count ID → Confirm
6. PDFs now show "Included" badge

### Submit AI Feedback
1. Go to **AI Console** tab
2. Type natural language: `"eggs 2 per person for breakfast"`
3. Click **💬 Submit Feedback**
4. Click **🚀 Train Now** to apply immediately
5. Check **📜 History** to see applied/pending comments

### Adjust Population
1. Go to **Forecast** tab
2. Click quick chips (±25 people, ±5 Indian)
3. Or enter exact values in input fields → **💾 Update**
4. Forecast refreshes automatically

### Export Forecast Data
1. Go to **Settings** tab
2. Click **📥 Export Daily Summary CSV**
3. CSV downloads with all predictions
4. Open in Excel/Sheets

---

## ⚠️ Troubleshooting

### "Owner re-auth required" message
→ Token expired (15min TTL). Click OK, you'll be redirected to login.

### Empty states / "No data found"
→ Normal if database tables empty. Console handles gracefully with fallbacks.

### PDF won't open
→ Check document ID is correct. Ensure PDF exists in documents table.

### Count won't close
→ Review process panel first. Must have at least one item. Click **Confirm & Close**.

### Token TTL warning (red)
→ Less than 2 minutes remaining. Save work and refresh token via middleware.

---

## 📊 Performance Tips

1. **Warm Cache** (Settings): Enable for faster forecast loads
2. **Pagination**: Use 25 items/page for optimal load time
3. **Tab Switching**: Data cached, no refetch needed
4. **CSV Export**: Client-side, no server load
5. **PDF Streaming**: Range requests for fast preview

---

## 🔒 Security Notes

- Localhost-only (127.0.0.1:8083)
- RequireOwner middleware on all routes
- JWT token required in Authorization header
- 401/403 triggers re-auth
- No external network calls
- Device binding in localStorage

---

## 📞 Support

For issues or questions:
1. Check browser console (F12) for errors
2. Review server logs: `/tmp/server-fixed.log`
3. Run smoke tests: `./test_owner_super_console.sh`
4. Check changelog: `OWNER_CONSOLE_CHANGELOG.md`

---

## 🎓 Advanced Features

### Multi-Select PDFs
- Hold Shift to select range
- Hold Ctrl/Cmd to select multiple
- "Select All" checkbox in header

### Process Panel (Count Close)
- Shows all items before final close
- Click PDF names to preview
- Confirm/Cancel prevents accidents
- Creates immutable snapshot

### AI Widget Refresh
- Auto-refresh every 60 seconds
- Manual refresh: Click ↻ button
- Shows latency in milliseconds

### Token Auto-Refresh
- Middleware handles refresh if configured
- TTL countdown warns at 2min
- Automatic logout at 0

---

**Version**: 3.2.0
**Last Updated**: 2025-10-10
**Status**: Production Ready ✅
