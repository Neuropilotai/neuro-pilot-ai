# 🛡️ Leak Prevention Plan

**NeuroInnovate Inventory Enterprise v3.2.0**
**Date:** 2025-10-09
**Classification:** CONFIDENTIAL

---

## 🎯 OBJECTIVE

Implement multi-layer defenses to guarantee zero data/code leakage from backend and AI systems.

---

## 1. IMMEDIATE FIX: Localhost Binding

### 1.1 Apply Server Fix

**Priority**: 🔴 **CRITICAL** (Do this first!)

```bash
cd ~/neuro-pilot-ai/inventory-enterprise/backend

# Backup current server.js
cp server.js server.js.backup.$(date +%Y%m%d_%H%M%S)

# Apply fix (edit line 215)
# Change: httpServer.listen(PORT, async () => {
# To:     httpServer.listen(PORT, '127.0.0.1', async () => {
```

**Using sed (automated)**:
```bash
sed -i.bak 's/httpServer\.listen(PORT, async/httpServer.listen(PORT, '\''127.0.0.1'\'', async/' server.js

# Verify change
grep -n "httpServer.listen" server.js
# Expected output should show: httpServer.listen(PORT, '127.0.0.1', async () => {
```

### 1.2 Restart Server

```bash
# If using pm2
pm2 restart inventory-enterprise

# If running directly
pkill -f "node server.js"
cd ~/neuro-pilot-ai/inventory-enterprise/backend
node server.js > /tmp/v3_2_0_server.log 2>&1 &
```

### 1.3 Verify Binding

```bash
# Check that server is bound to 127.0.0.1 ONLY
lsof -i :8083 | head -5

# Expected output:
# COMMAND   PID  USER   FD   TYPE   DEVICE SIZE/OFF NODE NAME
# node    xxxxx user   12u  IPv4  0x...    0t0     TCP 127.0.0.1:8083 (LISTEN)
#                                                       ^^^^^^^^^^^
#                                                    Must be 127.0.0.1!

# Test: External connections should FAIL
# From another machine on network:
curl -v http://YOUR_MAC_IP:8083/health
# Expected: Connection refused or timeout

# Test: Localhost connections should SUCCEED
curl -s http://localhost:8083/health | jq '.status'
# Expected: "ok"
```

---

## 2. NETWORK ISOLATION

### 2.1 Firewall Rules (macOS)

**Configure macOS Application Firewall:**

```bash
# Enable firewall
sudo /usr/libexec/ApplicationFirewall/socketfilterfw --setglobalstate on

# Block incoming connections by default
sudo /usr/libexec/ApplicationFirewall/socketfilterfw --setblockall off
sudo /usr/libexec/ApplicationFirewall/socketfilterfw --setstealthmode on

# Allow only localhost connections for Node
NODEPATH=$(which node)
sudo /usr/libexec/ApplicationFirewall/socketfilterfw --add "$NODEPATH"
sudo /usr/libexec/ApplicationFirewall/socketfilterfw --blockapp "$NODEPATH"

# Verify
sudo /usr/libexec/ApplicationFirewall/socketfilterfw --getblockall
sudo /usr/libexec/ApplicationFirewall/socketfilterfw --getstealthmode
```

### 2.2 Little Snitch Alternative (Recommended)

If you have Little Snitch installed (provides granular control):

**Rules to Create:**

1. **Allow**: Node → localhost (127.0.0.1)
2. **Allow**: Node → localhost:8083
3. **Deny**: Node → * (all external IPs)
4. **Alert**: Node → any outbound connection

**Configuration File** (if using pf - macOS packet filter):

```bash
# Create pf rule file
sudo tee /etc/pf.anchors/inventory_enterprise <<EOF
# Inventory Enterprise Security Rules
# Block all outbound from Node except localhost

# Allow localhost
pass out quick on lo0 proto tcp from 127.0.0.1 to 127.0.0.1 port 8083

# Block all other outbound
block out log quick proto tcp from any to any port 1:65535
EOF

# Load rules
sudo pfctl -f /etc/pf.anchors/inventory_enterprise
sudo pfctl -e  # Enable pf
```

