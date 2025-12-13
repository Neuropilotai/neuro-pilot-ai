/**
 * Fastify Server Setup
 * 
 * Main server entry point with tenant isolation, authentication, and route registration
 */

import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import { registerRoutes } from './routes';
import { prisma } from './utils/prisma';
import { authMiddleware } from './middleware/auth';

// Environment variables
const PORT = parseInt(process.env.PORT || '3000', 10);
const HOST = process.env.HOST || '0.0.0.0';
const NODE_ENV = process.env.NODE_ENV || 'development';

// Create Fastify instance
const server = Fastify({
  logger: {
    level: NODE_ENV === 'production' ? 'info' : 'debug',
    transport:
      NODE_ENV === 'development'
        ? {
            target: 'pino-pretty',
            options: {
              translateTime: 'HH:MM:ss Z',
              ignore: 'pid,hostname',
            },
          }
        : undefined,
  },
  requestIdLogLabel: 'reqId',
  requestIdHeader: 'x-request-id',
  disableRequestLogging: false,
});

// Register plugins
async function registerPlugins() {
  // CORS
  await server.register(cors, {
    origin: process.env.CORS_ORIGIN?.split(',') || true,
    credentials: true,
  });

  // Security headers
  await server.register(helmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        scriptSrc: ["'self'"],
        imgSrc: ["'self'", 'data:', 'https:'],
      },
    },
  });

  // Rate limiting
  await server.register(rateLimit, {
    max: 100, // requests
    timeWindow: '1 minute',
    errorResponseBuilder: (request, context) => {
      return {
        error: 'Too Many Requests',
        message: `Rate limit exceeded, retry in ${context.ttl} seconds`,
        retryAfter: context.ttl,
      };
    },
  });
}

// Graceful shutdown
async function gracefulShutdown(signal: string) {
  server.log.info(`Received ${signal}, shutting down gracefully...`);

  try {
    // Close server
    await server.close();

    // Disconnect Prisma
    await prisma.$disconnect();

    server.log.info('Server shut down successfully');
    process.exit(0);
  } catch (error) {
    server.log.error('Error during shutdown:', error);
    process.exit(1);
  }
}

// Register shutdown handlers
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Error handler
server.setErrorHandler((error, request, reply) => {
  server.log.error({
    error: error.message,
    stack: error.stack,
    requestId: request.id,
    url: request.url,
    method: request.method,
  });

  // Don't expose internal errors in production
  const message =
    NODE_ENV === 'production' && error.statusCode >= 500
      ? 'Internal Server Error'
      : error.message;

  reply.status(error.statusCode || 500).send({
    error: error.name || 'Error',
    message,
    statusCode: error.statusCode || 500,
    requestId: request.id,
  });
});

// Not found handler
server.setNotFoundHandler((request, reply) => {
  reply.status(404).send({
    error: 'Not Found',
    message: `Route ${request.method} ${request.url} not found`,
    statusCode: 404,
    requestId: request.id,
  });
});

// Start server
async function start() {
  try {
    // Register plugins
    await registerPlugins();

    // Register health checks BEFORE tenant middleware
    server.get('/healthz', async (request, reply) => {
      return reply.send({ status: 'ok', timestamp: new Date().toISOString() });
    });

    server.get('/readyz', async (request, reply) => {
      try {
        await prisma.$queryRaw`SELECT 1`;
        return reply.send({ status: 'ready', database: 'connected' });
      } catch (error) {
        return reply.status(503).send({ status: 'not ready', database: 'disconnected' });
      }
    });

    // Apply authentication middleware (after health checks, before routes)
    // Note: Individual routes can opt out if needed
    server.addHook('preHandler', authMiddleware);

    // Register routes (includes tenant middleware)
    await registerRoutes(server);

    // Test database connection
    await prisma.$connect();
    server.log.info('Database connected');

    // Start server
    await server.listen({ port: PORT, host: HOST });

    server.log.info({
      message: `Server listening on http://${HOST}:${PORT}`,
      port: PORT,
      host: HOST,
      env: NODE_ENV,
      nodeVersion: process.version,
    });
  } catch (error) {
    server.log.error('Error starting server:', error);
    await prisma.$disconnect();
    process.exit(1);
  }
}

// Start if this file is executed directly
if (require.main === module) {
  start();
}

export { server, start };

