import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '../../src/lib/prisma';
import { requestContext } from '../../src/lib/async-context';
import { runMultiCargoSeed } from '../../scripts/seed-multi-cargo';
import { runAgentCatalogImport } from '../../scripts/import-agent-catalog';
import { runCapabilityEngineSeed } from '../../scripts/seed-capability-engine';
import { authorizeCapability } from '../../src/features/job-roles/services/capabilityAuthorization.service';
import { CAPABILITY_CATALOG, CAPABILITY_CODES } from '../../src/config/capability-catalog';
import { JOB_ROLE_CODES } from '../../src/config/job-role-catalog';
import { getJobRoleByCode } from '../../src/features/job-roles/services/jobRole.service';
import { assignJobRole } from '../../src/features/job-roles/services/jobRole.service';
import normalizedBirthHubCatalog from '../../src/features/job-roles/catalog/agents.normalized.json';
import { COMMERCIAL_AGENT_REGISTRY } from '../../src/features/intelligence/agents/commercialAgentRegistry';

const ORG_ID = 'test-org-id';
const OTHER_ORG_ID = 'test-org-id-2';

let userCounter = 0;
async function makeUserWithJobRole(jobRoleCode: string, userRole = 'SDR') {
  userCounter++;
  const user = await prisma.user.create({
    data: {
      name: `Capability Test User ${userCounter}`,
      email: `capability.test.${Date.now()}.${userCounter}@test.com`,
      organizationId: ORG_ID,
      role: userRole,
    },
  });
  const jobRole = await getJobRoleByCode(jobRoleCode);
  await assignJobRole({
    organizationId: ORG_ID,
    userId: user.id,
    jobRoleId: jobRole!.id,
    assignedBy: 'admin-capability-test',
  });
  return { user, jobRole: jobRole! };
}

function actorFor(user: { id: string; role: string }) {
  return { userId: user.id, organizationId: ORG_ID, userRole: user.role };
}

