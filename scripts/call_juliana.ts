import { prisma } from '../src/lib/prisma.js';
import { callLead } from '../src/features/integrations/birth-voice/birthVoice.service.js';
import { requestContext } from '../src/lib/async-context.js';
import { logger } from '../src/lib/logger.js';

async function main() {
    const JULIANA_PHONE = '+5516993924196';
    const JULIANA_NAME = 'Juliana';

    try {
        console.log(`Buscando organização para vinculação do lead...`);
        let org = await prisma.organization.findFirst();
        
        if (!org) {
            console.log('Nenhuma organização encontrada. Criando organização padrão Atlas GR...');
            org = await prisma.organization.create({
                data: {
                    name: 'Atlas GR Comercial',
                    slug: 'atlas-gr-comercial',
                }
            });
        }

        // Tentar encontrar a Juliana
        let lead = await prisma.lead.findFirst({
            where: {
                contact: {
                    equals: {
                        phone: JULIANA_PHONE
                    }
                },
                organizationId: org.id
            }
        });

        if (!lead) {
            console.log(`Criando registro de lead para ${JULIANA_NAME} (${JULIANA_PHONE})...`);
            lead = await prisma.lead.create({
                data: {
                    title: `Juliana - Qualificação SDR (Gessica)`,
                    status: 'Lead_Recebido',
                    organizationId: org.id,
                    contact: {
                        name: JULIANA_NAME,
                        phone: JULIANA_PHONE,
                        email: 'juliana.prospect@exemplo.com'
                    },
                    company: {
                        tradeName: 'Empresa Alvo - Juliana'
                    },
                    temperature: 'HOT',
                    fitScore: 90
                }
            });
            console.log(`Lead criado com ID: ${lead.id}`);
        } else {
            console.log(`Lead da Juliana encontrado com ID: ${lead.id}`);
        }

        console.log(`Disparando chamada de qualificação com a IA Gessica para o Lead ${lead.id}...`);

        // Trigger da chamada via BirthVoice Service
        await requestContext.run({ tenantId: org.id }, async () => {
            const result = await callLead(org.id, lead.id, 'sdr');
            console.log('Ligação disparada com sucesso:', result);
        });

    } catch (error: any) {
        console.error('Status da solicitação de chamada:', error.message || error);
    } finally {
        await prisma.$disconnect();
    }
}

main();
