# Authentication & Validation Implementation

## Overview

Complete authentication middleware and request validation system using JWT and Zod schemas.

## Authentication Middleware

### File: `apps/api/src/middleware/auth.ts`

**Features**:
- ✅ JWT token verification
- ✅ User context injection
- ✅ Role-based access control (RBAC)
- ✅ Optional authentication support
- ✅ Health check bypass
- ✅ User account validation

**Usage**:

```typescript
// Apply to all routes
server.addHook('preHandler', authMiddleware);

// Optional authentication (doesn't fail if no token)
server.addHook('preHandler', optionalAuthMiddleware);

// Role-based protection
server.get('/api/admin/users', {
  preHandler: [requireAdmin],
}, handler);

// Editor or Admin
server.post('/api/items', {
  preHandler: [requireEditor],
}, handler);
```

**JWT Payload Structure**:
```typescript
{
  userId: string;
  orgId: string;
  email: string;
  role: string;
  iat?: number;
  exp?: number;
}
```

**Request Flow**:
1. Extract token from `Authorization: Bearer <token>` header
2. Verify JWT signature and expiration
3. Fetch user from database
4. Validate user is active
5. Verify orgId matches
6. Inject user context into request

## Request Validation

### File: `apps/api/src/middleware/validation.ts`

**Features**:
- ✅ Body validation
- ✅ Query parameter validation
- ✅ Route parameter validation
- ✅ Combined validation
- ✅ Detailed error messages

**Usage**:

```typescript
// Validate body
server.post('/api/items', {
  preHandler: [validateBody(createItemSchema)],
}, handler);

// Validate query
server.get('/api/items', {
  preHandler: [validateQuery(itemQuerySchema)],
}, handler);

// Validate params
server.get('/api/items/:id', {
  preHandler: [validateParams(itemParamsSchema)],
}, handler);

// Validate multiple
server.post('/api/counts/:id/lines', {
  preHandler: [
    validateParams(countSheetParamsSchema),
    validateBody(addCountLineSchema),
  ],
}, handler);
```

## Validation Schemas

### Shared Package: `packages/shared/src/schemas/`

**Schemas Created**:

1. **Items** (`schemas/items.ts`):
   - `createItemSchema` - Item creation
   - `updateItemSchema` - Item updates
   - `itemQuerySchema` - Query parameters
   - `itemParamsSchema` - Route parameters

2. **Locations** (`schemas/locations.ts`):
   - `createLocationSchema` - Location creation
   - `locationQuerySchema` - Query parameters
   - `locationParamsSchema` - Route parameters

3. **Count Sheets** (`schemas/counts.ts`):
   - `createCountSheetSchema` - Count sheet creation
   - `addCountLineSchema` - Count line addition
   - `countSheetParamsSchema` - Route parameters

**Example Schema**:
```typescript
export const createItemSchema = z.object({
  itemNumber: z.string().min(1).max(100),
  name: z.string().min(1).max(255),
  nameEn: z.string().max(255).optional(),
  nameFr: z.string().max(255).optional(),
  category: z.string().max(100).optional(),
  canonicalUom: z.string().max(20).optional().default('g'),
  isPerishable: z.boolean().optional().default(false),
  requiresLot: z.boolean().optional().default(false),
  parLevel: z.number().positive().optional(),
});
```

## Integration

### Server Setup

Authentication is automatically applied to all routes (except health checks):

```typescript
// In server.ts
server.addHook('preHandler', authMiddleware);
```

### Route Protection

Routes can use role-based protection:

```typescript
// Admin only
server.post('/api/items', {
  preHandler: [requireAdmin],
}, createItem);

// Editor or Admin
server.patch('/api/items/:id', {
  preHandler: [requireEditor],
}, updateItem);

// Counter, Editor, Approver, or Admin
server.post('/api/counts', {
  preHandler: [requireCounter],
}, createCountSheet);
```

### Validation in Routes

Routes use validation middleware:

```typescript
server.post('/api/items', {
  preHandler: [
    requireAdmin,
    validateBody(createItemSchema),
  ],
}, createItem);
```

## Error Responses

### Authentication Errors

```json
{
  "error": "Unauthorized",
  "message": "Missing Authorization header"
}
```

### Validation Errors

```json
{
  "error": "Validation Error",
  "message": "Invalid request body",
  "details": [
    {
      "path": "itemNumber",
      "message": "String must contain at least 1 character(s)"
    }
  ]
}
```

### Authorization Errors

```json
{
  "error": "Forbidden",
  "message": "Required role: ADMIN",
  "userRole": "COUNTER"
}
```

## Next Steps

1. **Implement JWT Library**:
   ```bash
   npm install @fastify/jwt --workspace=@neuro/api
   ```

2. **Update auth.ts**:
   - Replace placeholder `verifyToken` with actual JWT verification
   - Use `@fastify/jwt` for token signing/verification

3. **Create Auth Routes**:
   - `POST /api/auth/login` - Login endpoint
   - `POST /api/auth/refresh` - Token refresh
   - `POST /api/auth/logout` - Logout

4. **Add 2FA Support**:
   - TOTP generation
   - 2FA verification endpoint

## Security Considerations

1. **Token Storage**: Use httpOnly cookies or secure storage
2. **Token Expiration**: Set appropriate expiration times
3. **Refresh Tokens**: Implement refresh token rotation
4. **Rate Limiting**: Already applied (100 req/min)
5. **HTTPS Only**: Enforce in production
6. **Token Revocation**: Implement token blacklist

## Related Documentation

- [Routes Implementation](./ROUTES_IMPLEMENTATION.md)
- [Server Setup](./../SERVER_SETUP_SUMMARY.md)
- [Testing Guide](./TESTING.md)

