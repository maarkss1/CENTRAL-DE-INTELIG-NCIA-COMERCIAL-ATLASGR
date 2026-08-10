/**
 * Taxonomia estruturada de motivos de perda (seção 23 do prompt de produto). `Lead.lossReason` é
 * uma coluna de texto livre (populada manualmente ou importada do Bitrix — ver comentário no
 * schema) — não uma FK para uma tabela de motivos. Em vez de criar uma nova tabela/enum de banco
 * (mudança de schema maior, fora do "mínimo necessário" da seção 34) para uma classificação que
 * pode evoluir, normalizamos o texto livre para um bucket fixo por casamento de palavra-chave,
 * determinístico e reproduzível — nunca por IA. O texto original é sempre preservado como
 * "observação da perda", nunca descartado.
 */

export const LOSS_REASON_TAXONOMY = [
    'Preço',
    'Concorrência',
    'Sem orçamento',
    'Timing',
    'Prioridade adiada',
    'Sem fit',
    'Sem resposta',
    'Projeto cancelado',
    'Decisão interna',
    'Produto',
    'Prazo',
    'Condição comercial',
    'Implantação',
    'Outro',
] as const;

export type LossReasonBucket = (typeof LOSS_REASON_TAXONOMY)[number] | 'Não informado';

const KEYWORD_RULES: Array<{ bucket: (typeof LOSS_REASON_TAXONOMY)[number]; keywords: string[] }> = [
    { bucket: 'Preço', keywords: ['preco', 'preço', 'caro', 'valor alto', 'custo'] },
    { bucket: 'Concorrência', keywords: ['concorrente', 'concorrencia', 'concorrência', 'outro fornecedor'] },
    { bucket: 'Sem orçamento', keywords: ['sem orcamento', 'sem orçamento', 'orcamento', 'orçamento', 'budget'] },
    { bucket: 'Timing', keywords: ['timing', 'nao e o momento', 'não é o momento', 'momento errado'] },
    { bucket: 'Prioridade adiada', keywords: ['adiado', 'adiada', 'postergado', 'prioridade'] },
    { bucket: 'Sem fit', keywords: ['sem fit', 'nao se encaixa', 'não se encaixa', 'fora do perfil'] },
    { bucket: 'Sem resposta', keywords: ['sem resposta', 'nao respondeu', 'não respondeu', 'sumiu', 'silencio'] },
    { bucket: 'Projeto cancelado', keywords: ['projeto cancelado', 'cancelou o projeto', 'projeto interrompido'] },
    { bucket: 'Decisão interna', keywords: ['decisao interna', 'decisão interna', 'politica interna', 'reestruturacao'] },
    { bucket: 'Produto', keywords: ['produto', 'funcionalidade', 'recurso'] },
    { bucket: 'Prazo', keywords: ['prazo', 'urgencia', 'urgência', 'tempo de implantacao'] },
    { bucket: 'Condição comercial', keywords: ['condicao comercial', 'condição comercial', 'contrato', 'termos'] },
    { bucket: 'Implantação', keywords: ['implantacao', 'implantação', 'onboarding', 'integracao'] },
];

function normalize(raw: string): string {
    return raw
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '');
}

/**
 * Classifica um motivo de perda em texto livre para um bucket da taxonomia fixa.
 * - `null`/vazio → 'Não informado' (ausência de dado, nunca vira "Outro" silenciosamente — regra
 *   27: "nunca transformar ausência de dado em zero silenciosamente").
 * - Texto preenchido sem casamento de palavra-chave → 'Outro' (dado real, só não classificável
 *   automaticamente).
 */
export function classifyLossReason(raw: string | null | undefined): LossReasonBucket {
    if (!raw || !raw.trim()) return 'Não informado';
    const normalized = normalize(raw);
    for (const rule of KEYWORD_RULES) {
        if (rule.keywords.some((keyword) => normalized.includes(normalize(keyword)))) {
            return rule.bucket;
        }
    }
    return 'Outro';
}
