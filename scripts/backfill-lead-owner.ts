import { prisma } from '../src/lib/prisma.js';

async function run() {
    const isDryRun = !process.argv.includes('--apply');
    console.log(`\n=== BACKFILL: Lead Owner (${isDryRun ? 'DRY-RUN' : 'APPLY'}) ===\n`);

    const organizations = await prisma.organization.findMany();

    let totalMigrated = 0;
    let totalAmbiguous = 0;
    let totalNotFound = 0;

    for (const org of organizations) {
        // Encontra leads cujo dono não seja um ID de usuário conhecido daquela org
        const leads = await prisma.lead.findMany({
            where: {
                organizationId: org.id,
                owner: { not: null }
            }
        });

        const orgUsers = await prisma.user.findMany({
            where: { organizationId: org.id }
        });
        const validUserIds = new Set(orgUsers.map(u => u.id));

        const candidates = leads.filter(l => l.owner && !validUserIds.has(l.owner));

        if (candidates.length === 0) continue;

        console.log(`\n[Org: ${org.name}] Encontrados ${candidates.length} leads para avaliação.`);

        for (const lead of candidates) {
            const matches = orgUsers.filter(u => u.name === lead.owner);

            if (matches.length === 1) {
                const matchedUser = matches[0];
                if (!isDryRun) {
                    await prisma.lead.update({
                        where: { id: lead.id },
                        data: { owner: matchedUser.id }
                    });
                    
                    await prisma.auditLog.create({
                        data: {
                            action: 'UPDATE',
                            entity: 'Lead',
                            entityId: lead.id,
                            organizationId: org.id,
                            actorId: 'system-backfill',
                            details: {
                                reason: 'Backfill lead owner from name to id',
                                oldOwner: lead.owner,
                                newOwnerId: matchedUser.id
                            }
                        }
                    });
                } else {
                    console.log(`  [DRY-RUN] Migraria lead ${lead.id} de '${lead.owner}' para '${matchedUser.id}'`);
                }
                totalMigrated++;
            } else if (matches.length === 0) {
                console.log(`  [NOT FOUND] Lead ${lead.id} tem owner '${lead.owner}', sem match na org.`);
                totalNotFound++;
            } else {
                console.log(`  [AMBIGUOUS] Lead ${lead.id} tem owner '${lead.owner}', com ${matches.length} matches na org.`);
                totalAmbiguous++;
            }
        }
    }

    console.log(`\n=== RESULTADO ===`);
    console.log(`Migrados: ${totalMigrated}`);
    console.log(`Não encontrados: ${totalNotFound}`);
    console.log(`Ambíguos: ${totalAmbiguous}`);
    
    if (isDryRun) {
        console.log(`\nRode com --apply para efetivar as mudanças.`);
    }
}

run().catch(console.error).finally(() => prisma.$disconnect());
