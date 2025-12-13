/**
 * Route Registration
 * 
 * Central route registration for all API endpoints
 * 
 * Usage in server.ts:
 *   import { registerRoutes } from './routes';
 *   registerRoutes(server);
 */

/**
 * Route Registration
 * 
 * Central route registration for all API endpoints
 */

import { FastifyInstance } from 'fastify';
import { tenantMiddlewareHook } from '../middleware/tenant';
import { prisma } from '../utils/prisma';

// Import route handlers
import * as inventoryRoutes from './inventory.example';
import * as itemRoutes from './items';
import * as locationRoutes from './locations';
import * as countRoutes from './counts';

/**
 * Register all routes with tenant middleware
 */
export async function registerRoutes(server: FastifyInstance) {
  const defaultOrgId = process.env.DEFAULT_ORG_ID;

  // Apply tenant middleware to all routes (except health checks)
  server.addHook('onRequest', tenantMiddlewareHook(prisma, defaultOrgId));

  // Health checks (no tenant required - registered before tenant middleware)
  // These are handled in server.ts before tenant middleware is applied

  // Inventory routes (from example file)
  // Note: These are example routes - implement proper routes in inventory.ts when ready
  try {
    if (inventoryRoutes.getInventoryBalance) {
      server.get('/api/inventory/balance', inventoryRoutes.getInventoryBalance as any);
    }
    if (inventoryRoutes.getAllInventoryBalances) {
      server.get('/api/inventory/balances', inventoryRoutes.getAllInventoryBalances as any);
    }
    if (inventoryRoutes.getInventoryLedger) {
      server.get('/api/inventory/ledger', inventoryRoutes.getInventoryLedger as any);
    }
    if (inventoryRoutes.adjustInventory) {
      server.post('/api/inventory/adjust', inventoryRoutes.adjustInventory as any);
    }
  } catch (error) {
    // Inventory routes are optional (example file)
    console.warn('Inventory routes not available:', error);
  }

  // Item routes
  server.get('/api/items', itemRoutes.listItems as any);
  server.get('/api/items/:id', itemRoutes.getItem as any);
  server.post('/api/items', itemRoutes.createItem as any);
  server.patch('/api/items/:id', itemRoutes.updateItem as any);

  // Location routes
  server.get('/api/locations', locationRoutes.listLocations as any);
  server.get('/api/locations/:id', locationRoutes.getLocation as any);
  server.post('/api/locations', locationRoutes.createLocation as any);

  // Count sheet routes
  server.post('/api/counts', countRoutes.createCountSheet as any);
  server.get('/api/counts', async (request: any, reply: any) => {
    // TODO: Implement list count sheets
    return reply.status(501).send({ error: 'Not implemented' });
  });
  server.get('/api/counts/:id', countRoutes.getCountSheet as any);
  server.patch('/api/counts/:id', async (request: any, reply: any) => {
    // TODO: Implement update count sheet
    return reply.status(501).send({ error: 'Not implemented' });
  });
  server.post('/api/counts/:id/lines', countRoutes.addCountLine as any);
  server.post('/api/counts/:id/post', countRoutes.postCountSheet as any);

  // TODO: Add remaining routes:
  // - Authentication routes
  // - Import routes
  // - Export routes
  // - Audit log routes
}

