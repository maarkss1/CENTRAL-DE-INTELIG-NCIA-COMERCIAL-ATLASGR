import { prisma } from '../src/lib/prisma.ts';
import bcrypt from 'bcrypt';

async function resetPassword() {
  const users = await prisma.user.findMany();
  
  if (users.length === 0) {
    console.log("No users found.");
    return;
  }

  const salt = await bcrypt.genSalt(10);
  const passwordHash = await bcrypt.hash('00000000', salt);

  for (const user of users) {
    // 1. Update the 'Account' table for better-auth
    await prisma.account.updateMany({
      where: { userId: user.id },
      data: { password: passwordHash }
    });

    // 2. Update the 'User' table to force password change
    await prisma.user.update({
      where: { id: user.id },
      data: { 
        mustChangePassword: true,
        passwordHash: passwordHash
      }
    });

    console.log(`Password reset to 00000000 and mustChangePassword set for user: ${user.email}`);
  }
}

resetPassword()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
