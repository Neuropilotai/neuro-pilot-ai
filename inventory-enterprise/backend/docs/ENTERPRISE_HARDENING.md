# Enterprise Hardening Implementation

## Overview

This document describes the enterprise hardening features added to the inventory management system, including multi-tenant isolation, materialized balance tables, and backup/recovery systems.

## Features Implemented

### 1. Multi-Tenant Database Isolation

- **Organization Model**: Added to Prisma schema with support for subdomain and API key resolution
- **Tenant Resolution**: Enhanced middleware supports:
  - X-Org-Id header (explicit)
  - Subdomain parsing (e.g., org1.yourapp.com)
  - API key lookup (X-API-Key header)
  - Default org fallback
- **Query Scoping**: Automatic orgId filtering on all tenant-scoped queries
- **Validation**: Extra safety checks prevent cross-tenant data access

### 2. Materialized Inventory Balance Table

- **Table**: `inventory_balances` - Fast balance queries (10x+ faster than ledger SUM)
- **Automatic Updates**: PostgreSQL trigger updates balance on ledger INSERT
- **Reconciliation**: Daily job detects and auto-corrects discrepancies
- **Backfill Script**: Populates balances from existing ledger data

### 3. Enhanced Authentication & Validation

- **JWT Authentication**: Enhanced auth middleware with user context injection
- **Request Validation**: Zod schemas for all request types (body, query, params)
- **RBAC Helpers**: Role-based access control middleware (requireAdmin, requireEditor, requireCounter)

### 4. Backup & Recovery

- **Monitoring Job**: Daily backup status verification
- **Verification Scripts**: Manual backup validation tools
- **Documentation**: Complete backup and disaster recovery procedures

## File Structure

```
inventory-enterprise/backend/
├── prisma/
│   └── schema.prisma              # Prisma schema with Organization and InventoryBalance
├── migrations/postgres/
│   └── 041_inventory_balance_table.sql  # Balance table migration
├── src/
│   ├── middleware/
│   │   ├── tenant-enhancement.js   # Enhanced tenant resolution
│   │   ├── auth-enhancement.js    # Enhanced authentication
│   │   └── validation.js          # Request validation
│   ├── routes/
│   │   ├── items-enterprise.js    # Enhanced items routes
│   │   ├── locations-enterprise.js # Enhanced locations routes
│   │   └── counts-enterprise.js   # Enhanced counts routes
│   ├── schemas/
│   │   ├── items.js               # Item validation schemas
│   │   ├── locations.js           # Location validation schemas
│   │   └── counts.js              # Count validation schemas
│   ├── utils/
│   │   ├── query-scope.js         # Query scoping utilities
│   │   └── prisma-client.js       # Prisma client wrapper
│   └── jobs/
│       ├── balance-reconciliation.js  # Daily reconciliation job
│       └── backup-monitor.js      # Backup monitoring job
├── scripts/
│   ├── create-organization.js     # Create org CLI
│   ├── list-organizations.js      # List orgs CLI
│   ├── validate-migration.js      # Migration validation
│   └── backfill-balances.js       # Balance backfill
└── docs/
    └── ENTERPRISE_HARDENING.md    # This file
```

## Migration Guide

### Step 1: Run Balance Table Migration

```bash
cd inventory-enterprise/backend
psql $DATABASE_URL -f migrations/postgres/041_inventory_balance_table.sql
```

### Step 2: Backfill Balances

```bash
npm run backfill:balances
```

### Step 3: Verify Migration

```bash
npm run validate:migration
```

## Usage

### Tenant Resolution

The system automatically resolves organization from:
1. `X-Org-Id` header
2. Subdomain (e.g., `org1.example.com`)
3. `X-API-Key` header
4. Default org (from `DEFAULT_ORG_ID` env var)

### Using Enhanced Routes

```bash
# List items (with tenant isolation)
curl -H "X-Org-Id: <org-id>" http://localhost:3000/api/items-enterprise

# Create item (requires admin)
curl -X POST -H "X-Org-Id: <org-id>" -H "Authorization: Bearer <token>" \
  http://localhost:3000/api/items-enterprise \
  -d '{"itemNumber": "ITEM-001", "name": "Apples"}'
```

### Balance Reconciliation

Run daily reconciliation:

```bash
npm run reconcile:balances
```

Or schedule with cron:

```bash
0 2 * * * cd /path/to/backend && npm run reconcile:balances
```

## API Endpoints

### Enterprise Routes

- `GET /api/items-enterprise` - List items (enhanced)
- `GET /api/items-enterprise/:id` - Get item (enhanced)
- `POST /api/items-enterprise` - Create item (Admin only)
- `PATCH /api/items-enterprise/:id` - Update item (Editor+)

- `GET /api/locations-enterprise` - List locations (enhanced)
- `GET /api/locations-enterprise/:id` - Get location (enhanced)
- `POST /api/locations-enterprise` - Create location (Admin only)

- `POST /api/counts-enterprise` - Create count sheet
- `GET /api/counts-enterprise/:id` - Get count sheet with lines
- `POST /api/counts-enterprise/:id/lines` - Add count line
- `POST /api/counts-enterprise/:id/post` - Post to ledger (Editor+)

## Scripts

- `npm run org:create <name> [subdomain] [apiKey]` - Create organization
- `npm run org:list` - List all organizations
- `npm run validate:migration` - Validate migration status
- `npm run backfill:balances` - Backfill balance table
- `npm run reconcile:balances` - Run reconciliation
- `npm run monitor:backups` - Check backup status

## Related Documentation

- See existing routes for standard endpoints
- See `prisma/schema.prisma` for data model
- See migration files for database changes

