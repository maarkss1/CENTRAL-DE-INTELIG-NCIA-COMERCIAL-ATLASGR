// PROMPT 4 — Agent Runtime Genérico.
//
// Fluxo obrigatório (regra do prompt da onda), implementado exatamente nesta ordem:
//   actor autenticado → JobRole → AgentDefinition → AgentVersion ativa → requestedCapability →
//   CapabilityAuthorizationService → ToolBinding VERIFIED → executor real → facts/evidence →
//   result → audit (persistência em AgentExecution).
//
// Esta função NUNCA decide autorização sozinha — toda decisão vem de `authorizeCapability`
// (PROMPT 3). Nunca duplica um motor de negócio — todo resultado real vem de um executor de
// `toolExecutors.ts`, que por sua vez só chama serviços reais já existentes. Um AgentDefinition
// sem executor registrado (mesmo com capability autorizada) nunca executa — fail closed também
// aqui, não só na camada de autorização.

import type { AgentExecutionStatus } from '@prisma/client';
import { prisma } from '../../../lib/prisma.js';
import { authorizeCapability, type CapabilityDecision } from './capabilityAuthorization.service.js';
import { getPrimaryActiveJobRoleForUser } from './jobRole.service.js';
import { getToolExecutor, type ToolExecutionOutput } from './toolExecutors.js';

export interface AgentExecutionRequest {
  actorId: string;
  organizationId: string;
  /** `UserRole` do ator — sempre resolvido pela rota a partir da sessão autenticada, nunca do body. */
  actorRole: string;
  agentCode: string;
  mission?: string;
  requestedCapability: string;
  resource?: Record<string, unknown>;
  context?: Record<string, unknown>;
  correlationId?: string;
}

export interface AgentExecutionToolCall {
  toolCode: string;
  startedAt: string;
  finishedAt: string;
  ok: boolean;
}

export interface AgentExecutionResultDto {
  executionId: string;
  agentCode: string;
  agentVersion: number | null;
  status: AgentExecutionStatus;
  summary: string;
  facts: ToolExecutionOutput['facts'];
  metrics: ToolExecutionOutput['metrics'];
  evidence: string[];
  risks: unknown[];
  recommendations: unknown[];
  nextActions: string[];
  handoffs: unknown[];
  confidence: number | null;
  missingData: string[];
  policyDecision: CapabilityDecision;
  toolCalls: AgentExecutionToolCall[];
  timestamps: { createdAt: string; completedAt: string | null };
}

function toDto(row: {
  id: string;
  agentCode: string;
  agentVersionNumber: number | null;
  status: AgentExecutionStatus;
  summary: string | null;
  facts: unknown;
  metrics: unknown;
  evidence: unknown;
  risks: unknown;
  recommendations: unknown;
  nextActions: unknown;
  missingData: unknown;
  confidence: number | null;
  policyDecision: unknown;
  toolCalls: unknown;
  createdAt: Date;
  completedAt: Date | null;
}): AgentExecutionResultDto {
  return {
    executionId: row.id,
    agentCode: row.agentCode,
    agentVersion: row.agentVersionNumber,
    status: row.status,
    summary: row.summary ?? '',
    facts: (row.facts as ToolExecutionOutput['facts']) ?? [],
    metrics: (row.metrics as ToolExecutionOutput['metrics']) ?? {},
    evidence: (row.evidence as string[]) ?? [],
    risks: (row.risks as unknown[]) ?? [],
    recommendations: (row.recommendations as unknown[]) ?? [],
    nextActions: (row.nextActions as string[]) ?? [],
    handoffs: [],
    confidence: row.confidence,
    missingData: (row.missingData as string[]) ?? [],
    policyDecision: row.policyDecision as CapabilityDecision,
    toolCalls: (row.toolCalls as AgentExecutionToolCall[]) ?? [],
    timestamps: {
      createdAt: row.createdAt.toISOString(),
      completedAt: row.completedAt?.toISOString() ?? null,
    },
  };
}

/** Mensagem de erro sanitizada — nunca o stack trace bruto (regra "error sanitization" do prompt
 *  da onda), truncada para não estourar o campo nem vazar payload grande. */
function sanitizeError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.slice(0, 500);
}

/** Heurística simples e explicável de confiança — nunca decorativa (regra do contrato
 *  `AgentExecutionResult.confidence`, `commercialAgentTypes.ts`): 0.8 quando o executor não
 *  reportou nenhum dado faltante, 0.4 quando reportou (ex.: recurso não encontrado, forecast não
 *  elegível) — nunca um valor aleatório ou fixo sem relação com o resultado real. */
function computeConfidence(output: ToolExecutionOutput): number {
  return output.missingData.length === 0 ? 0.8 : 0.4;
}

