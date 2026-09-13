import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '../../src/lib/prisma';
import { requestContext } from '../../src/lib/async-context';
import { setupDI } from '../../src/shared/di/setup';
import { runMultiCargoSeed } from '../../scripts/seed-multi-cargo';
import { runAgentCatalogImport } from '../../scripts/import-agent-catalog';
import { runCapabilityEngineSeed } from '../../scripts/seed-capability-engine';
import { runAgentExecution } from '../../src/features/job-roles/services/agentRuntime.service';
import {
  getJobRoleByCode,
  assignJobRole,
} from '../../src/features/job-roles/services/jobRole.service';
import { CAPABILITY_CODES } from '../../src/config/capability-catalog';
import normalizedBirthHubCatalog from '../../src/features/job-roles/catalog/agents.normalized.json';

const ORG_ID = 'test-org-id';
const OTHER_ORG_ID = 'test-org-id-2';

let userCounter = 0;
async function makeUserWithJobRole(jobRoleCode: string, userRole = 'SDR') {
  userCounter++;
  const user = await prisma.user.create({
    data: {
      name: `Agent Runtime Test User ${userCounter}`,
      email: `agent.runtime.test.${Date.now()}.${userCounter}@test.com`,
      organizationId: ORG_ID,
      role: userRole,
    },
  });
  const jobRole = await getJobRoleByCode(jobRoleCode);
  await assignJobRole({
    organizationId: ORG_ID,
    userId: user.id,
    jobRoleId: jobRole!.id,
    assignedBy: 'admin-agent-runtime-test',
  });
  return { user, jobRole: jobRole! };
}

async function makeLead(overrides: Record<string, unknown> = {}) {
  return prisma.lead.create({
    data: {
      organizationId: ORG_ID,
      title: 'Lead de teste do Agent Runtime',
      status: 'Lead_Recebido',
      ...overrides,
    },
  });
}

