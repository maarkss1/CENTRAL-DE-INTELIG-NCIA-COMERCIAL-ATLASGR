import 'dotenv/config';
import crypto from 'node:crypto';
import { hashPassword } from 'better-auth/crypto';
import { prisma } from './src/lib/prisma.js';
import { requestContext } from './src/lib/async-context.js';

function generateRandomPassword(): string {
  return crypto.randomBytes(18).toString('base64url');
}

const EMAILS = [
  'marcelo.nascimento@atlasgr.com.br',
  'joao.reis@atlasgr.com.br',
  'kaue.oliveira@totaltrac.com.br',
  'jhonatan.garcia@totaltrac.com.br',
];

async function main() {
  await requestContext.run({ bypassRls: true }, async () => {
    for (const email of EMAILS) {
      const user = await prisma.user.findUnique({ where: { email } });
      if (!user) {
        console.log(`Usuário ${email} não encontrado — pulando.`);
        continue;
      }
      const password = generateRandomPassword();
      const hashed = await hashPassword(password);
      const account = await prisma.account.findFirst({
        where: { userId: user.id, providerId: 'credential' },
      });
      if (account) {
        await prisma.account.update({ where: { id: account.id }, data: { password: hashed } });
      } else {
        await prisma.account.create({
          data: {
            id: crypto.randomUUID(),
            accountId: email,
            providerId: 'credential',
            userId: user.id,
            password: hashed,
          },
        });
      }
      console.log(`${email} -> ${password}`);
    }
  });
}

main()
  .catch((err) => {
    console.error('Falha:', err);
    process.exitCode = 1;
  })
  .finally(() => {
    process.exit(process.exitCode ?? 0);
  });
