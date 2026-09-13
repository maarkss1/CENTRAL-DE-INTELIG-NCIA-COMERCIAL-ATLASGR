import '../helpers/integration-setup';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Cobertura de ponta a ponta do fix da auditoria de dívida técnica (AIAGENT-001/AIAGENT-002,
 * docs/audits/repository-debt-audit/agents/AIAGENT.md, seção "Quick wins"): `agent.execute`
 * deixou de ser um `FUTURE_TOOL` bloqueado por um comentário desatualizado
 * (`src/features/job-roles/config/tool-bindings.ts`) e ganhou um `ToolExecutor` genérico real
 * (`src/features/job-roles/services/toolExecutors.ts:agentExecute`) que lê
 * `AgentVersion.systemPrompt` (condição PROMPT_READY — 27 dos 379 agentes importados do catálogo
 * Birth Hub têm um prompt real) e invoca o gateway de IA com ele.
 *
 * Roda contra o Postgres real de teste (sem mock de Prisma, mesmo padrão de
 * tests/integration/agent-runtime.test.ts) — a única fronteira controlada é o modelo de linguagem
 * em si (sem credencial de provedor externo neste ambiente), mesmo padrão de
 * swarm-autonomous-mission-e2e.test.ts: `getAiModel` é substituído por um "modelo" determinístico,
 * mas autorização (capabilityAuthorization.service.ts), runtime (agentRuntime.service.ts) e
 * persistência (AgentExecution) rodam com o código real.
 */

const ORG_ID = 'test-org-id'; // já seedado por tests/helpers/integration-setup.ts

vi.mock('@/config/env', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/config/env')>();
  // Spread — nunca substitui o `env` real inteiro (isso apagaria DATABASE_URL/flags reais lidos
  // por outros módulos deste grafo, ex.: RLS/budget) — só adiciona a base legal LGPD para o tenant
  // de teste. Mutável de propósito: o teste de ausência de consentimento abaixo desliga essa
  // mesma chave temporariamente, no MESMO objeto (nunca um segundo mock).
  return { ...actual, env: { ...actual.env, AI_PII_EXTERNAL_CONSENT_ORGANIZATIONS: ORG_ID } };
});

const STUBBED_OUTPUT =
  'Diagnóstico executivo: pipeline concentrado em poucas contas — recomendo diversificar a prospecção no próximo trimestre.';

let lastInvokeMessages: Array<{ content: string }> | null = null;
let invokeCallCount = 0;

// Sem GROQ_API_KEY/OPENAI_API_KEY neste ambiente, uma chamada real ao provedor sempre falharia por
// credencial, não por comportamento do sistema — o que este arquivo prova é o pipeline completo
// (autorização → executor genérico → chamada de IA → persistência), não a qualidade de uma geração
// de texto real (mesmo racional de swarm-autonomous-mission-e2e.test.ts).
vi.mock('@/lib/ai/gateway', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/ai/gateway')>();
  return {
    ...actual,
    getAiModel: () => ({
      invoke: async (messages: Array<{ content: string }>) => {
        invokeCallCount++;
        lastInvokeMessages = messages;
        return {
          content: STUBBED_OUTPUT,
          response_metadata: {
            model: 'stub-model-agent-execute',
            tokenUsage: { totalTokens: 210, promptTokens: 150, completionTokens: 60 },
          },
        };
      },
    }),
  };
});

const { env } = await import('@/config/env');
const { prisma } = await import('@/lib/prisma');
const { setupDI } = await import('@/shared/di/setup');
const { runMultiCargoSeed } = await import('../../scripts/seed-multi-cargo');
const { runAgentCatalogImport } = await import('../../scripts/import-agent-catalog');
const { runCapabilityEngineSeed } = await import('../../scripts/seed-capability-engine');
const { runAgentExecution } = await import('@/features/job-roles/services/agentRuntime.service');
const { getJobRoleByCode, assignJobRole } = await import(
  '@/features/job-roles/services/jobRole.service'
);
const { CAPABILITY_CODES } = await import('@/config/capability-catalog');
const normalizedCatalog = (
  await import('@/features/job-roles/catalog/agents.normalized.json')
).default as {
  agents: Array<{
    code: string;
    primaryJobRole: string | null;
    hasPrompt: boolean;
    systemPrompt: string | null;
  }>;
};

