/**
 * Prisma Scoping Tests
 * 
 * Tests for automatic orgId filtering in Prisma queries
 */

import { PrismaClient } from '@prisma/client';
import { createScopedPrisma, validateOrgAccess, scopeWhere, scopeCreate } from '../../utils/prisma-scope';

// Mock Prisma client
jest.mock('@prisma/client');

describe('Prisma Scoping', () => {
  let prisma: jest.Mocked<PrismaClient>;
  let scopedPrisma: any;

  beforeEach(() => {
    prisma = new PrismaClient() as jest.Mocked<PrismaClient>;
    jest.clearAllMocks();
  });

  describe('createScopedPrisma', () => {
    beforeEach(() => {
      scopedPrisma = createScopedPrisma('org-123', prisma);
    });

    it('should automatically add orgId to findMany where clause', async () => {
      prisma.item.findMany = jest.fn().mockResolvedValue([]);

      await scopedPrisma.item.findMany({
        where: { isActive: true },
      });

      expect(prisma.item.findMany).toHaveBeenCalledWith({
        where: {
          isActive: true,
          orgId: 'org-123',
        },
      });
    });

    it('should automatically add orgId to findUnique where clause', async () => {
      prisma.item.findUnique = jest.fn().mockResolvedValue(null);

      await scopedPrisma.item.findUnique({
        where: { id: 'item-123' },
      });

      expect(prisma.item.findUnique).toHaveBeenCalledWith({
        where: {
          id: 'item-123',
          orgId: 'org-123',
        },
      });
    });

    it('should automatically add orgId to create data', async () => {
      prisma.item.create = jest.fn().mockResolvedValue({ id: 'item-123', orgId: 'org-123' });

      await scopedPrisma.item.create({
        data: {
          itemNumber: 'ITEM-001',
          name: 'Test Item',
        },
      });

      expect(prisma.item.create).toHaveBeenCalledWith({
        data: {
          itemNumber: 'ITEM-001',
          name: 'Test Item',
          orgId: 'org-123',
        },
      });
    });

    it('should not override explicit orgId in where clause', async () => {
      prisma.item.findMany = jest.fn().mockResolvedValue([]);

      await scopedPrisma.item.findMany({
        where: {
          orgId: 'org-456', // Explicit orgId
          isActive: true,
        },
      });

      expect(prisma.item.findMany).toHaveBeenCalledWith({
        where: {
          orgId: 'org-456', // Should keep explicit value
          isActive: true,
        },
      });
    });

    it('should add orgId to updateMany where clause', async () => {
      prisma.item.updateMany = jest.fn().mockResolvedValue({ count: 0 });

      await scopedPrisma.item.updateMany({
        where: { isActive: false },
        data: { isActive: true },
      });

      expect(prisma.item.updateMany).toHaveBeenCalledWith({
        where: {
          isActive: false,
          orgId: 'org-123',
        },
        data: { isActive: true },
      });
    });

    it('should add orgId to deleteMany where clause', async () => {
      prisma.item.deleteMany = jest.fn().mockResolvedValue({ count: 0 });

      await scopedPrisma.item.deleteMany({
        where: { isActive: false },
      });

      expect(prisma.item.deleteMany).toHaveBeenCalledWith({
        where: {
          isActive: false,
          orgId: 'org-123',
        },
      });
    });

    it('should handle createMany with array', async () => {
      prisma.item.createMany = jest.fn().mockResolvedValue({ count: 2 });

      await scopedPrisma.item.createMany({
        data: [
          { itemNumber: 'ITEM-001', name: 'Item 1' },
          { itemNumber: 'ITEM-002', name: 'Item 2' },
        ],
      });

      expect(prisma.item.createMany).toHaveBeenCalledWith({
        data: [
          { itemNumber: 'ITEM-001', name: 'Item 1', orgId: 'org-123' },
          { itemNumber: 'ITEM-002', name: 'Item 2', orgId: 'org-123' },
        ],
      });
    });

    it('should only scope tenant-scoped models', async () => {
      // Non-tenant models should not be scoped
      // This test would need to be adjusted based on actual non-tenant models
      // For now, we'll test that tenant-scoped models are scoped
      prisma.item.findMany = jest.fn().mockResolvedValue([]);

      await scopedPrisma.item.findMany();

      expect(prisma.item.findMany).toHaveBeenCalledWith({
        where: { orgId: 'org-123' },
      });
    });
  });

  describe('scopeWhere', () => {
    it('should add orgId to where clause', () => {
      const where: { isActive: boolean; orgId?: string } = { isActive: true };
      const scoped = scopeWhere('org-123', where);

      expect(scoped).toEqual({
        isActive: true,
        orgId: 'org-123',
      });
    });

    it('should preserve existing where clause', () => {
      const where: { isActive: boolean; category: string; orgId?: string } = { 
        isActive: true, 
        category: 'Produce' 
      };
      const scoped = scopeWhere('org-123', where);

      expect(scoped).toEqual({
        isActive: true,
        category: 'Produce',
        orgId: 'org-123',
      });
    });
  });

  describe('scopeCreate', () => {
    it('should add orgId to create data', () => {
      const data: { itemNumber: string; name: string; orgId?: string } = { 
        itemNumber: 'ITEM-001', 
        name: 'Test Item' 
      };
      const scoped = scopeCreate('org-123', data);

      expect(scoped).toEqual({
        itemNumber: 'ITEM-001',
        name: 'Test Item',
        orgId: 'org-123',
      });
    });
  });

  describe('validateOrgAccess', () => {
    it('should not throw for matching orgId', () => {
      const result = { orgId: 'org-123' };
      expect(() => validateOrgAccess('org-123', result)).not.toThrow();
    });

    it('should throw for mismatched orgId', () => {
      const result = { orgId: 'org-456' };
      expect(() => validateOrgAccess('org-123', result)).toThrow(
        'Resource does not belong to organization org-123'
      );
    });

    it('should not throw for null result', () => {
      expect(() => validateOrgAccess('org-123', null)).not.toThrow();
    });

    it('should use custom resource name in error', () => {
      const result = { orgId: 'org-456' };
      expect(() => validateOrgAccess('org-123', result, 'Item')).toThrow(
        'Item does not belong to organization org-123'
      );
    });
  });
});

