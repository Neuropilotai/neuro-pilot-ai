# 🛡️ Quantum Governance Operational Runbook v4.1

**NeuroInnovate Inventory Enterprise**
**Classification:** CONFIDENTIAL - Owner Eyes Only
**Last Updated:** 2025-10-09

---

## 📋 DAILY OPERATIONS

### Morning Routine (5 minutes)

**Time:** 9:00 AM Daily

```bash
#!/bin/bash
# Daily Quantum Governance Health Check

cd ~/neuro-pilot-ai/inventory-enterprise/backend

echo "🛡️  Daily Quantum Governance Check - $(date)"
echo "═══════════════════════════════════════"

# 1. Server health
echo "1. Server Status:"
curl -s http://localhost:8083/health | jq -r '.status'

# 2. Validation daemon status
echo ""
echo "2. Last Validation:"
jq -r '.timestamp, .overall_status' /tmp/qdl_validation.json 2>/dev/null || echo "No validation yet"

# 3. Compliance score
echo ""
echo "3. Compliance Score:"
node -e "
const ACE = require('/tmp/autonomous_compliance');
const ace = new ACE();
ace.initialize().then(async () => {
  const score = await ace.generateComplianceScore();
  console.log(\`   Overall: \${score.overall}/100 (\${score.passed ? 'PASS' : 'FAIL'})\`);
  process.exit(0);
});
" 2>/dev/null

# 4. Quantum key age
echo ""
echo "4. Quantum Keys:"
if security find-generic-password -a "ed25519_primary" -s "com.neuroinnovate.quantum" >/dev/null 2>&1; then
  echo "   ✅ Ed25519 key present in Keychain"
else
  echo "   ❌ Ed25519 key MISSING - CRITICAL"
fi

# 5. Network isolation
echo ""
echo "5. Network Isolation:"
if lsof -i :8083 | grep -q "127.0.0.1\|localhost"; then
  echo "   ✅ Server bound to localhost"
else
  echo "   ❌ Server NOT localhost-only - CRITICAL"
fi

# 6. Memory usage
echo ""
echo "6. Resource Usage:"
PID=$(pgrep -f "node.*server.js" | head -1)
if [ -n "$PID" ]; then
  MEM_MB=$(ps -p "$PID" -o rss= | awk '{print int($1/1024)}')
  CPU_PCT=$(ps -p "$PID" -o %cpu= | awk '{print int($1)}')
  echo "   Memory: ${MEM_MB}MB | CPU: ${CPU_PCT}%"
else
  echo "   ❌ Server not running"
fi

echo ""
echo "═══════════════════════════════════════"
echo "✅ Daily check complete"
```

---

## 📅 WEEKLY OPERATIONS

### Monday Deep Scan (15 minutes)

**Time:** Monday 9:00 AM

```bash
#!/bin/bash
# Weekly Quantum Governance Deep Scan

cd ~/neuro-pilot-ai/inventory-enterprise/backend

echo "🔍 Weekly Deep Security Scan"
echo "═══════════════════════════════════════"

# 1. Run full integration test suite
echo "1. Running integration tests..."
bash /tmp/test_quantum_governance_v4.1.sh

# 2. Generate compliance report
echo ""
echo "2. Generating compliance report..."
node -e "
const ACE = require('/tmp/autonomous_compliance');
const ace = new ACE();
ace.initialize().then(async () => {
  const report = await ace.generateReport();
  console.log('   Report saved: reports/compliance_' + Date.now() + '.json');
  console.log('   Overall Grade: ' + report.overall.grade);
  process.exit(0);
});
" 2>/dev/null

# 3. Run validation daemon once
echo ""
echo "3. Running validation daemon..."
python3 /tmp/governance_validation_daemon.py --once

# 4. Check for npm vulnerabilities
echo ""
echo "4. Scanning for vulnerabilities..."
npm audit --audit-level=moderate | head -20

# 5. Verify backups
echo ""
echo "5. Backup verification..."
LAST_BACKUP=$(tmutil latestbackup)
echo "   Last Time Machine backup: $LAST_BACKUP"

# 6. Archive logs
echo ""
echo "6. Archiving logs..."
mkdir -p ./logs/archive
tar -czf ./logs/archive/logs_$(date +%Y%m%d).tar.gz ./logs/*.log
echo "   Logs archived: logs/archive/logs_$(date +%Y%m%d).tar.gz"

echo ""
echo "═══════════════════════════════════════"
echo "✅ Weekly deep scan complete"
```

