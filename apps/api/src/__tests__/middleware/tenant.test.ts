/**
 * Tenant Middleware Tests
 * 
 * Tests for tenant resolution and isolation
 */

import { PrismaClient } from '@prisma/client';
import { resolveTenant, extractSubdomain } from '../../middleware/tenant';

// Mock Prisma client
jest.mock('@prisma/client');

describe('Tenant Middleware', () => {
  let prisma: jest.Mocked<PrismaClient>;

  beforeEach(() => {
    prisma = new PrismaClient() as jest.Mocked<PrismaClient>;
    jest.clearAllMocks();
  });

  describe('extractSubdomain', () => {
    it('should extract subdomain from hostname', () => {
      expect(extractSubdomain('org1.example.com')).toBe('org1');
      expect(extractSubdomain('acme.localhost')).toBe('acme');
      expect(extractSubdomain('test.example.com:3000')).toBe('test');
    });

    it('should return null for domain without subdomain', () => {
      expect(extractSubdomain('example.com')).toBeNull();
      expect(extractSubdomain('localhost')).toBeNull();
    });

    it('should handle empty or invalid input', () => {
      expect(extractSubdomain('')).toBeNull();
      expect(extractSubdomain('localhost:3000')).toBeNull();
    });
  });

  describe('resolveTenant', () => {
    const mockOrg = {
      id: 'org-123',
      name: 'Test Organization',
      subdomain: 'test',
      isActive: true,
    };

    it('should resolve tenant from X-Org-Id header', async () => {
      const req = {
        headers: {
          'x-org-id': 'org-123',
        },
      };

      prisma.organization.findUnique = jest.fn().mockResolvedValue(mockOrg);

      const result = await resolveTenant(req as any, prisma);

      expect(result).not.toBeNull();
      expect(result?.orgId).toBe('org-123');
      expect(prisma.organization.findUnique).toHaveBeenCalledWith({
        where: { id: 'org-123' },
        select: expect.any(Object),
      });
    });

    it('should resolve tenant from subdomain', async () => {
      const req = {
        hostname: 'test.example.com',
        headers: {},
      };

      prisma.organization.findUnique = jest
        .fn()
        .mockResolvedValueOnce(mockOrg) // Subdomain lookup
        .mockResolvedValueOnce(mockOrg); // Validation lookup

      const result = await resolveTenant(req as any, prisma);

      expect(result).not.toBeNull();
      expect(result?.orgId).toBe('org-123');
      expect(prisma.organization.findUnique).toHaveBeenCalledWith({
        where: { subdomain: 'test' },
        select: expect.any(Object),
      });
    });

    it('should resolve tenant from API key', async () => {
      const req = {
        headers: {
          'x-api-key': 'api-key-123',
        },
      };

      prisma.organization.findUnique = jest
        .fn()
        .mockResolvedValueOnce(mockOrg) // API key lookup
        .mockResolvedValueOnce(mockOrg); // Validation lookup

      const result = await resolveTenant(req as any, prisma);

      expect(result).not.toBeNull();
      expect(result?.orgId).toBe('org-123');
      expect(prisma.organization.findUnique).toHaveBeenCalledWith({
        where: { apiKey: 'api-key-123' },
        select: expect.any(Object),
      });
    });

    it('should use default org if provided', async () => {
      const req = {
        headers: {},
      };

      prisma.organization.findUnique = jest.fn().mockResolvedValue(mockOrg);

      const result = await resolveTenant(req as any, prisma, 'org-123');

      expect(result).not.toBeNull();
      expect(result?.orgId).toBe('org-123');
    });

    it('should return null if organization not found', async () => {
      const req = {
        headers: {
          'x-org-id': 'non-existent',
        },
      };

      prisma.organization.findUnique = jest.fn().mockResolvedValue(null);

      const result = await resolveTenant(req as any, prisma);

      expect(result).toBeNull();
    });

    it('should throw error if organization is inactive', async () => {
      const req = {
        headers: {
          'x-org-id': 'org-123',
        },
      };

      const inactiveOrg = { ...mockOrg, isActive: false };
      prisma.organization.findUnique = jest.fn().mockResolvedValue(inactiveOrg);

      await expect(resolveTenant(req as any, prisma)).rejects.toThrow(
        'Organization Test Organization is not active'
      );
    });

    it('should prioritize X-Org-Id over subdomain', async () => {
      const req = {
        headers: {
          'x-org-id': 'org-123',
        },
        hostname: 'other.example.com',
      };

      prisma.organization.findUnique = jest.fn().mockResolvedValue(mockOrg);

      const result = await resolveTenant(req as any, prisma);

      expect(result?.orgId).toBe('org-123');
      // Should not call subdomain lookup
      expect(prisma.organization.findUnique).not.toHaveBeenCalledWith({
        where: { subdomain: 'other' },
      });
    });
  });
});