### 2.3 Verify Network Isolation

```bash
# Test 1: Server should only listen on localhost
netstat -an | grep 8083 | grep LISTEN
# Expected: tcp4       0      0  127.0.0.1.8083         *.*                    LISTEN

# Test 2: No unexpected connections
lsof -i -P | grep node | grep ESTABLISHED
# Expected: Only connections to/from 127.0.0.1

# Test 3: DNS queries (should be minimal)
sudo tcpdump -i any -n port 53 -c 10
# Expected: No suspicious DNS lookups
```

---

## 3. PROCESS MONITORING

### 3.1 Install Monitoring Tools

```bash
# Install process monitoring tools
brew install lsof
brew install netstat

# Optional: Install network monitor
brew install --cask little-snitch  # Commercial, $45
# OR
brew install --cask lulu           # Free, open-source
```

### 3.2 Real-Time Monitoring Script

**Create**: `/tmp/monitor_inventory.sh`

```bash
#!/bin/bash
# Real-time monitoring for Inventory Enterprise
# Detects unauthorized outbound connections

while true; do
  # Get Node PID
  PID=$(pgrep -f "node server.js" | head -1)

  if [ -z "$PID" ]; then
    echo "[$(date)] Server not running"
    sleep 5
    continue
  fi

  # Check for non-localhost connections
  EXTERNAL=$(lsof -p "$PID" -i -P -n | grep ESTABLISHED | grep -v 127.0.0.1)

  if [ -n "$EXTERNAL" ]; then
    echo "[$(date)] ⚠️  ALERT: External connection detected!"
    echo "$EXTERNAL"
    echo "---"

    # Log to file
    echo "[$(date)] $EXTERNAL" >> /tmp/inventory_security_alerts.log

    # Optional: Send notification
    osascript -e 'display notification "Unauthorized outbound connection detected!" with title "Security Alert"'
  fi

  sleep 10
done
```

**Run Monitor**:
```bash
chmod +x /tmp/monitor_inventory.sh
/tmp/monitor_inventory.sh > /tmp/inventory_monitor.log 2>&1 &
```

---

## 4. CODE INTEGRITY

### 4.1 Scheduled Scans

**Create cron job** (runs every 6 hours):

```bash
# Add to crontab
(crontab -l 2>/dev/null; echo "0 */6 * * * cd ~/neuro-pilot-ai/inventory-enterprise/backend && node /tmp/scan_outbound_requests.js >> /tmp/security_scans.log 2>&1") | crontab -

# Verify cron
crontab -l | grep scan_outbound
```

### 4.2 File Integrity Monitoring

**Install AIDE** (Advanced Intrusion Detection Environment):

```bash
# Install via Homebrew
brew install aide

# Initialize database
cd ~/neuro-pilot-ai/inventory-enterprise/backend
aide --init

# Check for changes
aide --check
```

**Alternative: Git-based integrity check:**

```bash
# Check for uncommitted changes to source code
cd ~/neuro-pilot-ai/inventory-enterprise/backend
git status --porcelain | grep -E "\.js$" | grep -v "node_modules"

# If output is empty, no unauthorized changes
# If output exists, investigate immediately
```

---

## 5. DATABASE PROTECTION

### 5.1 Encrypt SQLite Database

```bash
cd ~/neuro-pilot-ai/inventory-enterprise/backend

# Install sqlcipher (encrypted SQLite)
brew install sqlcipher

# Encrypt existing database
DB_PATH="db/inventory_enterprise.db"
DB_BACKUP="db/inventory_enterprise.db.backup.$(date +%Y%m%d)"

cp "$DB_PATH" "$DB_BACKUP"

sqlcipher "$DB_PATH" <<EOF
PRAGMA key = 'your-encryption-key-here';  # Replace with secure key from Keychain
ATTACH DATABASE '${DB_PATH}.encrypted' AS encrypted KEY 'your-encryption-key-here';
SELECT sqlcipher_export('encrypted');
DETACH DATABASE encrypted;
EOF

# Replace original with encrypted version
mv "${DB_PATH}.encrypted" "$DB_PATH"
```

