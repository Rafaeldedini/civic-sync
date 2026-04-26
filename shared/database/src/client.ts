import { PrismaClient } from '@prisma/client';

// ─── Singleton PrismaClient ────────────────────────────────────────────────────
// Reusing a global instance prevents connection pool exhaustion during
// hot-reloads in development.

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log:
      process.env.NODE_ENV === 'development'
        ? ['query', 'info', 'warn', 'error']
        : ['warn', 'error'],
  });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

export { PrismaClient };
