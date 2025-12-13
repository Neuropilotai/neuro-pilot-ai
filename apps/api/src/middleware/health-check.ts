/**
 * Health Check Middleware
 * 
 * Bypasses tenant resolution for health check endpoints.
 * Use this to exclude health checks from tenant middleware.
 */

import { FastifyRequest, FastifyReply } from 'fastify';

/**
 * Check if request is a health check endpoint
 */
export function isHealthCheck(path: string): boolean {
  const healthCheckPaths = ['/healthz', '/readyz', '/health', '/ping'];
  return healthCheckPaths.some((healthPath) => path.startsWith(healthPath));
}

/**
 * Health check middleware that bypasses tenant resolution
 * 
 * Usage in Fastify:
 *   server.addHook('onRequest', async (request, reply) => {
 *     if (isHealthCheck(request.url)) {
 *       // Skip tenant middleware
 *       return;
 *     }
 *     // Continue with tenant middleware
 *   });
 */
export function healthCheckBypass(
  request: FastifyRequest,
  reply: FastifyReply,
  next: () => void
) {
  if (isHealthCheck(request.url)) {
    // Skip tenant resolution for health checks
    return next();
  }
  next();
}

