import { randomUUID } from 'node:crypto';
import { hashPassword } from 'better-auth/crypto';
import { prisma } from '../src/lib/prisma.js';
import { requestContext } from '../src/lib/async-context.js';
import type { UserRole } from '@prisma/client';

const ORG_NAME = 'AtlasGR';
const DEFAULT_TEMP_PASSWORD = process.env.INITIAL_ADMIN_PASSWORD || '00000000';

const TEAM: Array<{ name: string; email: string; role: UserRole }> = [
  { name: 'Marcelo Nascimento', email: 'marcelo.nascimento@atlasgr.com.br', role: 'ADMIN' },
  { name: 'Joao Reis', email: 'joao.reis@atlasgr.com.br', role: 'GESTOR' },
  { name: 'Murilo Marques', email: 'murilo.marques@atlasgr.com.br', role: 'GESTOR' },
  { name: 'Comercial', email: 'comercial@atlasgr.com.br', role: 'CLOSER' },
  { name: 'Kaue Oliveira', email: 'kaue.oliveira@totaltrac.com.br', role: 'SDR' },
];

async function main() {
  requestContext.enterWith({ bypassRls: true });

  const org = await prisma.organization.upsert({
    where: { name: ORG_NAME },
    update: {},
    create: { name: ORG_NAME },
  });
  console.log(`Organization: ${org.name} (${org.id})`);

  const passwordHash = await hashPassword(DEFAULT_TEMP_PASSWORD);

  for (const member of TEAM) {
    const user = await prisma.user.upsert({
      where: { email: member.email },
      update: { name: member.name, role: member.role, organizationId: org.id },
      create: {
        name: member.name,
        email: member.email,
        role: member.role,
        organizationId: org.id,
        emailVerified: true,
      },
    });

    const existingAccounts = await prisma.account.findMany({
      where: { userId: user.id, providerId: 'credential' },
      orderBy: { createdAt: 'asc' },
    });

    if (existingAccounts.length > 0) {
      const [primary, ...duplicates] = existingAccounts;
      await prisma.account.update({
        where: { id: primary.id },
        data: { password: passwordHash },
      });
      if (duplicates.length > 0) {
        await prisma.account.deleteMany({
          where: { id: { in: duplicates.map((a) => a.id) } },
        });
      }
    } else {
      await prisma.account.create({
        data: {
          id: randomUUID(),
          userId: user.id,
          accountId: user.id,
          providerId: 'credential',
          password: passwordHash,
        },
      });
    }

    await prisma.user.update({
      where: { id: user.id },
      data: { mustChangePassword: false },
    });

    console.log(`OK  ${member.role.padEnd(10)} ${member.email}`);
  }

  console.log('\nSenha para todos os usuários do seed: ' + DEFAULT_TEMP_PASSWORD);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    process.exit(0);
  });
