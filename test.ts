import { LeadUseCases } from './src/features/crm/application/LeadUseCases.ts';
import { PrismaLeadRepository } from './src/features/crm/infra/PrismaLeadRepository.ts';
import { prisma } from './src/lib/prisma.ts';

async function test() {
    try {
        const repo = new PrismaLeadRepository();
        const useCases = new LeadUseCases(repo);
        
        const lead = await useCases.findLeadById('44e7119a-1249-49cc-99d9-78db0bb2ff6f', 'cmsgw7cip0008p0fb733l4dr8');
        console.log("LEAD BY ID:", lead);
    } catch (e) {
        console.error("ERROR:", e);
    } finally {
        await prisma.$disconnect();
    }
}
test();
