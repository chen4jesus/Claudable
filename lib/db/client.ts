import { PrismaClient } from '@prisma/client';
import path from 'path';

// Prisma Client singleton pattern for Next.js
// Prevents multiple instances in development (hot reload)

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

/**
 * Handle SQLite relative paths to make them absolute based on process.cwd()
 * This is crucial for production/standalone mode where CWD might be different
 * than development or the directory containing .env.
 */
function getDatasources() {
  const url = process.env.DATABASE_URL;
  if (url && url.startsWith('file:')) {
    // Extract the raw path part
    let dbPath = url.replace(/^file:/, '');
    
    // If it's relative (doesn't start with / or a Windows drive letter like C:)
    if (!path.isAbsolute(dbPath) && !dbPath.match(/^[a-zA-Z]:/)) {
      // Normalize relative path (handling ./ or just the path)
      const cleanRelativePath = dbPath.startsWith('./') ? dbPath.substring(2) : dbPath;
      dbPath = path.resolve(process.cwd(), cleanRelativePath);
    }
    
    // Ensure forward slashes for SQLite URI consistency
    const normalizedPath = dbPath.split(path.sep).join('/');
    const absoluteUrl = `file:${normalizedPath}`;
    
    console.log(`[Prisma] Normalized DATABASE_URL: ${url} -> ${absoluteUrl}`);
    return {
      db: {
        url: absoluteUrl,
      },
    };
  }
  return undefined;
}

export const prisma =
  globalForPrisma.prisma ||
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
    datasources: getDatasources(),
  });

globalForPrisma.prisma = prisma;
