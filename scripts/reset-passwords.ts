import { hashPassword } from 'better-auth/crypto';
import { prisma } from '../src/lib/prisma.js';
import { requestContext } from '../src/lib/async-context.js';

const DEFAULT_TEMP_PASSWORD = '00000000';

async function main() {
  const targetArg = process.argv[2]?.trim();
  const password = process.argv[3] ?? DEFAULT_TEMP_PASSWORD;

  // Alvo explícito obrigatório: rodar sem argumento resetava a senha de TODOS os usuários da
  // base para o valor temporário — destrutivo demais para acontecer por engano. Para atingir
  // todo mundo, a intenção precisa ser literal: `--all`.
  if (!targetArg) {
    console.error('Uso: tsx scripts/reset-passwords.ts <email|--all> [senha]');
    console.error('Sem alvo explícito nada é alterado. Use --all somente se quiser resetar TODOS os usuários.');
    process.exit(1);
  }

  const resetAll = targetArg === '--all';
  const targetEmail = resetAll ? undefined : targetArg.toLowerCase();

  requestContext.enterWith({ bypassRls: true });

  const users = await prisma.user.findMany({
    where: targetEmail ? { email: targetEmail } : undefined,
    select: { id: true, email: true },
  });

  if (users.length === 0) {
    console.log(targetEmail ? `No user found for ${targetEmail}.` : 'No users found.');
    return;
  }

  const passwordHash = await hashPassword(password);

  for (const user of users) {
    await prisma.account.upsert({
      where: { id: `${user.id}:credential` },
      update: { password: passwordHash },
      create: {
        id: `${user.id}:credential`,
        userId: user.id,
        accountId: user.id,
        providerId: 'credential',
        password: passwordHash,
      },
    });

    await prisma.user.update({
      where: { id: user.id },
      data: { mustChangePassword: true },
    });

    console.log(`Password reset to ${password} and mustChangePassword set for user: ${user.email}`);
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