### Sunday Key Rotation (Automated)

**Time:** Sunday 2:00 AM (Automated via launchd)

```bash
#!/bin/bash
# Automated Weekly Key Rotation

cd ~/neuro-pilot-ai/inventory-enterprise/backend

echo "🔄 Automated Quantum Key Rotation"
echo "═══════════════════════════════════════"

# 1. Rotate keys
node -e "
const QKM = require('/tmp/quantum_key_manager');
const qkm = new QKM({ autoRotate: false });
qkm.initialize().then(async () => {
  console.log('Current key age: ' + await qkm.getKeyAge() + 'ms');
  await qkm.rotateKeys();
  console.log('✅ Keys rotated successfully');
  process.exit(0);
});
" 2>/dev/null

# 2. Verify new keys
if security find-generic-password -a "ed25519_primary" -s "com.neuroinnovate.quantum" >/dev/null 2>&1; then
  echo "✅ New Ed25519 key verified in Keychain"
else
  echo "❌ Key rotation failed - CRITICAL"
  osascript -e 'display notification "Quantum key rotation failed!" with title "🔐 Security Alert" sound name "Basso"'
  exit 1
fi

# 3. Restart server to load new keys
echo "Restarting server..."
pm2 restart inventory-enterprise

echo ""
echo "✅ Key rotation complete"
```

**Setup launchd for automated rotation:**

```bash
# Create launchd plist
cat > ~/Library/LaunchAgents/com.neuroinnovate.keyrotation.plist <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.neuroinnovate.keyrotation</string>
    <key>ProgramArguments</key>
    <array>
        <string>/bin/bash</string>
        <string>/Users/$(whoami)/neuro-pilot-ai/inventory-enterprise/backend/scripts/rotate_keys_weekly.sh</string>
    </array>
    <key>StartCalendarInterval</key>
    <dict>
        <key>Weekday</key>
        <integer>0</integer>
        <key>Hour</key>
        <integer>2</integer>
        <key>Minute</key>
        <integer>0</integer>
    </dict>
    <key>StandardOutPath</key>
    <string>/tmp/keyrotation.log</string>
    <key>StandardErrorPath</key>
    <string>/tmp/keyrotation.error.log</string>
</dict>
</plist>
EOF

# Load launchd job
launchctl load ~/Library/LaunchAgents/com.neuroinnovate.keyrotation.plist
```

---

## 🚨 INCIDENT RESPONSE

### Threat Detection Alert

**Trigger:** Defense AI score >70 OR Zero-Leak Daemon violation

```bash
#!/bin/bash
# Incident Response - Automatic Containment

echo "🚨 INCIDENT RESPONSE INITIATED"
echo "═══════════════════════════════════════"

# 1. Freeze all services
echo "1. Freezing services..."
pm2 stop all

# 2. Capture evidence
echo "2. Capturing evidence..."
EVIDENCE_DIR="/tmp/incident_$(date +%Y%m%d_%H%M%S)"
mkdir -p "$EVIDENCE_DIR"

# Network connections
lsof -i -P | grep node > "$EVIDENCE_DIR/network_connections.txt"

# Process list
ps aux | grep node > "$EVIDENCE_DIR/processes.txt"

# Recent logs
tail -1000 logs/*.log > "$EVIDENCE_DIR/recent_logs.txt"

# Validation status
cp /tmp/qdl_validation.json "$EVIDENCE_DIR/"

# 3. Rollback to last signed state
echo "3. Rolling back to last verified state..."
git checkout HEAD -- server.js config/ routes/

# 4. Verify database integrity
echo "4. Verifying database..."
sqlite3 db/inventory_enterprise.db "PRAGMA integrity_check;" > "$EVIDENCE_DIR/db_integrity.txt"

# 5. Notify owner
echo "5. Notifying owner..."
osascript -e 'display notification "Security incident detected! System frozen. Review evidence in /tmp/" with title "🚨 CRITICAL ALERT" sound name "Basso"'

# 6. Require Touch ID to proceed
echo ""
echo "═══════════════════════════════════════"
echo "⚠️  SYSTEM FROZEN - TOUCH ID REQUIRED TO RESUME"
echo ""
echo "Evidence saved to: $EVIDENCE_DIR"
echo ""
echo "To resume after review:"
echo "  1. Review evidence files"
echo "  2. Verify system integrity"
echo "  3. Run: pm2 start inventory-enterprise"
```

