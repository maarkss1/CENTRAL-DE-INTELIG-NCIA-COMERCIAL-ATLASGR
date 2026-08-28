/**
 * Catálogo central dos `promptId` usados por `logAiUsage()` (ver ../usage-log.ts) em todo o
 * produto. Antes deste arquivo, cada serviço de IA (roleplay, playbook, mesa de tratamento,
 * cadência, etc.) escrevia seu `promptId` como string livre solta no meio do código —
 * funcionando para persistência (AILog.promptId é só texto), mas sem nenhum lugar único para
 * responder "quais prompts existem hoje, e qual serviço é dono de cada um" (critério de aceite:
 * "prompts/versionamento ficam rastreáveis").
 *
 * Escopo desta correção: só o catálogo + o tipo, sem migrar os ~16 pontos de chamada (fora da
 * camada de gateway/IA, em serviços de domínio de vários features/*) para importá-lo — trocar
 * cada literal por `PROMPT_IDS.x` é um refactor de baixo risco mas alto raio de arquivos tocados,
 * fora do escopo de decompor o gateway em si; ver nota de débito derivado no PR. `PromptId` já
 * serve como o contrato: `AiUsageLogInput.promptId` (../gateway/types.ts) aceita um `PromptId`
 * conhecido OU qualquer string (compat com os pontos de chamada existentes) — TypeScript não
 * quebra nenhum call site, mas autocompletar/grep por aqui já mostra os valores catalogados.
 *
 * `version` é informativo (não gate nada em runtime): sobe manualmente quando o texto do prompt
 * correspondente muda de forma significativa, para permitir correlacionar uma mudança de
 * qualidade de resposta com a versão do prompt ativa no momento via AILog.promptId + este
 * catálogo.
 */

export interface PromptRegistryEntry {
    /** Serviço dono do prompt — onde o texto do prompt de fato vive hoje. */
    owner: string;
    version: number;
    description: string;
}

export const PROMPT_REGISTRY = {
    'seller-coaching-report': {
        owner: 'src/features/gamification/services/seller-coaching.service.ts',
        version: 1,
        description: 'Relatório de coaching de vendedor gerado a partir de atividades recentes.',
    },
    'proposal-generation': {
        owner: 'src/features/document-editor/services/proposal-ai.service.ts',
        version: 1,
        description: 'Geração de proposta comercial a partir dos dados do negócio.',
    },
    'decision-committee-mapping': {
        owner: 'src/features/contacts/services/decision-committee.service.ts',
        version: 1,
        description: 'Mapeamento do comitê de decisão de uma conta a partir dos contatos conhecidos.',
    },
    'bitrix-lead-hygiene': {
        owner: 'src/features/integrations/bitrix/services/bitrix-data-hygiene.service.ts',
        version: 1,
        description: 'Higienização/normalização de dados de lead sincronizado do Bitrix24.',
    },
    'next-best-action': {
        owner: 'src/features/activities/services/next-best-action.service.ts',
        version: 1,
        description: 'Sugestão de próxima melhor ação comercial para um lead/negócio.',
    },
    'roleplay-turn': {
        owner: 'src/features/roleplay/services/roleplay-ai.service.ts',
        version: 1,
        description: 'Turno de simulação de roleplay de vendas (fala do "cliente" simulado).',
    },
    'roleplay-eval': {
        owner: 'src/features/roleplay/services/roleplay-ai.service.ts',
        version: 1,
        description: 'Avaliação de desempenho ao final de uma sessão de roleplay de vendas.',
    },
    'cadence-step-generation': {
        owner: 'src/features/cadence/infra/services/cadence-ai.service.ts',
        version: 1,
        description: 'Geração de conteúdo de uma etapa de cadência de prospecção.',
    },
    'meeting-synthesis': {
        owner: 'src/features/chatbook/services/meeting-synthesis.service.ts',
        version: 1,
        description: 'Síntese/resumo de reunião transcrita.',
    },
    'knowledge-copilot-answer': {
        owner: 'src/features/knowledge/services/knowledge-copilot.service.ts',
        version: 1,
        description: 'Resposta do copiloto de conhecimento (RAG sobre a base de conhecimento).',
    },
    'knowledge-rerank': {
        owner: 'src/features/knowledge/services/reranker.service.ts',
        version: 1,
        description: 'Reranking via LLM dos candidatos top-N já fundidos por RRF na busca da base de conhecimento (DEC-11).',
    },
    'playbook-generation': {
        owner: 'src/features/playbook/services/playbook-ai.service.ts',
        version: 1,
        description: 'Geração de playbook de vendas.',
    },
    'mesa-triage-analysis': {
        owner: 'src/features/mesa-tratamento/services/mesa-triage.service.ts',
        version: 1,
        description: 'Análise de triagem da mesa de tratamento de leads.',
    },
    'lgpd-sanitizer': {
        owner: 'src/features/lgpd/services/lgpd-sanitizer.service.ts',
        version: 1,
        description: 'Sanitização de dados pessoais para conformidade com a LGPD.',
    },
    'churn-prediction-analysis': {
        owner: 'src/features/analytics/services/churn-prediction.service.ts',
        version: 1,
        description: 'Análise preditiva de risco de churn de uma conta.',
    },
    'smart-lead-routing': {
        owner: 'src/features/automations/services/smart-lead-router.service.ts',
        version: 1,
        description: 'Roteamento inteligente de lead para o vendedor/fila mais adequado.',
    },
} as const satisfies Record<string, PromptRegistryEntry>;

export type PromptId = keyof typeof PROMPT_REGISTRY;

/** True se o promptId está catalogado. Usado só para observabilidade (ex.: alertar sobre um
 * promptId novo não documentado) — nunca bloqueia a chamada de IA em si. */
export function isKnownPromptId(promptId: string | undefined): promptId is PromptId {
    return typeof promptId === 'string' && Object.hasOwn(PROMPT_REGISTRY, promptId);
}
