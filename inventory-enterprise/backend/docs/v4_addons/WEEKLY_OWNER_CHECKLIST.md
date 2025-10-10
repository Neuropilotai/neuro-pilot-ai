# NeuroInnovate Weekly Owner Checklist

**Recommended Schedule:** Every Monday morning (15-20 minutes)

**Owner:** David Mikulis
**Purpose:** Proactive system health monitoring, storage optimization, security validation

---

## 📊 System Health Review (5 minutes)

### Quick Health Check

```bash
cd ~/neuro-pilot-ai/inventory-enterprise/backend

# Get health score
node -e "
const SHM = require('./v4_addons/system_health');
const monitor = new SHM();
monitor.getHealthScore().then(s => {
  console.log('Health Score:', s.score + '/100 (Grade ' + s.grade + ')');
  if (s.issues.length > 0) {
    console.log('\nIssues:');
    s.issues.forEach(i => console.log('  ⚠️', i.message));
  } else {
    console.log('✅ All systems operational');
  }
});
"
```

**Expected:** Score ≥85/100, Grade A or B

**Action Items:**
- [ ] Health score ≥85? If not, review issues
- [ ] Any critical warnings? Document and schedule fix
- [ ] CPU usage <80%? Memory usage <85%?

---

## 💾 Smart Storage Optimization (5 minutes)

### Weekly Storage Scan

```bash
# Scan for inactive files
bash scripts/verify_v4_addons.sh --scan-storage
```

**Review Output:**
- Archive candidates count
- Potential space savings (MB)
- Protected files skipped
- Dependencies skipped

### Storage Statistics

```bash
# View archive stats
sqlite3 db/inventory_enterprise.db "
  SELECT
    COUNT(*) as total_archived,
    ROUND(SUM(file_size_bytes)/1048576, 1) as size_mb_archived,
    SUM(CASE WHEN is_hot = 1 THEN 1 ELSE 0 END) as hot_files,
    ROUND(AVG(recall_count), 1) as avg_recalls
  FROM file_archive_index;
"
```

**Action Items:**
- [ ] Review archive candidates list
- [ ] If ≥100MB savings available, proceed with archival:
  ```bash
  # Preview what will be archived
  bash scripts/verify_v4_addons.sh --archive-storage

  # If looks good, approve archival
  bash scripts/verify_v4_addons.sh --archive-storage --approve
  ```
- [ ] Check for "hot" files (recall_count ≥3) - these should stay local
- [ ] Verify Google Drive sync is active:
  ```bash
  ls "$HOME/Library/CloudStorage/GoogleDrive-neuro.pilot.ai@gmail.com/My Drive/Neuro.Pilot.AI/Archive/backend" | head -5
  ```

**Expected Results:**
- 40%+ cumulative space savings
- Zero restore failures
- Hot files correctly identified

---

## 🔐 Security & Audit Review (3 minutes)

### Audit Log Check

```bash
# Recent storage operations
sqlite3 db/inventory_enterprise.db "
  SELECT
    action,
    endpoint,
    CASE WHEN success = 1 THEN '✅' ELSE '❌' END as status,
    created_at
  FROM audit_logs
  WHERE event_type = 'STORAGE_OPERATION'
  ORDER BY created_at DESC
  LIMIT 10;
"
```

### Security Verification

```bash
# Verify localhost-only binding
lsof -i :8083 | grep LISTEN

# Check database permissions
ls -la db/inventory_enterprise.db | awk '{print $1}'
```

**Action Items:**
- [ ] All storage operations successful?
- [ ] No failed archival attempts?
- [ ] Server bound to 127.0.0.1 only?
- [ ] Database permissions: `-rw-------` (600)?

---

## 🤖 AI Performance Monitoring (Optional, 2 minutes)

### Forecast Accuracy

If v5 AI modules installed:

```bash
# Check AI optimizer metrics
curl -s http://localhost:8083/api/v5/ai/optimizer/performance | jq '.report.summary'
```

**Action Items:**
- [ ] Average MAPE ≤7%?
- [ ] Items meeting target ≥80%?
- [ ] Any items requiring retraining?