function findCatalogAgent(code: string) {
  const agent = normalizedCatalog.agents.find((a) => a.code === code);
  if (!agent) throw new Error(`Agente "${code}" não encontrado no catálogo normalizado.`);
  return agent;
}

// Um dos 352 agentes SEM prompt real (hasPrompt: false) — resolvido dinamicamente (nunca hardcoded
// por posição/índice) para não depender de um code específico sobreviver a uma futura regeneração
// do catálogo; só precisa ter `primaryJobRole` (para ganhar RoleAgentGrant EXECUTE no import).
const noPromptAgent = normalizedCatalog.agents.find((a) => !a.hasPrompt && a.primaryJobRole);
if (!noPromptAgent) {
  throw new Error('Nenhum agente sem systemPrompt com primaryJobRole encontrado no catálogo.');
}

let userCounter = 0;
async function makeUserWithJobRole(jobRoleCode: string, userRole = 'GESTOR') {
  userCounter++;
  const user = await prisma.user.create({
    data: {
      name: `Agent Execute Test User ${userCounter}`,
      email: `agent.execute.test.${Date.now()}.${userCounter}@test.com`,
      organizationId: ORG_ID,
      role: userRole,
    },
  });
  const jobRole = await getJobRoleByCode(jobRoleCode);
  if (!jobRole) throw new Error(`JobRole "${jobRoleCode}" não encontrado após o seed.`);
  await assignJobRole({
    organizationId: ORG_ID,
    userId: user.id,
    jobRoleId: jobRole.id,
    assignedBy: 'admin-agent-execute-test',
  });
  return { user, jobRole };
}

