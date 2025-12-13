/**
 * Items Routes
 * 
 * Item management endpoints with tenant isolation
 */

import { FastifyRequest, FastifyReply } from 'fastify';
import { PrismaClient } from '@prisma/client';
import { createScopedPrisma, validateOrgAccess } from '../utils/prisma-scope';
import { prisma } from '../utils/prisma';
import { validateBody, validateQuery, validateParams } from '../middleware/validation';
import {
  createItemSchema,
  updateItemSchema,
  itemQuerySchema,
  itemParamsSchema,
} from '@neuro/shared';

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
 * GET /api/items
 * List items with filtering
 */
export async function listItems(req: TenantRequest, reply: FastifyReply) {
  const { orgId } = req;
  if (!orgId) {
    return reply.status(401).send({ error: 'Organization not resolved' });
  }

  const { category, isActive, search } = req.query as {
    category?: string;
    isActive?: string;
    search?: string;
  };

  try {
    const scopedPrisma = createScopedPrisma(orgId, prisma);

    const where: any = {
      orgId,
    };

    if (category) {
      where.category = category;
    }

    if (isActive !== undefined) {
      where.isActive = isActive === 'true';
    }

    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { itemNumber: { contains: search, mode: 'insensitive' } },
        { nameEn: { contains: search, mode: 'insensitive' } },
        { nameFr: { contains: search, mode: 'insensitive' } },
      ];
    }

    const items = await scopedPrisma.item.findMany({
      where,
      include: {
        supplierItems: true,
        uomConversions: true,
      },
      orderBy: {
        itemNumber: 'asc',
      },
    });

    return reply.send({
      items: items.map((item) => ({
        id: item.id,
        orgId: item.orgId,
        itemNumber: item.itemNumber,
        name: item.name,
        nameEn: item.nameEn,
        nameFr: item.nameFr,
        category: item.category,
        canonicalUom: item.canonicalUom,
        isPerishable: item.isPerishable,
        requiresLot: item.requiresLot,
        parLevel: item.parLevel?.toString(),
        isActive: item.isActive,
        supplierItems: item.supplierItems,
        uomConversions: item.uomConversions,
      })),
    });
  } catch (error: any) {
    console.error('Error listing items:', error);
    return reply.status(500).send({
      error: 'Internal Server Error',
      message: error.message,
    });
  }
}

/**
 * GET /api/items/:id
 * Get single item
 */
export async function getItem(req: TenantRequest, reply: FastifyReply) {
  const { orgId } = req;
  const { id } = req.params as { id: string };

  if (!orgId) {
    return reply.status(401).send({ error: 'Organization not resolved' });
  }

  try {
    const scopedPrisma = createScopedPrisma(orgId, prisma);

    const item = await scopedPrisma.item.findUnique({
      where: { id },
      include: {
        supplierItems: true,
        uomConversions: true,
        lots: {
          where: {
            expiryDate: {
              gte: new Date(), // Only non-expired lots
            },
          },
          orderBy: {
            expiryDate: 'asc',
          },
        },
      },
    });

    if (!item) {
      return reply.status(404).send({ error: 'Item not found' });
    }

    // Extra safety check
    validateOrgAccess(orgId, item, 'Item');

    return reply.send({
      id: item.id,
      orgId: item.orgId,
      itemNumber: item.itemNumber,
      name: item.name,
      nameEn: item.nameEn,
      nameFr: item.nameFr,
      category: item.category,
      canonicalUom: item.canonicalUom,
      isPerishable: item.isPerishable,
      requiresLot: item.requiresLot,
      parLevel: item.parLevel?.toString(),
      isActive: item.isActive,
      supplierItems: item.supplierItems,
      uomConversions: item.uomConversions,
      lots: item.lots,
    });
  } catch (error: any) {
    if (error.message.includes('does not belong to organization')) {
      return reply.status(403).send({ error: 'Access denied' });
    }
    console.error('Error fetching item:', error);
    return reply.status(500).send({
      error: 'Internal Server Error',
      message: error.message,
    });
  }
}

/**
 * POST /api/items
 * Create new item (Admin only)
 */