### 5.2 Restrict Database File Permissions

```bash
# Only owner can read/write
chmod 600 ~/neuro-pilot-ai/inventory-enterprise/backend/db/*.db

# Verify
ls -la ~/neuro-pilot-ai/inventory-enterprise/backend/db/
# Expected: -rw------- (600)
```

---

## 6. ENVIRONMENT VARIABLES

### 6.1 Secure .env File

```bash
cd ~/neuro-pilot-ai/inventory-enterprise/backend

# Restrict permissions
chmod 600 .env

# Verify no secrets are committed to git
git check-ignore .env
# Expected: .env (should be ignored)

# Audit .env for exposed secrets
grep -E "API_KEY|SECRET|PASSWORD" .env | grep -v "process.env"
# Expected: No matches (all should reference process.env)
```

### 6.2 Use macOS Keychain for Secrets

**Store secrets in Keychain:**

```bash
# Store OpenAI API key
security add-generic-password -a "$USER" -s "inventory-enterprise-openai" -w "YOUR_API_KEY"

# Retrieve in Node.js:
# const apiKey = execSync('security find-generic-password -a "$USER" -s "inventory-enterprise-openai" -w', { encoding: 'utf8' }).trim();
```

---

## 7. LLM API MONITORING

### 7.1 Disable LLM Calls (if not needed)

```bash
# Edit .env
cd ~/neuro-pilot-ai/inventory-enterprise/backend
echo "INSIGHT_ENABLED=false" >> .env

# Restart server
pm2 restart inventory-enterprise
```

### 7.2 Monitor LLM Payloads

**Add logging to InsightGenerator:**

```javascript
// backend/aiops/InsightGenerator.js (line 310, before axios.post)

// Log payload before sending
logger.info('LLM Request Payload', {
  provider: this.config.provider,
  dataSize: JSON.stringify(data).length,
  incidentCount: data.incidents.length,
  metricsOnly: true
});

// Verify no raw data
if (JSON.stringify(data).includes('user@email.com') ||
    JSON.stringify(data).includes('item_code')) {
  logger.error('SECURITY ALERT: Raw data in LLM payload!');
  throw new Error('Data leak prevented');
}
```

---

## 8. WEBHOOK SAFEGUARDS

### 8.1 Restrict Webhook Destinations

**Add URL validation** to webhook endpoints:

```javascript
// backend/routes/webhooks_2025-10-07.js

const ALLOWED_WEBHOOK_HOSTS = [
  'hooks.slack.com',
  'discord.com',
  'api.pagerduty.com'
];

function validateWebhookUrl(url) {
  const parsed = new URL(url);

  // Block localhost and internal IPs
  if (parsed.hostname === 'localhost' ||
      parsed.hostname === '127.0.0.1' ||
      parsed.hostname.startsWith('192.168.') ||
      parsed.hostname.startsWith('10.')) {
    throw new Error('Localhost/internal IPs not allowed');
  }

  // Whitelist check
  const allowed = ALLOWED_WEBHOOK_HOSTS.some(host =>
    parsed.hostname.endsWith(host)
  );

  if (!allowed) {
    throw new Error(`Webhook host not whitelisted: ${parsed.hostname}`);
  }

  return true;
}
```

### 8.2 Audit Webhook Deliveries

```bash
# Check recent webhook deliveries
sqlite3 ~/neuro-pilot-ai/inventory-enterprise/backend/db/inventory_enterprise.db <<EOF
SELECT
  webhook_id,
  event_type,
  status,
  sent_at,
  http_status
FROM webhook_deliveries
WHERE sent_at >= datetime('now', '-24 hours')
ORDER BY sent_at DESC
LIMIT 50;
EOF
```

---

## 9. INCIDENT RESPONSE

### 9.1 Leak Detection Procedure

**If unauthorized outbound connection detected:**