describe('agent.execute — ToolExecutor genérico do AgentRuntime (fix AIAGENT-001/002)', () => {
  const sourceAgentCodes = normalizedCatalog.agents.map((a) => a.code);

  beforeAll(async () => {
    setupDI();
    await runMultiCargoSeed();
    await runAgentCatalogImport();
    await runCapabilityEngineSeed();
  });

  beforeEach(() => {
    invokeCallCount = 0;
    lastInvokeMessages = null;
    env.AI_PII_EXTERNAL_CONSENT_ORGANIZATIONS = ORG_ID;
  });

  afterAll(async () => {
    await prisma.agentExecution.deleteMany({ where: { organizationId: ORG_ID } });
    await prisma.userJobRole.deleteMany({ where: { organizationId: ORG_ID } });
    await prisma.user.deleteMany({
      where: { organizationId: ORG_ID, email: { contains: 'agent.execute.test' } },
    });
    await prisma.agentCapabilityGrant.deleteMany({
      where: { capabilityDefinition: { code: { in: CAPABILITY_CODES } } },
    });
    await prisma.roleCapabilityGrant.deleteMany({
      where: { capabilityDefinition: { code: { in: CAPABILITY_CODES } } },
    });
    await prisma.capabilityDefinition.deleteMany({ where: { code: { in: CAPABILITY_CODES } } });
    await prisma.roleAgentGrant.deleteMany({
      where: { agentDefinition: { code: { in: sourceAgentCodes } } },
    });
    await prisma.agentVersion.deleteMany({
      where: { agentDefinition: { code: { in: sourceAgentCodes } } },
    });
    await prisma.agentDefinition.deleteMany({ where: { code: { in: sourceAgentCodes } } });
  });

  describe('(a) agente PROMPT_READY — SUCCEEDED com saída real de IA e auditoria completa', () => {
    it.each([
      { code: 'ceo', jobRole: 'DIRETOR_COMERCIAL' },
      { code: 'account-manager', jobRole: 'CHURN_RETENCAO' },
      { code: 'closer-copilot', jobRole: 'CLOSER' },
    ])(
      '$code (systemPrompt real) executa via agent.execute e retorna SUCCEEDED com output do modelo',
      async ({ code, jobRole }) => {
        const catalogAgent = findCatalogAgent(code);
        expect(catalogAgent.hasPrompt).toBe(true);
        expect(catalogAgent.systemPrompt).toBeTruthy();

        const { user } = await makeUserWithJobRole(jobRole, 'GESTOR');
        const mission = `Missão de teste para ${code}: dê um diagnóstico rápido.`;

        const result = await runAgentExecution({
          actorId: user.id,
          organizationId: ORG_ID,
          actorRole: 'GESTOR',
          agentCode: code,
          requestedCapability: 'agent.execute',
          mission,
          resource: { exampleField: 'valor-nao-sensivel' },
        });

        expect(result.policyDecision.allowed).toBe(true);
        expect(result.policyDecision.reason).toBe('PERMITTED');
        expect(result.status).toBe('SUCCEEDED');
        expect(result.summary).toBe(STUBBED_OUTPUT);
        expect(result.evidence.some((e) => e.startsWith('AgentVersion.id='))).toBe(true);
        expect(result.metrics.totalTokens).toBe(210);
        expect(result.toolCalls).toHaveLength(1);
        expect(result.toolCalls[0]?.ok).toBe(true);
        expect(result.confidence).toBeGreaterThan(0);

        // O executor genérico realmente chamou o gateway de IA com o systemPrompt ARMAZENADO no
        // banco (AgentVersion.systemPrompt), não um texto inventado/hardcoded no executor.
        expect(invokeCallCount).toBe(1);
        expect(lastInvokeMessages?.[0]?.content).toBe(catalogAgent.systemPrompt);
        expect(lastInvokeMessages?.[1]?.content).toContain(mission);

        // Persistência real — linha de auditoria (AgentExecution) existe no banco, não só o
        // retorno da função.
        const row = await prisma.agentExecution.findUnique({ where: { id: result.executionId } });
        expect(row?.status).toBe('SUCCEEDED');
        expect(row?.agentCode).toBe(code);
        expect(row?.capabilityCode).toBe('agent.execute');
        expect(row?.summary).toBe(STUBBED_OUTPUT);
        expect(row?.agentVersionId).toBeTruthy();
      },
    );
  });

  describe('(b) agente SEM systemPrompt — falha fechada, honesta, nunca fabrica resposta', () => {
    it(`${noPromptAgent!.code} (sem AgentVersion/systemPrompt) é autorizado mas o executor recusa executar, sem nunca chamar o gateway de IA`, async () => {
      const { user } = await makeUserWithJobRole(noPromptAgent!.primaryJobRole!, 'GESTOR');

      const result = await runAgentExecution({
        actorId: user.id,
        organizationId: ORG_ID,
        actorRole: 'GESTOR',
        agentCode: noPromptAgent!.code,
        requestedCapability: 'agent.execute',
        mission: 'Isto nunca deveria gerar uma resposta de IA de verdade.',
        resource: {},
      });

      // A autorização (13 etapas do Capability Engine) PERMITE — o binding é VERIFIED/AVAILABLE e
      // todos os grants existem; é o EXECUTOR, no fim da cadeia, que recusa por falta de conteúdo
      // real configurado.
      expect(result.policyDecision.allowed).toBe(true);
      expect(result.status).toBe('FAILED');
      expect(invokeCallCount).toBe(0); // nunca chegou a chamar o provedor de IA

      const row = await prisma.agentExecution.findUnique({ where: { id: result.executionId } });
      expect(row?.errorMessage).toBeTruthy();
      expect(row?.errorMessage).toContain('não tem conteúdo executável configurado');
      // Nunca uma resposta fabricada — nem no retorno, nem persistida.
      expect(result.summary).not.toBe(STUBBED_OUTPUT);
      expect(row?.summary ?? '').not.toContain(STUBBED_OUTPUT);
    });
  });

  describe('(c) o pipeline de autorização continua gatekeeping agent.execute como qualquer outra capability', () => {
    it('DISCOVER (nível do agente): DENIED com DISCOVER_ONLY, nunca chama o executor/gateway de IA', async () => {
      const { user } = await makeUserWithJobRole('DIRETOR_COMERCIAL', 'GESTOR');
      const agent = await prisma.agentDefinition.findUniqueOrThrow({ where: { code: 'ceo' } });
      const jobRole = await getJobRoleByCode('DIRETOR_COMERCIAL');
      const grant = await prisma.roleAgentGrant.upsert({
        where: {
          jobRoleId_agentDefinitionId: { jobRoleId: jobRole!.id, agentDefinitionId: agent.id },
        },
        create: {
          jobRoleId: jobRole!.id,
          agentDefinitionId: agent.id,
          accessLevel: 'DISCOVER',
          isActive: true,
        },
        update: { accessLevel: 'DISCOVER', isActive: true },
      });
      try {
        const result = await runAgentExecution({
          actorId: user.id,
          organizationId: ORG_ID,
          actorRole: 'GESTOR',
          agentCode: 'ceo',
          requestedCapability: 'agent.execute',
          mission: 'Nunca deveria rodar.',
        });
        expect(result.status).toBe('DENIED');
        expect(result.policyDecision.reason).toBe('DISCOVER_ONLY');
        expect(result.toolCalls).toHaveLength(0);
        expect(invokeCallCount).toBe(0);
      } finally {
        // Restaura para EXECUTE (nunca deleta): 'ceo'+'DIRETOR_COMERCIAL' já tinha um
        // RoleAgentGrant EXECUTE real vindo do import do catálogo (primaryJobRole) antes deste
        // teste rodar — o `upsert` acima ATUALIZOU essa linha existente, então desfazer com um
        // `delete` deixaria o agente sem NENHUM grant para os testes seguintes deste arquivo
        // (inclusive os de (c) que reusam 'ceo'/'DIRETOR_COMERCIAL').
        await prisma.roleAgentGrant.update({
          where: { id: grant.id },
          data: { accessLevel: 'EXECUTE', isActive: true },
        });
      }
    });

    it('capability agent.execute não concedida ao agente (AgentCapabilityGrant ausente): DENIED, nunca chama o gateway de IA', async () => {
      const { user } = await makeUserWithJobRole('DIRETOR_COMERCIAL', 'GESTOR');
      const agent = await prisma.agentDefinition.findUniqueOrThrow({ where: { code: 'ceo' } });
      const capability = await prisma.capabilityDefinition.findUniqueOrThrow({
        where: { code: 'agent.execute' },
      });
      const existingGrant = await prisma.agentCapabilityGrant.findUnique({
        where: {
          agentDefinitionId_capabilityDefinitionId: {
            agentDefinitionId: agent.id,
            capabilityDefinitionId: capability.id,
          },
        },
      });
      await prisma.agentCapabilityGrant.update({
        where: { id: existingGrant!.id },
        data: { isActive: false },
      });
      try {
        const result = await runAgentExecution({
          actorId: user.id,
          organizationId: ORG_ID,
          actorRole: 'GESTOR',
          agentCode: 'ceo',
          requestedCapability: 'agent.execute',
          mission: 'Nunca deveria rodar.',
        });
        expect(result.status).toBe('DENIED');
        expect(result.policyDecision.reason).toBe('CAPABILITY_NOT_GRANTED_TO_AGENT');
        expect(invokeCallCount).toBe(0);
      } finally {
        await prisma.agentCapabilityGrant.update({
          where: { id: existingGrant!.id },
          data: { isActive: true },
        });
      }
    });

    it('sem base legal LGPD (AI_PII_EXTERNAL_CONSENT_ORGANIZATIONS) para a organização: FAILED com erro explícito, nunca chama o gateway de IA', async () => {
      const { user } = await makeUserWithJobRole('DIRETOR_COMERCIAL', 'GESTOR');
      env.AI_PII_EXTERNAL_CONSENT_ORGANIZATIONS = undefined;
      try {
        const result = await runAgentExecution({
          actorId: user.id,
          organizationId: ORG_ID,
          actorRole: 'GESTOR',
          agentCode: 'ceo',
          requestedCapability: 'agent.execute',
          mission: 'Contém possivelmente dado pessoal de um lead real.',
        });
        // A autorização (Capability Engine) continua permitindo — o gate de PII é uma checagem
        // LGPD adicional dentro do executor, não uma etapa de authorizeCapability.
        expect(result.policyDecision.allowed).toBe(true);
        expect(result.status).toBe('FAILED');
        expect(invokeCallCount).toBe(0);
        const row = await prisma.agentExecution.findUnique({ where: { id: result.executionId } });
        expect(row?.errorMessage).toBeTruthy();
        expect(row?.errorMessage?.toLowerCase()).toContain('lgpd');
      } finally {
        env.AI_PII_EXTERNAL_CONSENT_ORGANIZATIONS = ORG_ID;
      }
    });
  });
});
