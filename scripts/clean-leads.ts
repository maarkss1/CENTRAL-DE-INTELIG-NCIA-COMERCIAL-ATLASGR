import { prisma } from '../src/lib/prisma.js';

async function cleanAllLeads() {
    console.log('🧹 Iniciando limpeza completa de leads no banco de dados...');

    // Contagem inicial
    const countBefore = await prisma.lead.count();
    console.log(`📊 Leads cadastrados atualmente: ${countBefore}`);

    // Exclui dependências
    await prisma.timelineEvent.deleteMany({});
    await prisma.note.deleteMany({});
    await prisma.activity.deleteMany({});

    // Exclui todos os leads
    const result = await prisma.lead.deleteMany({});
    console.log(`✅ ${result.count} leads foram permanentemente excluídos do banco de dados.`);

    const contactsCleaned = await prisma.contact.deleteMany({});
    console.log(`✅ ${contactsCleaned.count} contatos desvinculados foram limpos.`);

    const countAfter = await prisma.lead.count();
    console.log(`🎉 Limpeza concluída! Leads no banco agora: ${countAfter}`);
    process.exit(0);
}

cleanAllLeads().catch((err) => {
    console.error('❌ Erro durante a limpeza de leads:', err);
    process.exit(1);
});
