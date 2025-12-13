/**
 * Inventory Routes Example
 * 
 * This file demonstrates how to use tenant-scoped Prisma queries
 * and the materialized inventory_balances table.
 * 
 * Copy this pattern to your actual route files.
 */

import { FastifyRequest, FastifyReply } from 'fastify';
import { PrismaClient } from '@prisma/client';
import { createScopedPrisma, validateOrgAccess } from '../utils/prisma-scope';

const prisma = new PrismaClient();

// Extend FastifyRequest to include orgId
interface TenantRequest extends FastifyRequest {
  orgId?: string;
  tenant?: {
    orgId: string;
    organization: any;
  };
}

/**
 * GET /api/inventory/balance
 * Get current inventory balance for item/location
 * 
 * Uses materialized inventory_balances table for fast queries
 */
export async function getInventoryBalance(
  req: TenantRequest,
  reply: FastifyReply
) {
  const { orgId } = req;
  if (!orgId) {
    return reply.status(401).send({ error: 'Organization not resolved' });
  }

  const { itemId, locationId, lotId } = req.query as {
    itemId: string;
    locationId: string;
    lotId?: string;
  };

  if (!itemId || !locationId) {
    return reply.status(400).send({
      error: 'Missing required parameters: itemId, locationId',
    });
  }

  try {
    // Use scoped Prisma to ensure orgId filtering
    const scopedPrisma = createScopedPrisma(orgId, prisma);

    // Read from materialized balance table (fast)
    const balance = await scopedPrisma.inventoryBalance.findUnique({
      where: {
        orgId_itemId_locationId_lotId: {
          orgId,
          itemId,
          locationId,
          lotId: lotId || null,
        },
      },
      include: {
        item: true,
        location: true,
        lot: true,
      },
    });

    if (!balance) {
      // Return zero balance if no record exists
      return reply.send({
        orgId,
        itemId,
        locationId,
        lotId: lotId || null,
        qtyCanonical: 0,
        lastUpdated: null,
      });
    }

    // Validate org access (extra safety check)
    validateOrgAccess(orgId, balance, 'InventoryBalance');

    return reply.send({
      orgId: balance.orgId,
      itemId: balance.itemId,
      locationId: balance.locationId,
      lotId: balance.lotId,
      qtyCanonical: balance.qtyCanonical.toString(),
      lastUpdated: balance.lastUpdated,
      item: balance.item,
      location: balance.location,
      lot: balance.lot,
    });
  } catch (error: any) {
    console.error('Error fetching inventory balance:', error);
    return reply.status(500).send({
      error: 'Internal Server Error',
      message: error.message,
    });
  }
}

/**
 * GET /api/inventory/balances
 * Get all inventory balances for organization
 * 
 * Uses materialized inventory_balances table
 */
export async function getAllInventoryBalances(
  req: TenantRequest,
  reply: FastifyReply
) {
  const { orgId } = req;
  if (!orgId) {
    return reply.status(401).send({ error: 'Organization not resolved' });
  }

  const { itemId, locationId } = req.query as {
    itemId?: string;
    locationId?: string;
  };

  try {
    const scopedPrisma = createScopedPrisma(orgId, prisma);

    const balances = await scopedPrisma.inventoryBalance.findMany({
      where: {
        orgId,
        ...(itemId && { itemId }),
        ...(locationId && { locationId }),
      },
      include: {
        item: true,
        location: true,
        lot: true,
      },
      orderBy: {
        lastUpdated: 'desc',
      },
    });

    return reply.send({
      balances: balances.map((b) => ({
        orgId: b.orgId,
        itemId: b.itemId,
        locationId: b.locationId,
        lotId: b.lotId,
        qtyCanonical: b.qtyCanonical.toString(),
        lastUpdated: b.lastUpdated,
        item: b.item,
        location: b.location,
        lot: b.lot,
      })),
    });
  } catch (error: any) {
    console.error('Error fetching inventory balances:', error);
    return reply.status(500).send({
      error: 'Internal Server Error',
      message: error.message,
    });
  }
}

/**
 * GET /api/inventory/ledger
 * Get ledger entries (audit trail)
 * 
 * Note: For balance queries, use /api/inventory/balance instead
 * This endpoint is for audit trail purposes
 */
