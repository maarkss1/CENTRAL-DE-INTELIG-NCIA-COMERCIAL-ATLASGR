import { prisma } from '../src/lib/prisma.js';

async function main() {
  const result = await prisma.user.updateMany({
    data: {
      role: 'ADMIN',
    },
  });

  console.log(`Updated ${result.count} users to ADMIN role.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
