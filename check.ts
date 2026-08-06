import { prisma } from './src/lib/prisma.ts';

async function check() {
  const accounts = await prisma.account.findMany({ where: { user: { email: 'marcelo.nascimento@atlasgr.com.br' } } });
  console.log('Accounts:', accounts);
}

check().catch(console.error).finally(() => prisma.$disconnect());
