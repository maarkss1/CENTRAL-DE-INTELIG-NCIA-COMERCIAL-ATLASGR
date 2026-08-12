import { prisma } from '../src/lib/prisma.js';
import { callLead } from '../src/features/integrations/birth-voice/birthVoice.service.js';
import { requestContext } from '../src/lib/async-context.js';
import { logger } from '../src/lib/logger.js';

async function main() {
    try {
        // Obter uma organização
        const org = await prisma.organization.findFirst();
        if (!org) {
            console.error('Nenhuma organização encontrada.');
            return;
        }

        // Tentar encontrar o Rodrigo
        let lead = await prisma.lead.findFirst({
            where: {
                contact: {
                    equals: {
                        phone: '+5516981319748'
                    }
                },
                organizationId: org.id
            }
        });

        if (!lead) {
            console.log('Criando lead Rodrigo...');
            lead = await prisma.lead.create({
                data: {
                    title: 'Rodrigo - Prospect Atlas GR',
                    status: 'Lead_Recebido',
                    organizationId: org.id,
                    contact: {
                        name: 'Rodrigo',
                        phone: '+5516981319748',
                        email: 'rodrigo.prospect@exemplo.com'
                    },
                    company: {
                        tradeName: 'Logística LTDA'
                    },
                    temperature: 'HOT',
                    fitScore: 85
                }
            });
        }

        console.log(`Ligando para o Lead ${lead.id}...`);

        // Trigger da chamada
        await requestContext.run({ tenantId: org.id }, async () => {
            const result = await callLead(org.id, lead.id);
            console.log('Ligação disparada com sucesso:', result);
        });

    } catch (error) {
        console.error('Erro ao ligar:', error);
    } finally {
        await prisma.$disconnect();
    }
}

main();
