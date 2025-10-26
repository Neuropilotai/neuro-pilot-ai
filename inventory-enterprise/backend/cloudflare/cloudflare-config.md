# Cloudflare Configuration for NeuroPilot Inventory Enterprise

## Overview

This document provides step-by-step instructions for configuring Cloudflare as a WAF/proxy layer in front of your Railway-hosted backend.

**Architecture Flow:**
```
User/Browser → Cloudflare WAF/CDN → Railway Backend → Neon Postgres
```

**Benefits:**
- DDoS protection (unlimited mitigation on Pro+ plans)
- WAF with managed rulesets
- Rate limiting at edge
- SSL/TLS termination
- Global CDN caching for static assets
- Bot management
- Analytics and logging

---

## Prerequisites

1. Cloudflare account (Free tier works, Pro tier recommended for advanced WAF)
2. Domain name added to Cloudflare
3. Railway backend deployed with public URL
4. SSL certificate provisioned

---

## Step 1: DNS Configuration

### Add DNS Records

In Cloudflare Dashboard → DNS → Records:

```
Type    Name            Content                              Proxy   TTL
CNAME   api             your-app.up.railway.app              ✅ Yes  Auto
CNAME   www             your-app.up.railway.app              ✅ Yes  Auto
A       @               Railway IP (if using A record)       ✅ Yes  Auto
```

**Important**: Ensure "Proxy status" is **Proxied** (orange cloud) to enable Cloudflare protection.

---

## Step 2: SSL/TLS Settings

Navigate to: **SSL/TLS → Overview**

### Recommended Settings:

| Setting                    | Value                  | Reason                                      |
|----------------------------|------------------------|---------------------------------------------|
| SSL/TLS encryption mode    | **Full (strict)**      | Encrypts traffic between CF and Railway    |
| Always Use HTTPS           | **On**                 | Force HTTPS redirects                       |
| Minimum TLS Version        | **TLS 1.2**            | Security standard                           |
| Opportunistic Encryption   | **On**                 | Enable HTTP/2 and HTTP/3                    |
| TLS 1.3                    | **On**                 | Modern encryption                           |
| Automatic HTTPS Rewrites   | **On**                 | Fix mixed content                           |
| Certificate Transparency   | **On**                 | Security monitoring                         |

### Edge Certificates

