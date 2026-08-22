import type { LeadStatus as PrismaLeadStatus } from '@prisma/client';
import { prisma } from '../../../lib/prisma.js';
import { logger } from '../../../lib/logger.js';

const WON: PrismaLeadStatus = 'Negocios_Ganhos';

export class ABTestingService {
    /**
     * Registra o uso de um prompt específico para um Lead.
     */
    async logPromptUsage(leadId: string, promptVariant: 'A' | 'B', promptName: string) {
        try {
            await prisma.note.create({
                data: {
                    leadId,
                    content: `[A/B Test Tracking] O prompt variante '${promptVariant}' do modelo '${promptName}' foi utilizado nesta interação.`,
                    author: 'Sistema de A/B Testing',
                }
            });
            logger.info({ leadId, promptVariant, promptName }, 'A/B Test prompt usage logged');
        } catch (err) {
            logger.error({ err }, 'Failed to log A/B test usage');
        }
    }

    /**
     * Calcula a taxa de conversão real (% de Leads Ganhos) para as variantes de um prompt,
     * a partir das Notas de tracking gravadas por `logPromptUsage` — não existe um modelo nativo
     * `PromptABTest` no schema (decisão para não mexer no DB), então a extração faz match de
     * `content` pelo texto gravado ali.
     */
    async getConversionRates(promptName: string): Promise<{ variantA: number, variantB: number }> {
        const [variantA, variantB] = await Promise.all([
            this.conversionRateForVariant('A', promptName),
            this.conversionRateForVariant('B', promptName),
        ]);
        return { variantA, variantB };
    }

    /** Retorna 0 quando a variante ainda não tem nenhuma interação rastreada — zero real, não invenção. */
    private async conversionRateForVariant(variant: 'A' | 'B', promptName: string): Promise<number> {
        const notes = await prisma.note.findMany({
            where: { content: { contains: `variante '${variant}' do modelo '${promptName}'` } },
            select: { leadId: true },
        });
        const leadIds = [...new Set(notes.map((n) => n.leadId))];
        if (leadIds.length === 0) return 0;

        const wonCount = await prisma.lead.count({ where: { id: { in: leadIds }, status: WON } });
        return (wonCount / leadIds.length) * 100;
    }
}

export const abTestingService = new ABTestingService();
