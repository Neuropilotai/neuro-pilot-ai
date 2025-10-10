# ✅ Weekly Owner Security Verification Checklist

**NeuroInnovate Inventory Enterprise v3.2.0**
**Owner:** neuro.pilot.ai@gmail.com
**Frequency:** Every Monday at 9:00 AM
**Duration:** ~15 minutes

---

## 📋 QUICK REFERENCE

**This Week's Date**: ____________

**Status**: ⬜ Not Started | 🟡 In Progress | ✅ Complete | ❌ Failed

**Overall Status**: _________ (Pass/Fail)

**Time Started**: __________
**Time Completed**: __________

---

## 1. CRITICAL SECURITY CHECKS (5 min)

### 1.1 Server Binding Verification

**Status**: ⬜

```bash
# Verify server is bound to localhost ONLY
lsof -i :8083 | grep LISTEN

# ✅ Expected output should contain: 127.0.0.1:8083
# ❌ If you see *:8083 or 0.0.0.0:8083, STOP and fix immediately!
```

**Result**: ________________

**Action if Failed**:
```bash
# Apply localhost binding fix
cd ~/neuro-pilot-ai/inventory-enterprise/backend
sed -i.bak 's/httpServer\.listen(PORT, async/httpServer.listen(PORT, '\''127.0.0.1'\'', async/' server.js
pm2 restart inventory-enterprise
```

---

### 1.2 External Connection Check

**Status**: ⬜

```bash
# Check for unauthorized external connections
PID=$(pgrep -f "node.*server.js" | head -1)
lsof -p "$PID" -i -P -n 2>/dev/null | grep ESTABLISHED | grep -v "127.0.0.1"

# ✅ Expected: No output (no external connections)
# ❌ If output exists, investigate immediately!
```

**Result**: ________________

**Action if Failed**:
1. Capture evidence: `lsof -p "$PID" -i -P > /tmp/leak_evidence_$(date +%Y%m%d).txt`
2. Kill server: `pm2 stop inventory-enterprise`
3. Run security scan: `node /tmp/scan_outbound_requests.js`
4. Review logs: `tail -100 logs/*.log`

---

### 1.3 Firewall Status

**Status**: ⬜

```bash
# Verify macOS Application Firewall is enabled
sudo /usr/libexec/ApplicationFirewall/socketfilterfw --getglobalstate

# ✅ Expected: "Firewall is enabled. (State = 1)"
# ❌ If disabled, enable immediately
```

**Result**: ________________

```bash
# Verify pf (packet filter) is running
sudo pfctl -s info | head -5

# ✅ Expected: "Status: Enabled"
```

**Result**: ________________

---

## 2. CODE INTEGRITY (3 min)

### 2.1 Run Outbound Request Scanner

**Status**: ⬜

```bash
cd ~/neuro-pilot-ai/inventory-enterprise/backend
node /tmp/scan_outbound_requests.js

# ✅ Expected: "✅ SCAN PASSED - NO ISSUES DETECTED"
# ⚠️  Warnings are OK if documented (LLM APIs, webhooks)
# ❌ Critical issues require immediate action
```

**Result**: ________________

**Critical Issues Found**: ____ (0 = Pass)
**Warnings Found**: ____ (Expected: 2-3 for LLM/webhooks)

---

### 2.2 Git Status Check

**Status**: ⬜

```bash
cd ~/neuro-pilot-ai/inventory-enterprise/backend
git status --porcelain | grep -E "\.js$" | grep -v "node_modules"

# ✅ Expected: No output (no uncommitted changes to source code)
# ⚠️  If changes exist, verify they are authorized
```

**Uncommitted Files**: ________________

**Action if Unexpected Changes**:
```bash
# View changes
git diff

# If unauthorized, revert
git checkout -- <file>
```

---

## 3. ACCESS CONTROL (2 min)

### 3.1 Audit Chain Verification

**Status**: ⬜

