import { prisma } from '../src/lib/prisma.js';
import { resetPasswords, ResetPasswordsUsageError } from './reset-passwords.core.js';

// Ponto de entrada CLI puro — toda a lógica testável vive em reset-passwords.core.ts (ver
// tests/unit/scripts/reset-passwords.test.ts). Manter este arquivo fino evita que rodar os testes
// dispare uma execução real do script.
resetPasswords(process.argv.slice(2))
  .catch((error) => {
    if (error instanceof ResetPasswordsUsageError) {
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