describe('Capability & Permission Engine (PROMPT 3 + hardening PROMPT 3B)', () => {
  const sourceAgentCodes = (normalizedBirthHubCatalog.agents as { code: string }[]).map(
    (a) => a.code,
  );

  beforeAll(async () => {
    // Ordem real de rollout: PROMPT 1 -> PROMPT 2 -> PROMPT 3, sempre nessa ordem em produção —
    // reproduzida aqui porque o banco de teste começa vazio (mesmo padrão de
    // tests/integration/import-agent-catalog.test.ts).
    await runMultiCargoSeed();
    await runAgentCatalogImport();
    await runCapabilityEngineSeed();
  });

  afterAll(async () => {
    await prisma.userJobRole.deleteMany({ where: { organizationId: ORG_ID } });
    await prisma.user.deleteMany({
      where: { organizationId: ORG_ID, email: { contains: 'capability.test' } },
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

  describe('seed idempotente', () => {
    it('reexecutar o seed do Capability Engine não duplica nada', async () => {
      // Timeout maior: o seed grava ~1000 grants sequencialmente (927 AgentCapabilityGrant + 113
      // RoleCapabilityGrant) — rodar 2x dentro de um mesmo teste passa do timeout default (5s).
      const before = await prisma.capabilityDefinition.count({
        where: { code: { in: CAPABILITY_CODES } },
      });
      const beforeAgentGrants = await prisma.agentCapabilityGrant.count({
        where: { capabilityDefinition: { code: { in: CAPABILITY_CODES } } },
      });
      const beforeRoleGrants = await prisma.roleCapabilityGrant.count({
        where: { capabilityDefinition: { code: { in: CAPABILITY_CODES } } },
      });

      await runCapabilityEngineSeed();
      await runCapabilityEngineSeed();

      const after = await prisma.capabilityDefinition.count({
        where: { code: { in: CAPABILITY_CODES } },
      });
      const afterAgentGrants = await prisma.agentCapabilityGrant.count({
        where: { capabilityDefinition: { code: { in: CAPABILITY_CODES } } },
      });
      const afterRoleGrants = await prisma.roleCapabilityGrant.count({
        where: { capabilityDefinition: { code: { in: CAPABILITY_CODES } } },
      });

      expect(after).toBe(before);
      expect(afterAgentGrants).toBe(beforeAgentGrants);
      expect(afterRoleGrants).toBe(beforeRoleGrants);
    }, 30000);

    it('não existem dois CapabilityDefinition com o mesmo code (no schema duplication)', async () => {
      const rows = await prisma.capabilityDefinition.findMany({
        where: { code: { in: CAPABILITY_CODES } },
        select: { code: true },
      });
      expect(new Set(rows.map((r) => r.code)).size).toBe(rows.length);
      expect(rows).toHaveLength(CAPABILITY_CATALOG.length);
    });
  });

  describe('reconciliação 379 (Birth Hub) + 12 (Célula Comercial) = 391 (PROMPT 3B item 1)', () => {
    it('não há sobreposição de code entre o catálogo Birth Hub e a Célula Comercial', () => {
      const birthHubCodes = new Set(sourceAgentCodes);
      const commercialCellCodes = COMMERCIAL_AGENT_REGISTRY.map((a) => a.id);
      const overlap = commercialCellCodes.filter((code) => birthHubCodes.has(code));
      expect(overlap).toEqual([]);
      expect(sourceAgentCodes.length).toBe(379);
      expect(commercialCellCodes.length).toBe(12);
      expect(sourceAgentCodes.length + commercialCellCodes.length).toBe(391);
    });

    it('o total real de AgentDefinition no banco (Birth Hub + Célula Comercial) é 391', async () => {
      const allCodes = [...sourceAgentCodes, ...COMMERCIAL_AGENT_REGISTRY.map((a) => a.id)];
      const rows = await prisma.agentDefinition.findMany({ where: { code: { in: allCodes } } });
      expect(rows).toHaveLength(391);
    });

    it('todo agente (Birth Hub + Célula Comercial) tem ao menos um AgentCapabilityGrant real', async () => {
      const allCodes = [...sourceAgentCodes, ...COMMERCIAL_AGENT_REGISTRY.map((a) => a.id)];
      const agents = await prisma.agentDefinition.findMany({
        where: { code: { in: allCodes } },
        select: {
          id: true,
          code: true,
          capabilityGrants: { where: { isActive: true }, select: { id: true } },
        },
      });
      const withoutAny = agents.filter((a) => a.capabilityGrants.length === 0);
      expect(
        withoutAny,
        `agentes sem nenhuma capability: ${withoutAny.map((a) => a.code).join(', ')}`,
      ).toEqual([]);
    });
  });

  describe('authorizeCapability — caminho feliz (PERMITTED)', () => {
    it('LDR executando lead.read via ldr-intelligence é PERMITTED', async () => {
      const { user } = await makeUserWithJobRole('LDR', 'SDR');
      const decision = await authorizeCapability({
        actor: actorFor(user),
        agentCode: 'ldr-intelligence',
        capabilityCode: 'lead.read',
      });
      expect(decision.allowed).toBe(true);
      expect(decision.reason).toBe('PERMITTED');
      expect(decision.requiresApproval).toBe(false);
      expect(decision.bindingVerification).toBe('VERIFIED');
      expect(decision.toolAvailable).toBe(true);
    });
  });

  describe('authorizeCapability — negações estruturais (fail closed)', () => {
    it('NO_JOB_ROLE: usuário sem UserJobRole', async () => {
      const user = await prisma.user.create({
        data: {
          name: 'Sem Cargo',
          email: `capability.test.sem-cargo.${Date.now()}@test.com`,
          organizationId: ORG_ID,
          role: 'SDR',
        },
      });
      const decision = await authorizeCapability({
        actor: actorFor(user),
        agentCode: 'ldr-intelligence',
        capabilityCode: 'lead.read',
      });
      expect(decision.allowed).toBe(false);
      expect(decision.reason).toBe('NO_JOB_ROLE');
    });

    it('INACTIVE_JOB_ROLE: cargo principal existe mas está desativado', async () => {
      const { user, jobRole } = await makeUserWithJobRole('LDR', 'SDR');
      await prisma.jobRole.update({ where: { id: jobRole.id }, data: { isActive: false } });
      try {
        const decision = await authorizeCapability({
          actor: actorFor(user),
          agentCode: 'ldr-intelligence',
          capabilityCode: 'lead.read',
        });
        expect(decision.reason).toBe('INACTIVE_JOB_ROLE');
      } finally {
        await prisma.jobRole.update({ where: { id: jobRole.id }, data: { isActive: true } });
      }
    });

    it('UNKNOWN_AGENT: código de agente inexistente', async () => {
      const { user } = await makeUserWithJobRole('LDR', 'SDR');
      const decision = await authorizeCapability({
        actor: actorFor(user),
        agentCode: 'agente-que-nao-existe-xyz',
        capabilityCode: 'lead.read',
      });
      expect(decision.reason).toBe('UNKNOWN_AGENT');
    });

    it('INACTIVE_AGENT: agente existe mas está desativado', async () => {
      const { user } = await makeUserWithJobRole('LDR', 'SDR');
      const agent = await prisma.agentDefinition.findUniqueOrThrow({
        where: { code: 'ldr-intelligence' },
      });
      await prisma.agentDefinition.update({ where: { id: agent.id }, data: { isActive: false } });
      try {
        const decision = await authorizeCapability({
          actor: actorFor(user),
          agentCode: 'ldr-intelligence',
          capabilityCode: 'lead.read',
        });
        expect(decision.reason).toBe('INACTIVE_AGENT');
      } finally {
        await prisma.agentDefinition.update({ where: { id: agent.id }, data: { isActive: true } });
      }
    });

    it('AGENT_NOT_GRANTED_TO_ROLE: cargo sem grant para o agente', async () => {
      const { user } = await makeUserWithJobRole('LDR', 'SDR');
      // "contract-signature" nunca é concedido a LDR (não é um dos 6 agentes comuns).
      const decision = await authorizeCapability({
        actor: actorFor(user),
        agentCode: 'contract-signature',
        capabilityCode: 'contract.read',
      });
      expect(decision.reason).toBe('AGENT_NOT_GRANTED_TO_ROLE');
    });

    it('AGENT_NOT_GRANTED_TO_ROLE (revogado): revogar um RoleAgentGrant ativo passa a negar', async () => {
      const { user } = await makeUserWithJobRole('LDR', 'SDR');
      const agent = await prisma.agentDefinition.findUniqueOrThrow({
        where: { code: 'ldr-intelligence' },
      });
      const jobRole = await getJobRoleByCode('LDR');
      const grant = await prisma.roleAgentGrant.findUniqueOrThrow({
        where: {
          jobRoleId_agentDefinitionId: { jobRoleId: jobRole!.id, agentDefinitionId: agent.id },
        },
      });
      await prisma.roleAgentGrant.update({ where: { id: grant.id }, data: { isActive: false } });
      try {
        const decision = await authorizeCapability({
          actor: actorFor(user),
          agentCode: 'ldr-intelligence',
          capabilityCode: 'lead.read',
        });
        expect(decision.reason).toBe('AGENT_NOT_GRANTED_TO_ROLE');
      } finally {
        await prisma.roleAgentGrant.update({ where: { id: grant.id }, data: { isActive: true } });
      }
    });

    it('UNKNOWN_CAPABILITY: código de capability inexistente', async () => {
      const { user } = await makeUserWithJobRole('LDR', 'SDR');
      const decision = await authorizeCapability({
        actor: actorFor(user),
        agentCode: 'ldr-intelligence',
        capabilityCode: 'capability.que-nao-existe',
      });
      expect(decision.reason).toBe('UNKNOWN_CAPABILITY');
    });

    it('INACTIVE_CAPABILITY: capability existe mas está desativada', async () => {
      const { user } = await makeUserWithJobRole('LDR', 'SDR');
      const capability = await prisma.capabilityDefinition.findUniqueOrThrow({
        where: { code: 'lead.read' },
      });
      await prisma.capabilityDefinition.update({
        where: { id: capability.id },
        data: { isActive: false },
      });
      try {
        const decision = await authorizeCapability({
          actor: actorFor(user),
          agentCode: 'ldr-intelligence',
          capabilityCode: 'lead.read',
        });
        expect(decision.reason).toBe('INACTIVE_CAPABILITY');
      } finally {
        await prisma.capabilityDefinition.update({
          where: { id: capability.id },
          data: { isActive: true },
        });
      }
    });
  });

  describe('semântica de access level (DISCOVER/READ/EXECUTE/REQUEST)', () => {
    it('DISCOVER (nível do AGENTE): nunca executa', async () => {
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
        const decision = await authorizeCapability({
          actor: actorFor(user),
          agentCode: 'ldr-intelligence',
          capabilityCode: 'lead.read',
        });
        expect(decision.allowed).toBe(false);
        expect(decision.reason).toBe('DISCOVER_ONLY');
      } finally {
        await prisma.roleAgentGrant.delete({ where: { id: grant.id } });
      }
    });

    it('REQUEST (nível do AGENTE): nunca executa direto, exige aprovação (CROSS_ROLE_REQUEST_REQUIRED)', async () => {
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
        const decision = await authorizeCapability({
          actor: actorFor(user),
          agentCode: 'ldr-intelligence',
          capabilityCode: 'lead.read',
        });
        expect(decision.allowed).toBe(false);
        expect(decision.reason).toBe('CROSS_ROLE_REQUEST_REQUIRED');
        expect(decision.requiresApproval).toBe(true);
      } finally {
        await prisma.roleAgentGrant.delete({ where: { id: grant.id } });
      }
    });

    it('READ (nível do AGENTE) nunca autoriza uma capability WRITE (READ_ONLY_ACCESS)', async () => {
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
          accessLevel: 'READ',
          isActive: true,
        },
        update: { accessLevel: 'READ', isActive: true },
      });
      // Concede a capability WRITE "lead.update" tanto ao agente quanto ao cargo, para provar que
      // é especificamente o accessLevel=READ do agente que bloqueia — não a ausência de grant.
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
        const decision = await authorizeCapability({
          actor: actorFor(user),
          agentCode: 'ldr-intelligence',
          capabilityCode: 'lead.update',
        });
        expect(decision.allowed).toBe(false);
        expect(decision.reason).toBe('READ_ONLY_ACCESS');
      } finally {
        await prisma.roleAgentGrant.delete({ where: { id: grant.id } });
      }
    });
  });

  describe('AgentCapabilityGrant / RoleCapabilityGrant ausentes', () => {
    it('CAPABILITY_NOT_GRANTED_TO_AGENT: o cargo pode a capability, mas o agente não foi desenhado para ela', async () => {
      const { user } = await makeUserWithJobRole('LDR', 'SDR');
      // "signature.request" é concedido ao cargo CONTRATOS_ASSINATURA/CLOSER, mas "ldr-intelligence"
      // nunca recebe essa capability (fora do domínio de LDR).
      const agent = await prisma.agentDefinition.findUniqueOrThrow({
        where: { code: 'ldr-intelligence' },
      });
      const jobRole = await getJobRoleByCode('LDR');
      const capability = await prisma.capabilityDefinition.findUniqueOrThrow({
        where: { code: 'signature.request' },
      });
      // Garante que o CARGO (LDR) tenha o grant, isolando a ausência no lado do AGENTE.
      const roleGrant = await prisma.roleCapabilityGrant.upsert({
        where: {
          jobRoleId_capabilityDefinitionId: {
            jobRoleId: jobRole!.id,
            capabilityDefinitionId: capability.id,
          },
        },
        create: {
          jobRoleId: jobRole!.id,
          capabilityDefinitionId: capability.id,
          accessLevel: 'EXECUTE',
          isActive: true,
        },
        update: { accessLevel: 'EXECUTE', isActive: true },
      });
      try {
        const decision = await authorizeCapability({
          actor: actorFor(user),
          agentCode: 'ldr-intelligence',
          capabilityCode: 'signature.request',
        });
        expect(decision.allowed).toBe(false);
        expect(decision.reason).toBe('CAPABILITY_NOT_GRANTED_TO_AGENT');
      } finally {
        await prisma.roleCapabilityGrant.delete({ where: { id: roleGrant.id } });
      }
    });

    it('CAPABILITY_NOT_GRANTED_TO_ROLE: o agente foi desenhado para a capability, mas o cargo não a concede', async () => {
      const { user } = await makeUserWithJobRole('LDR', 'SDR');
      const agent = await prisma.agentDefinition.findUniqueOrThrow({
        where: { code: 'ldr-intelligence' },
      });
      const capability = await prisma.capabilityDefinition.findUniqueOrThrow({
        where: { code: 'billing.reconcile' },
      });
      // Garante que o AGENTE tenha o grant, isolando a ausência no lado do CARGO (LDR nunca
      // recebe billing.reconcile).
      const agentGrant = await prisma.agentCapabilityGrant.upsert({
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
        const decision = await authorizeCapability({
          actor: actorFor(user),
          agentCode: 'ldr-intelligence',
          capabilityCode: 'billing.reconcile',
        });
        expect(decision.allowed).toBe(false);
        expect(decision.reason).toBe('CAPABILITY_NOT_GRANTED_TO_ROLE');
      } finally {
        await prisma.agentCapabilityGrant.delete({ where: { id: agentGrant.id } });
      }
    });
  });

  describe('ToolBinding — SOURCE_REQUIRED / FUTURE_TOOL / TOOL_UNAVAILABLE nunca colapsados (PROMPT 3B item 5)', () => {
    it('billing.read via billing-revenue é SOURCE_REQUIRED (razão preservada)', async () => {
      const { user } = await makeUserWithJobRole('RECEITA_FATURAMENTO', 'GESTOR');
      const decision = await authorizeCapability({
        actor: actorFor(user),
        agentCode: 'billing-revenue',
        capabilityCode: 'billing.read',
      });
      expect(decision.allowed).toBe(false);
      expect(decision.reason).toBe('SOURCE_REQUIRED');
      expect(decision.bindingVerification).toBe('UNVERIFIED');
    });

    // Correção do achado da auditoria de dívida técnica (AIAGENT-001): `agent.execute` tinha um
    // binding FUTURE_TOOL cujo próprio comentário ("até o PROMPT 4") já estava obsoleto — o runtime
    // genérico (agentRuntime.service.ts/toolExecutors.ts) já existia; só faltava registrar um
    // executor real. Agora é AVAILABLE/VERIFIED (ver tool-bindings.ts) e a autorização PERMITE a
    // chamada — a decisão de "tem prompt real pra executar?" é responsabilidade do executor
    // (toolExecutors.ts:agentExecute), não desta etapa 11 de authorizeCapability.
    it('agent.execute é PERMITTED (VERIFIED/AVAILABLE desde a implementação do ToolExecutor genérico — Quick Win do audit de dívida técnica)', async () => {
      const { user } = await makeUserWithJobRole('LDR', 'SDR');
      const decision = await authorizeCapability({
        actor: actorFor(user),
        agentCode: 'ldr-intelligence',
        capabilityCode: 'agent.execute',
      });
      expect(decision.allowed).toBe(true);
      expect(decision.reason).toBe('PERMITTED');
      expect(decision.bindingVerification).toBe('VERIFIED');
      expect(decision.toolAvailable).toBe(true);
    });

    it('signature.request é FUTURE_TOOL mesmo com máquina de estados real (transporte externo é stub — PROMPT 3B item 6)', async () => {
      const { user } = await makeUserWithJobRole('CONTRATOS_ASSINATURA', 'GESTOR');
      const decision = await authorizeCapability({
        actor: actorFor(user),
        agentCode: 'contract-signature',
        capabilityCode: 'signature.request',
      });
      expect(decision.allowed).toBe(false);
      expect(decision.reason).toBe('FUTURE_TOOL');
    });

    it('meeting.read é TOOL_UNAVAILABLE (não é SOURCE_REQUIRED nem FUTURE_TOOL — gap honesto)', async () => {
      const { user } = await makeUserWithJobRole('SDR', 'SDR');
      // "sdr-qualification" nesta onda não recebe meeting.read por padrão (fora do escopo real
      // mapeado) — concede ad-hoc tanto ao agente quanto ao cargo para isolar o teste
      // especificamente no motivo de indisponibilidade do ToolBinding (etapa 11), não numa
      // ausência de grant (etapas 8/9).
      const agent = await prisma.agentDefinition.findUniqueOrThrow({
        where: { code: 'sdr-qualification' },
      });
      const jobRole = await getJobRoleByCode('SDR');
      const capability = await prisma.capabilityDefinition.findUniqueOrThrow({
        where: { code: 'meeting.read' },
      });
      const agentGrant = await prisma.agentCapabilityGrant.upsert({
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
      const roleGrant = await prisma.roleCapabilityGrant.upsert({
        where: {
          jobRoleId_capabilityDefinitionId: {
            jobRoleId: jobRole!.id,
            capabilityDefinitionId: capability.id,
          },
        },
        create: {
          jobRoleId: jobRole!.id,
          capabilityDefinitionId: capability.id,
          accessLevel: 'EXECUTE',
          isActive: true,
        },
        update: { accessLevel: 'EXECUTE', isActive: true },
      });
      try {
        const decision = await authorizeCapability({
          actor: actorFor(user),
          agentCode: 'sdr-qualification',
          capabilityCode: 'meeting.read',
        });
        expect(decision.allowed).toBe(false);
        expect(decision.reason).toBe('TOOL_UNAVAILABLE');
      } finally {
        await prisma.agentCapabilityGrant.delete({ where: { id: agentGrant.id } });
        await prisma.roleCapabilityGrant.delete({ where: { id: roleGrant.id } });
      }
    });
  });

  describe('risco e aprovação (HIGH/CRITICAL)', () => {
    it('HIGH: deal.move_stage via closer-sales exige aprovação (APPROVAL_REQUIRED)', async () => {
      const { user } = await makeUserWithJobRole('CLOSER', 'CLOSER');
      const decision = await authorizeCapability({
        actor: actorFor(user),
        agentCode: 'closer-sales',
        capabilityCode: 'deal.move_stage',
      });
      expect(decision.allowed).toBe(false);
      expect(decision.reason).toBe('APPROVAL_REQUIRED');
      expect(decision.requiresApproval).toBe(true);
      expect(decision.riskLevel).toBe('HIGH');
    });

    it('CRITICAL: bitrix.configure exige aprovação mesmo para o dono (BITRIX_GUARDIAN)', async () => {
      const { user } = await makeUserWithJobRole('BITRIX_GUARDIAN', 'GESTOR');
      const agent = await prisma.agentDefinition.findUniqueOrThrow({
        where: { code: 'bitrix-guardian' },
      });
      const capability = await prisma.capabilityDefinition.findUniqueOrThrow({
        where: { code: 'bitrix.configure' },
      });
      // bitrix-guardian (agente) não tem bitrix.configure por padrão nesta onda — concede ad-hoc
      // para isolar o teste no critério de risco/aprovação, não na ausência de grant.
      const agentGrant = await prisma.agentCapabilityGrant.upsert({
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
        const decision = await authorizeCapability({
          actor: actorFor(user),
          agentCode: 'bitrix-guardian',
          capabilityCode: 'bitrix.configure',
        });
        expect(decision.allowed).toBe(false);
        expect(decision.reason).toBe('APPROVAL_REQUIRED');
        expect(decision.riskLevel).toBe('CRITICAL');
      } finally {
        await prisma.agentCapabilityGrant.delete({ where: { id: agentGrant.id } });
      }
    });

    it('bitrix.write via BitrixLeadWritebackAdapter é binding VERIFIED mas HIGH — verificado não é sinônimo de autorizado (PROMPT 3B item 7)', async () => {
      const { user } = await makeUserWithJobRole('BITRIX_GUARDIAN', 'GESTOR');
      const decision = await authorizeCapability({
        actor: actorFor(user),
        agentCode: 'bitrix-guardian',
        capabilityCode: 'bitrix.write',
      });
      expect(decision.bindingVerification).toBe('VERIFIED');
      expect(decision.toolAvailable).toBe(true);
      expect(decision.allowed).toBe(false);
      expect(decision.reason).toBe('APPROVAL_REQUIRED');
    });
  });

  describe('UserRole policy (PROMPT 3B item 4) — patamar mínimo por tipo de ação', () => {
    it('SDR não atinge o patamar ADMIN (bitrix.configure é actionType=ADMIN)', async () => {
      const { user } = await makeUserWithJobRole('BITRIX_GUARDIAN', 'SDR');
      const decision = await authorizeCapability({
        actor: actorFor(user),
        agentCode: 'bitrix-guardian',
        capabilityCode: 'bitrix.configure',
      });
      expect(decision.allowed).toBe(false);
      expect(decision.reason).toBe('USER_ROLE_FORBIDDEN');
    });

    it('CLOSER não atinge o patamar ADMIN', async () => {
      const { user } = await makeUserWithJobRole('BITRIX_GUARDIAN', 'CLOSER');
      const decision = await authorizeCapability({
        actor: actorFor(user),
        agentCode: 'bitrix-guardian',
        capabilityCode: 'bitrix.configure',
      });
      expect(decision.allowed).toBe(false);
      expect(decision.reason).toBe('USER_ROLE_FORBIDDEN');
    });

    it('GESTOR atinge o patamar ADMIN e segue avaliação (nunca para em USER_ROLE_FORBIDDEN)', async () => {
      const { user } = await makeUserWithJobRole('BITRIX_GUARDIAN', 'GESTOR');
      const decision = await authorizeCapability({
        actor: actorFor(user),
        agentCode: 'bitrix-guardian',
        capabilityCode: 'bitrix.configure',
      });
      expect(decision.reason).not.toBe('USER_ROLE_FORBIDDEN');
    });

    it('ADMIN (UserRole) não pula nenhuma etapa funcional — sem AgentCapabilityGrant, ADMIN também é negado', async () => {
      const { user } = await makeUserWithJobRole('LDR', 'ADMIN');
      const decision = await authorizeCapability({
        actor: actorFor(user),
        agentCode: 'contract-signature',
        capabilityCode: 'contract.read',
      });
      expect(decision.allowed).toBe(false);
      expect(decision.reason).toBe('AGENT_NOT_GRANTED_TO_ROLE');
    });
  });

  describe('agente compartilhado por múltiplos cargos (shared agent)', () => {
    it('o mesmo agente concedido a dois cargos produz decisões independentes por cargo', async () => {
      // "knowledge" é um dos 6 agentes comuns aos 12 cargos (PROMPT 2) — EXECUTE só no cargo dono
      // (BITRIX_GUARDIAN por fallback de domínio), READ nos demais.
      const { user: ldrUser } = await makeUserWithJobRole('LDR', 'SDR');
      const { user: bitrixUser } = await makeUserWithJobRole('BITRIX_GUARDIAN', 'GESTOR');

      const ldrDecision = await authorizeCapability({
        actor: actorFor(ldrUser),
        agentCode: 'knowledge',
        capabilityCode: 'agent.discover',
      });
      const bitrixDecision = await authorizeCapability({
        actor: actorFor(bitrixUser),
        agentCode: 'knowledge',
        capabilityCode: 'agent.discover',
      });

      // Ambos os cargos têm RoleAgentGrant para "knowledge" (piso comum), e "agent.discover" é
      // universal — ambos permitidos, mas avaliados de forma independente (grants distintos).
      expect(ldrDecision.allowed).toBe(true);
      expect(bitrixDecision.allowed).toBe(true);
      expect(ldrDecision.agent?.code).toBe(bitrixDecision.agent?.code);
    });
  });

  describe('segurança — UserRole primacy e isolamento de tenant', () => {
    it('a autorização de capability nunca altera UserRole de nenhum usuário', async () => {
      const { user } = await makeUserWithJobRole('LDR', 'VISUALIZADOR');
      await authorizeCapability({
        actor: actorFor(user),
        agentCode: 'ldr-intelligence',
        capabilityCode: 'lead.read',
      });
      const reloaded = await prisma.user.findUnique({ where: { id: user.id } });
      expect(reloaded?.role).toBe('VISUALIZADOR');
    });

    it('VISUALIZADOR (UserRole) não atinge o patamar mínimo SDR de uma capability EXECUTE', async () => {
      const { user } = await makeUserWithJobRole('LDR', 'VISUALIZADOR');
      const decision = await authorizeCapability({
        actor: actorFor(user),
        agentCode: 'ldr-intelligence',
        capabilityCode: 'lead.enrich',
      });
      expect(decision.allowed).toBe(false);
      expect(decision.reason).toBe('USER_ROLE_FORBIDDEN');
    });

    it('isolamento de tenant: um JobRole de outra organização nunca autoriza nesta organização', async () => {
      const otherUser = await requestContext.run({ bypassRls: true }, async () => {
        await prisma.organization.upsert({
          where: { id: OTHER_ORG_ID },
          update: {},
          create: { id: OTHER_ORG_ID, name: 'Outra Org — Capability Test' },
        });
        return prisma.user.create({
          data: {
            name: 'Usuário Outro Tenant',
            email: `capability.test.outro-tenant.${Date.now()}@test.com`,
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

      // O actor é resolvido com o organizationId de OTHER_ORG_ID (correto), mas a query de
      // authorizeCapability busca UserJobRole por (organizationId, userId) — nunca "vaza" para
      // ORG_ID. O teste real de isolamento é: um decisor que usa por engano o organizationId de
      // ORG_ID para este userId (de outra org) nunca encontra o cargo real.
      const decision = await authorizeCapability({
        actor: { userId: otherUser.id, organizationId: ORG_ID, userRole: 'SDR' },
        agentCode: 'ldr-intelligence',
        capabilityCode: 'lead.read',
      });
      expect(decision.allowed).toBe(false);
      expect(decision.reason).toBe('NO_JOB_ROLE');

      // E com o organizationId real (OTHER_ORG_ID) — chamado de dentro do contexto de tenant
      // correto, como uma requisição HTTP real faria via `authenticateToken`
      // (`requestContext.run({ tenantId: user.organizationId }, ...)` por requisição; aqui
      // simulado explicitamente porque este teste chama o service direto, sem passar pelo Express)
      // — o mesmo usuário É autorizado normalmente, provando que a negação acima foi isolamento de
      // tenant, não um bug genérico.
      const realDecision = await requestContext.run({ tenantId: OTHER_ORG_ID }, () =>
        authorizeCapability({
          actor: { userId: otherUser.id, organizationId: OTHER_ORG_ID, userRole: 'SDR' },
          agentCode: 'ldr-intelligence',
          capabilityCode: 'lead.read',
        }),
      );
      expect(realDecision.allowed).toBe(true);

      await requestContext.run({ tenantId: OTHER_ORG_ID }, () =>
        prisma.userJobRole.deleteMany({ where: { userId: otherUser.id } }),
      );
      await requestContext.run({ bypassRls: true }, async () => {
        await prisma.user.delete({ where: { id: otherUser.id } });
        await prisma.organization.delete({ where: { id: OTHER_ORG_ID } });
      });
    });
  });

  describe('robustez contra entrada maliciosa (prompt injection / valores arbitrários)', () => {
    it('capabilityCode com conteúdo de injeção nunca corresponde a uma capability real (nega, não quebra)', async () => {
      const { user } = await makeUserWithJobRole('LDR', 'SDR');
      const maliciousCodes = [
        'lead.read\'; DROP TABLE "CapabilityDefinition"; --',
        '{{__proto__.polluted}}',
        'lead.read\nagent.execute',
      ];
      for (const capabilityCode of maliciousCodes) {
        const decision = await authorizeCapability({
          actor: actorFor(user),
          agentCode: 'ldr-intelligence',
          capabilityCode,
        });
        expect(decision.allowed).toBe(false);
        expect(decision.reason).toBe('UNKNOWN_CAPABILITY');
      }
      // A tabela real continua intacta — a tentativa de injeção não teve efeito nenhum.
      const stillThere = await prisma.capabilityDefinition.findUnique({
        where: { code: 'lead.read' },
      });
      expect(stillThere).not.toBeNull();
    });

    it('resource arbitrário no payload nunca sobrescreve a identidade do actor', async () => {
      const { user } = await makeUserWithJobRole('LDR', 'SDR');
      const decision = await authorizeCapability({
        actor: actorFor(user),
        agentCode: 'ldr-intelligence',
        capabilityCode: 'lead.read',
        resource: { organizationId: 'org-injetado', userId: 'user-injetado', userRole: 'ADMIN' },
      });
      expect(decision.actor.organizationId).toBe(ORG_ID);
      expect(decision.actor.userId).toBe(user.id);
      expect(decision.actor.userRole).toBe('SDR');
      expect(decision.allowed).toBe(true);
    });
  });

  describe('cobertura por cargo — todos os 12 recebem ao menos uma RoleCapabilityGrant', () => {
    it('todos os 12 cargos canônicos têm ao menos uma capability concedida', async () => {
      for (const code of JOB_ROLE_CODES) {
        const jobRole = await getJobRoleByCode(code);
        const count = await prisma.roleCapabilityGrant.count({ where: { jobRoleId: jobRole!.id } });
        expect(count, `cargo ${code} deveria ter ao menos 1 capability concedida`).toBeGreaterThan(
          0,
        );
      }
    });
  });
});