```bash
# Get authentication token
TOKEN=$(curl -s -X POST http://localhost:8083/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"neuro.pilot.ai@gmail.com","password":"Admin123!@#"}' \
  | jq -r '.accessToken')

# Verify audit chain integrity (if Super Console is deployed)
curl -s -X POST http://localhost:8083/api/super/audit/verify \
  -H "Authorization: Bearer $TOKEN" \
  -H "X-Device-ID: $DEVICE_ID" \
  -H "X-Device-Signature: $SIGNATURE" \
  -H "X-Request-Timestamp: $(date -u +%Y-%m-%dT%H:%M:%SZ)" \
  2>/dev/null | jq '.valid'

# ✅ Expected: true
# ❌ If false, audit log has been tampered with!
```

**Result**: ________________

---

### 3.2 Failed Login Attempts

**Status**: ⬜

```bash
# Check for failed login attempts (potential brute-force)
cd ~/neuro-pilot-ai/inventory-enterprise/backend
sqlite3 db/inventory_enterprise.db <<EOF
SELECT COUNT(*) as failed_attempts
FROM audit_logs
WHERE action_code = 'LOGIN_FAILED'
  AND created_at >= datetime('now', '-7 days');
EOF

# ✅ Expected: 0-5 (normal user errors)
# ⚠️  5-20 requires investigation
# ❌ >20 indicates potential attack
```

**Failed Attempts**: ____ (Last 7 days)

---

## 4. DATA PROTECTION (2 min)

### 4.1 Database File Permissions

**Status**: ⬜

```bash
# Verify database files are owner-only (600)
ls -la ~/neuro-pilot-ai/inventory-enterprise/backend/db/*.db

# ✅ Expected: -rw------- (600)
# ❌ If -rw-r--r-- or similar, fix immediately
```

**Permissions**: ________________

**Action if Failed**:
```bash
chmod 600 ~/neuro-pilot-ai/inventory-enterprise/backend/db/*.db
```

---

### 4.2 PDF Storage Permissions

**Status**: ⬜

```bash
# Verify PDF files are owner-only
find ~/neuro-pilot-ai/inventory-enterprise/backend/data/docs -type f -name "*.pdf" \
  -exec ls -l {} \; | head -5

# ✅ Expected: -rw------- (600) for all PDFs
```

**Permissions**: ________________

**Action if Failed**:
```bash
chmod -R 600 ~/neuro-pilot-ai/inventory-enterprise/backend/data/docs/**/*.pdf
```

---

## 5. NETWORK MONITORING (2 min)

### 5.1 Review Network Monitor Logs

**Status**: ⬜

```bash
# Check for security alerts
tail -50 /tmp/inventory_security_alerts.log 2>/dev/null

# ✅ Expected: No entries or old entries only
# ❌ Recent entries indicate unauthorized connections
```

**Alerts Found**: ____ (Last 7 days)

**Recent Alerts**:
```
__________________________________________
__________________________________________
__________________________________________
```

---

### 5.2 DNS Query Audit

**Status**: ⬜

```bash
# Check recent DNS queries (leak indicator)
sudo log show --predicate 'eventMessage contains "DNS"' --last 7d \
  | grep -i "node" | head -10

# ✅ Expected: Only npm registry, localhost, or known domains
# ⚠️  Unknown domains require investigation
```

**Suspicious Domains**: ________________

---

## 6. LLM & WEBHOOK AUDIT (2 min)

### 6.1 LLM API Calls (if INSIGHT_ENABLED=true)

**Status**: ⬜

```bash
# Review LLM payloads for data leaks
cd ~/neuro-pilot-ai/inventory-enterprise/backend
grep -E "LLM Request|api\.openai|api\.anthropic" logs/*.log \
  | tail -10

# ✅ Expected: Only aggregated metrics (counts, averages)
# ❌ If raw data (emails, item names) found, DISABLE immediately
```

**Data Leak Found**: ⬜ Yes / ⬜ No

**Action if Leak Found**:
```bash
# Disable LLM integration immediately
echo "INSIGHT_ENABLED=false" >> .env
pm2 restart inventory-enterprise
```

---

### 6.2 Webhook Deliveries

**Status**: ⬜