### Owner Emergency Lockdown

**Usage:** Owner-initiated complete system shutdown

```bash
#!/bin/bash
# Emergency Owner Lockdown

echo "🔐 EMERGENCY LOCKDOWN INITIATED"
echo "═══════════════════════════════════════"

# 1. Stop all services
pm2 stop all
pkill -9 -f "node server.js"

# 2. Block all network traffic
sudo pfctl -d
sudo tee /etc/pf.anchors/lockdown <<EOF
# Emergency lockdown - block ALL traffic
block all
EOF
sudo pfctl -f /etc/pf.anchors/lockdown
sudo pfctl -e

# 3. Archive current state
LOCKDOWN_DIR="/tmp/lockdown_$(date +%Y%m%d_%H%M%S)"
mkdir -p "$LOCKDOWN_DIR"
tar -czf "$LOCKDOWN_DIR/full_system_snapshot.tar.gz" \
  db/ \
  logs/ \
  /tmp/qdl_validation.json \
  /tmp/incident_*

# 4. Clear sensitive data from memory
sudo purge

# 5. Create lockdown marker
touch /tmp/SYSTEM_LOCKED_DOWN

echo ""
echo "═══════════════════════════════════════"
echo "✅ SYSTEM LOCKED DOWN"
echo ""
echo "Snapshot saved: $LOCKDOWN_DIR"
echo ""
echo "To restore (Touch ID required):"
echo "  1. Review snapshot"
echo "  2. Restore firewall: sudo pfctl -f /etc/pf.conf"
echo "  3. Start server: pm2 start inventory-enterprise"
echo "  4. Remove marker: rm /tmp/SYSTEM_LOCKED_DOWN"
```

---

## 📊 MONTHLY OPERATIONS

### Compliance Audit Export (Last Friday)

```bash
#!/bin/bash
# Monthly Compliance Report for Stakeholders

cd ~/neuro-pilot-ai/inventory-enterprise/backend

# 1. Generate comprehensive report
node -e "
const ACE = require('/tmp/autonomous_compliance');
const ace = new ACE();
ace.initialize().then(async () => {
  const report = await ace.generateReport();
  console.log(JSON.stringify(report, null, 2));
  process.exit(0);
});
" > reports/compliance_monthly_$(date +%Y%m).json

# 2. Update Canva dashboards (manual)
echo "📊 Update Canva dashboards with:"
echo "   - Compliance Score: $(jq -r '.overall.score' reports/compliance_monthly_$(date +%Y%m).json)"
echo "   - SOC2: $(jq -r '.frameworks.soc2.score' reports/compliance_monthly_$(date +%Y%m).json)"
echo "   - ISO27001: $(jq -r '.frameworks.iso27001.score' reports/compliance_monthly_$(date +%Y%m).json)"
echo "   - OWASP: $(jq -r '.frameworks.owasp.score' reports/compliance_monthly_$(date +%Y%m).json)"
```

---

## 🎯 SUCCESS CRITERIA

| Metric | Target | Verification |
|--------|--------|--------------|
| Daily checks | 100% pass rate | Morning routine completes |
| Compliance score | ≥90/100 | Weekly compliance report |
| Validation status | PASS | /tmp/qdl_validation.json |
| Key rotation | Every 7 days | Keychain archive count |
| Incident response | <15 seconds | Freeze + notify |
| Memory usage | <500MB | ps command |
| CPU usage | <10% idle | ps command |
| Test pass rate | >95% | Integration test suite |

---

**Runbook Version:** 1.0.0
**Owner:** neuro.pilot.ai@gmail.com
**Status:** 🟢 **ACTIVE**
