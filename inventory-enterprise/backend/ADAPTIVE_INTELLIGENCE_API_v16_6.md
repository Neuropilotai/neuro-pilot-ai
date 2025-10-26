# Adaptive Intelligence API - v16.6.0

## 🎯 Overview

v16.6 introduces **Adaptive Intelligence & Auto-Recovery** with a new canonical API path: `/api/ai/adaptive/*`

This replaces the legacy `/api/stability/*` endpoints while maintaining backward compatibility.

## 📍 Endpoint Mapping

### Canonical Endpoints (use these)

| Method | Endpoint | Description | Access |
|--------|----------|-------------|--------|
| GET | `/api/ai/adaptive/status` | Current policy and metrics | Authenticated |
| POST | `/api/ai/adaptive/retrain` | Run tuning cycle | Owner only |
| GET | `/api/ai/adaptive/history` | Tuning history | Admin/Owner |
| GET | `/api/ai/adaptive/metrics` | Detailed telemetry | Admin/Owner |
| POST | `/api/ai/adaptive/apply/:id` | Apply recommendation | Owner only |
| PUT | `/api/ai/adaptive/policy` | Update policy | Owner only |
| GET | `/api/ai/adaptive/health` | Health score | Authenticated |

### Legacy Endpoints (deprecated)

⚠️ **Deprecated - Will be removed in v17.0**

| Old Path | New Path |
|----------|----------|
| `/api/stability/status` | `/api/ai/adaptive/status` |
| `/api/stability/tune` | `/api/ai/adaptive/retrain` |
| `/api/stability/recommendations` | `/api/ai/adaptive/history` |
| `/api/stability/metrics` | `/api/ai/adaptive/metrics` |
| `/api/stability/apply/:id` | `/api/ai/adaptive/apply/:id` |
| `/api/stability/policy` | `/api/ai/adaptive/policy` |
| `/api/stability/health` | `/api/ai/adaptive/health` |

**Note:** Legacy paths still work but log deprecation warnings.

---

## 🧪 Quick Test

```bash
TOKEN=$(cat .owner_token)

# Status
curl -s -H "Authorization: Bearer $TOKEN" \
  http://localhost:8083/api/ai/adaptive/status | python3 -m json.tool

# Retrain (accepts days & force parameters)
curl -s -X POST -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"days":30,"force":false}' \
  http://localhost:8083/api/ai/adaptive/retrain | python3 -m json.tool

# History (accepts limit & applied parameters)
curl -s -H "Authorization: Bearer $TOKEN" \
  "http://localhost:8083/api/ai/adaptive/history?limit=10" | python3 -m json.tool

# Metrics (confirm ai_ series are exposed)
curl -s http://localhost:8083/metrics | grep -E '^ai_'
```

---

## 🔧 Verification Script

Run the automated verification script:

```bash
cd inventory-enterprise/backend
./scripts/verify_adaptive_intelligence.sh
```

This will test:
- ✅ All canonical endpoints (`/api/ai/adaptive/*`)
- ✅ Legacy endpoints still work (with deprecation warnings)
- ✅ Prometheus metrics exposure

---

## 📊 Example Responses

### GET /api/ai/adaptive/status

```json
{
  "success": true,
  "data": {
    "policy": {
      "max_retries": 3,
      "base_delay_ms": 200,
      "jitter_pct": 30,
      "cron_min_interval_min": 15,
      "enabled": true,
      "auto_tune_enabled": true,
      "last_updated": "2025-10-20T10:30:00Z",
      "updated_by": "AUTO"
    },
    "metrics": {
      "observation_count": 1247,
      "success_rate": 98.5,
      "avg_attempts": 1.2,
      "lock_rate": 1.8,
      "avg_duration_ms": 45
    },
    "recommendations": {
      "pending": 0,
      "applied": 3,
      "total": 3
    },
    "tuner": {
      "is_running": false,
      "last_tune": "2025-10-20T08:15:00Z",
      "tune_count": 3
    }
  }
}
```

### POST /api/ai/adaptive/retrain

