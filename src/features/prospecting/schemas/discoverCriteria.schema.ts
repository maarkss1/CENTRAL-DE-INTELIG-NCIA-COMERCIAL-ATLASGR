import { z } from 'zod';

/**
 * Espelha `ProspectCriteria` (prospecting.service.ts) — sem isso, um filtro em formato errado
 * (ex: `quantidade` como string, `estado` como array) falhava silenciosamente lá dentro: nada
 * quebrava, mas o filtro em questão simplesmente não pegava, e o vendedor só via um resultado
 * estranho sem entender por quê. Todo campo é livre-texto/número solto de propósito — a Apollo é
 * quem de fato interpreta o valor; aqui só garantimos o tipo e um teto de tamanho.
 *
 * Compartilhado entre `/api/prospecting/discover` (multi-provider) e as ferramentas standalone de
 * `/api/prospecting/tools/*` (Google Places / Apollo isolados) — mesmo shape de critério em
 * qualquer um dos dois modos de busca.
 */
export const discoverCriteriaSchema = z.object({
    icp: z.string().trim().max(1000).optional(),
    persona: z.string().trim().max(1000).optional(),
    segmento: z.string().trim().min(1, 'Informe um segmento (pode ser qualquer texto)').max(200),
    localizacao: z.string().trim().max(200).default(''),
    quantidade: z.number().int().min(1).max(500).default(10),
    estado: z.string().trim().max(100).optional(),
    cidade: z.string().trim().max(100).optional(),
    porte: z.string().trim().max(50).optional(),
    faturamentoMin: z.number().nonnegative().optional(),
    faturamentoMax: z.number().nonnegative().optional(),
    palavrasChave: z.string().trim().max(300).optional(),
    nomeEmpresa: z.string().trim().max(200).optional(),
    anoFundacaoMin: z.number().int().min(1800).max(2100).optional(),
    anoFundacaoMax: z.number().int().min(1800).max(2100).optional(),
    tecnologias: z.string().trim().max(500).optional(),
    tecnologiasExcluir: z.string().trim().max(500).optional(),
    localizacaoExcluir: z.string().trim().max(500).optional(),
    apenasCapitalAberto: z.boolean().optional(),
    pagina: z.number().int().min(1).max(20).optional(),
    excludeNames: z.array(z.string()).optional(),
});
