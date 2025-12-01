# AI Engine V22.2 Hardening - Documentation

## Overview

This document describes the hardening changes made to the NeuroPilot AI Engine V22.1 to produce V22.2, ensuring enterprise-grade security, data purity, and auditability.

---

## Changelog

### V22.2 Hardening Release (2025-11-30)

#### Files Created
| File | Purpose |
|------|---------|
| `backend/lib/aiAudit.js` | Centralized audit logging with strict schema |
| `backend/lib/aiSchemas.js` | Data contracts with runtime validation |
| `backend/tests/ai-engine.test.js` | Integration tests for AI endpoints |
| `backend/docs/AI_ENGINE_V22_HARDENING.md` | This documentation |

#### Files Modified
| File | Changes |
|------|---------|
| `backend/services/aiEngine.js` | V22.2 - Added strict mode, input validation, bounded outputs, enhanced audit logging, SQL injection fix |
| `backend/routes/ai-engine.js` | V22.2 - Added audit middleware, strict tenant validation, mode-aware responses |

---

## Safety & Data Purity

### How We Guarantee "NO FAKE DATA" in Production

1. **Read-Only from Business Tables**
   - AI Engine queries `inventory_movements`, `item_locations`, `vendors`, `population` for data
   - **NEVER writes** to these tables
   - All forecasts, anomalies, and suggestions are derived from real historical data

2. **Write-Only to AI Tables**
   - In `production` mode, writes are restricted to:
     - `ai_ops_breadcrumbs` (audit logging)
     - `ai_forecasts` (forecast storage - if implemented)
   - Core business tables are explicitly blocked

3. **No Data Generation**
   - No mock data generators
   - No random SKU/vendor creation
   - If no historical data exists, API returns empty arrays with informative messages

4. **Input Validation**
   - All inputs validated via `aiSchemas.js`
   - Invalid inputs are rejected with 400 errors
   - Validation failures are logged to `ai_ops_breadcrumbs`

5. **Output Bounding**
   - All numeric values clamped to safe ranges:
     - Quantities: 0 to 1,000,000
     - Confidence: 0 to 1
     - Z-scores: -100 to 100
     - Lead times: 0 to 365 days
   - Prevents absurd/infinite values from propagating

### How Simulation is Separated and Controlled

1. **Mode Flag**
   - Environment variable: `AI_ENGINE_MODE`
   - Values: `production` (default) | `simulation`
   - Logged on startup and included in all API responses

2. **Mode Enforcement**
   - `aiAudit.validateModeOperation(operation, targetTable)` checks write permissions
   - In simulation mode, additional tables are writable:
     - `ai_simulation_forecasts`
     - `ai_simulation_scenarios`

3. **Clear Separation**
   - Simulation data never mixes with production data
   - All audit logs include `mode` field for traceability

---

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `AI_ENGINE_MODE` | `production` | AI Engine operating mode (`production` or `simulation`) |
| `AI_AUDIT_DEBUG` | `false` | Set to `true` for verbose audit logging |

### Example Configuration

```bash
# Production (default)
AI_ENGINE_MODE=production

# Development/Testing
AI_ENGINE_MODE=simulation
AI_AUDIT_DEBUG=true
```

---

## Tenant & Org Isolation

### How Isolation is Enforced

1. **All Queries Include `org_id`**
   - Every database query in `aiEngine.js` includes `WHERE org_id = $1`
   - No cross-tenant data aggregation

2. **Strict Tenant Validation**
   - `ensureTenant` middleware in routes returns 400 if no tenant context
   - Tenant resolution priority:
     1. `req.tenant.tenantId` (from tenant middleware)
     2. `req.user.org_id` (from JWT)
     3. `req.user.tenant_id` (fallback)
   - `'default'` is NOT used as fallback in routes (explicit tenant required)

3. **Access Denial Logging**
   - Failed tenant resolution logged to `ai_ops_breadcrumbs` with `access_denied` event type

---

## Data Contracts

### Input Schemas

```javascript
// Forecast Input
{
  orgId: string,      // Required
  itemCode?: string,  // Optional, max 255 chars
  siteId?: string,    // Optional, max 255 chars
  horizonDays?: number // Optional, clamped 1-365
}

// Reorder Input
{
  orgId: string,      // Required
  limit?: number,     // Optional, clamped 1-100
  siteId?: string     // Optional
}

// Anomaly Input
{
  orgId: string,      // Required
  windowDays?: number, // Optional, clamped 1-90
  itemCode?: string   // Optional
}
```

### Output Schemas

All outputs are validated and sanitized via `aiSchemas.js`:

- **ForecastResult**: Bounded predictions with confidence intervals
- **ReorderSuggestion**: Valid urgency levels, bounded quantities
- **AnomalyRecord**: Valid severity, bounded z-scores
- **PopulationFactors**: Bounded population counts

---

## Audit Logging

### Audit Event Structure

```javascript
{
  eventType: string,    // One of: api_request, forecast_run, reorder_run, anomaly_run, etc.
  action: string,       // Human-readable action
  endpoint?: string,    // API endpoint (e.g., "GET /api/ai/forecast")
  orgId?: string,       // Tenant/org ID
  userId?: string,      // User ID from JWT
  rowsRead?: number,    // DB rows read
  rowsWritten?: number, // DB rows written
  durationMs?: number,  // Operation duration
  success?: boolean,    // Success/failure flag
  errorMessage?: string,// Error message if failed
  metadata?: object     // Additional context
}
```

### Event Types

