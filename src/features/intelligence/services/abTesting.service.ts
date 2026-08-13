import { prisma } from '../../../lib/prisma.js';
import { logger } from '../../../lib/logger.js';

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
     * Calcula a taxa de conversão (Leads Ganhos) para as variantes de um prompt.
     * Na prática, uma query agregada ou script analítico rodaria sobre as anotações geradas acima.
     */
    async getConversionRates(promptName: string): Promise<{ variantA: number, variantB: number }> {
        // Implementação mock/stub para a feature 60
        // Como não criamos um modelo nativo `PromptABTest` no schema (para não mexer no DB),
        // o tracking fica nas Notas do Lead. Uma extração real faria match de `content` LIKE '[A/B Test Tracking]%'.
        return { variantA: 15.4, variantB: 12.1 };
    }
}

export const abTestingService = new ABTestingService();
