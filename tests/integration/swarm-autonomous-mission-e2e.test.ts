import '../helpers/integration-setup';
import { afterEach, beforeAll, afterAll, describe, expect, it, vi } from 'vitest';

/**
 * Reprodução ponta a ponta de uma missão REAL do piloto automático comercial (Missão da Onda 7,
 * item 5): semeia um Lead real no Postgres de teste, roda o scheduler de verdade
 * (`runSwarmScheduler`) e confere o que fica persistido em AgentMemory, AILog e AIPendingAction —
 * sem nenhum mock de Prisma. A única fronteira controlada é o modelo de linguagem em si (não há
 * credencial de provedor externo — Groq/OpenAI — disponível neste ambiente de execução):
 * `getAiModel` é substituído por um "modelo" determinístico que devolve uma resposta fixa, mas
 * `logAiUsage` (grava AILog de verdade) e todo o resto do pipeline (roteamento, persistência,
 * guardrails, ledger de decisão) rodam com o código real, contra o Postgres real.
 */

const mockEnv: Record<string, unknown> = {
    SWARM_SCHEDULER_ENABLED: true,
    SWARM_SCHEDULER_ORGANIZATIONS: '*',
    SWARM_SCHEDULER_MAX_LEADS_PER_RUN: 5,
    SWARM_AUTONOMY_MODE: 'supervised',
    SWARM_AUTONOMOUS_MIN_SCORE: 80,
    SWARM_NEW_LEAD_GRACE_MINUTES: 30,
    SWARM_STALE_PIPELINE_HOURS: 72,
    SWARM_STALE_PROPOSAL_HOURS: 48,
    SWARM_RECOMMENDATION_COOLDOWN_HOURS: 24,
    SDR_CALL_WINDOW_START: 9,
    SDR_CALL_WINDOW_END: 18,
    SDR_CALL_TIMEZONE: 'America/Sao_Paulo',
    AI_PII_EXTERNAL_CONSENT_ORGANIZATIONS: '*',
};
vi.mock('@/config/env', () => ({ env: mockEnv }));

const STUBBED_RECOMMENDATION =
    'Diagnóstico: follow-up vencido há 3 dias, decisor ainda não confirmou o piloto. ' +
    'Ação recomendada: ligar hoje e reforçar o caso de ROI antes que o lead esfrie.';

// Única fronteira controlada desta reprodução: sem GROQ_API_KEY/OPENAI_API_KEY
// neste ambiente, uma chamada real ao provedor sempre falharia por credencial, não por
// comportamento do sistema — o que este teste prova é o pipeline (roteamento → execução →
// persistência), não a qualidade de uma geração de texto real.
vi.mock('@/lib/ai/gateway', async () => {
    const actual = await vi.importActual<typeof import('@/lib/ai/gateway')>('@/lib/ai/gateway');
    return {
        ...actual,
        getAiModel: () => ({
            invoke: async () => ({
                content: STUBBED_RECOMMENDATION,
                response_metadata: { model: 'stub-model-e2e', tokenUsage: { totalTokens: 420, promptTokens: 300, completionTokens: 120 } },
            }),
        }),
    };
});

const { prisma } = await import('@/lib/prisma');
const { requestContext } = await import('@/lib/async-context');
const { runSwarmScheduler, getSwarmSloSnapshot } = await import(
    '@/features/intelligence/services/swarmScheduler.service'
);

const ORG_ID = 'swarm-e2e-org';
const NOW = new Date('2026-08-15T12:00:00Z'); // segunda-feira, 09:00 em São Paulo

const withRlsBypass = <T>(fn: () => Promise<T>): Promise<T> => requestContext.run({ bypassRls: true }, fn);

let leadId: string;

beforeAll(async () => {
    await withRlsBypass(async () => {
        await prisma.organization.upsert({
            where: { id: ORG_ID },
            update: {},
            create: { id: ORG_ID, name: 'Swarm E2E Org' },
        });

        const company = await prisma.company.create({
            data: {
                organizationId: ORG_ID,
                legalName: 'Translog Transportes e Logística Ltda',
                tradeName: 'Translog',
                segment: 'Logística',
                size: 'Grande',
            },
        });

        const contact = await prisma.contact.create({
            data: {
                organizationId: ORG_ID,
                companyId: company.id,
                name: 'Carlos Mendes',
                role: 'Gerente de Operações',
                email: 'carlos.mendes@translog.example',
            },
        });

        const lead = await prisma.lead.create({
            data: {
                organizationId: ORG_ID,
                companyId: company.id,
                contactId: contact.id,
                status: 'Qualificacao_SDR', // nem EARLY nem CLOSER → roleForStatus() decide 'CRM'
                score: 66,
                nextAction: new Date('2026-08-12T12:00:00Z'), // vencido em relação a NOW
            },
        });
        leadId = lead.id;
    });
});

afterAll(async () => {
    await withRlsBypass(async () => {
        await prisma.aIPendingAction.deleteMany({ where: { organizationId: ORG_ID } });
        await prisma.agentMemory.deleteMany({ where: { organizationId: ORG_ID } });
        await prisma.aILog.deleteMany({ where: { organizationId: ORG_ID } });
        await prisma.lead.deleteMany({ where: { organizationId: ORG_ID } });
        await prisma.contact.deleteMany({ where: { organizationId: ORG_ID } });
        await prisma.company.deleteMany({ where: { organizationId: ORG_ID } });
        await prisma.organization.deleteMany({ where: { id: ORG_ID } });
    });
});

