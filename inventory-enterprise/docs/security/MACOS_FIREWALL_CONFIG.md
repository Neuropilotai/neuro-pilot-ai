# 🔥 macOS Firewall Configuration Guide

**NeuroInnovate Inventory Enterprise v3.2.0**
**Platform:** macOS M3 Pro (Apple Silicon)
**Date:** 2025-10-09

---

## 🎯 OBJECTIVE

Configure macOS firewall to prevent unauthorized network access while maintaining localhost functionality.

---

## 1. OVERVIEW

### 1.1 Defense Strategy

```
┌──────────────────────────────────────────────────────┐
│                 FIREWALL LAYERS                      │
├──────────────────────────────────────────────────────┤
│                                                      │
│  Layer 1: Application Firewall (macOS Built-in)     │
│           └─ Block all incoming except localhost    │
│                                                      │
│  Layer 2: Packet Filter (pf)                        │
│           └─ Filter by IP, port, protocol           │
│                                                      │
│  Layer 3: Network Monitor (Little Snitch/LuLu)      │
│           └─ Alert on unauthorized outbound         │
│                                                      │
│  Layer 4: Server Binding (Express listen)           │
│           └─ Bind to 127.0.0.1 ONLY                 │
│                                                      │
└──────────────────────────────────────────────────────┘
```

### 1.2 Security Goals

| Goal | Implementation | Verification |
|------|----------------|--------------|
| Block remote access | Application firewall | `nmap localhost` |
| Localhost-only server | Express bind 127.0.0.1 | `lsof -i :8083` |
| Alert on outbound | Network monitor | Little Snitch/LuLu |
| Block data exfiltration | pf rules | `pfctl -s rules` |

---

## 2. LAYER 1: macOS APPLICATION FIREWALL

### 2.1 Enable Application Firewall

```bash
# Check current status
sudo /usr/libexec/ApplicationFirewall/socketfilterfw --getglobalstate

# Enable firewall
sudo /usr/libexec/ApplicationFirewall/socketfilterfw --setglobalstate on

# Enable stealth mode (don't respond to ping)
sudo /usr/libexec/ApplicationFirewall/socketfilterfw --setstealthmode on

# Enable logging
sudo /usr/libexec/ApplicationFirewall/socketfilterfw --setloggingmode on

# Restart firewall
sudo pkill -HUP socketfilterfw
```

### 2.2 Configure Node.js Rules

```bash
# Find Node.js path
NODEPATH=$(which node)
echo "Node.js path: $NODEPATH"

# Add Node.js to firewall (but block external connections)
sudo /usr/libexec/ApplicationFirewall/socketfilterfw --add "$NODEPATH"

# Set to block incoming connections
sudo /usr/libexec/ApplicationFirewall/socketfilterfw --blockapp "$NODEPATH"

# Verify
sudo /usr/libexec/ApplicationFirewall/socketfilterfw --listapps | grep node
```

**Expected Output**:
```
/usr/local/bin/node ( Block incoming connections )
```

### 2.3 Verify Firewall Status

```bash
# Check global state
sudo /usr/libexec/ApplicationFirewall/socketfilterfw --getglobalstate
# Expected: Firewall is enabled. (State = 1)

# Check stealth mode
sudo /usr/libexec/ApplicationFirewall/socketfilterfw --getstealthmode
# Expected: Stealth mode enabled (State = 1)

# Check logging
sudo /usr/libexec/ApplicationFirewall/socketfilterfw --getloggingmode
# Expected: Log mode is on

# View firewall log
log show --predicate 'process == "socketfilterfw"' --info --last 1h
```

---

## 3. LAYER 2: PACKET FILTER (pf)

### 3.1 Understanding pf

**pf** (Packet Filter) is macOS's built-in firewall for advanced packet filtering.

**Location**: `/etc/pf.conf` (main config)
**Anchors**: `/etc/pf.anchors/` (modular rules)

### 3.2 Create Inventory Enterprise Rules

```bash
# Create anchor file for Inventory Enterprise
sudo tee /etc/pf.anchors/com.neuroinnovate.inventory <<'EOF'
#
# Inventory Enterprise Firewall Rules
# Generated: 2025-10-09
# Purpose: Restrict all traffic except localhost
#

# Skip loopback interface (allow all localhost)
set skip on lo0

# Default: block all
block log all

# Allow ICMP (ping) on loopback only
pass on lo0 inet proto icmp all

# Allow TCP/UDP on loopback only
pass on lo0 proto { tcp, udp } all

# Allow established connections (return traffic)
pass out proto tcp from any to any modulate state

# Block specific ports from accepting external connections
block in log quick proto tcp from any to any port 8083

# Allow DNS for Node.js (required for package updates)
# But only to trusted DNS servers
pass out log proto udp from any to 1.1.1.1 port 53
pass out log proto udp from any to 8.8.8.8 port 53

# Block all other outbound (except HTTPS for npm)
pass out proto tcp from any to any port { 80, 443 } keep state

# Log denied packets
block log all

EOF

# Verify syntax
sudo pfctl -nf /etc/pf.anchors/com.neuroinnovate.inventory
```

