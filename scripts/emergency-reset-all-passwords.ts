import { randomUUID } from 'node:crypto';
import { hashPassword } from 'better-auth/crypto';
import { prisma } from '../src/lib/prisma.js';
import { requestContext } from '../src/lib/async-context.js';

const emergencyPassword = process.env.EMERGENCY_RESET_ALL_PASSWORDS_PASSWORD?.trim();

async function main() {
  if (!emergencyPassword) {
    console.log('Emergency password reset disabled.');
    return;
  }

  if (emergencyPassword.length < 16) {
    throw new Error('EMERGENCY_RESET_ALL_PASSWORDS_PASSWORD must have at least 16 characters.');
  }

  requestContext.enterWith({ bypassRls: true });

  const users = await prisma.user.findMany({
    select: { id: true, email: true },
    orderBy: { createdAt: 'asc' },
  });

  if (users.length === 0) {
    console.log('EMERGENCY_AUTH_RESET no users found.');
    return;
  }

  const passwordHash = await hashPassword(emergencyPassword);
  let removedDuplicateCredentials = 0;
  let revokedSessions = 0;

  for (const user of users) {
    const credentialAccounts = await prisma.account.findMany({
      where: { userId: user.id, providerId: 'credential' },
      select: { id: true },
    });

    if (credentialAccounts.length === 0) {
      await prisma.account.create({
        data: {
          id: randomUUID(),
          userId: user.id,
          accountId: user.id,
          providerId: 'credential',
          password: passwordHash,
        },
      });
    } else {
      const [canonicalCredential, ...duplicates] = credentialAccounts;

      await prisma.account.update({
        where: { id: canonicalCredential.id },
        data: { password: passwordHash },
      });

      if (duplicates.length > 0) {
        const deleted = await prisma.account.deleteMany({
          where: { id: { in: duplicates.map((account) => account.id) } },
        });
        removedDuplicateCredentials += deleted.count;
      }
    }

    const sessions = await prisma.session.deleteMany({ where: { userId: user.id } });
    revokedSessions += sessions.count;

    await prisma.user.update({
      where: { id: user.id },
      data: { mustChangePassword: true },
    });

    console.log(`EMERGENCY_AUTH_RESET user=${user.email} status=reset`);
  }

  console.log(
    `EMERGENCY_AUTH_RESET completed users=${users.length} revokedSessions=${revokedSessions} removedDuplicateCredentials=${removedDuplicateCredentials}`,
  );
}

main()
  .catch((error) => {
    console.error('EMERGENCY_AUTH_RESET failed', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
