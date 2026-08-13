import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import { prisma } from '../../../lib/prisma.js';
import { logger } from '../../../lib/logger.js';
import { getTenantId } from '../../../lib/async-context.js';

const copywriterSchema = z.object({
    leadId: z.string().describe('O ID do Lead (obrigatório para salvar a nota internamente)'),
    targetRole: z.string().describe('Cargo ou perfil do decisor (ex: CFO, Gerente de Logística)'),
    icpPainPoint: z.string().describe('A principal dor ou gargalo logístico identificado'),
    tone: z.enum(['Persuasivo', 'Consultivo', 'Direto', 'Provocativo']).describe('O tom desejado para a copy'),
});

export const copywriterTool = tool(
    async (args) => {
        const organizationId = getTenantId();
        if (!organizationId) return 'Erro: Contexto de organização ausente.';

        try {
            logger.info({ leadId: args.leadId }, 'Gerando template de cold email via IA');

            // Uma lógica simplificada para estruturar um Cold Email. 
            // Em uma evolução, poderia usar a própria LLM para escrever em sub-agentes, 
            // mas o SDR já tem contexto, ele só precisa chamar e formatar.
            const subject = `Ideia para otimizar ${args.icpPainPoint}`;
            const body = `Olá, tudo bem?\n\nSabemos que, como ${args.targetRole}, um dos maiores desafios atuais é lidar com ${args.icpPainPoint}. Na AtlasGR, temos ajudado empresas similares a mitigar exatamente isso com tecnologia de ponta.\n\nFaz sentido agendarmos 10 minutos na próxima semana para trocarmos uma ideia sobre como isso impacta sua operação?`;
            
            const finalCopy = `Assunto: ${subject}\n\n${body}`;

            // Salva como uma nota interna para o SDR usar depois. O model `Note` não tem `type`
            // nem `organizationId` (escopo de organização vem do `leadId` -> `lead.organizationId`)
            // e exige `author` — ver padrão em note.service.ts/abTesting.service.ts.
            await prisma.note.create({
                data: {
                    content: `[Gerado por IA] Sugestão de Cold Email:\n\n${finalCopy}`,
                    author: 'Agente de IA (Copywriter)',
                    leadId: args.leadId,
                }
            });

            return `Draft de email gerado com sucesso e salvo no histórico do Lead! Conteúdo gerado:\n\n${finalCopy}`;

        } catch (error) {
            logger.error({ err: error, leadId: args.leadId }, 'Erro ao gerar copy do lead');
            return 'Erro ao tentar gerar o draft de email.';
        }
    },
    {
        name: 'generate_cold_email_copy',
        description: 'Gera uma cópia de email de prospecção fria focada na dor do cliente, salvando automaticamente no histórico do Lead.',
        schema: copywriterSchema,
    }
);
