import 'dotenv/config';
import { prisma } from '../src/lib/prisma.js';
import bcrypt from 'bcrypt';
import { v4 as uuidv4 } from 'uuid';

async function main() {
    try {
        console.log("Creating Organization...");
        const org = await prisma.organization.create({
            data: { name: 'Demo Organization ' + Date.now() }
        });
        
        console.log("Hashing password...");
        const hashedPassword = await bcrypt.hash('password123', 10);
        
        console.log("Creating User...");
        const userId = uuidv4();
        
        const user = await prisma.user.create({
            data: {
                id: userId,
                name: 'Demo User',
                email: 'demo@demo.com',
                passwordHash: hashedPassword,
                role: 'ADMINISTRADOR',
                organizationId: org.id,
                emailVerified: true
            }
        });
        
        console.log("Creating Account...");
        await prisma.account.create({
            data: {
                id: uuidv4(),
                userId: user.id,
                accountId: user.email,
                providerId: 'credential',
                password: hashedPassword,
            }
        });
        
        console.log("User successfully created: demo@demo.com / password123");
    } catch (e) {
        console.error(e);
    } finally {
        await prisma.$disconnect();
    }
}

main();