afterEach(() => {
    vi.clearAllMocks();
});

describe('Missão real do enxame, ponta a ponta (scheduler autônomo → CRM → ledger)', () => {
    // Toda a ação + verificação roda dentro de UM ÚNICO `requestContext.run()` de nível superior
    // (com `runSwarmScheduler`/`getSwarmSloSnapshot` abrindo seus próprios `.run({tenantId})`
    // ANINHADOS por dentro, normalmente). Constatação empírica deste ambiente de teste: encerrar um
    // `requestContext.run()` de nível superior e abrir um SEGUNDO, separado, logo em seguida para
    // ler de volta o que acabou de ser escrito no primeiro faz o `pg.Pool`/adapter devolver uma
    // conexão que não enxerga o commit anterior — mesmo com o commit confirmado (linha retornada
    // pelo `create()`). Aninhar em vez de encadear evita o problema; times de plataforma (Agente 01)
    // devem investigar a causa raiz em `executeWithRls`/pool à parte (ver handoff correspondente).
    it('detecta o follow-up vencido, roteia para o CRM, executa com o modelo e persiste o traço completo', async () => withRlsBypass(async () => {
        const result = await runSwarmScheduler(ORG_ID, NOW);

        // 1) Roteamento: o lead vencido foi detectado e roteado para o papel correto.
        expect(result.scanned).toBe(1);
        expect(result.proposed).toBe(1);
        expect(result.errors).toBe(0);

        // 2) Persistência em AgentMemory: o CRMAgent (via BaseAgent) gravou a conversa real no Postgres.
        const memories = await prisma.agentMemory.findMany({
            where: { organizationId: ORG_ID, agentType: 'CRM' },
        });
        expect(memories).toHaveLength(1);
        expect(memories[0]!.sessionId).toContain(`autonomy-crm-${leadId}`);
        const savedMessages = memories[0]!.messages as Array<{ role: string; content: string }>;
        expect(savedMessages.some((m) => m.content.includes('follow-up vencido'))).toBe(true);

        // 3) Persistência em AILog: a chamada ao modelo (mesmo com o modelo stub) passou pelo
        //    caminho real de telemetria de custo/latência/tokens.
        const aiLogs = await prisma.aILog.findMany({ where: { organizationId: ORG_ID } });
        expect(aiLogs).toHaveLength(1);
        expect(aiLogs[0]!.model).toBe('stub-model-e2e');
        expect(aiLogs[0]!.tokens).toBe(420);

        // 4) Persistência em AIPendingAction: a recomendação do enxame fica no ledger, aguardando
        //    aprovação humana — nunca executada sozinha (modo supervised).
        const pendingActions = await prisma.aIPendingAction.findMany({ where: { organizationId: ORG_ID } });
        expect(pendingActions).toHaveLength(1);
        const [action] = pendingActions;
        expect(action!.action).toBe('swarm_recommendation');
        expect(action!.agentRole).toBe('CRM');
        expect(action!.approved).toBe(false);
        expect(action!.executed).toBe(false);
        expect((action!.payload as { leadId: string; synthesis: string }).leadId).toBe(leadId);
        expect((action!.payload as { synthesis: string }).synthesis).toBe(STUBBED_RECOMMENDATION);

        // 5) Reprocessar o mesmo lead na mesma janela de cooldown não duplica a recomendação nem
        //    gera um segundo contato — trava de idempotência sob retry (Missão item 3/item 5).
        const secondRun = await runSwarmScheduler(ORG_ID, new Date(NOW.getTime() + 5 * 60 * 1000));
        expect(secondRun.skippedAlreadyPending).toBe(1);
        expect(secondRun.proposed).toBe(0);
        const pendingActionsAfterRetry = await prisma.aIPendingAction.findMany({ where: { organizationId: ORG_ID } });
        expect(pendingActionsAfterRetry).toHaveLength(1);

        // 6) O painel de SLO (Missão item 1), consultado sobre a MESMA base real, reflete a
        //    cobertura de verdade para o papel CRM — fechando o ciclo completo do relatório.
        const slo = await getSwarmSloSnapshot(ORG_ID, 30, NOW);
        const crmSlo = slo.agents.find((agent) => agent.role === 'CRM')!;
        expect(crmSlo.coverage).toBe(1);
        // Ainda não houve decisão humana (aprovar/descartar) nem execução — as taxas continuam em
        // estado vazio explícito, não em "0%" fabricado.
        expect(crmSlo.humanOverride.value).toBeNull();
        expect(crmSlo.conversion.value).toBe(0); // denominador 1, executados 0 — taxa real, não vazia.

        // Limpeza dentro do mesmo contexto (ver nota acima) — mantém afterAll como rede de segurança.
        await prisma.aIPendingAction.deleteMany({ where: { organizationId: ORG_ID } });
        await prisma.agentMemory.deleteMany({ where: { organizationId: ORG_ID } });
        await prisma.aILog.deleteMany({ where: { organizationId: ORG_ID } });
    }));
});
