import { hashPassword } from 'better-auth/crypto';
import { prisma } from '../src/lib/prisma.js';
import { requestContext } from '../src/lib/async-context.js';

const ORG_NAME = 'AtlasGR';
const DEFAULT_TEMP_PASSWORD = '00000000';

const TEAM = [
  { name: 'Marcelo Nascimento', email: 'marcelo.nascimento@atlasgr.com.br', role: 'ADMIN' },
  { name: 'Joao Reis', email: 'joao.reis@atlasgr.com.br', role: 'GESTOR' },
  { name: 'Murilo Marques', email: 'murilo.marques@atlasgr.com.br', role: 'GESTOR' },
  { name: 'Comercial', email: 'comercial@atlasgr.com.br', role: 'VENDEDOR' },
  { name: 'Kaue Oliveira', email: 'kaue.oliveira@totaltrac.com.br', role: 'VENDEDOR' },
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

    console.log(`OK  ${member.role.padEnd(10)} ${member.email}`);
  }

  console.log('\nSenha temporaria para todos: ' + DEFAULT_TEMP_PASSWORD + ' (troca obrigatoria no primeiro login)');
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