export async function getInventoryLedger(
  req: TenantRequest,
  reply: FastifyReply
) {
  const { orgId } = req;
  if (!orgId) {
    return reply.status(401).send({ error: 'Organization not resolved' });
  }

  const { itemId, locationId, moveType, limit = 100 } = req.query as {
    itemId?: string;
    locationId?: string;
    moveType?: string;
    limit?: number;
  };

  try {
    const scopedPrisma = createScopedPrisma(orgId, prisma);

    const entries = await scopedPrisma.inventoryLedger.findMany({
      where: {
        orgId,
        ...(itemId && { itemId }),
        ...(locationId && { locationId }),
        ...(moveType && { moveType: moveType as any }),
      },
      include: {
        item: true,
        location: true,
        lot: true,
        actor: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
      take: Math.min(limit, 1000),
    });

    return reply.send({
      entries: entries.map((e) => ({
        id: e.id,
        orgId: e.orgId,
        itemId: e.itemId,
        locationId: e.locationId,
        lotId: e.lotId,
        qtyCanonical: e.qtyCanonical.toString(),
        moveType: e.moveType,
        reasonCode: e.reasonCode,
        sourceRef: e.sourceRef,
        notes: e.notes,
        actor: e.actor,
        correlationId: e.correlationId,
        createdAt: e.createdAt,
        item: e.item,
        location: e.location,
        lot: e.lot,
      })),
    });
  } catch (error: any) {
    console.error('Error fetching inventory ledger:', error);
    return reply.status(500).send({
      error: 'Internal Server Error',
      message: error.message,
    });
  }
}

/**
 * POST /api/inventory/adjust
 * Create manual inventory adjustment
 * 
 * Creates ledger entry and balance is updated via trigger
 */
export async function adjustInventory(
  req: TenantRequest,
  reply: FastifyReply
) {
  const { orgId } = req;
  if (!orgId) {
    return reply.status(401).send({ error: 'Organization not resolved' });
  }

  const { itemId, locationId, lotId, qtyCanonical, reasonCode, notes } =
    req.body as {
      itemId: string;
      locationId: string;
      lotId?: string;
      qtyCanonical: number;
      reasonCode?: string;
      notes?: string;
    };

  if (!itemId || !locationId || qtyCanonical === undefined) {
    return reply.status(400).send({
      error: 'Missing required parameters: itemId, locationId, qtyCanonical',
    });
  }

  try {
    const scopedPrisma = createScopedPrisma(orgId, prisma);

    // Verify item and location belong to org
    const [item, location] = await Promise.all([
      scopedPrisma.item.findUnique({ where: { orgId_itemNumber: { orgId, itemNumber: itemId } } }),
      scopedPrisma.location.findUnique({ where: { id: locationId } }),
    ]);

    if (!item) {
      return reply.status(404).send({ error: 'Item not found' });
    }
    if (!location) {
      return reply.status(404).send({ error: 'Location not found' });
    }

    validateOrgAccess(orgId, item, 'Item');
    validateOrgAccess(orgId, location, 'Location');

    // Get actor from request (should be set by auth middleware)
    const actorId = (req as any).user?.id;
    if (!actorId) {
      return reply.status(401).send({ error: 'User not authenticated' });
    }

    // Create ledger entry (balance updated automatically via trigger)
    const ledgerEntry = await scopedPrisma.inventoryLedger.create({
      data: {
        orgId,
        itemId: item.id,
        locationId: location.id,
        lotId: lotId || null,
        qtyCanonical,
        moveType: 'ADJUSTMENT',
        reasonCode,
        notes,
        actorId,
      },
      include: {
        item: true,
        location: true,
        lot: true,
      },
    });

    return reply.status(201).send({
      id: ledgerEntry.id,
      orgId: ledgerEntry.orgId,
      itemId: ledgerEntry.itemId,
      locationId: ledgerEntry.locationId,
      qtyCanonical: ledgerEntry.qtyCanonical.toString(),
      moveType: ledgerEntry.moveType,
      createdAt: ledgerEntry.createdAt,
    });
  } catch (error: any) {
    console.error('Error adjusting inventory:', error);
    return reply.status(500).send({
      error: 'Internal Server Error',
      message: error.message,
    });
  }
}

