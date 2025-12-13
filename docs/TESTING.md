# Testing Guide

## Overview

This guide covers testing for the enterprise inventory system, with a focus on tenant isolation and data integrity.

## Test Structure

```
apps/api/src/__tests__/
├── middleware/
│   └── tenant.test.ts          # Tenant resolution tests
├── utils/
│   └── prisma-scope.test.ts    # Prisma scoping tests
└── integration/
    └── tenant-isolation.test.ts # Integration tests
```

## Running Tests

### All Tests
```bash
npm test
```

### Unit Tests Only
```bash
npm run test:unit
```

### Integration Tests Only
```bash
npm run test:integration
```

### Watch Mode
```bash
npm run test:watch
```

### Coverage
```bash
npm run test:coverage
```

## Test Types

### Unit Tests

**Location**: `apps/api/src/__tests__/middleware/` and `apps/api/src/__tests__/utils/`

**Purpose**: Test individual functions and utilities in isolation

**Examples**:
- Tenant resolution logic
- Subdomain extraction
- Prisma scoping functions
- Validation helpers

**Run**: `npm run test:unit`

### Integration Tests

**Location**: `apps/api/src/__tests__/integration/`

**Purpose**: Test complete workflows with real database

**Requirements**:
- Test database (set `TEST_DATABASE_URL`)
- Migrations run
- Test data setup

**Examples**:
- Cross-tenant data access prevention
- Balance table updates
- End-to-end tenant isolation

**Run**: `npm run test:integration`

## Setting Up Test Database

1. **Create test database**
   ```bash
   createdb test_inventory
   ```

2. **Set environment variable**
   ```bash
   export TEST_DATABASE_URL=postgresql://user:password@localhost:5432/test_inventory
   ```

3. **Run migrations**
   ```bash
   DATABASE_URL=$TEST_DATABASE_URL npm run db:migrate
   ```

4. **Run tests**
   ```bash
   npm test
   ```

## Writing Tests

### Tenant Isolation Test Example

```typescript
import { createScopedPrisma } from '../../utils/prisma-scope';
import { PrismaClient } from '@prisma/client';

describe('Tenant Isolation', () => {
  let prisma: PrismaClient;
  let org1Id: string;
  let org2Id: string;

  beforeAll(async () => {
    prisma = new PrismaClient();
    // Create test organizations
  });

  it('should prevent cross-tenant data access', async () => {
    const scopedPrisma = createScopedPrisma(org1Id, prisma);
    
    // Should only return org1 items
    const items = await scopedPrisma.item.findMany();
    expect(items.every(item => item.orgId === org1Id)).toBe(true);
  });
});
```

### Mocking Prisma

For unit tests, mock Prisma client:

```typescript
jest.mock('@prisma/client');

const prisma = new PrismaClient() as jest.Mocked<PrismaClient>;

prisma.organization.findUnique = jest.fn().mockResolvedValue({
  id: 'org-123',
  name: 'Test Org',
  // ...
});
```

## Test Coverage Goals

- **Tenant Middleware**: 90%+
- **Prisma Scoping**: 90%+
- **Integration Tests**: Critical paths only

## Continuous Integration

Add to CI/CD pipeline:

```yaml
# Example GitHub Actions
- name: Run tests
  run: npm test

- name: Run integration tests
  run: npm run test:integration
  env:
    TEST_DATABASE_URL: ${{ secrets.TEST_DATABASE_URL }}
```

## Test Data Management

### Fixtures

Create test data factories:

```typescript
export async function createTestOrganization(prisma: PrismaClient) {
  return prisma.organization.create({
    data: {
      name: `Test Org ${Date.now()}`,
      subdomain: `test-${Date.now()}`,
    },
  });
}
```

### Cleanup

Always clean up test data:

```typescript
afterAll(async () => {
  await prisma.item.deleteMany({ where: { orgId: testOrgId } });
  await prisma.organization.delete({ where: { id: testOrgId } });
  await prisma.$disconnect();
});
```

## Common Test Patterns

### Testing Tenant Resolution

```typescript
it('should resolve from X-Org-Id header', async () => {
  const req = { headers: { 'x-org-id': 'org-123' } };
  const tenant = await resolveTenant(req, prisma);
  expect(tenant?.orgId).toBe('org-123');
});
```

### Testing Query Scoping

```typescript
it('should automatically filter by orgId', async () => {
  const scopedPrisma = createScopedPrisma('org-123', prisma);
  await scopedPrisma.item.findMany();
  
  expect(prisma.item.findMany).toHaveBeenCalledWith({
    where: { orgId: 'org-123' },
  });
});
```

### Testing Cross-Tenant Prevention

```typescript
it('should not return items from other orgs', async () => {
  const scopedPrisma = createScopedPrisma('org-1', prisma);
  const items = await scopedPrisma.item.findMany();
  
  expect(items.every(item => item.orgId === 'org-1')).toBe(true);
});
```

## Troubleshooting

### Tests Fail with "Cannot find name 'jest'"

**Solution**: Install Jest types
```bash
npm install --save-dev @types/jest
```

### Integration Tests Fail

**Solution**: 
1. Check `TEST_DATABASE_URL` is set
2. Verify test database exists
3. Run migrations on test database

### Mock Not Working

**Solution**: Ensure mocks are set up before imports:
```typescript
jest.mock('@prisma/client');
import { PrismaClient } from '@prisma/client';
```

## Related Documentation

- [Setup Guide](./SETUP_GUIDE.md)
- [Migration Guide](./MIGRATION_GUIDE.md)
- [Quick Reference](./QUICK_REFERENCE.md)