---

## 📈 Inventory System Health (2 minutes)

### Quick Database Check

```bash
# Count records
sqlite3 db/inventory_enterprise.db "
  SELECT 'Items' as type, COUNT(*) as count FROM inventory_items
  UNION ALL
  SELECT 'Orders', COUNT(*) FROM orders
  UNION ALL
  SELECT 'Archived Files', COUNT(*) FROM file_archive_index;
"
```

### Recent Activity

```bash
# Recent orders
sqlite3 db/inventory_enterprise.db "
  SELECT invoice_number, order_date, total_value
  FROM orders
  ORDER BY created_at DESC
  LIMIT 5;
"
```

**Action Items:**
- [ ] Inventory item count stable or growing appropriately?
- [ ] Recent orders processing correctly?
- [ ] No duplicate invoice numbers?

---

## 🔄 Backup Verification (1 minute)

### Verify Cloud Backup

```bash
# Check Google Drive archive size
du -sh "$HOME/Library/CloudStorage/GoogleDrive-neuro.pilot.ai@gmail.com/My Drive/Neuro.Pilot.AI/Archive"

# Check local database size
du -sh db/inventory_enterprise.db
```

**Action Items:**
- [ ] Google Drive archive growing as expected?
- [ ] Database file backed up to cloud?
- [ ] Can access archived files if needed?

---

## ✅ Weekly Completion Summary

```bash
# Generate weekly report
echo "=== NeuroInnovate Weekly Report $(date +%Y-%m-%d) ==="
echo ""
echo "System Health:"
node -e "require('./v4_addons/system_health').prototype.getHealthScore.call(new (require('./v4_addons/system_health'))()).then(s=>console.log('  Score: '+s.score+'/100'))"
echo ""
echo "Storage Statistics:"
sqlite3 db/inventory_enterprise.db "SELECT '  Archived: ' || COUNT(*) || ' files (' || ROUND(SUM(file_size_bytes)/1048576,1) || ' MB)' FROM file_archive_index;"
echo ""
echo "Recent Activity:"
sqlite3 db/inventory_enterprise.db "SELECT '  Orders (7d): ' || COUNT(*) FROM orders WHERE created_at > datetime('now', '-7 days');"
echo ""
echo "✅ Weekly review complete"
```

---

## 🚨 Alert Thresholds

**Immediate Action Required If:**
- Health score <70 (Grade D or F)
- CPU usage >90% sustained
- Memory usage >95%
- Storage operation failures >5%
- Database integrity check fails
- Archived file restore fails with checksum mismatch

**Investigation Required If:**
- Health score 70-84 (Grade C)
- Archive candidates >1000 files
- Hot file recalls >10 in a week
- Audit log shows unexpected STORAGE_OPERATION events
- Google Drive sync stopped or delayed

---

## 📝 Monthly Deep Dive (Once per month)

- Run full verification suite: `bash scripts/verify_v4_addons.sh`
- Review all documentation updates
- Test file restore process from Google Drive
- Verify compliance scores if v5 modules installed
- Review and prune very old archived files (>6 months unused, 0 recalls)

---

## 🔗 Quick Reference

**Documentation:**
- [Quick Start Guide](./QUICK_START_V4.md)
- [Architecture Overview](./V4_ARCHITECTURE_OVERVIEW.md)
- [Implementation Guide](./V4_IMPLEMENTATION_GUIDE.md)

**Key Commands:**
```bash
# Health check
bash scripts/verify_v4_addons.sh

# Storage scan
bash scripts/verify_v4_addons.sh --scan-storage

# Archive files
bash scripts/verify_v4_addons.sh --archive-storage --approve

# Restore file
bash scripts/verify_v4_addons.sh --restore <path>

# View statistics
sqlite3 db/inventory_enterprise.db "SELECT * FROM file_archive_index ORDER BY archived_date DESC LIMIT 10;"
```

---

**Status:** ✅ Active Checklist
**Version:** v5.1 with Smart Storage Guardian
**Last Updated:** 2025-10-10
**Owner:** David Mikulis
**Frequency:** Weekly (recommended Monday mornings)
