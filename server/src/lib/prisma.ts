/**
 * Database bootstrap.
 *
 * The app runs against an in-memory store by default so it starts with zero
 * setup, and against real PostgreSQL when `USE_REAL_POSTGRES=true`.
 *
 * IMPORTANT: `@prisma/client` is loaded LAZILY, with `require`, inside the
 * Postgres branch. A static `import { PrismaClient } from '@prisma/client'`
 * crashes the process at module-load time whenever `prisma generate` has not
 * run — which is the default state of a fresh clone, since the schema lives at
 * `server/prisma/schema.prisma` rather than the path Prisma looks in by default.
 * Requiring it lazily means the in-memory path never touches the generated
 * client at all, and the try/catch fallback below can actually do its job.
 */
import path from 'node:path';
import { createRequire } from 'node:module';
import { createInMemoryPrisma } from './inMemoryPrisma.js';

const nodeRequire =
  typeof require === 'function'
    ? require
    : createRequire(path.resolve(process.cwd(), 'package.json'));

const globalForPrisma = globalThis as unknown as { prisma?: unknown };

function initializePrisma(): unknown {
  if (process.env.USE_REAL_POSTGRES === 'true') {
    try {
      console.log('[Prisma] Connecting to PostgreSQL…');
      const { PrismaClient } = nodeRequire('@prisma/client') as { PrismaClient: new () => unknown };
      return new PrismaClient();
    } catch (error) {
      console.warn(
        '[Prisma] Could not load the generated client. Run:\n' +
          '  npx prisma generate --schema server/prisma/schema.prisma\n' +
          'Falling back to the in-memory store for now.',
        error instanceof Error ? error.message : error,
      );
      return createInMemoryPrisma();
    }
  }

  console.log('[Prisma] Using the in-memory store, pre-seeded with the workbook data.');
  return createInMemoryPrisma();
}

/**
 * Typed loosely on purpose: the in-memory store and the generated client are
 * structurally compatible for everything this app does, but they are not the
 * same nominal type, and the generated one may not exist at compile time.
 * Every call site is still typed by the service layer above it.
 */
export const prisma: any = globalForPrisma.prisma ?? initializePrisma();
globalForPrisma.prisma = prisma;
