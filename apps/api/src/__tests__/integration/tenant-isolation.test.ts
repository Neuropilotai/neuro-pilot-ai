/**
 * Tenant Isolation Integration Tests
 * 
 * Tests that verify cross-tenant data access is prevented
 * 
 * Note: These tests require a test database
 * Run with: npm test -- tenant-isolation
 */

import { PrismaClient } from '@prisma/client';
import { createScopedPrisma } from '../../utils/prisma-scope';

describe('Tenant Isolation Integration', () => {
  let prisma: PrismaClient;
  let org1Id: string;
  let org2Id: string;

  beforeAll(async () => {
    prisma = new PrismaClient();

    // Create test organizations
    const org1 = await prisma.organization.create({
      data: {
        name: 'Test Org 1',
        subdomain: 'test1',
        apiKey: 'test-key-1',
      },
    });
    org1Id = org1.id;

    const org2 = await prisma.organization.create({
      data: {
        name: 'Test Org 2',
        subdomain: 'test2',
        apiKey: 'test-key-2',
      },
    });
    org2Id = org2.id;
  });

  afterAll(async () => {
    // Cleanup test data
    await prisma.item.deleteMany({
      where: {
        orgId: { in: [org1Id, org2Id] },
      },
    });
    await prisma.organization.deleteMany({
      where: {
        id: { in: [org1Id, org2Id] },
      },
    });
    await prisma.$disconnect();
  });

  describe('Item Isolation', () => {
    let org1ItemId: string;
    let org2ItemId: string;

    beforeEach(async () => {
      // Create items for each org
      const org1Item = await prisma.item.create({
        data: {
          orgId: org1Id,
          itemNumber: 'ITEM-001',
          name: 'Org 1 Item',
        },
      });
      org1ItemId = org1Item.id;

      const org2Item = await prisma.item.create({
        data: {
          orgId: org2Id,
          itemNumber: 'ITEM-001', // Same item number, different org
          name: 'Org 2 Item',
        },
      });
      org2ItemId = org2Item.id;
    });

    afterEach(async () => {
      await prisma.item.deleteMany({
        where: {
          id: { in: [org1ItemId, org2ItemId] },
        },
      });
    });

    it('should only return items for org1 when using scoped Prisma', async () => {
      const scopedPrisma = createScopedPrisma(org1Id, prisma);

      const items = await scopedPrisma.item.findMany();

      expect(items.length).toBe(1);
      expect(items[0].id).toBe(org1ItemId);
      expect(items[0].orgId).toBe(org1Id);
    });

    it('should only return items for org2 when using scoped Prisma', async () => {
      const scopedPrisma = createScopedPrisma(org2Id, prisma);

      const items = await scopedPrisma.item.findMany();

      expect(items.length).toBe(1);
      expect(items[0].id).toBe(org2ItemId);
      expect(items[0].orgId).toBe(org2Id);
    });

    it('should not find org2 item when querying from org1 context', async () => {
      const scopedPrisma = createScopedPrisma(org1Id, prisma);

      const item = await scopedPrisma.item.findUnique({
        where: { id: org2ItemId },
      });

      expect(item).toBeNull();
    });

    it('should not find org1 item when querying from org2 context', async () => {
      const scopedPrisma = createScopedPrisma(org2Id, prisma);

      const item = await scopedPrisma.item.findUnique({
        where: { id: org1ItemId },
      });

      expect(item).toBeNull();
    });

    it('should allow same itemNumber in different orgs', async () => {
      const scopedPrisma1 = createScopedPrisma(org1Id, prisma);
      const scopedPrisma2 = createScopedPrisma(org2Id, prisma);

      const item1 = await scopedPrisma1.item.findUnique({
        where: { orgId_itemNumber: { orgId: org1Id, itemNumber: 'ITEM-001' } },
      });

      const item2 = await scopedPrisma2.item.findUnique({
        where: { orgId_itemNumber: { orgId: org2Id, itemNumber: 'ITEM-001' } },
      });

      expect(item1).not.toBeNull();
      expect(item2).not.toBeNull();
      expect(item1?.id).not.toBe(item2?.id);
    });

    it('should prevent creating item without orgId', async () => {
      const scopedPrisma = createScopedPrisma(org1Id, prisma);

      // Even if we try to create without orgId, it should be added automatically
      const item = await scopedPrisma.item.create({
        data: {
          itemNumber: 'ITEM-002',
          name: 'Auto-scoped Item',
          // orgId not provided
        },
      });

      expect(item.orgId).toBe(org1Id);
    });

    it('should prevent updating item from different org', async () => {
      const scopedPrisma = createScopedPrisma(org1Id, prisma);

      // Try to update org2's item from org1 context
      const result = await scopedPrisma.item.updateMany({
        where: { id: org2ItemId },
        data: { name: 'Hacked' },
      });

      // Should update 0 records because orgId filter prevents access
      expect(result.count).toBe(0);
    });

    it('should prevent deleting item from different org', async () => {
      const scopedPrisma = createScopedPrisma(org1Id, prisma);

      // Try to delete org2's item from org1 context
      const result = await scopedPrisma.item.deleteMany({
        where: { id: org2ItemId },
      });

      // Should delete 0 records
      expect(result.count).toBe(0);

      // Verify item still exists
      const item = await prisma.item.findUnique({
        where: { id: org2ItemId },
      });
      expect(item).not.toBeNull();
    });
  });

  describe('Balance Table Isolation', () => {
    let org1ItemId: string;
    let org2ItemId: string;
    let org1LocationId: string;
    let org2LocationId: string;

    beforeEach(async () => {
      // Create locations
      const org1Location = await prisma.location.create({
        data: {
          orgId: org1Id,
          name: 'Location 1',
          site: 'Main',
          kind: 'DRY',
        },
      });
      org1LocationId = org1Location.id;

      const org2Location = await prisma.location.create({
        data: {
          orgId: org2Id,
          name: 'Location 1',
          site: 'Main',
          kind: 'DRY',
        },
      });
      org2LocationId = org2Location.id;

      // Create items
      const org1Item = await prisma.item.create({
        data: {
          orgId: org1Id,
          itemNumber: 'ITEM-BAL-001',
          name: 'Balance Test Item 1',
        },
      });
      org1ItemId = org1Item.id;

      const org2Item = await prisma.item.create({
        data: {
          orgId: org2Id,
          itemNumber: 'ITEM-BAL-001',
          name: 'Balance Test Item 2',
        },
      });
      org2ItemId = org2Item.id;

      // Create ledger entries (which will create balance records via trigger)
      await prisma.inventoryLedger.create({
        data: {
          orgId: org1Id,
          itemId: org1ItemId,
          locationId: org1LocationId,
          qtyCanonical: 100,
          moveType: 'RECEIPT',
          actorId: (await prisma.user.findFirst())?.id || 'test-user',
        },
      });

      await prisma.inventoryLedger.create({
        data: {
          orgId: org2Id,
          itemId: org2ItemId,
          locationId: org2LocationId,
          qtyCanonical: 200,
          moveType: 'RECEIPT',
          actorId: (await prisma.user.findFirst())?.id || 'test-user',
        },
      });
    });

    afterEach(async () => {
      await prisma.inventoryBalance.deleteMany({
        where: {
          orgId: { in: [org1Id, org2Id] },
        },
      });
      await prisma.inventoryLedger.deleteMany({
        where: {
          orgId: { in: [org1Id, org2Id] },
        },
      });
      await prisma.item.deleteMany({
        where: {
          id: { in: [org1ItemId, org2ItemId] },
        },
      });
      await prisma.location.deleteMany({
        where: {
          id: { in: [org1LocationId, org2LocationId] },
        },
      });
    });

    it('should only return balances for org1', async () => {
      const scopedPrisma = createScopedPrisma(org1Id, prisma);

      const balances = await scopedPrisma.inventoryBalance.findMany();

      expect(balances.length).toBeGreaterThan(0);
      balances.forEach((balance) => {
        expect(balance.orgId).toBe(org1Id);
      });
    });

    it('should not return org2 balances when querying from org1', async () => {
      const scopedPrisma = createScopedPrisma(org1Id, prisma);

      const balance = await scopedPrisma.inventoryBalance.findUnique({
        where: {
          orgId_itemId_locationId_lotId: {
            orgId: org2Id,
            itemId: org2ItemId,
            locationId: org2LocationId,
            lotId: null,
          },
        },
      });

      expect(balance).toBeNull();
    });
  });
});