```json
{
  "success": true,
  "message": "Retrain cycle completed",
  "recommendation_id": 4,
  "window_days": 30,
  "recommendation": {
    "from": {
      "max_retries": 3,
      "base_delay_ms": 200,
      "jitter_pct": 30,
      "cron_min_interval_min": 15
    },
    "to": {
      "max_retries": 3,
      "base_delay_ms": 150,
      "jitter_pct": 30,
      "cron_min_interval_min": 15
    },
    "reason": "Excellent success rate (99.2%) allows faster retries"
  }
}
```

### GET /api/ai/adaptive/history

```json
{
  "success": true,
  "data": {
    "total": 3,
    "limit": 10,
    "history": [
      {
        "id": 3,
        "timestamp": "2025-10-20T08:15:00Z",
        "from": {
          "max_retries": 3,
          "base_delay_ms": 250,
          "jitter_pct": 30,
          "cron_min_interval_min": 15
        },
        "to": {
          "max_retries": 3,
          "base_delay_ms": 200,
          "jitter_pct": 30,
          "cron_min_interval_min": 15
        },
        "reason": "Excellent success rate (98.8%) allows faster retries",
        "author": "AUTO",
        "applied": true,
        "applied_at": "2025-10-20T08:15:30Z",
        "applied_by": "AUTO",
        "telemetry": {
          "observation_count": 1124,
          "success_rate": 98.8,
          "avg_attempts": 1.15,
          "p95_duration_ms": 120,
          "lock_rate": 1.2
        }
      }
    ]
  }
}
```

---

## 🔐 Authentication

All endpoints require JWT authentication via the `Authorization: Bearer <token>` header.

- **Owner-only endpoints**: `/retrain`, `/apply/:id`, `/policy`
- **Admin/Owner endpoints**: `/metrics`, `/history`
- **Authenticated endpoints**: `/status`, `/health`

---

## 🚀 Migration Guide

### For Scripts

**Before:**
```bash
curl -s -H "Authorization: Bearer $TOKEN" \
  http://localhost:8083/api/stability/status
```

**After:**
```bash
curl -s -H "Authorization: Bearer $TOKEN" \
  http://localhost:8083/api/ai/adaptive/status
```

### For Frontend Code

**Before:**
```javascript
fetch('/api/stability/status', {
  headers: { 'Authorization': `Bearer ${token}` }
})
```

**After:**
```javascript
fetch('/api/ai/adaptive/status', {
  headers: { 'Authorization': `Bearer ${token}` }
})
```

---

## 📝 Implementation Details

### Dual-Path Mounting

Both paths are mounted in `server.js`:

```javascript
// v16.6.0 - Adaptive Intelligence & Auto-Recovery
// Canonical path (new)
app.use('/api/ai/adaptive', stabilityRoutes);

// Legacy alias (deprecated, kept for backward compatibility)
app.use('/api/stability', (req, res, next) => {
  logger.warn('[DEPRECATION] /api/stability* → use /api/ai/adaptive*', {
    path: req.originalUrl,
    ip: req.ip,
    user: req.user?.email || 'unauthenticated'
  });
  next();
}, stabilityRoutes);
```

### New Endpoints

Added in `routes/stability.js`:

- **POST `/retrain`** - Canonical alias for `/tune` with enhanced request parameters
- **GET `/history`** - Canonical alias for `/recommendations` with improved response format

---

## 🎯 Why This Change?

1. **Semantic Clarity**: "Adaptive Intelligence" better describes the AI-driven nature of the system
2. **API Consistency**: Aligns with existing `/api/ai/*` namespace
3. **Future-Proofing**: Better positioning for v17+ enhancements
4. **Backward Compatibility**: Legacy paths still work during migration period

---

## 📚 Related Documentation

- [Predictive Stability Layer Guide](./V16_1_0_PREDICTIVE_CONTROL_PANEL_GUIDE.md)
- [DB Retry Implementation](./DB_RETRY_IMPLEMENTATION_COMPLETE.md)
- [Verification Script](./scripts/verify_adaptive_intelligence.sh)

---

## 📅 Deprecation Timeline

- **v16.6** (October 2025): Introduce `/api/ai/adaptive/*`, deprecate `/api/stability/*`
- **v16.7-16.9** (Q4 2025): Migration period - both paths work with warnings
- **v17.0** (January 2026): Remove `/api/stability/*` entirely

---

**Generated**: 2025-10-20
**Version**: 16.6.0
**Author**: NeuroInnovate AI Team
