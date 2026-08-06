import { prisma } from '../src/lib/prisma.ts';
import { hashPassword } from 'better-auth/crypto';

async function resetPassword() {
  const users = await prisma.user.findMany();
  
  if (users.length === 0) {
    console.log("No users found.");
    return;
  }

  const newPasswordHash = await hashPassword('00000000');

  for (const user of users) {
    // 1. Update the 'Account' table for better-auth
    await prisma.account.updateMany({
      where: { userId: user.id },
      data: { password: newPasswordHash }
    });

    // 2. Update the 'User' table to force password change
    await prisma.user.update({
      where: { id: user.id },
      data: { 
        mustChangePassword: true,
        passwordHash: newPasswordHash
      }
    });

    console.log(`Password reset to 00000000 and mustChangePassword set for user: ${user.email}`);
  }
}

resetPassword()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
