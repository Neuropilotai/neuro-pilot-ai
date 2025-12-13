/**
 * Locations Routes
 * 
 * Location management endpoints with tenant isolation
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
 * GET /api/locations
 * List all locations
 */
export async function listLocations(req: TenantRequest, reply: FastifyReply) {
  const { orgId } = req;
  if (!orgId) {
    return reply.status(401).send({ error: 'Organization not resolved' });
  }

  const { kind, site, isActive } = req.query as {
    kind?: string;
    site?: string;
    isActive?: string;
  };

  try {
    const scopedPrisma = createScopedPrisma(orgId, prisma);

    const where: any = {
      orgId,
    };

    if (kind) {
      where.kind = kind;
    }

    if (site) {
      where.site = site;
    }

    if (isActive !== undefined) {
      where.isActive = isActive === 'true';
    }

    const locations = await scopedPrisma.location.findMany({
      where,
      orderBy: [
        { site: 'asc' },
        { sortOrder: 'asc' },
        { name: 'asc' },
      ],
    });

    return reply.send({
      locations: locations.map((loc) => ({
        id: loc.id,
        orgId: loc.orgId,
        name: loc.name,
        site: loc.site,
        kind: loc.kind,
        isActive: loc.isActive,
        sortOrder: loc.sortOrder,
      })),
    });
  } catch (error: any) {
    console.error('Error listing locations:', error);
    return reply.status(500).send({
      error: 'Internal Server Error',
      message: error.message,
    });
  }
}

/**
 * GET /api/locations/:id
 * Get single location
 */
export async function getLocation(req: TenantRequest, reply: FastifyReply) {
  const { orgId } = req;
  const { id } = req.params as { id: string };

  if (!orgId) {
    return reply.status(401).send({ error: 'Organization not resolved' });
  }

  try {
    const scopedPrisma = createScopedPrisma(orgId, prisma);

    const location = await scopedPrisma.location.findUnique({
      where: { id },
    });

    if (!location) {
      return reply.status(404).send({ error: 'Location not found' });
    }

    validateOrgAccess(orgId, location, 'Location');

    return reply.send({
      id: location.id,
      orgId: location.orgId,
      name: location.name,
      site: location.site,
      kind: location.kind,
      isActive: location.isActive,
      sortOrder: location.sortOrder,
      createdAt: location.createdAt,
      updatedAt: location.updatedAt,
    });
  } catch (error: any) {
    if (error.message.includes('does not belong to organization')) {
      return reply.status(403).send({ error: 'Access denied' });
    }
    console.error('Error fetching location:', error);
    return reply.status(500).send({
      error: 'Internal Server Error',
      message: error.message,
    });
  }
}

/**
 * POST /api/locations
 * Create new location (Admin only)
 */
export async function createLocation(req: TenantRequest, reply: FastifyReply) {
  const { orgId } = req;
  const user = req.user;

  if (!orgId) {
    return reply.status(401).send({ error: 'Organization not resolved' });
  }

  if (!user || user.role !== 'ADMIN') {
    return reply.status(403).send({ error: 'Admin access required' });
  }

  const { name, site, kind, sortOrder } = req.body as {
    name: string;
    site?: string;
    kind: string;
    sortOrder?: number;
  };

  if (!name || !kind) {
    return reply.status(400).send({
      error: 'Missing required fields: name, kind',
    });
  }

  try {
    const scopedPrisma = createScopedPrisma(orgId, prisma);

    // Check if location already exists in this org/site
    const existing = await scopedPrisma.location.findUnique({
      where: {
        orgId_site_name: {
          orgId,
          site: site || 'Main',
          name,
        },
      },
    });

    if (existing) {
      return reply.status(409).send({
        error: 'Location already exists',
        locationId: existing.id,
      });
    }

    const location = await scopedPrisma.location.create({
      data: {
        name,
        site: site || 'Main',
        kind: kind as any,
        sortOrder: sortOrder || 0,
      },
    });

    return reply.status(201).send({
      id: location.id,
      orgId: location.orgId,
      name: location.name,
      site: location.site,
      kind: location.kind,
      createdAt: location.createdAt,
    });
  } catch (error: any) {
    console.error('Error creating location:', error);
    return reply.status(500).send({
      error: 'Internal Server Error',
      message: error.message,
    });
  }
}

