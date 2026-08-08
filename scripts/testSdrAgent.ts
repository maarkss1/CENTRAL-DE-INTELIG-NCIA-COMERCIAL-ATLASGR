import 'dotenv/config';
import { prisma } from '../src/lib/prisma.js';
import { leadsQueue } from '../src/lib/queue/index.js';
import { enrichmentQueue } from '../src/lib/queue/enrichment.queue.js';
import { agentQueue } from '../src/lib/queue/agent.worker.js';
import { requestContext } from '../src/lib/async-context.js';

async function runEndToEndTest() {
    console.log("🚀 Iniciando Teste de Fogo (End-to-End) do Agente SDR...");

    // 1. Setup do Tenant de Teste
    let tenant = await prisma.organization.findFirst({ where: { name: 'AtlasGR E2E Test' }});
    if (!tenant) {
        tenant = await prisma.organization.create({
            data: { name: 'AtlasGR E2E Test' }
        });
    }

    const tenantId = tenant.id;

    // 2. Executar no contexto RLS
    await requestContext.run({ tenantId }, async () => {
        // Criar uma empresa fictícia
        const company = await prisma.company.create({
            data: {
                legalName: 'TransTest Logística S/A',
                tradeName: 'TransTest Logística',
                domain: 'transtest-logistica-ficticia.com.br',
                organizationId: tenantId,
                status: 'Ativo',
                enrichmentStatus: 'Pendente'
            }
        });
        console.log(`✅ [1/4] Empresa Fictícia criada: ${company.tradeName} (ID: ${company.id})`);

        // Criar um Lead para esta empresa
        const lead = await prisma.lead.create({
            data: {
                title: 'Oportunidade TransTest',
                organizationId: tenantId,
                companyId: company.id,
                status: 'Lead_Recebido',
                source: 'Outbound',
            }
        });
        console.log(`✅ [2/4] Lead criado (ID: ${lead.id})`);

        // 3. Simular Automação de Enriquecimento
        console.log(`⏳ [3/4] Enviando para fila de Enriquecimento...`);
        const enrichJob = await enrichmentQueue.add('enrich', { companyId: company.id });
        console.log(`   Job adicionado na fila (ID: ${enrichJob.id}). Aguardando processamento...`);

        // Aguarda 5 segundos (tempo simulado para o worker rodar)
        await new Promise(resolve => setTimeout(resolve, 5000));

        // 4. Simular Agente SDR de Qualificação
        console.log(`⏳ [4/4] Enviando Lead para Agente SDR (Qualificação por IA)...`);
        const aiJob = await leadsQueue.add('qualify', { leadId: lead.id, companyInfo: 'Empresa de testes logísticos.' });
        console.log(`   Job adicionado na fila (ID: ${aiJob.id}). Aguardando processamento da IA...`);

        // Aguarda 10 segundos
        await new Promise(resolve => setTimeout(resolve, 10000));

        // 5. Verificar Resultado
        const finalLead = await prisma.lead.findUnique({
            where: { id: lead.id },
            include: { company: true }
        });


        console.log('--- 🎯 RESULTADO FINAL ---');
        console.log(`Score: ${finalLead?.score} | Temp: ${finalLead?.temperature} | Status: ${finalLead?.status} | Enriquecimento: ${finalLead?.company?.enrichmentStatus}`);

    });

    console.log("🏁 Teste concluído com sucesso!");
    process.exit(0);
}

runEndToEndTest().catch(console.error);
