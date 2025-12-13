# Tenant Resolution Priority Chain Fix

## Issue

The tenant resolution priority chain used `else if` statements that prevented falling through to the API key check (Priority 3) when subdomain resolution was attempted. If a request had a hostname without a subdomain (e.g., "localhost"), the subdomain check executed, found no subdomain, and then stopped. The API key check never ran because it was also in an `else if` block.

## Root Cause

In `inventory-enterprise/backend/src/middleware/tenant-enhancement.js`, line 92 used:
```javascript
else if (req.hostname || req.headers.host) {
```

This condition is **always true** for any HTTP request (hostname always exists), so:
1. Priority 1 (X-Org-Id) runs if header exists
2. Priority 2 (Subdomain) **always runs** because hostname exists
3. Priority 3 (API key) **never runs** because it's blocked by the `else if` chain

## Solution

Changed the `else if` chain to independent `if` statements with `!org` guards:

```javascript
// Priority 1: X-Org-Id header
if (req.headers['x-org-id']) {
  // ... resolve org
}

// Priority 2: Subdomain parsing (only if org not resolved yet)
if (!org && (req.hostname || req.headers.host)) {
  const subdomain = extractSubdomain(hostname);
  if (subdomain) {
    // ... resolve org
  }
}

// Priority 3: API key lookup (only if org not resolved yet)
if (!org && req.headers['x-api-key']) {
  // ... resolve org
}

// Priority 4: Default org (only if org not resolved yet)
if (!org && process.env.DEFAULT_ORG_ID) {
  // ... resolve org
}
```

## Result

Now the priority chain works correctly:
1. **Priority 1**: X-Org-Id header (if present, use it)
2. **Priority 2**: Subdomain (only if org not resolved AND hostname has subdomain)
3. **Priority 3**: API key (only if org not resolved AND API key header exists) ✅ **Now runs correctly**
4. **Priority 4**: Default org (only if org not resolved AND default exists)

## Testing

To verify the fix works:

```bash
# Test 1: API key should work when no subdomain
curl -H "X-Api-Key: <api-key>" http://localhost:3000/api/items-enterprise

# Test 2: API key should work when subdomain doesn't resolve
curl -H "Host: localhost" -H "X-Api-Key: <api-key>" http://localhost:3000/api/items-enterprise

# Test 3: Subdomain should still work
curl -H "Host: org1.example.com" http://org1.example.com/api/items-enterprise
```

## Commit

- **Commit**: `f6d18fb566`
- **Message**: "fix: Tenant resolution priority chain - allow API key fallthrough"
- **File**: `inventory-enterprise/backend/src/middleware/tenant-enhancement.js`

