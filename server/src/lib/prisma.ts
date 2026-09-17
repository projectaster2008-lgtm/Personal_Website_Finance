import { PrismaClient } from '@prisma/client';
import { createInMemoryPrisma } from './inMemoryPrisma.js';

const globalForPrisma = globalThis as unknown as { prisma?: any };

function initializePrisma(): any {
  if (process.env.USE_REAL_POSTGRES === 'true') {
    try {
      console.log('[Prisma] Attempting to connect to PostgreSQL...');
      return new PrismaClient();
    } catch (err) {
      console.warn('[Prisma] Database connection failed, falling back to InMemoryPrisma:', err);
      return createInMemoryPrisma();
    }
  }

  // Default to robust, pre-seeded InMemoryPrisma for instant zero-dependency execution
  console.log('[Prisma] Using InMemoryPrisma store with pre-seeded workbook data.');
  return createInMemoryPrisma();
}

export const prisma: PrismaClient = (globalForPrisma.prisma ?? initializePrisma()) as unknown as PrismaClient;

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}
