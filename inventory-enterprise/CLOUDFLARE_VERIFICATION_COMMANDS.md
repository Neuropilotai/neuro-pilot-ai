# Cloudflare Verification Commands

**Quick reference for testing Cloudflare configuration**

---

## 🚀 Quick Verification Script

```bash
cd backend
./scripts/verify-cloudflare.sh
```

**Automated checks**:
- ✅ DNS resolution
- ✅ SSL/TLS + HSTS
- ✅ Cloudflare proxy headers
- ✅ WAF protection (SQL injection, XSS)
- ✅ Performance optimization
- ✅ Rate limiting
- ✅ HTTPS redirect

---

## 🔍 Manual Verification Commands

### 1. DNS Resolution

```bash
# Check frontend DNS (expect Cloudflare IP)
dig +short inventory.neuropilot.ai

# Check API DNS (expect Cloudflare IP)
dig +short api.neuropilot.ai

# Full DNS info
dig inventory.neuropilot.ai
dig api.neuropilot.ai
```

**Expected**: IP addresses (Cloudflare proxied)

---

### 2. SSL/TLS & HSTS Headers

```bash
# Frontend SSL + HSTS
curl -I https://inventory.neuropilot.ai | sed -n '1p;/strict-transport-security/p'

# API SSL + HSTS
curl -I https://api.neuropilot.ai/health | sed -n '1p;/strict-transport-security/p'
```

**Expected**:
```
HTTP/2 200
strict-transport-security: max-age=31536000; includeSubDomains; preload
```

---

### 3. Cloudflare Headers

```bash
# Check Cloudflare proxy
curl -I https://inventory.neuropilot.ai | grep -i "cf-"

# Expected headers:
# - cf-ray: [unique-id]
# - cf-cache-status: [HIT/MISS/DYNAMIC]
```

**Expected**:
```
cf-ray: 1234567890abcdef-IAD
cf-cache-status: DYNAMIC
```

---

### 4. WAF Protection Tests

**SQL Injection** (should return 403):
```bash
# Test SQL injection blocking
curl -I "https://api.neuropilot.ai/?q=UNION%20SELECT%201"

# Expected: HTTP/2 403
```

**XSS** (should return 403):
```bash
# Test XSS blocking
curl -I "https://api.neuropilot.ai/?name=%3Cscript%3Ealert(1)%3C/script%3E"

# Expected: HTTP/2 403
```

**Path Traversal** (should return 403):
```bash
# Test path traversal blocking
curl -I "https://api.neuropilot.ai/../../../etc/passwd"

# Expected: HTTP/2 403
```

---

### 5. Rate Limiting Test

```bash
# Test login rate limit (5 allowed, 6th blocked)
for i in {1..6}; do
  echo "Attempt $i:"
  curl -w "HTTP %{http_code}\n" -s -o /dev/null \
    -X POST https://api.neuropilot.ai/api/auth/login \
    -H "Content-Type: application/json" \
    -d '{"email":"test@test.com","password":"wrong"}'
  sleep 1
done
```

**Expected**:
```
Attempt 1: HTTP 401
Attempt 2: HTTP 401
Attempt 3: HTTP 401
Attempt 4: HTTP 401
Attempt 5: HTTP 401
Attempt 6: HTTP 429  ← Blocked by rate limit
```

---

### 6. Compression Test

```bash
# Check Brotli compression
curl -I https://inventory.neuropilot.ai/app.js | grep -i "content-encoding"

# Expected: content-encoding: br
```

---

### 7. HTTPS Redirect

```bash
# Test HTTP → HTTPS redirect
curl -I http://inventory.neuropilot.ai

# Expected:
# HTTP/1.1 301 Moved Permanently
# Location: https://inventory.neuropilot.ai/
```

---

### 8. TLS Version Check

```bash
# Check TLS version
curl -I https://inventory.neuropilot.ai -w "TLS: %{ssl_version}\n" -o /dev/null

# Expected: TLS: TLSv1.3 or TLSv1.2
```

---

### 9. Certificate Validation

```bash
# Check SSL certificate
openssl s_client -connect inventory.neuropilot.ai:443 -servername inventory.neuropilot.ai < /dev/null 2>/dev/null | openssl x509 -noout -dates

# Expected:
# notBefore=[date]
# notAfter=[date in future]
```

---

### 10. Cache Performance

```bash
# Check cache hit ratio (after some traffic)
curl -I https://inventory.neuropilot.ai/app.js | grep -i "cf-cache-status"

# Expected: cf-cache-status: HIT (for static assets)
```

---

## 🧪 Advanced Tests

### Test Bot Challenge

```bash
# Low-quality user agent (may trigger challenge)
curl -I https://api.neuropilot.ai/api/items \
  -H "User-Agent: BadBot/1.0"

# Expected: May return 403 or challenge page
```

### Test Geographic Routing

```bash
# Check which Cloudflare edge location serves you
curl -I https://inventory.neuropilot.ai | grep -i "cf-ray"

# CF-Ray format: [request-id]-[edge-location-code]
# Example: cf-ray: 1234567890abcdef-IAD
# IAD = Washington DC edge location
```

### Measure Response Time

```bash
# Time to first byte (TTFB)
curl -w "Time: %{time_total}s\n" -o /dev/null -s https://api.neuropilot.ai/health

# Expected: <0.2s (200ms)
```