### 3.3 Load pf Rules

```bash
# Check if pf is running
sudo pfctl -s info

# Enable pf (if not already)
sudo pfctl -e

# Load inventory rules
sudo pfctl -f /etc/pf.anchors/com.neuroinnovate.inventory

# Verify rules loaded
sudo pfctl -s rules
```

### 3.4 Make pf Rules Persistent

**Method 1: Edit main pf.conf**

```bash
# Backup original
sudo cp /etc/pf.conf /etc/pf.conf.backup.$(date +%Y%m%d)

# Add anchor to main config
sudo tee -a /etc/pf.conf <<EOF

# Inventory Enterprise Security Rules
anchor "com.neuroinnovate.inventory"
load anchor "com.neuroinnovate.inventory" from "/etc/pf.anchors/com.neuroinnovate.inventory"
EOF

# Reload pf
sudo pfctl -f /etc/pf.conf
```

**Method 2: Launch Daemon** (Survives reboots)

```bash
# Create Launch Daemon
sudo tee /Library/LaunchDaemons/com.neuroinnovate.inventory.pf.plist <<'EOF'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.neuroinnovate.inventory.pf</string>
    <key>ProgramArguments</key>
    <array>
        <string>/sbin/pfctl</string>
        <string>-ef</string>
        <string>/etc/pf.anchors/com.neuroinnovate.inventory</string>
    </array>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <false/>
</dict>
</plist>
EOF

# Set permissions
sudo chmod 644 /Library/LaunchDaemons/com.neuroinnovate.inventory.pf.plist
sudo chown root:wheel /Library/LaunchDaemons/com.neuroinnovate.inventory.pf.plist

# Load daemon
sudo launchctl load /Library/LaunchDaemons/com.neuroinnovate.inventory.pf.plist

# Verify
sudo launchctl list | grep inventory
```

---

## 4. LAYER 3: NETWORK MONITOR

### 4.1 Option A: Little Snitch (Commercial - $45)

**Installation**:
```bash
# Install via Homebrew
brew install --cask little-snitch

# Or download from: https://www.obdev.at/products/littlesnitch/
```

**Configuration**:

1. Open Little Snitch (System Preferences → Little Snitch)
2. Create rule for Node.js:
   - Application: `/usr/local/bin/node`
   - Action: **Deny** all connections
   - Exception: Allow connections to `127.0.0.1`
   - Exception: Allow connections to `localhost`
   - Alert: Enabled (notify on violation)

3. Create alert rule:
   - When: Node makes outbound connection
   - Alert: Desktop notification + Log
   - Action: Deny by default

### 4.2 Option B: LuLu (Free, Open Source)

**Installation**:
```bash
# Install via Homebrew
brew install --cask lulu

# Or download from: https://objective-see.org/products/lulu.html
```

**Configuration**:

1. Open LuLu
2. Click "Rules" → Add Rule
3. Configure:
   - Process: `/usr/local/bin/node`
   - Action: **Block**
   - Destination: Any except 127.0.0.1

4. Enable passive mode alerts

### 4.3 Manual Monitoring Script

If you don't want to install third-party software:

```bash
#!/bin/bash
# /tmp/network_monitor.sh
# Real-time network monitoring for Inventory Enterprise

LOG_FILE="/tmp/inventory_network.log"
ALERT_FILE="/tmp/inventory_alerts.log"

while true; do
  # Get Node PID
  PID=$(pgrep -f "node.*server.js" | head -1)

  if [ -z "$PID" ]; then
    sleep 5
    continue
  fi

  # Monitor connections
  CONNECTIONS=$(lsof -p "$PID" -i -P -n 2>/dev/null | grep -v "127.0.0.1" | grep ESTABLISHED)

  if [ -n "$CONNECTIONS" ]; then
    TIMESTAMP=$(date "+%Y-%m-%d %H:%M:%S")
    echo "[$TIMESTAMP] ⚠️  EXTERNAL CONNECTION DETECTED!" | tee -a "$ALERT_FILE"
    echo "$CONNECTIONS" | tee -a "$LOG_FILE"

    # Send macOS notification
    osascript -e 'display notification "Unauthorized network connection detected!" with title "Security Alert" sound name "Basso"'
  fi

  sleep 10
done
```

