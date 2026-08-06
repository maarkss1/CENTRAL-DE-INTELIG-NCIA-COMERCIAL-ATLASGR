import { prisma } from '../src/lib/prisma.js';
import bcrypt from 'bcrypt';

async function main() {
  const password = '00000000';
  // Better Auth padroniza bcrypt com custo 10 ou usa lib nativa.
  const hashedPassword = await bcrypt.hash(password, 10);

  // Atualiza as senhas na tabela account onde a conta for do tipo credential
  const resultAccounts = await prisma.account.updateMany({
    where: {
      providerId: 'credential',
    },
    data: {
      password: hashedPassword,
    },
  });

  // Marca para trocar a senha no próximo login
  const resultUsers = await prisma.user.updateMany({
    data: {
      mustChangePassword: true,
    },
  });

  console.log(`Updated ${resultAccounts.count} accounts with new password.`);
  console.log(`Updated ${resultUsers.count} users with mustChangePassword = true.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
