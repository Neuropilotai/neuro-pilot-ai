# Routes Implementation Guide

## Overview

Complete route implementations with tenant isolation for all core inventory endpoints.

## Route Files

### 1. Items Routes (`apps/api/src/routes/items.ts`)

**Endpoints**:
- `GET /api/items` - List items with filtering
- `GET /api/items/:id` - Get single item
- `POST /api/items` - Create item (Admin only)
- `PATCH /api/items/:id` - Update item (Admin/Editor only)

**Features**:
- ✅ Tenant isolation via scoped Prisma
- ✅ RBAC enforcement (Admin/Editor roles)
- ✅ Search and filtering support
- ✅ Validation of org access
- ✅ Item number uniqueness per org

**Usage Example**:
```typescript
// List items
GET /api/items?category=Produce&isActive=true&search=apple

// Create item
POST /api/items
{
  "itemNumber": "ITEM-001",
  "name": "Apples",
  "nameEn": "Apples",
  "nameFr": "Pommes",
  "category": "Produce",
  "canonicalUom": "kg"
}
```

### 2. Locations Routes (`apps/api/src/routes/locations.ts`)

**Endpoints**:
- `GET /api/locations` - List locations
- `GET /api/locations/:id` - Get single location
- `POST /api/locations` - Create location (Admin only)

**Features**:
- ✅ Tenant isolation
- ✅ Filtering by kind, site, active status
- ✅ Location uniqueness per org/site
- ✅ RBAC enforcement

**Usage Example**:
```typescript
// List locations
GET /api/locations?kind=DRY&site=Main

// Create location
POST /api/locations
{
  "name": "Dry Storage 1",
  "site": "Main",
  "kind": "DRY",
  "sortOrder": 1
}
```

### 3. Count Sheets Routes (`apps/api/src/routes/counts.ts`)

**Endpoints**:
- `POST /api/counts` - Create count sheet
- `GET /api/counts/:id` - Get count sheet with lines
- `POST /api/counts/:id/lines` - Add count line
- `POST /api/counts/:id/post` - Post to ledger (Editor+)

**Features**:
- ✅ Tenant isolation
- ✅ Automatic count number generation
- ✅ Balance lookup for expected quantities
- ✅ Variance calculation
- ✅ Ledger posting with correlation IDs
- ✅ RBAC enforcement

**Usage Example**:
```typescript
// Create count sheet
POST /api/counts
{
  "scheduledFor": "2024-01-15T08:00:00Z",
  "notes": "Monthly inventory count"
}

// Add count line
POST /api/counts/:id/lines
{
  "itemId": "item-123",
  "locationId": "loc-456",
  "countedQty": 100,
  "countedUom": "ea"
}

// Post to ledger
POST /api/counts/:id/post
```

### 4. Inventory Routes (`apps/api/src/routes/inventory.example.ts`)

**Endpoints**:
- `GET /api/inventory/balance` - Get balance for item/location
- `GET /api/inventory/balances` - Get all balances
- `GET /api/inventory/ledger` - Get ledger entries
- `POST /api/inventory/adjust` - Manual adjustment

**Features**:
- ✅ Uses materialized balance table
- ✅ Tenant isolation
- ✅ Ledger audit trail

### 5. Route Registration (`apps/api/src/routes/index.ts`)

**Purpose**: Central registration point for all routes

**Features**:
- ✅ Applies tenant middleware to all routes
- ✅ Health check endpoints (no tenant required)
- ✅ Organized route registration
- ✅ Ready for additional routes

**Usage in Server**:
```typescript
import { registerRoutes } from './routes';

const server = fastify();
await registerRoutes(server);
```

## Tenant Isolation Pattern

All routes follow this pattern:

```typescript
export async function handler(req: TenantRequest, reply: FastifyReply) {
  const { orgId } = req;
  
  // 1. Verify orgId resolved
  if (!orgId) {
    return reply.status(401).send({ error: 'Organization not resolved' });
  }

  // 2. Create scoped Prisma client
  const scopedPrisma = createScopedPrisma(orgId, prisma);

  // 3. Use scoped client for all queries
  const items = await scopedPrisma.item.findMany();

  // 4. Validate org access for single resources
  validateOrgAccess(orgId, item, 'Item');

  // 5. Return response
  return reply.send({ items });
}
```

## RBAC Enforcement

Routes check user roles:

```typescript
// Admin only
if (!user || user.role !== 'ADMIN') {
  return reply.status(403).send({ error: 'Admin access required' });
}

// Editor or Admin
if (!['EDITOR', 'ADMIN'].includes(user.role)) {
  return reply.status(403).send({ error: 'Editor access required' });
}

// Counter, Editor, Approver, or Admin
if (!['COUNTER', 'EDITOR', 'APPROVER', 'ADMIN'].includes(user.role)) {
  return reply.status(403).send({ error: 'Counter access required' });
}
```

## Error Handling

All routes include:
- ✅ Input validation
- ✅ Resource existence checks
- ✅ Org access validation
- ✅ Proper HTTP status codes
- ✅ Error logging
- ✅ User-friendly error messages

## Security Features

1. **Tenant Isolation**: All queries automatically scoped by orgId
2. **Access Validation**: Extra checks prevent cross-org access
3. **RBAC**: Role-based permissions enforced
4. **Input Validation**: Required fields checked
5. **Uniqueness**: Per-org uniqueness constraints
6. **Audit Trail**: Ledger entries track all changes

## Next Steps

1. **Install Fastify**:
   ```bash
   npm install fastify --workspace=@neuro/api
   ```

2. **Add Authentication Middleware**:
   - JWT validation
   - User context injection
   - Role extraction

3. **Add Request Validation**:
   - Zod schemas for request bodies
   - Query parameter validation
   - Type-safe request/response types

4. **Add Remaining Routes**:
   - Authentication routes
   - Import routes
   - Export routes
   - Audit log routes

## Related Documentation

- [Setup Guide](./SETUP_GUIDE.md)
- [Quick Reference](./QUICK_REFERENCE.md)
- [Testing Guide](./TESTING.md)