- **Auto Renew**: Enabled
- **Universal SSL**: Active
- **Validity Period**: 90 days (Let's Encrypt)

---

## Step 3: Firewall Rules (WAF)

Navigate to: **Security → WAF**

### Enable Managed Rulesets

1. **Cloudflare Managed Ruleset**: ✅ On
2. **Cloudflare OWASP Core Ruleset**: ✅ On (if on Pro+ plan)
3. **Cloudflare Exposed Credentials Check**: ✅ On

### Custom Firewall Rules

Navigate to: **Security → WAF → Custom rules**

#### Rule 1: Block Non-API Traffic to Backend

```
Field: URI Path
Operator: does not start with
Value: /api/

Action: Block
```

**Purpose**: Only allow API traffic through Cloudflare to Railway backend.

#### Rule 2: Rate Limit Authentication Endpoints

```
Field: URI Path
Operator: equals
Value: /api/auth/login

AND

Field: Request Count
Operator: greater than
Value: 5
Duration: 60 seconds

Action: Challenge (Managed Challenge)
```

**Purpose**: Prevent brute force attacks on login.

#### Rule 3: Block Bad Bots

```
Field: Known Bots
Operator: equals
Value: Bad Bot

Action: Block
```

**Purpose**: Block malicious scrapers and bots.

#### Rule 4: Geo-Blocking (Optional)

```
Field: Country
Operator: is not in
Value: US, CA, GB, AU (adjust to your allowed countries)

Action: Challenge (Managed Challenge)
```

**Purpose**: Reduce attack surface by limiting geographic access.

#### Rule 5: SQL Injection Protection

```
Field: URI Query String
Operator: contains
Value: (union|select|drop|insert|update|delete|--|;--|--)

OR

Field: Request Body
Operator: contains
Value: (union|select|drop|insert|update|delete)

Action: Block
```

**Purpose**: Block common SQL injection attempts (backup to RLS).

---

## Step 4: Rate Limiting

Navigate to: **Security → WAF → Rate limiting rules**

### Rule 1: Global API Rate Limit

```
Rule Name: Global API Rate Limit
Field: URI Path
Operator: starts with
Value: /api/

Rate: 300 requests per 10 minutes
Match: IP Address

Action: Block for 10 minutes
```

### Rule 2: Auth Endpoint Protection

```
Rule Name: Auth Rate Limit
Field: URI Path
Operator: equals
Value: /api/auth/login

Rate: 10 requests per 15 minutes
Match: IP Address

Action: Block for 1 hour
```

### Rule 3: Adaptive Intelligence Write Protection

```
Rule Name: AI Write Rate Limit
Field: URI Path
Operator: equals
Value: /api/ai/adaptive/retrain

Rate: 5 requests per 1 hour
Match: IP Address

Action: Block for 1 hour
```

---

## Step 5: Page Rules

Navigate to: **Rules → Page Rules**

### Rule 1: Cache Static Assets

```
URL Pattern: *yourdomain.com/public/*

Settings:
- Cache Level: Cache Everything
- Edge Cache TTL: 1 month
- Browser Cache TTL: 1 day
```

### Rule 2: Bypass Cache for API

```
URL Pattern: *yourdomain.com/api/*

Settings:
- Cache Level: Bypass
```

**Important**: API responses should NOT be cached to ensure fresh data.

### Rule 3: Security Headers for API

```
URL Pattern: *yourdomain.com/api/*

Settings:
- Security Level: High
- SSL: Full (strict)
```

---

## Step 6: Transform Rules (Headers)

Navigate to: **Rules → Transform Rules → HTTP Response Headers**

### Add Security Headers

Create a rule to add security headers to all responses:

```
Rule Name: Security Headers
When: All incoming requests

Set Static:
- Strict-Transport-Security: max-age=31536000; includeSubDomains; preload
- X-Content-Type-Options: nosniff
- X-Frame-Options: DENY
- X-XSS-Protection: 1; mode=block
- Referrer-Policy: strict-origin-when-cross-origin
- Permissions-Policy: geolocation=(), microphone=(), camera=()
```

**Note**: These headers are already set in `server.production.js` via Helmet, but adding them at the edge provides defense in depth.

---

## Step 7: Bot Management

Navigate to: **Security → Bots**

### Settings:

| Setting                    | Value          |
|----------------------------|----------------|
| Bot Fight Mode (Free)      | ✅ On          |
| Super Bot Fight Mode (Pro) | ✅ On          |
| JavaScript Detections      | ✅ On          |
| Verified Bots              | ✅ Allow       |

**Verified Bots to Allow:**
- Google
- Bing
- Apple
- DuckDuckGo
- Slack (for webhooks)

---

## Step 8: Caching Configuration

Navigate to: **Caching → Configuration**

### Recommended Settings:

| Setting                    | Value                  |
|----------------------------|------------------------|
| Caching Level              | Standard               |
| Browser Cache TTL          | Respect Existing Headers |
| Crawler Hints              | On                     |
| Always Online              | On                     |
| Development Mode           | Off (production)       |

### Cache Rules

Navigate to: **Caching → Cache Rules**

#### Rule 1: Cache Frontend Assets

```
Rule Name: Cache Frontend
When: URI Path starts with /public/
Then: Eligible for cache
Cache TTL: 1 month
Browser TTL: 1 day
```

#### Rule 2: Never Cache API

```
Rule Name: Bypass API Cache
When: URI Path starts with /api/
Then: Bypass cache
```

---

## Step 9: Network Settings

Navigate to: **Network**

### Recommended Settings:

| Setting                    | Value          |
|----------------------------|----------------|
| HTTP/2                     | ✅ On          |
| HTTP/3 (with QUIC)         | ✅ On          |
| 0-RTT Connection Resumption| ✅ On          |
| IPv6 Compatibility         | ✅ On          |
| WebSockets                 | ✅ On          |
| Onion Routing              | ❌ Off         |
| IP Geolocation             | ✅ On          |
| Maximum Upload Size        | 100 MB         |
| Pseudo IPv4                | Add Header     |

---

## Step 10: Analytics and Logging

### Enable Logpush (Enterprise plan)

If available, configure Logpush to send WAF events to:
- Datadog
- Splunk
- S3 bucket
- Google Cloud Storage

### Free Tier Analytics

Navigate to: **Analytics → Traffic**

Monitor:
- Total requests
- Cached vs uncached
- Threat analytics
- Bot traffic
- Top countries
- Top paths

---

## Step 11: Alerting

Navigate to: **Notifications → Add**

### Recommended Alerts:

1. **DDoS Attack Detected**
   - Type: DDoS L3/L4 or L7
   - Notification: Email + Webhook

2. **WAF Alert - High Threat Score**
   - Type: Security Event
   - Threshold: Threat score > 50
   - Notification: Email + Webhook

3. **Rate Limit Exceeded**
   - Type: Rate Limiting
   - Notification: Email

4. **SSL Certificate Expiring**
   - Type: SSL/TLS
   - Days before expiry: 14
   - Notification: Email

---

## Step 12: Integration with Railway Backend

### Update Railway Environment Variables

Ensure your Railway backend knows it's behind Cloudflare:

```bash
TRUST_PROXY=true
CLOUDFLARE_ENABLED=true
```

### Update Express Configuration

In `server.production.js`:

```javascript
// Trust Cloudflare proxy
app.set('trust proxy', 1);

// Get real IP from Cloudflare headers
app.use((req, res, next) => {
  req.realIP = req.headers['cf-connecting-ip'] || req.ip;
  next();
});

// Verify requests come from Cloudflare (optional)
const cloudflareIPs = [
  '173.245.48.0/20', '103.21.244.0/22', '103.22.200.0/22',
  '103.31.4.0/22', '141.101.64.0/18', '108.162.192.0/18',
  '190.93.240.0/20', '188.114.96.0/20', '197.234.240.0/22',
  '198.41.128.0/17', '162.158.0.0/15', '104.16.0.0/13',
  '104.24.0.0/14', '172.64.0.0/13', '131.0.72.0/22'
];

const ipRangeCheck = require('ip-range-check');

app.use((req, res, next) => {
  const clientIP = req.ip;
  if (!ipRangeCheck(clientIP, cloudflareIPs)) {
    logger.warn('Request not from Cloudflare', { ip: clientIP });
    // Optionally reject: return res.status(403).json({ error: 'Forbidden' });
  }
  next();
});
```

---

## Step 13: Testing Cloudflare Setup

### Test DNS Resolution

```bash
# Verify DNS points to Cloudflare
dig api.yourdomain.com

# Should show Cloudflare IPs (104.x.x.x range)
```

### Test SSL/TLS

```bash
# Verify SSL certificate
curl -vI https://api.yourdomain.com/api/health

# Check for CF headers
curl -I https://api.yourdomain.com/api/health | grep cf-
```

Expected headers:
```
cf-ray: 8a1b2c3d4e5f6-SFO
cf-cache-status: DYNAMIC
server: cloudflare
```

### Test WAF Rules

```bash
# Should be blocked by SQL injection rule
curl "https://api.yourdomain.com/api/items?id=1' OR '1'='1"

# Should trigger rate limit after 300 requests
for i in {1..350}; do
  curl -s https://api.yourdomain.com/api/health
done
```

### Test Rate Limiting

```bash
# Auth endpoint - should block after 10 attempts
for i in {1..15}; do
  curl -X POST https://api.yourdomain.com/api/auth/login \
    -H "Content-Type: application/json" \
    -d '{"email":"test@example.com","password":"wrong"}'
done
```

---

## Step 14: Monitoring and Maintenance

### Weekly Tasks:

1. Review WAF analytics for blocked threats
2. Check rate limiting effectiveness
3. Verify cache hit ratio (should be >80% for static assets)
4. Review bot traffic patterns

### Monthly Tasks:

1. Update custom firewall rules based on threat landscape
2. Review and tune rate limits based on legitimate traffic patterns
3. Check SSL certificate expiry (should auto-renew)
4. Audit allowed/blocked countries

### Quarterly Tasks:

1. Review and update OWASP ruleset configurations
2. Pen-test firewall rules
3. Update bot allow/block lists
4. Review cache rules for optimization

---

## Terraform Configuration (Optional)

For infrastructure-as-code deployment:

```hcl
# cloudflare/main.tf

terraform {
  required_providers {
    cloudflare = {
      source  = "cloudflare/cloudflare"
      version = "~> 4.0"
    }
  }
}

provider "cloudflare" {
  api_token = var.cloudflare_api_token
}

variable "zone_id" {
  description = "Cloudflare Zone ID"
  type        = string
}

variable "railway_url" {
  description = "Railway backend URL"
  type        = string
}

# DNS Record
resource "cloudflare_record" "api" {
  zone_id = var.zone_id
  name    = "api"
  value   = var.railway_url
  type    = "CNAME"
  proxied = true
  ttl     = 1  # Auto
}

# Firewall Rule - Block non-API traffic
resource "cloudflare_firewall_rule" "block_non_api" {
  zone_id     = var.zone_id
  description = "Block non-API traffic"
  filter_id   = cloudflare_filter.non_api.id
  action      = "block"
}

resource "cloudflare_filter" "non_api" {
  zone_id     = var.zone_id
  description = "Non-API paths"
  expression  = "(not http.request.uri.path startsWith \"/api/\")"
}

# Rate Limiting - Global API
resource "cloudflare_rate_limit" "api_global" {
  zone_id   = var.zone_id
  threshold = 300
  period    = 600
  match {
    request {
      url_pattern = "*/api/*"
    }
  }
  action {
    mode    = "ban"
    timeout = 600
  }
}

# Rate Limiting - Auth
resource "cloudflare_rate_limit" "auth" {
  zone_id   = var.zone_id
  threshold = 10
  period    = 900
  match {
    request {
      url_pattern = "*/api/auth/login"
    }
  }
  action {
    mode    = "ban"
    timeout = 3600
  }
}

# Page Rule - Cache static assets
resource "cloudflare_page_rule" "cache_static" {
  zone_id  = var.zone_id
  target   = "api.yourdomain.com/public/*"
  priority = 1

  actions {
    cache_level         = "cache_everything"
    edge_cache_ttl      = 2592000  # 30 days
    browser_cache_ttl   = 86400    # 1 day
  }
}

# Page Rule - Bypass API cache
resource "cloudflare_page_rule" "bypass_api" {
  zone_id  = var.zone_id
  target   = "api.yourdomain.com/api/*"
  priority = 2

  actions {
    cache_level = "bypass"
  }
}

# SSL Settings
resource "cloudflare_zone_settings_override" "ssl_settings" {
  zone_id = var.zone_id

  settings {
    ssl                      = "strict"
    always_use_https         = "on"
    min_tls_version          = "1.2"
    opportunistic_encryption = "on"
    tls_1_3                  = "on"
    automatic_https_rewrites = "on"
  }
}
```

**Deploy with:**
```bash
cd cloudflare
terraform init
terraform plan -var="zone_id=YOUR_ZONE_ID" -var="railway_url=your-app.up.railway.app"
terraform apply
```

---

## Cost Analysis

### Cloudflare Pricing Tiers:

| Plan       | Monthly Cost | Features                                      |
|------------|--------------|-----------------------------------------------|
| Free       | $0           | Basic DDoS, WAF, SSL, CDN, 3 page rules       |
| Pro        | $20          | Advanced WAF, 20 page rules, image optimization|
| Business   | $200         | Custom SSL, 50 page rules, PCI compliance     |
| Enterprise | Custom       | Logpush, Bot Management, 24/7 phone support   |

**Recommended for NeuroPilot**: **Pro Plan ($20/month)**

**Total Stack Cost** (Production):
```
Vercel (Frontend):    $0-20/month
Railway (Backend):    $5-20/month
Neon Postgres:        $19/month (Pro tier)
Cloudflare (WAF):     $20/month (Pro tier)
OneDrive (Backup):    $0 (personal) or $10 (business)
-------------------------------------------
Total:                $44-89/month
```

---

## Security Best Practices

1. **Enable DNSSEC** in Cloudflare DNS settings
2. **Use API tokens** instead of API keys (scoped permissions)
3. **Enable 2FA** on Cloudflare account
4. **Review audit logs** weekly for unauthorized changes
5. **Test WAF rules** in "Log" mode before enabling "Block"
6. **Monitor false positives** and whitelist legitimate traffic
7. **Keep Railway backend URL secret** (only accessible via Cloudflare)
8. **Use Cloudflare Access** for admin endpoints (zero-trust model)

---

## Rollback Plan

If issues arise after enabling Cloudflare:

1. **Bypass Cloudflare temporarily**:
   - Change DNS record to "DNS only" (gray cloud)
   - Direct traffic to Railway URL

2. **Disable specific rules**:
   - Set firewall rules to "Log" mode instead of "Block"
   - Disable page rules causing caching issues

3. **Full rollback**:
   - Remove CNAME record for api subdomain
   - Update frontend to point directly to Railway URL

---

## Additional Resources

- [Cloudflare Fundamentals](https://developers.cloudflare.com/fundamentals/)
- [WAF Managed Rules](https://developers.cloudflare.com/waf/managed-rules/)
- [Rate Limiting Guide](https://developers.cloudflare.com/waf/rate-limiting-rules/)
- [Terraform Provider Docs](https://registry.terraform.io/providers/cloudflare/cloudflare/latest/docs)
- [Cloudflare IP Ranges](https://www.cloudflare.com/ips/)

---

**Version**: 1.0.0
**Last Updated**: 2025-01
**Author**: NeuroPilot AI
**Status**: Production-Ready
