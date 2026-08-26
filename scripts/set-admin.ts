import { prisma } from '../src/lib/prisma.js';
import { setAdmin, SetAdminUsageError } from './set-admin.core.js';

// Ponto de entrada CLI puro — toda a lógica testável vive em set-admin.core.ts (ver
// tests/unit/scripts/set-admin.test.ts).
setAdmin(process.argv.slice(2))
  .catch((error) => {
    if (error instanceof SetAdminUsageError) {
      console.error(error.message);
      process.exitCode = 1;
      return;
    }
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
