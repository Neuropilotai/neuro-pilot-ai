/**
 * Prisma Client Utility
 * 
 * Provides Prisma client instance for use with Prisma schema
 * Falls back to pool-based queries if Prisma is not available
 */

let prismaClient = null;

/**
 * Get or create Prisma client instance
 * @returns {Promise<PrismaClient>} Prisma client
 */
async function getPrismaClient() {
  if (prismaClient) {
    return prismaClient;
  }

  try {
    const { PrismaClient } = require('@prisma/client');
    prismaClient = new PrismaClient();
    
    // Test connection
    await prismaClient.$connect();
    console.log('✅ Prisma client connected');
    
    return prismaClient;
  } catch (error) {
    console.warn('⚠️  Prisma client not available, using pool-based queries:', error.message);
    return null;
  }
}

/**
 * Gracefully disconnect Prisma client
 */
async function disconnectPrisma() {
  if (prismaClient) {
    await prismaClient.$disconnect();
    prismaClient = null;
  }
}

module.exports = {
  getPrismaClient,
  disconnectPrisma,
};

