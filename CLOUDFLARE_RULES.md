# Cloudflare Security Rules

## 1. Block State-Changing Requests from Non-Allowed Origins

**Rule Name**: Block Non-Allowed Origins
**Expression**:
```
(http.request.method in {"POST" "PUT" "DELETE" "PATCH"}) and 
(http.request.headers["origin"] != "https://inventory.neuropilot.ai") and 
(http.request.headers["origin"] != "")
```
**Action**: Block

## 2. Rate Limit Login Endpoint

**Rule Name**: Rate Limit Auth Login
**Expression**:
```
http.request.uri.path eq "/auth/login"
```
**Action**: Rate Limit
- **Requests**: 3 per 15 minutes
- **Per**: IP address
- **Response**: 429 Too Many Requests

## 3. Rate Limit Refresh Endpoint

**Rule Name**: Rate Limit Auth Refresh
**Expression**:
```
http.request.uri.path eq "/auth/refresh"
```
**Action**: Rate Limit (or JS Challenge)
- **Requests**: 20 per 15 minutes
- **Per**: IP address
- **Response**: 429 Too Many Requests (or JS Challenge)

## 4. JS Challenge for Auth Endpoints (Bot Protection)

**Rule Name**: Auth Endpoint Bot Protection
**Expression**:
```
http.request.uri.path contains "/auth/" and not cf.client.bot
```
**Action**: JS Challenge

## SSL/TLS Configuration

- **SSL Mode**: Full (Strict)
- **HSTS**: Enabled with preload
- **Min TLS Version**: 1.2
- **TLS 1.3**: Enabled

## Security Headers (Edge)

Add these via Transform Rules or Page Rules:
- `Strict-Transport-Security: max-age=31536000; includeSubDomains; preload`
- `X-Frame-Options: DENY`
- `X-Content-Type-Options: nosniff`
- `Referrer-Policy: strict-origin-when-cross-origin`