```bash
# 1. Capture evidence
lsof -i -P | grep node > /tmp/leak_evidence_$(date +%Y%m%d_%H%M%S).txt
netstat -an | grep ESTABLISHED >> /tmp/leak_evidence_$(date +%Y%m%d_%H%M%S).txt

# 2. Kill server immediately
pm2 stop inventory-enterprise

# 3. Block all Node outbound connections
sudo pfctl -f /etc/pf.anchors/inventory_enterprise

# 4. Analyze logs
tail -100 ~/neuro-pilot-ai/inventory-enterprise/backend/logs/*.log

# 5. Run security scan
cd ~/neuro-pilot-ai/inventory-enterprise/backend
node /tmp/scan_outbound_requests.js

# 6. Check for unauthorized code changes
git status
git diff
```

### 9.2 Emergency Shutdown

**Create emergency kill script:**

```bash
#!/bin/bash
# /tmp/emergency_shutdown.sh

echo "🚨 EMERGENCY SHUTDOWN INITIATED"

# Kill server
pm2 stop all
pkill -9 -f "node server.js"

# Block all network
sudo pfctl -d  # Disable current rules
sudo pfctl -f /etc/pf.anchors/lockdown  # Load lockdown rules

# Create lockdown rule
sudo tee /etc/pf.anchors/lockdown <<EOF
# Emergency lockdown - block all traffic
block all
EOF

echo "✅ System locked down"
echo "To restore: sudo pfctl -f /etc/pf.conf && pm2 start inventory-enterprise"
```

---

## 10. VERIFICATION CHECKLIST

### Daily Checks

```bash
# 1. Verify localhost binding
lsof -i :8083 | grep 127.0.0.1

# 2. Check for external connections
lsof -i -P | grep node | grep ESTABLISHED | grep -v 127.0.0.1

# 3. Scan for unauthorized changes
cd ~/neuro-pilot-ai/inventory-enterprise/backend && git status --porcelain

# 4. Check security logs
tail -50 /tmp/inventory_security_alerts.log
```

### Weekly Checks

```bash
# 1. Run full security scan
cd ~/neuro-pilot-ai/inventory-enterprise/backend
node /tmp/scan_outbound_requests.js

# 2. Review webhook deliveries
sqlite3 db/inventory_enterprise.db "SELECT * FROM webhook_deliveries WHERE sent_at >= datetime('now', '-7 days')"

# 3. Audit LLM calls (if enabled)
grep "LLM Request" logs/*.log | tail -20

# 4. Verify database encryption
file db/inventory_enterprise.db | grep -i sqlite
```

---

## 11. SUCCESS CRITERIA

| Metric | Target | Verification |
|--------|--------|--------------|
| Server binding | 127.0.0.1 only | `lsof -i :8083` shows localhost |
| External connections | 0 (except LLM/webhooks) | `lsof -i -P \| grep node` |
| Unauthorized code changes | 0 | `git status --porcelain` empty |
| Security scan | 0 critical issues | `scan_outbound_requests.js` passes |
| Database permissions | 600 (owner only) | `ls -la db/*.db` |
| .env permissions | 600 (owner only) | `ls -la .env` |
| Firewall active | Enabled | `pfctl -s all` |

---

## 12. MAINTENANCE

### Monthly Tasks

1. **Rotate secrets**:
   ```bash
   # Generate new JWT secret
   openssl rand -base64 64 > /tmp/new_jwt_secret.txt

   # Update .env
   # Restart server
   ```

2. **Review firewall logs**:
   ```bash
   sudo pfctl -s all
   sudo log show --predicate 'eventMessage contains "firewall"' --last 30d
   ```

3. **Update dependencies**:
   ```bash
   cd ~/neuro-pilot-ai/inventory-enterprise/backend
   npm audit
   npm audit fix
   ```

---

## 📞 SUPPORT

**Questions or Issues?**

1. Check `/tmp/SECURITY_VALIDATION_REPORT_v3.2.0.md`
2. Run diagnostic: `node /tmp/scan_outbound_requests.js`
3. Review logs: `tail -100 /tmp/inventory_security_alerts.log`

**Emergency Contact**: neuro.pilot.ai@gmail.com

---

**Plan Status**: 🟢 **READY FOR DEPLOYMENT**
**Last Updated**: 2025-10-09
**Next Review**: 2025-10-16 (weekly)
