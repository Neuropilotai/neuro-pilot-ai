/**
 * Authentication Middleware
 * 
 * JWT authentication and user context injection
 */

import { FastifyRequest, FastifyReply } from 'fastify';
import { PrismaClient } from '@prisma/client';
import { prisma } from '../utils/prisma';

// JWT payload interface
export interface JWTPayload {
  userId: string;
  orgId: string;
  email: string;
  role: string;
  iat?: number;
  exp?: number;
}

// Extended request with user context
export interface AuthenticatedRequest extends FastifyRequest {
  user?: {
    id: string;
    email: string;
    role: string;
    orgId: string;
    firstName?: string;
    lastName?: string;
  };
}

/**
 * Verify JWT token and extract user information
 * 
 * This is a placeholder - implement with your JWT library (e.g., @fastify/jwt)
 */
async function verifyToken(token: string): Promise<JWTPayload | null> {
  try {
    // TODO: Implement actual JWT verification
    // Example with @fastify/jwt:
    // const decoded = await fastify.jwt.verify(token);
    // return decoded as JWTPayload;

    // For now, return null (authentication disabled)
    // In production, implement proper JWT verification
    return null;
  } catch (error) {
    return null;
  }
}

/**
 * Authentication middleware
 * 
 * Verifies JWT token and injects user context into request
 * 
 * Usage:
 *   server.addHook('preHandler', authMiddleware);
 */
export async function authMiddleware(
  request: AuthenticatedRequest,
  reply: FastifyReply
) {
  // Skip authentication for health checks
  const path = request.url || request.path || '';
  if (
    path.startsWith('/healthz') ||
    path.startsWith('/readyz') ||
    path.startsWith('/metrics')
  ) {
    return; // Skip authentication
  }

  // Get token from Authorization header
  const authHeader = request.headers.authorization;
  if (!authHeader) {
    return reply.status(401).send({
      error: 'Unauthorized',
      message: 'Missing Authorization header',
    });
  }

  // Extract token (Bearer <token>)
  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer') {
    return reply.status(401).send({
      error: 'Unauthorized',
      message: 'Invalid Authorization header format. Expected: Bearer <token>',
    });
  }

  const token = parts[1];

  // Verify token
  const payload = await verifyToken(token);
  if (!payload) {
    return reply.status(401).send({
      error: 'Unauthorized',
      message: 'Invalid or expired token',
    });
  }

  // Fetch user from database to get latest role/permissions
  try {
    const user = await prisma.user.findUnique({
      where: {
        id: payload.userId,
      },
      select: {
        id: true,
        email: true,
        role: true,
        orgId: true,
        firstName: true,
        lastName: true,
        isActive: true,
      },
    });

    if (!user) {
      return reply.status(401).send({
        error: 'Unauthorized',
        message: 'User not found',
      });
    }

    if (!user.isActive) {
      return reply.status(403).send({
        error: 'Forbidden',
        message: 'User account is inactive',
      });
    }

    // Verify orgId matches (extra security check)
    if (user.orgId !== payload.orgId) {
      return reply.status(403).send({
        error: 'Forbidden',
        message: 'Organization mismatch',
      });
    }

    // Inject user context into request
    request.user = {
      id: user.id,
      email: user.email,
      role: user.role,
      orgId: user.orgId,
      firstName: user.firstName || undefined,
      lastName: user.lastName || undefined,
    };
  } catch (error: any) {
    console.error('Error fetching user:', error);
    return reply.status(500).send({
      error: 'Internal Server Error',
      message: 'Failed to authenticate user',
    });
  }
}

/**
 * Optional authentication middleware
 * 
 * Tries to authenticate but doesn't fail if token is missing
 * Useful for endpoints that work with or without authentication
 */
export async function optionalAuthMiddleware(
  request: AuthenticatedRequest,
  reply: FastifyReply
) {
  const authHeader = request.headers.authorization;
  if (!authHeader) {
    return; // No token, continue without user context
  }

  // Try to authenticate
  await authMiddleware(request, reply);
  // If authentication fails, the reply will be sent, so we don't need to handle it here
}

/**
 * Role-based access control decorator
 * 
 * Creates middleware that checks if user has required role
 */
export function requireRole(...allowedRoles: string[]) {
  return async (request: AuthenticatedRequest, reply: FastifyReply) => {
    if (!request.user) {
      return reply.status(401).send({
        error: 'Unauthorized',
        message: 'Authentication required',
      });
    }

    if (!allowedRoles.includes(request.user.role)) {
      return reply.status(403).send({
        error: 'Forbidden',
        message: `Required role: ${allowedRoles.join(' or ')}`,
        userRole: request.user.role,
      });
    }
  };
}

/**
 * Admin-only middleware
 */
export const requireAdmin = requireRole('ADMIN');

/**
 * Editor or Admin middleware
 */
export const requireEditor = requireRole('EDITOR', 'ADMIN');

/**
 * Counter, Editor, Approver, or Admin middleware
 */
export const requireCounter = requireRole('COUNTER', 'EDITOR', 'APPROVER', 'ADMIN');