```bash
# Review webhook deliveries for suspicious destinations
cd ~/neuro-pilot-ai/inventory-enterprise/backend
sqlite3 db/inventory_enterprise.db <<EOF
SELECT
  w.url,
  COUNT(d.delivery_id) as deliveries,
  SUM(CASE WHEN d.status = 'sent' THEN 1 ELSE 0 END) as successful
FROM webhook_endpoints w
LEFT JOIN webhook_deliveries d ON w.webhook_id = d.webhook_id
WHERE d.sent_at >= datetime('now', '-7 days')
GROUP BY w.url
ORDER BY deliveries DESC;
EOF

# ✅ Expected: Only known webhook URLs
# ⚠️  Unknown URLs require investigation
```

**Suspicious Webhooks**: ________________

---

## 7. SYSTEM HEALTH (1 min)

### 7.1 Server Uptime

**Status**: ⬜

```bash
# Check server uptime
pm2 list | grep inventory-enterprise

# ✅ Expected: status "online", uptime > 1 day
# ⚠️  Frequent restarts indicate issues
```

**Uptime**: ________________
**Restarts (last 7 days)**: ________________

---

### 7.2 Disk Space

**Status**: ⬜

```bash
# Check available disk space
df -h ~/neuro-pilot-ai/inventory-enterprise/backend/data | tail -1

# ✅ Expected: >10GB free
# ⚠️  <5GB requires cleanup
# ❌ <1GB critical
```

**Free Space**: ________________ GB

---

## 8. COMPLIANCE & DOCUMENTATION (1 min)

### 8.1 Security Updates

**Status**: ⬜

```bash
# Check for npm security vulnerabilities
cd ~/neuro-pilot-ai/inventory-enterprise/backend
npm audit | head -20

# ✅ Expected: 0 vulnerabilities
# ⚠️  Low/Moderate: Review and update when convenient
# ❌ High/Critical: Update immediately
```

**Vulnerabilities**: ____ High, ____ Moderate, ____ Low

**Action if Critical Found**:
```bash
npm audit fix
pm2 restart inventory-enterprise
```

---

### 8.2 Backup Verification

**Status**: ⬜

```bash
# Verify Time Machine backup
tmutil latestbackup

# ✅ Expected: Recent timestamp (within 24 hours)
# ❌ Old timestamp or error requires immediate attention
```

**Last Backup**: ________________

---

## 9. FINAL VERIFICATION (30 sec)

### 9.1 Run Comprehensive Verification

**Status**: ⬜

```bash
# Run all-in-one verification script
bash /tmp/verify_firewall.sh

# ✅ Expected: All checks pass
```

**Pass/Fail**: ________________

---

## 10. WEEKLY SUMMARY

### 10.1 Checklist Results

| Check | Status | Notes |
|-------|--------|-------|
| 1. Server Binding | ⬜ | _____ |
| 2. External Connections | ⬜ | _____ |
| 3. Firewall Status | ⬜ | _____ |
| 4. Code Integrity | ⬜ | _____ |
| 5. Git Status | ⬜ | _____ |
| 6. Audit Chain | ⬜ | _____ |
| 7. Failed Logins | ⬜ | _____ |
| 8. Database Permissions | ⬜ | _____ |
| 9. PDF Permissions | ⬜ | _____ |
| 10. Network Alerts | ⬜ | _____ |
| 11. DNS Audit | ⬜ | _____ |
| 12. LLM Payloads | ⬜ | _____ |
| 13. Webhooks | ⬜ | _____ |
| 14. Server Uptime | ⬜ | _____ |
| 15. Disk Space | ⬜ | _____ |
| 16. Security Updates | ⬜ | _____ |
| 17. Backup Status | ⬜ | _____ |

**Overall Grade**: __________

✅ **PASS** (all checks passed, 0-2 warnings)
⚠️ **CAUTION** (3-5 warnings, no critical issues)
❌ **FAIL** (1+ critical issues)

---

### 10.2 Actions Required