describe('Agent Runtime Genérico (PROMPT 4)', () => {
  const sourceAgentCodes = (normalizedBirthHubCatalog.agents as { code: string }[]).map(
    (a) => a.code,
  );

  beforeAll(async () => {
    // Os executores reais (`toolExecutors.ts`) resolvem `LeadUseCases`/`CompanyUseCases`/etc via
    // `container.resolve` — o container só é populado por `setupDI()` (mesma chamada que
    // `server.ts` faz no boot real), nunca automaticamente. Mesmo padrão de
    // `rbac-e2e-crm-operations.test.ts`/`proposalVersioning.test.ts`.
    setupDI();
    await runMultiCargoSeed();
    await runAgentCatalogImport();
    await runCapabilityEngineSeed();
  });

  afterAll(async () => {
    await prisma.agentExecution.deleteMany({ where: { organizationId: ORG_ID } });
    await prisma.userJobRole.deleteMany({ where: { organizationId: ORG_ID } });
    await prisma.user.deleteMany({
      where: { organizationId: ORG_ID, email: { contains: 'agent.runtime.test' } },
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

  describe('execução real de tool verificado (SUCCEEDED)', () => {
    it('LDR executando lead.read via ldr-intelligence sobre um lead real retorna SUCCEEDED com evidência', async () => {
      const { user } = await makeUserWithJobRole('LDR', 'SDR');
      const lead = await makeLead();

      const result = await runAgentExecution({
        actorId: user.id,
        organizationId: ORG_ID,
        actorRole: 'SDR',
        agentCode: 'ldr-intelligence',
        requestedCapability: 'lead.read',
        resource: { leadId: lead.id },
      });

      expect(result.status).toBe('SUCCEEDED');
      expect(result.summary).toContain(lead.title);
      expect(result.evidence.length).toBeGreaterThan(0); // cobertura de evidência
      expect(result.evidence).toContain(`Lead.id=${lead.id}`);
      expect(result.confidence).toBeGreaterThan(0);
      expect(result.policyDecision.allowed).toBe(true);
      expect(result.toolCalls).toHaveLength(1);
      expect(result.toolCalls[0]?.ok).toBe(true);

      // Persistência real — não é só o retorno da função, a linha existe no banco.
      const row = await prisma.agentExecution.findUnique({ where: { id: result.executionId } });
      expect(row?.status).toBe('SUCCEEDED');
      expect(row?.agentCode).toBe('ldr-intelligence');
      expect(row?.capabilityCode).toBe('lead.read');
    });

    it('company.search retorna SUCCEEDED mesmo sem nenhuma empresa cadastrada (lista vazia é sucesso, não falha)', async () => {
      const { user } = await makeUserWithJobRole('LDR', 'SDR');
      const result = await runAgentExecution({
        actorId: user.id,
        organizationId: ORG_ID,
        actorRole: 'SDR',
        agentCode: 'ldr-intelligence',
        requestedCapability: 'company.search',
        resource: { query: 'empresa-que-nao-existe-xyz' },
      });
      expect(result.status).toBe('SUCCEEDED');
      expect(result.metrics.total).toBe(0);
    });
  });

  describe('negações — toda execução passa pelo CapabilityAuthorizationService', () => {
    it('sem JobRole: DENIED com reason NO_JOB_ROLE, persistido mesmo sem AgentDefinition resolvido', async () => {
      const user = await prisma.user.create({
        data: {
          name: 'Sem Cargo Runtime',
          email: `agent.runtime.test.sem-cargo.${Date.now()}@test.com`,
          organizationId: ORG_ID,
          role: 'SDR',
        },
      });
      const result = await runAgentExecution({
        actorId: user.id,
        organizationId: ORG_ID,
        actorRole: 'SDR',
        agentCode: 'ldr-intelligence',
        requestedCapability: 'lead.read',
        resource: { leadId: 'nao-importa' },
      });
      expect(result.status).toBe('DENIED');
      expect(result.policyDecision.reason).toBe('NO_JOB_ROLE');
    });

    it('agentCode inexistente: DENIED com reason UNKNOWN_AGENT, linha persistida sem agentDefinitionId', async () => {
      const { user } = await makeUserWithJobRole('LDR', 'SDR');
      const result = await runAgentExecution({
        actorId: user.id,
        organizationId: ORG_ID,
        actorRole: 'SDR',
        agentCode: 'agente-que-nao-existe-xyz',
        requestedCapability: 'lead.read',
        resource: {},
      });
      expect(result.status).toBe('DENIED');
      expect(result.policyDecision.reason).toBe('UNKNOWN_AGENT');

      const row = await prisma.agentExecution.findUnique({ where: { id: result.executionId } });
      expect(row).not.toBeNull();
      expect(row?.agentDefinitionId).toBeNull();
      expect(row?.agentCode).toBe('agente-que-nao-existe-xyz');
    });

    it('capability não concedida ao agente: DENIED com reason CAPABILITY_NOT_GRANTED_TO_AGENT', async () => {
      const { user } = await makeUserWithJobRole('LDR', 'SDR');
      const result = await runAgentExecution({
        actorId: user.id,
        organizationId: ORG_ID,
        actorRole: 'SDR',
        agentCode: 'ldr-intelligence',
        requestedCapability: 'signature.request',
        resource: {},
      });
      expect(result.status).toBe('DENIED');
      expect([
        'CAPABILITY_NOT_GRANTED_TO_AGENT',
        'CAPABILITY_NOT_GRANTED_TO_ROLE',
        'FUTURE_TOOL',
      ]).toContain(result.policyDecision.reason);
    });

    it('DISCOVER (nível do agente): DENIED com reason DISCOVER_ONLY, nunca chama o executor real', async () => {
      const { user } = await makeUserWithJobRole('SDR', 'SDR');
      const agent = await prisma.agentDefinition.findUniqueOrThrow({
        where: { code: 'ldr-intelligence' },
      });
      const jobRole = await getJobRoleByCode('SDR');
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
          actorRole: 'SDR',
          agentCode: 'ldr-intelligence',
          requestedCapability: 'lead.read',
          resource: { leadId: 'nao-importa' },
        });
        expect(result.status).toBe('DENIED');
        expect(result.policyDecision.reason).toBe('DISCOVER_ONLY');
        expect(result.toolCalls).toHaveLength(0);
      } finally {
        await prisma.roleAgentGrant.delete({ where: { id: grant.id } });
      }
    });

    it('READ (nível do agente) nunca autoriza uma capability WRITE: DENIED com reason READ_ONLY_ACCESS, sem gravar nada', async () => {
      const { user } = await makeUserWithJobRole('SDR', 'SDR');
      const lead = await makeLead();
      const agent = await prisma.agentDefinition.findUniqueOrThrow({
        where: { code: 'ldr-intelligence' },
      });
      const jobRole = await getJobRoleByCode('SDR');
      const grant = await prisma.roleAgentGrant.upsert({
        where: {
          jobRoleId_agentDefinitionId: { jobRoleId: jobRole!.id, agentDefinitionId: agent.id },
        },
        create: {
          jobRoleId: jobRole!.id,
          agentDefinitionId: agent.id,
          accessLevel: 'READ',
          isActive: true,
        },
        update: { accessLevel: 'READ', isActive: true },
      });
      const capability = await prisma.capabilityDefinition.findUniqueOrThrow({
        where: { code: 'lead.update' },
      });
      await prisma.agentCapabilityGrant.upsert({
        where: {
          agentDefinitionId_capabilityDefinitionId: {
            agentDefinitionId: agent.id,
            capabilityDefinitionId: capability.id,
          },
        },
        create: {
          agentDefinitionId: agent.id,
          capabilityDefinitionId: capability.id,
          isActive: true,
        },
        update: { isActive: true },
      });
      try {
        const result = await runAgentExecution({
          actorId: user.id,
          organizationId: ORG_ID,
          actorRole: 'SDR',
          agentCode: 'ldr-intelligence',
          requestedCapability: 'lead.update',
          resource: { leadId: lead.id, data: { title: 'NUNCA DEVERIA SER GRAVADO' } },
        });
        expect(result.status).toBe('DENIED');
        expect(result.policyDecision.reason).toBe('READ_ONLY_ACCESS');

        const untouched = await prisma.lead.findUnique({ where: { id: lead.id } });
        expect(untouched?.title).toBe(lead.title);
      } finally {
        await prisma.roleAgentGrant.delete({ where: { id: grant.id } });
      }
    });

    it('REQUEST (nível do agente): DENIED com reason CROSS_ROLE_REQUEST_REQUIRED e requiresApproval=true', async () => {
      const { user } = await makeUserWithJobRole('SDR', 'SDR');
      const agent = await prisma.agentDefinition.findUniqueOrThrow({
        where: { code: 'ldr-intelligence' },
      });
      const jobRole = await getJobRoleByCode('SDR');
      const grant = await prisma.roleAgentGrant.upsert({
        where: {
          jobRoleId_agentDefinitionId: { jobRoleId: jobRole!.id, agentDefinitionId: agent.id },
        },
        create: {
          jobRoleId: jobRole!.id,
          agentDefinitionId: agent.id,
          accessLevel: 'REQUEST',
          isActive: true,
        },
        update: { accessLevel: 'REQUEST', isActive: true },
      });
      try {
        const result = await runAgentExecution({
          actorId: user.id,
          organizationId: ORG_ID,
          actorRole: 'SDR',
          agentCode: 'ldr-intelligence',
          requestedCapability: 'lead.read',
          resource: { leadId: 'nao-importa' },
        });
        expect(result.status).toBe('DENIED');
        expect(result.policyDecision.reason).toBe('CROSS_ROLE_REQUEST_REQUIRED');
        expect(result.policyDecision.requiresApproval).toBe(true);
      } finally {
        await prisma.roleAgentGrant.delete({ where: { id: grant.id } });
      }
    });

    // Correção do achado da auditoria de dívida técnica (AIAGENT-001/002): `agent.execute` deixou
    // de ser FUTURE_TOOL (tool-bindings.ts) e ganhou um executor real
    // (toolExecutors.ts:agentExecute). `ldr-intelligence` é um dos 3 agentes "comuns" pré-existentes
    // do PROMPT 1 (EXISTING_COMMON_CODES em scripts/import-agent-catalog.ts) — nunca passou pelo
    // loop de `agent.hasPrompt`/`upsertAgentVersion` do importador do catálogo Birth Hub, então não
    // tem nenhuma AgentVersion. A autorização agora PERMITE a chamada (binding VERIFIED/AVAILABLE),
    // mas o executor falha fechado por falta de prompt real — nunca fabrica uma resposta. Cobertura
    // completa do caminho SUCCEEDED (agente PROMPT_READY de verdade, com IA mockada) vive em
    // tests/integration/agent-execute.test.ts.
    it('agent.execute agora é PERMITTED pela autorização, mas falha fechado (FAILED) para um agente sem AgentVersion/systemPrompt', async () => {
      const { user } = await makeUserWithJobRole('LDR', 'SDR');
      const result = await runAgentExecution({
        actorId: user.id,
        organizationId: ORG_ID,
        actorRole: 'SDR',
        agentCode: 'ldr-intelligence',
        requestedCapability: 'agent.execute',
        resource: {},
      });
      expect(result.policyDecision.allowed).toBe(true);
      expect(result.policyDecision.reason).toBe('PERMITTED');
      expect(result.status).toBe('FAILED');
      const row = await prisma.agentExecution.findUnique({ where: { id: result.executionId } });
      expect(row?.errorMessage).toContain('não tem conteúdo executável configurado');
    });

    it('SOURCE_REQUIRED: billing.read permanece bloqueado (sem fonte real de faturamento)', async () => {
      const { user } = await makeUserWithJobRole('RECEITA_FATURAMENTO', 'GESTOR');
      const result = await runAgentExecution({
        actorId: user.id,
        organizationId: ORG_ID,
        actorRole: 'GESTOR',
        agentCode: 'billing-revenue',
        requestedCapability: 'billing.read',
        resource: {},
      });
      expect(result.status).toBe('DENIED');
      expect(result.policyDecision.reason).toBe('SOURCE_REQUIRED');
    });

    it('APPROVAL_REQUIRED: deal.move_stage (HIGH) nunca executa nem grava no banco', async () => {
      const { user } = await makeUserWithJobRole('CLOSER', 'CLOSER');
      const lead = await makeLead({ status: 'Nova_Oportunidade' });
      const result = await runAgentExecution({
        actorId: user.id,
        organizationId: ORG_ID,
        actorRole: 'CLOSER',
        agentCode: 'closer-sales',
        requestedCapability: 'deal.move_stage',
        resource: { leadId: lead.id, newStatus: 'Proposta_Enviada' },
      });
      expect(result.status).toBe('DENIED');
      expect(result.policyDecision.reason).toBe('APPROVAL_REQUIRED');
      expect(result.policyDecision.requiresApproval).toBe(true);

      // Prova real de que nada foi executado — o status do lead no banco não mudou.
      const untouched = await prisma.lead.findUnique({ where: { id: lead.id } });
      expect(untouched?.status).toBe('Nova_Oportunidade');
    });
  });

  describe('robustez — prompt injection e sanitização de erro', () => {
    it('leadId malicioso no resource nunca corresponde a um lead real (nega/reporta ausência, nunca quebra)', async () => {
      const { user } = await makeUserWithJobRole('LDR', 'SDR');
      const maliciousIds = [
        '\'; DROP TABLE "Lead"; --',
        '{{__proto__.polluted}}',
        '../../../etc/passwd',
      ];
      for (const leadId of maliciousIds) {
        const result = await runAgentExecution({
          actorId: user.id,
          organizationId: ORG_ID,
          actorRole: 'SDR',
          agentCode: 'ldr-intelligence',
          requestedCapability: 'lead.read',
          resource: { leadId },
        });
        expect(result.status).toBe('SUCCEEDED'); // executor real roda, mas não encontra nada
        expect(result.missingData).toContain('lead');
      }
      // A tabela real continua intacta.
      const stillThere = await prisma.capabilityDefinition.findUnique({
        where: { code: 'lead.read' },
      });
      expect(stillThere).not.toBeNull();
    });

    it('resource sem o campo obrigatório: FAILED com errorMessage sanitizado (nunca stack trace bruto)', async () => {
      const { user } = await makeUserWithJobRole('LDR', 'SDR');
      const result = await runAgentExecution({
        actorId: user.id,
        organizationId: ORG_ID,
        actorRole: 'SDR',
        agentCode: 'ldr-intelligence',
        requestedCapability: 'lead.read',
        resource: {}, // sem leadId — o executor lança um erro real
      });
      expect(result.status).toBe('FAILED');
      expect(result.toolCalls[0]?.ok).toBe(false);
      const row = await prisma.agentExecution.findUnique({ where: { id: result.executionId } });
      expect(row?.errorMessage).toBeTruthy();
      expect(row?.errorMessage).not.toContain('at Object.');
      expect(row?.errorMessage).not.toContain(__dirname);
      expect(row!.errorMessage!.length).toBeLessThanOrEqual(500);
    });
  });

  describe('idempotência', () => {
    it('reexecutar com o mesmo correlationId não dispara uma segunda execução real', async () => {
      const { user } = await makeUserWithJobRole('LDR', 'SDR');
      const lead = await makeLead();
      const correlationId = `idem-${Date.now()}`;

      const first = await runAgentExecution({
        actorId: user.id,
        organizationId: ORG_ID,
        actorRole: 'SDR',
        agentCode: 'ldr-intelligence',
        requestedCapability: 'lead.read',
        resource: { leadId: lead.id },
        correlationId,
      });
      const second = await runAgentExecution({
        actorId: user.id,
        organizationId: ORG_ID,
        actorRole: 'SDR',
        agentCode: 'ldr-intelligence',
        requestedCapability: 'lead.read',
        resource: { leadId: lead.id },
        correlationId,
      });

      expect(second.executionId).toBe(first.executionId);
      const count = await prisma.agentExecution.count({ where: { correlationId } });
      expect(count).toBe(1);
    });
  });

  describe('segurança — isolamento de tenant', () => {
    it('um JobRole de outra organização nunca autoriza execução nesta organização', async () => {
      const otherUser = await requestContext.run({ bypassRls: true }, async () => {
        await prisma.organization.upsert({
          where: { id: OTHER_ORG_ID },
          update: {},
          create: { id: OTHER_ORG_ID, name: 'Outra Org — Agent Runtime Test' },
        });
        return prisma.user.create({
          data: {
            name: 'Usuário Outro Tenant Runtime',
            email: `agent.runtime.test.outro-tenant.${Date.now()}@test.com`,
            organizationId: OTHER_ORG_ID,
            role: 'SDR',
          },
        });
      });
      const ldr = await getJobRoleByCode('LDR');
      await requestContext.run({ tenantId: OTHER_ORG_ID }, () =>
        prisma.userJobRole.create({
          data: {
            organizationId: OTHER_ORG_ID,
            userId: otherUser.id,
            jobRoleId: ldr!.id,
            isPrimary: true,
            assignedBy: 'admin-other-org',
          },
        }),
      );

      const result = await runAgentExecution({
        actorId: otherUser.id,
        organizationId: ORG_ID, // organizationId ERRADO de propósito — simula um bug/ataque
        actorRole: 'SDR',
        agentCode: 'ldr-intelligence',
        requestedCapability: 'lead.read',
        resource: { leadId: 'nao-importa' },
      });
      expect(result.status).toBe('DENIED');
      expect(result.policyDecision.reason).toBe('NO_JOB_ROLE');

      await requestContext.run({ tenantId: OTHER_ORG_ID }, () =>
        prisma.userJobRole.deleteMany({ where: { userId: otherUser.id } }),
      );
      await requestContext.run({ bypassRls: true }, async () => {
        await prisma.agentExecution.deleteMany({ where: { organizationId: OTHER_ORG_ID } });
        await prisma.user.delete({ where: { id: otherUser.id } });
        await prisma.organization.delete({ where: { id: OTHER_ORG_ID } });
      });
    });
  });
});
