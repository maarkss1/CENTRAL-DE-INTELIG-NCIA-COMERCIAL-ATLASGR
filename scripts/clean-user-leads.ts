import { prisma } from '../src/lib/prisma.js';

async function cleanMarceloLeads() {
    console.log('🧹 Procurando usuário marcelo.nascimento@atlasgr.com.br...');

    const user = await prisma.user.findFirst({
        where: { email: { equals: 'marcelo.nascimento@atlasgr.com.br', mode: 'insensitive' } }
    });

    if (user) {
        console.log(`👤 Usuário encontrado: ID=${user.id}, OrgID=${user.organizationId}`);
    } else {
        console.log('⚠️ Usuário marcelo.nascimento@atlasgr.com.br não foi encontrado na tabela User. Limpando todos os leads gerais...');
    }

    const orgId = user?.organizationId;
    const leadWhere = orgId ? { organizationId: orgId } : {};

    const countBefore = await prisma.lead.count({ where: leadWhere });
    console.log(`📊 Total de leads identificados para exclusão: ${countBefore}`);

    // Exclui dependências
    await prisma.timelineEvent.deleteMany({ where: orgId ? { lead: { organizationId: orgId } } : {} });
    await prisma.note.deleteMany({ where: orgId ? { lead: { organizationId: orgId } } : {} });
    await prisma.activity.deleteMany({ where: orgId ? { organizationId: orgId } : {} });

    // Exclui todos os leads
    const result = await prisma.lead.deleteMany({ where: leadWhere });
    console.log(`✅ ${result.count} leads foram permanentemente removidos.`);

    const contactsResult = await prisma.contact.deleteMany({ where: orgId ? { organizationId: orgId } : {} });
    console.log(`✅ ${contactsResult.count} contatos vinculados foram removidos.`);

    const countAfter = await prisma.lead.count();
    console.log(`🎉 Base zerada com sucesso! Total de leads restantes no banco: ${countAfter}`);
    process.exit(0);
}

cleanMarceloLeads().catch((err) => {
    console.error('❌ Erro durante a exclusão:', err);
    process.exit(1);
});