export async function runAgentExecution(
  request: AgentExecutionRequest,
): Promise<AgentExecutionResultDto> {
  // Idempotência: reexecutar com o mesmo correlationId (dentro do mesmo tenant) nunca dispara uma
  // segunda execução real quando a primeira já chegou a um estado terminal — devolve o mesmo
  // resultado já persistido.
  if (request.correlationId) {
    const existing = await prisma.agentExecution.findFirst({
      where: {
        organizationId: request.organizationId,
        correlationId: request.correlationId,
        status: { in: ['SUCCEEDED', 'DENIED', 'FAILED', 'CANCELLED'] },
      },
      include: { agentVersion: { select: { version: true } } },
    });
    if (existing) {
      return toDto({ ...existing, agentVersionNumber: existing.agentVersion?.version ?? null });
    }
  }

  const primaryJobRole = await getPrimaryActiveJobRoleForUser(
    request.organizationId,
    request.actorId,
  );

  // Autoriza ANTES de persistir qualquer coisa — `decision.agent` só vem preenchido quando o
  // AgentDefinition realmente existe (mesmo que inativo/sem grant), então a linha de auditoria
  // sempre reflete o estado real, nunca um FK "inventado" para um agentCode que não existe.
  const decision = await authorizeCapability({
    actor: {
      userId: request.actorId,
      organizationId: request.organizationId,
      userRole: request.actorRole,
    },
    agentCode: request.agentCode,
    capabilityCode: request.requestedCapability,
    resource: request.resource,
  });

  const execution = await prisma.agentExecution.create({
    data: {
      organizationId: request.organizationId,
      actorId: request.actorId,
      actorRole: request.actorRole,
      jobRoleCode: primaryJobRole?.code,
      agentCode: request.agentCode,
      agentDefinitionId: decision.agent?.id,
      capabilityCode: request.requestedCapability,
      mission: request.mission,
      status: decision.allowed ? 'RUNNING' : 'DENIED',
      policyDecision: decision as unknown as object,
      correlationId: request.correlationId,
      ...(decision.allowed
        ? {}
        : { summary: `Execução negada: ${decision.reason}.`, completedAt: new Date() }),
    },
    include: { agentVersion: { select: { version: true } } },
  });

  if (!decision.allowed) {
    return toDto({ ...execution, agentVersionNumber: execution.agentVersion?.version ?? null });
  }

  const agentVersion = await prisma.agentVersion.findFirst({
    where: { agentDefinitionId: decision.agent?.id, status: 'ACTIVE' },
    select: { id: true, version: true, systemPrompt: true },
  });

  if (agentVersion) {
    await prisma.agentExecution.update({
      where: { id: execution.id },
      data: { agentVersionId: agentVersion.id },
    });
  }

  const executor = getToolExecutor(request.requestedCapability);
  if (!executor) {
    // Fail closed também aqui: um binding VERIFIED sem executor real registrado nunca executa —
    // nunca inventa um resultado. Não deveria acontecer em uso normal (todo capability VERIFIED
    // tem um executor em `toolExecutors.ts`), mas a ausência é tratada como falha explícita, não
    // como sucesso silencioso.
    const failed = await prisma.agentExecution.update({
      where: { id: execution.id },
      data: {
        status: 'FAILED',
        summary:
          'Nenhum executor real registrado para esta capability (binding VERIFIED sem adapter).',
        errorMessage: `Nenhum ToolExecutor registrado para "${request.requestedCapability}".`,
        completedAt: new Date(),
      },
      include: { agentVersion: { select: { version: true } } },
    });
    return toDto({ ...failed, agentVersionNumber: failed.agentVersion?.version ?? null });
  }

  const startedAt = new Date();
  try {
    const output = await executor({
      organizationId: request.organizationId,
      actorId: request.actorId,
      resource: request.resource ?? {},
      mission: request.mission,
      context: request.context,
      agentCode: request.agentCode,
      agentVersion: agentVersion
        ? {
            id: agentVersion.id,
            version: agentVersion.version,
            systemPrompt: agentVersion.systemPrompt,
          }
        : null,
    });
    const finishedAt = new Date();
    const toolCalls: AgentExecutionToolCall[] = [
      {
        toolCode: decision.toolCode ?? request.requestedCapability,
        startedAt: startedAt.toISOString(),
        finishedAt: finishedAt.toISOString(),
        ok: true,
      },
    ];

    const succeeded = await prisma.agentExecution.update({
      where: { id: execution.id },
      data: {
        status: 'SUCCEEDED',
        summary: output.summary,
        facts: output.facts as unknown as object,
        metrics: output.metrics as unknown as object,
        evidence: output.evidence as unknown as object,
        missingData: output.missingData as unknown as object,
        toolCalls: toolCalls as unknown as object,
        confidence: computeConfidence(output),
        completedAt: finishedAt,
      },
      include: { agentVersion: { select: { version: true } } },
    });
    return toDto({ ...succeeded, agentVersionNumber: succeeded.agentVersion?.version ?? null });
  } catch (error) {
    const finishedAt = new Date();
    const toolCalls: AgentExecutionToolCall[] = [
      {
        toolCode: decision.toolCode ?? request.requestedCapability,
        startedAt: startedAt.toISOString(),
        finishedAt: finishedAt.toISOString(),
        ok: false,
      },
    ];
    const failed = await prisma.agentExecution.update({
      where: { id: execution.id },
      data: {
        status: 'FAILED',
        errorMessage: sanitizeError(error),
        toolCalls: toolCalls as unknown as object,
        completedAt: finishedAt,
      },
      include: { agentVersion: { select: { version: true } } },
    });
    return toDto({ ...failed, agentVersionNumber: failed.agentVersion?.version ?? null });
  }
}

export async function getAgentExecution(
  organizationId: string,
  executionId: string,
): Promise<AgentExecutionResultDto | null> {
  const row = await prisma.agentExecution.findFirst({
    where: { id: executionId, organizationId },
    include: { agentVersion: { select: { version: true } } },
  });
  if (!row) return null;
  return toDto({ ...row, agentVersionNumber: row.agentVersion?.version ?? null });
}