| Event Type | Description |
|------------|-------------|
| `api_request` | Incoming API request |
| `forecast_run` | Forecast generation |
| `reorder_run` | Reorder suggestion generation |
| `anomaly_run` | Anomaly detection run |
| `population_query` | Population data query |
| `health_check` | Health check |
| `validation_error` | Input validation failure |
| `access_denied` | Permission/tenant denial |
| `simulation_run` | Simulation mode operation |
| `data_write` | Data written to DB |
| `error` | Error occurred |

---

## SQL Injection Protection

### Fixed Vulnerability

**Before (V22.1):**
```javascript
// VULNERABLE - windowDays interpolated directly
query += ` AND date >= CURRENT_DATE - INTERVAL '${windowDays} days'`;
```

**After (V22.2):**
```javascript
// SAFE - windowDays is a bound parameter
query += ` AND date >= CURRENT_DATE - $2 * INTERVAL '1 day'`;
params.push(windowDays);
```

### Verification

All queries in `aiEngine.js` use parameterized queries with `$1, $2, ...` placeholders.

---

## Integration Tests

### Running Tests

```bash
# Basic test (no auth - tests health endpoint and validates structures)
node tests/ai-engine.test.js

# With authentication (tests all endpoints)
AI_TEST_TOKEN="your-jwt-token" node tests/ai-engine.test.js

# Against production
AI_TEST_URL="https://inventory-backend-production.railway.app" \
AI_TEST_TOKEN="your-jwt-token" \
node tests/ai-engine.test.js
```

### Test Coverage

1. **Health endpoint** - Returns valid structure with mode
2. **Mode consistency** - Mode is one of `production` or `simulation`
3. **Forecast endpoint** - Returns bounded predictions
4. **Reorder endpoint** - Valid urgency levels, bounded quantities
5. **Anomalies endpoint** - Valid severity, bounded z-scores
6. **Population endpoint** - Bounded population values
7. **Dashboard endpoint** - Combined response structure

---

## Migration: Simulation Tables (Optional)

If simulation mode is needed, create the simulation tables:

```sql
-- Migration: Create AI simulation tables

CREATE TABLE IF NOT EXISTS ai_simulation_forecasts (
  id SERIAL PRIMARY KEY,
  simulation_id UUID NOT NULL,
  org_id VARCHAR(255) NOT NULL,
  item_code VARCHAR(255) NOT NULL,
  forecast_date DATE NOT NULL,
  predicted_value DECIMAL(10,4),
  confidence_lower DECIMAL(10,4),
  confidence_upper DECIMAL(10,4),
  parameters JSONB DEFAULT '{}',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  created_by VARCHAR(255)
);

CREATE TABLE IF NOT EXISTS ai_simulation_scenarios (
  id SERIAL PRIMARY KEY,
  simulation_id UUID NOT NULL,
  org_id VARCHAR(255) NOT NULL,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  parameters JSONB DEFAULT '{}',
  status VARCHAR(50) DEFAULT 'draft',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  created_by VARCHAR(255)
);

CREATE INDEX idx_sim_forecasts_org ON ai_simulation_forecasts(org_id);
CREATE INDEX idx_sim_scenarios_org ON ai_simulation_scenarios(org_id);
```

---

## Frontend Integration

The AI Insights page should be added to `neuropilot-frontend` at `src/pages/AiInsights.jsx`:

```jsx
// Key endpoints to use:
// GET /api/ai/dashboard - Combined view
// GET /api/ai/forecast - Demand forecasts
// GET /api/ai/reorder - Reorder suggestions
// GET /api/ai/anomalies - Anomaly detection
// GET /api/ai/population - Population factors

// All responses include:
// - success: boolean
// - mode: "production" | "simulation"
// - Tenant-scoped data only
```

---

## Quick Reference

### API Endpoints

| Endpoint | Auth Required | Description |
|----------|---------------|-------------|
| `GET /api/ai/health` | No | Health check |
| `GET /api/ai/forecast` | Yes | Demand forecasts |
| `GET /api/ai/forecast/:itemCode` | Yes | Single item forecast |
| `GET /api/ai/reorder` | Yes | Reorder suggestions |
| `GET /api/ai/reorder/urgent` | Yes | Urgent reorder items |
| `GET /api/ai/anomalies` | Yes | Anomaly detection |
| `GET /api/ai/anomalies/summary` | Yes | Anomaly summary |
| `GET /api/ai/population` | Yes | Population factors |
| `GET /api/ai/dashboard` | Yes | Combined dashboard |
| `GET /api/ai/breadcrumbs` | Yes | Audit log |

### Health Check Response

```json
{
  "status": "healthy",
  "version": "V22.2",
  "mode": "production",
  "features": {
    "demandForecasting": true,
    "reorderSuggestions": true,
    "anomalyDetection": true,
    "populationScaling": true,
    "dataValidation": true,
    "auditLogging": true
  },
  "database": {
    "connected": true,
    "breadcrumbsTable": true
  },
  "latencyMs": 15
}
```

---

## Summary

V22.2 hardens the AI Engine with:

- **Strict Mode Flag** - `AI_ENGINE_MODE` controls behavior
- **Data Contracts** - Runtime validation via `aiSchemas.js`
- **Audit Logging** - Full request/response tracking via `aiAudit.js`
- **SQL Injection Fix** - All queries parameterized
- **Tenant Isolation** - Strict `org_id` scoping
- **Bounded Outputs** - No infinite/absurd values
- **NO FAKE DATA** - Real PostgreSQL data only