export async function createItem(req: TenantRequest, reply: FastifyReply) {
  const { orgId } = req;
  const user = req.user;

  if (!orgId) {
    return reply.status(401).send({ error: 'Organization not resolved' });
  }

  // Check permissions (Admin only)
  if (!user || user.role !== 'ADMIN') {
    return reply.status(403).send({ error: 'Admin access required' });
  }

  const {
    itemNumber,
    name,
    nameEn,
    nameFr,
    category,
    canonicalUom,
    isPerishable,
    requiresLot,
    parLevel,
  } = req.body as {
    itemNumber: string;
    name: string;
    nameEn?: string;
    nameFr?: string;
    category?: string;
    canonicalUom?: string;
    isPerishable?: boolean;
    requiresLot?: boolean;
    parLevel?: number;
  };

  if (!itemNumber || !name) {
    return reply.status(400).send({
      error: 'Missing required fields: itemNumber, name',
    });
  }

  try {
    const scopedPrisma = createScopedPrisma(orgId, prisma);

    // Check if itemNumber already exists in this org
    const existing = await scopedPrisma.item.findUnique({
      where: {
        orgId_itemNumber: {
          orgId,
          itemNumber,
        },
      },
    });

    if (existing) {
      return reply.status(409).send({
        error: 'Item number already exists',
        itemId: existing.id,
      });
    }

    // Create item (orgId automatically added by scopedPrisma)
    const item = await scopedPrisma.item.create({
      data: {
        itemNumber,
        name,
        nameEn,
        nameFr,
        category,
        canonicalUom: canonicalUom || 'g',
        isPerishable: isPerishable || false,
        requiresLot: requiresLot || false,
        parLevel: parLevel ? parLevel.toString() : null,
      },
    });

    return reply.status(201).send({
      id: item.id,
      orgId: item.orgId,
      itemNumber: item.itemNumber,
      name: item.name,
      createdAt: item.createdAt,
    });
  } catch (error: any) {
    console.error('Error creating item:', error);
    return reply.status(500).send({
      error: 'Internal Server Error',
      message: error.message,
    });
  }
}

/**
 * PATCH /api/items/:id
 * Update item (Admin/Editor only)
 */
export async function updateItem(req: TenantRequest, reply: FastifyReply) {
  const { orgId } = req;
  const { id } = req.params as { id: string };
  const user = req.user;

  if (!orgId) {
    return reply.status(401).send({ error: 'Organization not resolved' });
  }

  // Check permissions
  if (!user || !['ADMIN', 'EDITOR'].includes(user.role)) {
    return reply.status(403).send({ error: 'Editor access required' });
  }

  const updates = req.body as Partial<{
    name: string;
    nameEn: string;
    nameFr: string;
    category: string;
    canonicalUom: string;
    isPerishable: boolean;
    requiresLot: boolean;
    parLevel: number;
    isActive: boolean;
  }>;

  try {
    const scopedPrisma = createScopedPrisma(orgId, prisma);

    // Verify item exists and belongs to org
    const existing = await scopedPrisma.item.findUnique({
      where: { id },
    });

    if (!existing) {
      return reply.status(404).send({ error: 'Item not found' });
    }

    validateOrgAccess(orgId, existing, 'Item');

    // Prepare update data
    const updateData: any = {};
    if (updates.name !== undefined) updateData.name = updates.name;
    if (updates.nameEn !== undefined) updateData.nameEn = updates.nameEn;
    if (updates.nameFr !== undefined) updateData.nameFr = updates.nameFr;
    if (updates.category !== undefined) updateData.category = updates.category;
    if (updates.canonicalUom !== undefined) updateData.canonicalUom = updates.canonicalUom;
    if (updates.isPerishable !== undefined) updateData.isPerishable = updates.isPerishable;
    if (updates.requiresLot !== undefined) updateData.requiresLot = updates.requiresLot;
    if (updates.parLevel !== undefined) updateData.parLevel = updates.parLevel?.toString() || null;
    if (updates.isActive !== undefined) updateData.isActive = updates.isActive;

    const item = await scopedPrisma.item.update({
      where: { id },
      data: updateData,
    });

    return reply.send({
      id: item.id,
      orgId: item.orgId,
      itemNumber: item.itemNumber,
      name: item.name,
      updatedAt: item.updatedAt,
    });
  } catch (error: any) {
    if (error.message.includes('does not belong to organization')) {
      return reply.status(403).send({ error: 'Access denied' });
    }
    console.error('Error updating item:', error);
    return reply.status(500).send({
      error: 'Internal Server Error',
      message: error.message,
    });
  }
}

