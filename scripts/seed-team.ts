import { randomUUID } from 'node:crypto';
import { hashPassword } from 'better-auth/crypto';
import { prisma } from '../src/lib/prisma.js';
import { requestContext } from '../src/lib/async-context.js';
import type { UserRole } from '@prisma/client';

const ORG_NAME = 'AtlasGR';
const DEFAULT_ADMIN_EMAIL = 'marcelo.nascimento@atlasgr.com.br';
const DEFAULT_ADMIN_NAME = 'Marcelo Nascimento';
const DEFAULT_ADMIN_ROLE: UserRole = 'ADMIN';
const MIN_ADMIN_PASSWORD_LENGTH = 16;

function getAdminPassword(): string {
  const password = process.env.INITIAL_ADMIN_PASSWORD?.trim();

  if (!password) {
    throw new Error(
      'INITIAL_ADMIN_PASSWORD é obrigatória para configurar o administrador. Defina-a apenas no ambiente seguro de execução.',
    );
  }

  if (password.length < MIN_ADMIN_PASSWORD_LENGTH) {
    throw new Error(
      `INITIAL_ADMIN_PASSWORD deve ter pelo menos ${MIN_ADMIN_PASSWORD_LENGTH} caracteres.`,
    );
  }

  return password;
}

async function main() {
  requestContext.enterWith({ bypassRls: true });

  const adminPassword = getAdminPassword();

  const org = await prisma.organization.upsert({
    where: { name: ORG_NAME },
    update: {},
    create: { name: ORG_NAME },
  });
  console.log(`Organização: ${org.name} (${org.id})`);

  const passwordHash = await hashPassword(adminPassword);

  // 1. Cria ou atualiza o usuário único administrador.
  const user = await prisma.user.upsert({
    where: { email: DEFAULT_ADMIN_EMAIL },
    update: {
      name: DEFAULT_ADMIN_NAME,
      role: DEFAULT_ADMIN_ROLE,
      organizationId: org.id,
      emailVerified: true,
      mustChangePassword: false,
    },
    create: {
      name: DEFAULT_ADMIN_NAME,
      email: DEFAULT_ADMIN_EMAIL,
      role: DEFAULT_ADMIN_ROLE,
      organizationId: org.id,
      emailVerified: true,
      mustChangePassword: false,
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
        where: { id: { in: duplicates.map((account) => account.id) } },
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

  console.log(`OK  ${user.role.padEnd(10)} ${user.email} (usuário principal configurado com sucesso)`);

  // 2. Deleta todos os demais usuários.
  const otherUsers = await prisma.user.findMany({
    where: { email: { not: DEFAULT_ADMIN_EMAIL } },
    select: { id: true, email: true },
  });

  if (otherUsers.length > 0) {
    const otherUserIds = otherUsers.map((candidate) => candidate.id);

    // Remove sessões e contas associadas.
    await prisma.session.deleteMany({
      where: { userId: { in: otherUserIds } },
    });
    await prisma.account.deleteMany({
      where: { userId: { in: otherUserIds } },
    });

    const deleted = await prisma.user.deleteMany({
      where: { id: { in: otherUserIds } },
    });

    console.log(`Removidos ${deleted.count} outros usuários: ${otherUsers.map((candidate) => candidate.email).join(', ')}`);
  } else {
    console.log('Nenhum outro usuário encontrado para deleção.');
  }

  console.log('\n========================================');
  console.log(`Usuário único ativo: ${DEFAULT_ADMIN_EMAIL}`);
  console.log(`Role: ${DEFAULT_ADMIN_ROLE}`);
  console.log('Senha: configurada por INITIAL_ADMIN_PASSWORD (valor não exibido).');
  console.log('========================================\n');
}

main()
  .catch((error) => {
    console.error('Erro ao configurar usuário único:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
