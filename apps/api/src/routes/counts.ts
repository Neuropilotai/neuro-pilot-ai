/**
 * Count Sheets Routes
 * 
 * Physical count management endpoints with tenant isolation
 */

import { FastifyRequest, FastifyReply } from 'fastify';
import { createScopedPrisma, validateOrgAccess } from '../utils/prisma-scope';
import { prisma } from '../utils/prisma';

interface TenantRequest extends FastifyRequest {
  orgId?: string;
  tenant?: {
    orgId: string;
    organization: any;
  };
  user?: {
    id: string;
    role: string;
  };
  query: any;
  params: any;
  body: any;
}

/**
 * POST /api/counts
 * Create count sheet
 */
export async function createCountSheet(req: TenantRequest, reply: FastifyReply) {
  const { orgId } = req;
  const user = req.user;

  if (!orgId) {
    return reply.status(401).send({ error: 'Organization not resolved' });
  }

  if (!user) {
    return reply.status(401).send({ error: 'User not authenticated' });
  }

  // Check permissions (Counter, Editor, Approver, Admin)
  if (!['COUNTER', 'EDITOR', 'APPROVER', 'ADMIN'].includes(user.role)) {
    return reply.status(403).send({ error: 'Counter access required' });
  }

  const { scheduledFor, notes } = req.body as {
    scheduledFor?: string;
    notes?: string;
  };

  try {
    const scopedPrisma = createScopedPrisma(orgId, prisma);

    // Generate count number: COUNT-YYYY-MM-DD-001
    const today = new Date();
    const dateStr = today.toISOString().split('T')[0].replace(/-/g, '');
    
    // Get count of today's count sheets
    const todayStart = new Date(today.setHours(0, 0, 0, 0));
    const todayEnd = new Date(today.setHours(23, 59, 59, 999));
    
    const todayCount = await scopedPrisma.countSheet.count({
      where: {
        orgId,
        countDate: {
          gte: todayStart,
          lte: todayEnd,
        },
      },
    });

    const countNumber = `COUNT-${dateStr}-${String(todayCount + 1).padStart(3, '0')}`;

    const countSheet = await scopedPrisma.countSheet.create({
      data: {
        countNumber,
        countDate: new Date(),
        scheduledFor: scheduledFor ? new Date(scheduledFor) : null,
        notes,
        createdBy: user.id,
        status: 'DRAFT',
      },
    });

    return reply.status(201).send({
      id: countSheet.id,
      orgId: countSheet.orgId,
      countNumber: countSheet.countNumber,
      status: countSheet.status,
      countDate: countSheet.countDate,
      createdAt: countSheet.createdAt,
    });
  } catch (error: any) {
    console.error('Error creating count sheet:', error);
    return reply.status(500).send({
      error: 'Internal Server Error',
      message: error.message,
    });
  }
}

/**
 * GET /api/counts/:id
 * Get count sheet with lines
 */
export async function getCountSheet(req: TenantRequest, reply: FastifyReply) {
  const { orgId } = req;
  const { id } = req.params as { id: string };

  if (!orgId) {
    return reply.status(401).send({ error: 'Organization not resolved' });
  }

  try {
    const scopedPrisma = createScopedPrisma(orgId, prisma);

    const countSheet = await scopedPrisma.countSheet.findUnique({
      where: { id },
      include: {
        lines: {
          include: {
            item: true,
            location: true,
            lot: true,
          },
          orderBy: {
            countedAt: 'desc',
          },
        },
        creator: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
          },
        },
      },
    });

    if (!countSheet) {
      return reply.status(404).send({ error: 'Count sheet not found' });
    }

    validateOrgAccess(orgId, countSheet, 'CountSheet');

    return reply.send({
      id: countSheet.id,
      orgId: countSheet.orgId,
      countNumber: countSheet.countNumber,
      status: countSheet.status,
      countDate: countSheet.countDate,
      scheduledFor: countSheet.scheduledFor,
      startedAt: countSheet.startedAt,
      completedAt: countSheet.completedAt,
      postedAt: countSheet.postedAt,
      notes: countSheet.notes,
      creator: countSheet.creator,
      lines: countSheet.lines.map((line) => ({
        id: line.id,
        itemId: line.itemId,
        locationId: line.locationId,
        lotId: line.lotId,
        expectedQty: line.expectedQty?.toString(),
        countedQty: line.countedQty.toString(),
        countedUom: line.countedUom,
        varianceQty: line.varianceQty?.toString(),
        notes: line.notes,
        countedAt: line.countedAt,
        item: line.item,
        location: line.location,
        lot: line.lot,
      })),
    });
  } catch (error: any) {
    if (error.message.includes('does not belong to organization')) {
      return reply.status(403).send({ error: 'Access denied' });
    }
    console.error('Error fetching count sheet:', error);
    return reply.status(500).send({
      error: 'Internal Server Error',
      message: error.message,
    });
  }
}

/**
 * POST /api/counts/:id/lines
 * Add count line to count sheet
 */
