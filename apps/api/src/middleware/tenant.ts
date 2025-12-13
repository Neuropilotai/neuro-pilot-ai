/**
 * Tenant Resolution Middleware
 * 
 * Resolves organization ID from request using priority order:
 * 1. X-Org-Id header (explicit)
 * 2. Subdomain parsing (e.g., org1.yourapp.com)
 * 3. API key lookup (X-API-Key header)
 * 4. Default org (if configured)
 * 
 * Attaches orgId to request object and validates it exists in database.
 */

import { PrismaClient } from '@prisma/client';

export interface TenantRequest {
  headers: {
    'x-org-id'?: string;
    'x-api-key'?: string;
    host?: string;
  };
  hostname?: string;
  orgId?: string;
}

export interface TenantContext {
  orgId: string;
  organization?: {
    id: string;
    name: string;
    subdomain: string | null;
    isActive: boolean;
  };
}

/**
 * Extract subdomain from hostname
 * Examples:
 * - "org1.example.com" -> "org1"
 * - "org1.example.com:3000" -> "org1"
 * - "example.com" -> null
 */
export function extractSubdomain(hostname: string): string | null {
  if (!hostname) return null;
  
  // Remove port if present
  const host = hostname.split(':')[0];
  
  // Split by dots
  const parts = host.split('.');
  
  // If we have at least 3 parts (subdomain.domain.tld), return subdomain
  if (parts.length >= 3) {
    return parts[0];
  }
  
  return null;
}

/**
 * Resolve organization ID from request
 */
export async function resolveTenant(
  req: TenantRequest,
  prisma: PrismaClient,
  defaultOrgId?: string
): Promise<TenantContext | null> {
  let orgId: string | null = null;
  let resolvedBy: 'header' | 'subdomain' | 'apikey' | 'default' | null = null;

  // Priority 1: X-Org-Id header
  if (req.headers['x-org-id']) {
    orgId = req.headers['x-org-id'].trim();
    resolvedBy = 'header';
  }
  // Priority 2: Subdomain parsing
  else if (req.hostname || req.headers.host) {
    const hostname = req.hostname || req.headers.host || '';
    const subdomain = extractSubdomain(hostname);
    
    if (subdomain) {
      // Look up organization by subdomain
      const org = await prisma.organization.findUnique({
        where: { subdomain },
        select: { id: true, name: true, subdomain: true, isActive: true },
      });
      
      if (org) {
        orgId = org.id;
        resolvedBy = 'subdomain';
      }
    }
  }
  // Priority 3: API key lookup
  else if (req.headers['x-api-key']) {
    const apiKey = req.headers['x-api-key'].trim();
    
    const org = await prisma.organization.findUnique({
      where: { apiKey },
      select: { id: true, name: true, subdomain: true, isActive: true },
    });
    
    if (org) {
      orgId = org.id;
      resolvedBy = 'apikey';
    }
  }
  // Priority 4: Default org (if configured)
  else if (defaultOrgId) {
    orgId = defaultOrgId;
    resolvedBy = 'default';
  }

  if (!orgId) {
    return null;
  }

  // Validate organization exists and is active
  const organization = await prisma.organization.findUnique({
    where: { id: orgId },
    select: { id: true, name: true, subdomain: true, isActive: true },
  });

  if (!organization) {
    return null;
  }

  if (!organization.isActive) {
    throw new Error(`Organization ${organization.name} is not active`);
  }

  return {
    orgId: organization.id,
    organization,
  };
}

/**
 * Tenant resolution middleware factory
 * 
 * Usage:
 *   app.use(tenantMiddleware(prisma, process.env.DEFAULT_ORG_ID));
 */
export function tenantMiddleware(
  prisma: PrismaClient,
  defaultOrgId?: string
) {
  return async (req: TenantRequest, res: any, next: any) => {
    try {
      const tenant = await resolveTenant(req, prisma, defaultOrgId);

      if (!tenant) {
        return res.status(401).json({
          error: 'Unauthorized',
          message: 'Unable to resolve organization. Provide X-Org-Id header, valid subdomain, or API key.',
        });
      }

      // Attach orgId to request for use in routes
      req.orgId = tenant.orgId;

      // Attach full tenant context if needed
      (req as any).tenant = tenant;

      next();
    } catch (error: any) {
      return res.status(500).json({
        error: 'Internal Server Error',
        message: error.message || 'Failed to resolve tenant',
      });
    }
  };
}

/**
 * Express/Fastify compatible middleware
 * For Fastify, use as: fastify.addHook('onRequest', tenantMiddlewareHook(prisma))
 */
export function tenantMiddlewareHook(
  prisma: PrismaClient,
  defaultOrgId?: string
) {
  return async (request: any, reply: any) => {
    try {
      // Skip tenant resolution for health checks
      const path = request.url || request.path || '';
      if (path.startsWith('/healthz') || path.startsWith('/readyz') || path.startsWith('/health') || path.startsWith('/ping')) {
        return; // Skip tenant resolution
      }

      const tenant = await resolveTenant(request, prisma, defaultOrgId);

      if (!tenant) {
        return reply.status(401).send({
          error: 'Unauthorized',
          message: 'Unable to resolve organization. Provide X-Org-Id header, valid subdomain, or API key.',
        });
      }

      // Attach orgId to request
      request.orgId = tenant.orgId;
      request.tenant = tenant;
    } catch (error: any) {
      return reply.status(500).send({
        error: 'Internal Server Error',
        message: error.message || 'Failed to resolve tenant',
      });
    }
  };
}

