/**
 * Prisma Query Scoping Utility
 * 
 * Automatically filters all tenant-scoped queries by orgId to prevent
 * cross-tenant data access. Uses Prisma middleware to inject orgId filter.
 */

import { PrismaClient, Prisma } from '@prisma/client';

/**
 * Create a scoped Prisma client that automatically filters by orgId
 * 
 * Usage:
 *   const scopedPrisma = createScopedPrisma(orgId, prisma);
 *   const items = await scopedPrisma.item.findMany(); // Automatically filtered by orgId
 */
export function createScopedPrisma(orgId: string, prisma: PrismaClient) {
  // Use Prisma middleware to automatically inject orgId filter
  prisma.$use(async (params, next) => {
    // List of tenant-scoped models
    const tenantScopedModels = [
      'user',
      'item',
      'location',
      'inventoryLedger',
      'countSheet',
      'countLine',
      'auditLog',
      'featureFlag',
      'inventoryBalance',
    ];

    // Only apply scoping to tenant-scoped models
    if (tenantScopedModels.includes(params.model || '')) {
      // For findMany, findFirst, findUnique, update, delete operations
      if (params.args) {
        // Ensure where clause exists
        if (!params.args.where) {
          params.args.where = {};
        }

        // Add orgId filter (don't override if already set)
        if (!params.args.where.orgId) {
          params.args.where.orgId = orgId;
        }
      }

      // For create operations, automatically set orgId
      if (params.action === 'create' && params.args?.data) {
        if (!params.args.data.orgId) {
          params.args.data.orgId = orgId;
        }
      }

      // For createMany operations
      if (params.action === 'createMany' && params.args?.data) {
        if (Array.isArray(params.args.data)) {
          params.args.data = params.args.data.map((item: any) => ({
            ...item,
            orgId: item.orgId || orgId,
          }));
        } else if (!params.args.data.orgId) {
          params.args.data.orgId = orgId;
        }
      }

      // For updateMany operations, add orgId to where clause
      if (params.action === 'updateMany' && params.args) {
        if (!params.args.where) {
          params.args.where = {};
        }
        if (!params.args.where.orgId) {
          params.args.where.orgId = orgId;
        }
      }

      // For deleteMany operations, add orgId to where clause
      if (params.action === 'deleteMany' && params.args) {
        if (!params.args.where) {
          params.args.where = {};
        }
        if (!params.args.where.orgId) {
          params.args.where.orgId = orgId;
        }
      }

      // For upsert operations
      if (params.action === 'upsert' && params.args) {
        // Set orgId in create data
        if (params.args.create && !params.args.create.orgId) {
          params.args.create.orgId = orgId;
        }
        // Set orgId in update data
        if (params.args.update && !params.args.update.orgId) {
          params.args.update.orgId = orgId;
        }
        // Add orgId to where clause
        if (params.args.where && !params.args.where.orgId) {
          params.args.where.orgId = orgId;
        }
      }
    }

    return next(params);
  });

  return prisma;
}

/**
 * Alternative: Manual scoping helper functions
 * Use these if you prefer explicit scoping over middleware
 */

export function scopeWhere<T extends { orgId?: string }>(
  orgId: string,
  where?: T
): T & { orgId: string } {
  return {
    ...where,
    orgId,
  } as T & { orgId: string };
}

export function scopeCreate<T extends { orgId?: string }>(
  orgId: string,
  data: T
): T & { orgId: string } {
  return {
    ...data,
    orgId,
  } as T & { orgId: string };
}

/**
 * Validate that a result belongs to the specified org
 * Throws error if orgId mismatch detected
 */
export function validateOrgAccess(
  orgId: string,
  result: { orgId?: string } | null | undefined,
  resourceName: string = 'Resource'
): void {
  if (!result) {
    return; // Not found is handled by caller
  }

  if (result.orgId !== orgId) {
    throw new Error(
      `${resourceName} does not belong to organization ${orgId}`
    );
  }
}

/**
 * Validate that all results belong to the specified org
 */
export function validateOrgAccessMany<T extends { orgId?: string }>(
  orgId: string,
  results: T[],
  resourceName: string = 'Resources'
): T[] {
  const invalid = results.filter((r) => r.orgId !== orgId);
  
  if (invalid.length > 0) {
    throw new Error(
      `${invalid.length} ${resourceName} do not belong to organization ${orgId}`
    );
  }

  return results;
}