**Run Monitor**:
```bash
chmod +x /tmp/network_monitor.sh
nohup /tmp/network_monitor.sh > /dev/null 2>&1 &
echo $! > /tmp/network_monitor.pid
```

---

## 5. LAYER 4: SERVER BINDING

### 5.1 Verify Express Binding

**Check server.js**:
```bash
cd ~/neuro-pilot-ai/inventory-enterprise/backend
grep -n "httpServer.listen" server.js

# Expected output (line 215 or similar):
# httpServer.listen(PORT, '127.0.0.1', async () => {
#                         ^^^^^^^^^^^^
#                      Must have this!
```

### 5.2 Runtime Verification

```bash
# Server must be running
cd ~/neuro-pilot-ai/inventory-enterprise/backend
node server.js &
sleep 5

# Check binding
lsof -i :8083 | grep LISTEN

# Expected output:
# node    12345 user   12u  IPv4 0x...  0t0  TCP 127.0.0.1:8083 (LISTEN)
#                                                  ^^^^^^^^^^^^
#                                               Must be 127.0.0.1!

# If you see *:8083 or 0.0.0.0:8083, server is NOT properly bound!
```

---

## 6. TESTING & VERIFICATION

### 6.1 Localhost Access Test

```bash
# This should WORK
curl -s http://localhost:8083/health | jq '.status'
# Expected: "ok"

curl -s http://127.0.0.1:8083/health | jq '.status'
# Expected: "ok"
```

### 6.2 Remote Access Test

**From another machine on the same network**:

```bash
# Get your Mac's IP address
ifconfig | grep "inet " | grep -v 127.0.0.1

# From another computer, try to connect
curl -v http://YOUR_MAC_IP:8083/health
# Expected: Connection refused or timeout

# If connection succeeds, firewall is NOT working!
```

**Local test (simulate external)**:

```bash
# Create SSH tunnel to simulate external access
ssh -L 9999:localhost:8083 localhost

# Try to connect through tunnel
curl http://localhost:9999/health
# If this works, your server binding needs fixing
```

### 6.3 Port Scan Test

```bash
# Install nmap
brew install nmap

# Scan your own machine
nmap -p 8083 localhost

# Expected output:
# PORT     STATE    SERVICE
# 8083/tcp filtered unknown
# or
# 8083/tcp closed   unknown

# If you see "open", firewall is not blocking!
```

### 6.4 Firewall Status Check

```bash
#!/bin/bash
# /tmp/verify_firewall.sh
# Comprehensive firewall verification

echo "🔍 Firewall Verification Report"
echo "================================"
echo ""

# 1. Application Firewall
echo "1. Application Firewall"
STATUS=$(sudo /usr/libexec/ApplicationFirewall/socketfilterfw --getglobalstate)
if [[ "$STATUS" == *"enabled"* ]]; then
  echo "   ✅ Enabled"
else
  echo "   ❌ DISABLED - CRITICAL!"
fi

# 2. Stealth Mode
STEALTH=$(sudo /usr/libexec/ApplicationFirewall/socketfilterfw --getstealthmode)
if [[ "$STEALTH" == *"enabled"* ]]; then
  echo "   ✅ Stealth mode enabled"
else
  echo "   ⚠️  Stealth mode disabled"
fi

# 3. pf Status
echo ""
echo "2. Packet Filter (pf)"
if sudo pfctl -s info &>/dev/null; then
  echo "   ✅ pf is running"
  RULES=$(sudo pfctl -s rules | wc -l)
  echo "   Rules loaded: $RULES"
else
  echo "   ❌ pf is NOT running - CRITICAL!"
fi

# 4. Server Binding
echo ""
echo "3. Server Binding"
BINDING=$(lsof -i :8083 2>/dev/null | grep LISTEN | awk '{print $9}')
if [[ "$BINDING" == *"127.0.0.1"* ]]; then
  echo "   ✅ Bound to localhost only"
else
  echo "   ❌ NOT bound to localhost - CRITICAL!"
  echo "   Current binding: $BINDING"
fi

# 5. External Connections
echo ""
echo "4. Active External Connections"
PID=$(pgrep -f "node.*server.js" | head -1)
if [ -n "$PID" ]; then
  EXTERNAL=$(lsof -p "$PID" -i -P -n 2>/dev/null | grep ESTABLISHED | grep -v "127.0.0.1")
  if [ -z "$EXTERNAL" ]; then
    echo "   ✅ No external connections"
  else
    echo "   ⚠️  External connections detected:"
    echo "$EXTERNAL"
  fi
else
  echo "   Server not running"
fi

# 6. Network Monitor
echo ""
echo "5. Network Monitor"
if [ -f /tmp/network_monitor.pid ]; then
  MPID=$(cat /tmp/network_monitor.pid)
  if ps -p "$MPID" &>/dev/null; then
    echo "   ✅ Network monitor running (PID: $MPID)"
  else
    echo "   ⚠️  Monitor PID file exists but process not running"
  fi
else
  echo "   ⚠️  Network monitor not running"
fi

echo ""
echo "================================"
```