export async function addCountLine(req: TenantRequest, reply: FastifyReply) {
  const { orgId } = req;
  const { id: countSheetId } = req.params as { id: string };
  const user = req.user;

  if (!orgId) {
    return reply.status(401).send({ error: 'Organization not resolved' });
  }

  if (!user) {
    return reply.status(401).send({ error: 'User not authenticated' });
  }

  const {
    itemId,
    locationId,
    lotId,
    countedQty,
    countedUom,
    notes,
  } = req.body as {
    itemId: string;
    locationId: string;
    lotId?: string;
    countedQty: number;
    countedUom?: string;
    notes?: string;
  };

  if (!itemId || !locationId || countedQty === undefined) {
    return reply.status(400).send({
      error: 'Missing required fields: itemId, locationId, countedQty',
    });
  }

  try {
    const scopedPrisma = createScopedPrisma(orgId, prisma);

    // Verify count sheet exists and belongs to org
    const countSheet = await scopedPrisma.countSheet.findUnique({
      where: { id: countSheetId },
    });

    if (!countSheet) {
      return reply.status(404).send({ error: 'Count sheet not found' });
    }

    validateOrgAccess(orgId, countSheet, 'CountSheet');

    // Verify item and location belong to org
    const [item, location] = await Promise.all([
      scopedPrisma.item.findUnique({ where: { id: itemId } }),
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

    // Get current balance for expected quantity
    const balance = await scopedPrisma.inventoryBalance.findUnique({
      where: {
        orgId_itemId_locationId_lotId: {
          orgId,
          itemId,
          locationId,
          lotId: lotId || null,
        },
      },
    });

    const expectedQty = balance ? parseFloat(balance.qtyCanonical.toString()) : 0;
    const varianceQty = countedQty - expectedQty;

    // Create count line
    const countLine = await scopedPrisma.countLine.create({
      data: {
        countSheetId,
        itemId,
        locationId,
        lotId: lotId || null,
        expectedQty: expectedQty.toString(),
        countedQty: countedQty.toString(),
        countedUom: countedUom || 'ea',
        varianceQty: varianceQty.toString(),
        notes,
        countedBy: user.id,
      },
    });

    // Update count sheet status if needed
    if (countSheet.status === 'DRAFT') {
      await scopedPrisma.countSheet.update({
        where: { id: countSheetId },
        data: { status: 'IN_PROGRESS', startedAt: new Date() },
      });
    }

    return reply.status(201).send({
      id: countLine.id,
      countSheetId: countLine.countSheetId,
      itemId: countLine.itemId,
      locationId: countLine.locationId,
      expectedQty: countLine.expectedQty?.toString(),
      countedQty: countLine.countedQty.toString(),
      varianceQty: countLine.varianceQty?.toString(),
    });
  } catch (error: any) {
    if (error.message.includes('does not belong to organization')) {
      return reply.status(403).send({ error: 'Access denied' });
    }
    console.error('Error adding count line:', error);
    return reply.status(500).send({
      error: 'Internal Server Error',
      message: error.message,
    });
  }
}

/**
 * POST /api/counts/:id/post
 * Post count sheet to ledger (Editor/Approver/Admin only)
 */
export async function postCountSheet(req: TenantRequest, reply: FastifyReply) {
  const { orgId } = req;
  const { id: countSheetId } = req.params as { id: string };
  const user = req.user;

  if (!orgId) {
    return reply.status(401).send({ error: 'Organization not resolved' });
  }

  if (!user) {
    return reply.status(401).send({ error: 'User not authenticated' });
  }

  // Check permissions
  if (!['EDITOR', 'APPROVER', 'ADMIN'].includes(user.role)) {
    return reply.status(403).send({ error: 'Editor access required' });
  }

  try {
    const scopedPrisma = createScopedPrisma(orgId, prisma);

    // Get count sheet with lines
    const countSheet = await scopedPrisma.countSheet.findUnique({
      where: { id: countSheetId },
      include: {
        lines: true,
      },
    });

    if (!countSheet) {
      return reply.status(404).send({ error: 'Count sheet not found' });
    }

    validateOrgAccess(orgId, countSheet, 'CountSheet');

    if (countSheet.status !== 'COMPLETED') {
      return reply.status(400).send({
        error: 'Count sheet must be completed before posting',
        currentStatus: countSheet.status,
      });
    }

    if (countSheet.postedAt) {
      return reply.status(400).send({
        error: 'Count sheet already posted',
        postedAt: countSheet.postedAt,
      });
    }

    // Generate correlation ID for this posting
    const correlationId = `POST-${countSheetId}-${Date.now()}`;

    // Create ledger entries for each count line
    const ledgerEntries = await Promise.all(
      countSheet.lines.map((line) => {
        const varianceQty = parseFloat(line.varianceQty?.toString() || '0');
        
        // Only create entry if there's a variance
        if (Math.abs(varianceQty) < 0.000001) {
          return null;
        }

        return scopedPrisma.inventoryLedger.create({
          data: {
            itemId: line.itemId,
            locationId: line.locationId,
            lotId: line.lotId || null,
            qtyCanonical: varianceQty.toString(), // Positive or negative adjustment
            moveType: 'COUNT_POSTED',
            reasonCode: varianceQty > 0 ? 'overage' : 'shortage',
            sourceRef: countSheet.countNumber,
            notes: `Posted from count sheet ${countSheet.countNumber}`,
            actorId: user.id,
            correlationId,
          },
        });
      })
    );

    // Filter out null entries (zero variance)
    const createdEntries = ledgerEntries.filter((e) => e !== null);

    // Update count sheet
    await scopedPrisma.countSheet.update({
      where: { id: countSheetId },
      data: {
        status: 'POSTED',
        postedAt: new Date(),
        postedBy: user.id,
        correlationId,
      },
    });

    return reply.send({
      countSheetId,
      postedAt: new Date().toISOString(),
      ledgerEntriesCreated: createdEntries.length,
      correlationId,
    });
  } catch (error: any) {
    if (error.message.includes('does not belong to organization')) {
      return reply.status(403).send({ error: 'Access denied' });
    }
    console.error('Error posting count sheet:', error);
    return reply.status(500).send({
      error: 'Internal Server Error',
      message: error.message,
    });
  }
}

