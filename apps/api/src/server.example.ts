/**
 * Example Server Setup
 * 
 * This file demonstrates how to integrate tenant middleware
 * and scoped Prisma queries into your server.
 * 
 * Adapt this to your framework (Fastify, Express, etc.)
 */

import Fastify from 'fastify';
import { PrismaClient } from '@prisma/client';
import { tenantMiddlewareHook } from './middleware/tenant';
import { createScopedPrisma } from './utils/prisma-scope';
import { prisma } from './utils/prisma';

// Example: Fastify setup
const server = Fastify({
  logger: true,
});

// Add tenant resolution hook (runs on every request)
server.addHook('onRequest', tenantMiddlewareHook(prisma, process.env.DEFAULT_ORG_ID));

// Example route using scoped Prisma
server.get('/api/items', async (request, reply) => {
  const orgId = (request as any).orgId;
  
  if (!orgId) {
    return reply.status(401).send({ error: 'Organization not resolved' });
  }

  // Create scoped Prisma client (automatically filters by orgId)
  const scopedPrisma = createScopedPrisma(orgId, prisma);

  // Query is automatically scoped to orgId
  const items = await scopedPrisma.item.findMany({
    where: {
      isActive: true,
    },
    include: {
      supplierItems: true,
    },
  });

  return reply.send({ items });
});

// Example route with manual orgId validation
server.get('/api/items/:id', async (request, reply) => {
  const orgId = (request as any).orgId;
  const { id } = request.params as { id: string };

  if (!orgId) {
    return reply.status(401).send({ error: 'Organization not resolved' });
  }

  const scopedPrisma = createScopedPrisma(orgId, prisma);

  // findUnique automatically includes orgId filter
  const item = await scopedPrisma.item.findUnique({
    where: { id },
    include: {
      supplierItems: true,
      uomConversions: true,
    },
  });

  if (!item) {
    return reply.status(404).send({ error: 'Item not found' });
  }

  // Extra safety check
  if (item.orgId !== orgId) {
    return reply.status(403).send({ error: 'Access denied' });
  }

  return reply.send({ item });
});

// Example: Create item (orgId automatically set)
server.post('/api/items', async (request, reply) => {
  const orgId = (request as any).orgId;
  
  if (!orgId) {
    return reply.status(401).send({ error: 'Organization not resolved' });
  }

  const { itemNumber, name, category } = request.body as {
    itemNumber: string;
    name: string;
    category?: string;
  };

  const scopedPrisma = createScopedPrisma(orgId, prisma);

  // orgId is automatically added to create data
  const item = await scopedPrisma.item.create({
    data: {
      itemNumber,
      name,
      category,
      // orgId is automatically added by scopedPrisma
    },
  });

  return reply.status(201).send({ item });
});

// Health check (no tenant required)
server.get('/healthz', async (request, reply) => {
  return reply.send({ status: 'ok', timestamp: new Date().toISOString() });
});

// Readiness check (includes database)
server.get('/readyz', async (request, reply) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return reply.send({ status: 'ready', database: 'connected' });
  } catch (error) {
    return reply.status(503).send({ status: 'not ready', database: 'disconnected' });
  }
});

// Start server
const start = async () => {
  try {
    const port = parseInt(process.env.PORT || '3000', 10);
    const host = process.env.HOST || '0.0.0.0';
    
    await server.listen({ port, host });
    console.log(`Server listening on ${host}:${port}`);
  } catch (error) {
    server.log.error(error);
    process.exit(1);
  }
};

// Graceful shutdown
process.on('SIGTERM', async () => {
  await server.close();
  await prisma.$disconnect();
  process.exit(0);
});

if (require.main === module) {
  start();
}

export { server };