**Critical Issues** (Fix immediately):
```
1. ___________________________________________
2. ___________________________________________
3. ___________________________________________
```

**Warnings** (Address this week):
```
1. ___________________________________________
2. ___________________________________________
3. ___________________________________________
```

**Notes/Observations**:
```
___________________________________________________
___________________________________________________
___________________________________________________
```

---

### 10.3 Sign-Off

**Completed By**: ___________________________

**Date**: ___________________________

**Signature**: ___________________________

**Next Review Due**: ___________________________ (Next Monday)

---

## 📞 EMERGENCY CONTACTS

**Critical Issue Found?**

1. **Stop server immediately**:
   ```bash
   pm2 stop inventory-enterprise
   ```

2. **Run emergency lockdown**:
   ```bash
   bash /tmp/emergency_shutdown.sh
   ```

3. **Collect evidence**:
   ```bash
   lsof -i -P | grep node > /tmp/evidence_$(date +%Y%m%d_%H%M%S).txt
   tail -500 logs/*.log >> /tmp/evidence_$(date +%Y%m%d_%H%M%S).txt
   ```

4. **Contact**: neuro.pilot.ai@gmail.com

---

## 📂 DOCUMENT STORAGE

**Save completed checklists to**:
```bash
~/neuro-pilot-ai/inventory-enterprise/security-audits/weekly/
```

**Naming Convention**:
```
weekly_checklist_YYYY-MM-DD.md
```

**Retention**: Keep for 1 year (52 weeks)

---

## 🔄 AUTOMATION (OPTIONAL)

### Create Weekly Reminder

```bash
# Add to crontab (runs every Monday at 9:00 AM)
(crontab -l 2>/dev/null; echo "0 9 * * 1 osascript -e 'display notification \"Time for weekly security audit!\" with title \"Security Checklist\" sound name \"Basso\"'") | crontab -
```

### Auto-Run Pre-Checks

```bash
# Create pre-check script
cat > /tmp/weekly_precheck.sh <<'EOF'
#!/bin/bash
# Automated pre-checks before manual review

echo "🔍 Running automated pre-checks..."
echo ""

# 1. Server binding
echo "1. Server Binding:"
lsof -i :8083 | grep 127.0.0.1 && echo "✅ PASS" || echo "❌ FAIL"

# 2. Firewall
echo ""
echo "2. Firewall:"
sudo /usr/libexec/ApplicationFirewall/socketfilterfw --getglobalstate | grep -q enabled && echo "✅ PASS" || echo "❌ FAIL"

# 3. Code scan
echo ""
echo "3. Outbound Request Scan:"
cd ~/neuro-pilot-ai/inventory-enterprise/backend
node /tmp/scan_outbound_requests.js > /tmp/scan_result.txt 2>&1
grep -q "SCAN PASSED" /tmp/scan_result.txt && echo "✅ PASS" || echo "❌ FAIL"

# 4. Git status
echo ""
echo "4. Git Status:"
git status --porcelain | grep -E "\.js$" | grep -v "node_modules" > /tmp/git_status.txt
[ -s /tmp/git_status.txt ] && echo "⚠️  Uncommitted changes" || echo "✅ PASS"

echo ""
echo "Pre-checks complete. Review full checklist in /tmp/WEEKLY_OWNER_CHECKLIST.md"
EOF

chmod +x /tmp/weekly_precheck.sh
```

**Run pre-checks**:
```bash
bash /tmp/weekly_precheck.sh
```

---

## 📊 METRICS TRACKING

### Monthly Summary

Track pass/fail rates over time:

```bash
# Generate monthly report
cat ~/neuro-pilot-ai/inventory-enterprise/security-audits/weekly/*.md \
  | grep "Overall Grade:" \
  | sort \
  | uniq -c

# Expected output:
#   4 Overall Grade: PASS
#   0 Overall Grade: CAUTION
#   0 Overall Grade: FAIL
```

---

**Checklist Version**: 1.0.0
**Last Updated**: 2025-10-09
**Owner**: neuro.pilot.ai@gmail.com
**Status**: 🟢 **ACTIVE**