---

## 📊 Cloudflare Dashboard Checks

### 1. Analytics (dash.cloudflare.com)

Navigate to: **Analytics & Logs** → **Traffic**

Check:
- [ ] Requests per second
- [ ] Bandwidth usage
- [ ] Cache hit ratio (target: >80%)
- [ ] SSL/TLS traffic (should be 100%)

### 2. Security Events

Navigate to: **Security** → **Events**

Check:
- [ ] WAF blocks (SQL injection, XSS)
- [ ] Rate limiting triggers
- [ ] Bot challenges
- [ ] Country distribution

### 3. Speed

Navigate to: **Speed** → **Optimization**

Verify:
- [ ] Auto Minify: ON
- [ ] Brotli: ON
- [ ] Early Hints: ON

### 4. SSL/TLS

Navigate to: **SSL/TLS** → **Edge Certificates**

Verify:
- [ ] Always Use HTTPS: ON
- [ ] Minimum TLS Version: 1.3
- [ ] HSTS: Enabled (max-age 31536000)

---

## 🐛 Troubleshooting Commands

### DNS Not Resolving

```bash
# Check nameservers
dig NS neuropilot.ai

# Expected: Cloudflare nameservers
# ns1.cloudflare.com
# ns2.cloudflare.com
```

### SSL Certificate Issues

```bash
# Detailed SSL info
curl -vI https://inventory.neuropilot.ai 2>&1 | grep -i "ssl\|tls\|certificate"

# Check certificate chain
openssl s_client -connect inventory.neuropilot.ai:443 -showcerts
```

### WAF Not Blocking

```bash
# Check if Cloudflare proxy is active
curl -I https://api.neuropilot.ai | grep -i "cf-ray"

# If no CF-Ray header, proxy is not active (check DNS settings)
```

### Rate Limiting Not Working

```bash
# Check rate limit configuration
# (Must be done in Cloudflare dashboard)
# Security → WAF → Rate limiting rules
```

---

## ✅ Complete Verification Checklist

After Cloudflare setup:

### DNS & Connectivity
- [ ] `dig inventory.neuropilot.ai` returns IP
- [ ] `dig api.neuropilot.ai` returns IP
- [ ] Both domains resolve to Cloudflare IPs
- [ ] HTTPS accessible on both domains

### Security
- [ ] HSTS header present (max-age=31536000)
- [ ] SSL mode is Full (Strict)
- [ ] SQL injection blocked (403)
- [ ] XSS blocked (403)
- [ ] Rate limiting active (6th login blocked)
- [ ] HTTP → HTTPS redirect works

### Performance
- [ ] Cloudflare proxy active (CF-Ray header)
- [ ] Brotli or Gzip compression enabled
- [ ] TLS 1.3 in use
- [ ] Cache hit ratio >50% (after 24h)

### Headers
- [ ] CF-Ray present
- [ ] CF-Cache-Status present
- [ ] strict-transport-security present
- [ ] X-Content-Type-Options: nosniff

---

## 🎯 Expected Results Summary

| Test | Command | Expected Result |
|------|---------|----------------|
| DNS | `dig +short inventory.neuropilot.ai` | Cloudflare IP |
| SSL | `curl -I https://inventory.neuropilot.ai` | HTTP/2 200 |
| HSTS | Check headers | max-age=31536000 |
| CF Proxy | Check headers | cf-ray: [id] |
| WAF SQLi | `curl "https://api.neuropilot.ai/?q=UNION SELECT"` | HTTP 403 |
| WAF XSS | `curl "https://api.neuropilot.ai/?name=<script>"` | HTTP 403 |
| Rate Limit | 6 rapid logins | 6th returns HTTP 429 |
| Compression | Check static files | content-encoding: br |
| HTTPS Redirect | `curl -I http://inventory.neuropilot.ai` | 301 → https:// |

---

## 📈 Performance Benchmarks

### Before Cloudflare

```bash
# TTFB without Cloudflare
curl -w "Time: %{time_total}s\n" -o /dev/null -s https://[direct-vercel-url]

# Typical: 0.5-1.0s
```

### After Cloudflare

```bash
# TTFB with Cloudflare
curl -w "Time: %{time_total}s\n" -o /dev/null -s https://inventory.neuropilot.ai

# Expected: 0.1-0.3s (60-80% faster)
```

---

## 🔄 Continuous Monitoring

Set up automated checks:

```bash
# Add to cron (every 5 minutes)
*/5 * * * * /path/to/verify-cloudflare.sh > /tmp/cf-check.log 2>&1

# Or use external monitoring
# - Better Uptime (free)
# - UptimeRobot (free)
# - Pingdom
```

---

**Quick Start**:
```bash
# Run automated verification
cd backend
./scripts/verify-cloudflare.sh
```

**Manual Quick Check**:
```bash
# 3-command verification
dig +short inventory.neuropilot.ai          # DNS
curl -I https://inventory.neuropilot.ai     # SSL + Headers
curl "https://api.neuropilot.ai/?q=UNION"   # WAF
```

---

**Status**: Ready for verification after Cloudflare setup
**Time**: 2-3 minutes for automated script
**Requirements**: curl, dig, jq (optional)