**Run Verification**:
```bash
chmod +x /tmp/verify_firewall.sh
bash /tmp/verify_firewall.sh
```

---

## 7. TROUBLESHOOTING

### 7.1 Firewall Not Blocking

**Problem**: External connections still succeed

**Solution**:
```bash
# 1. Restart firewall
sudo pfctl -d  # Disable
sudo pfctl -f /etc/pf.anchors/com.neuroinnovate.inventory  # Reload
sudo pfctl -e  # Enable

# 2. Verify rules
sudo pfctl -s rules | grep 8083

# 3. Check server binding
lsof -i :8083
```

### 7.2 localhost Connections Blocked

**Problem**: Can't access http://localhost:8083

**Solution**:
```bash
# Check if lo0 (loopback) is skipped
sudo pfctl -s rules | grep "skip on lo0"

# If not, add to pf rules:
sudo tee -a /etc/pf.anchors/com.neuroinnovate.inventory <<EOF
set skip on lo0
EOF

# Reload
sudo pfctl -f /etc/pf.anchors/com.neuroinnovate.inventory
```

### 7.3 DNS Resolution Fails

**Problem**: npm install fails, can't resolve hostnames

**Solution**:
```bash
# Allow DNS queries in pf rules
sudo tee -a /etc/pf.anchors/com.neuroinnovate.inventory <<EOF
pass out proto udp from any to any port 53
EOF

# Reload
sudo pfctl -f /etc/pf.anchors/com.neuroinnovate.inventory
```

---

## 8. MAINTENANCE

### 8.1 Weekly Checks

```bash
# Run verification script
bash /tmp/verify_firewall.sh

# Check firewall logs
log show --predicate 'process == "socketfilterfw"' --info --last 7d | grep -i "block"

# Review pf logs
sudo pfctl -s info
```

### 8.2 Update Firewall Rules

```bash
# Edit rules
sudo nano /etc/pf.anchors/com.neuroinnovate.inventory

# Test syntax
sudo pfctl -nf /etc/pf.anchors/com.neuroinnovate.inventory

# Apply changes
sudo pfctl -f /etc/pf.anchors/com.neuroinnovate.inventory
```

---

## 9. EMERGENCY PROCEDURES

### 9.1 Lock Down Everything

```bash
#!/bin/bash
# /tmp/lockdown.sh
# Emergency lockdown - block ALL traffic

sudo tee /etc/pf.anchors/lockdown <<EOF
# Emergency lockdown
block all
EOF

sudo pfctl -f /etc/pf.anchors/lockdown
echo "🔒 System locked down - all traffic blocked"
```

### 9.2 Restore Normal Operation

```bash
#!/bin/bash
# /tmp/restore_firewall.sh

# Restore normal firewall rules
sudo pfctl -f /etc/pf.anchors/com.neuroinnovate.inventory

# Verify
bash /tmp/verify_firewall.sh

echo "✅ Firewall restored"
```

---

## 📊 SUCCESS CRITERIA

| Check | Command | Expected Result |
|-------|---------|-----------------|
| Firewall enabled | `sudo pfctl -s info` | Status: Enabled |
| Server bound to localhost | `lsof -i :8083` | 127.0.0.1:8083 |
| No external connections | `lsof -i -P \| grep node` | Only 127.0.0.1 |
| Remote access blocked | `nmap -p 8083 YOUR_IP` | filtered/closed |
| Localhost works | `curl localhost:8083/health` | 200 OK |

---

## 📞 SUPPORT

**Issues?**
1. Run: `bash /tmp/verify_firewall.sh`
2. Check logs: `log show --predicate 'process == "socketfilterfw"' --last 1h`
3. Review pf: `sudo pfctl -s all`

**Emergency Contact**: neuro.pilot.ai@gmail.com

---

**Configuration Status**: 🟢 **READY**
**Last Updated**: 2025-10-09
**Next Review**: 2025-10-16
