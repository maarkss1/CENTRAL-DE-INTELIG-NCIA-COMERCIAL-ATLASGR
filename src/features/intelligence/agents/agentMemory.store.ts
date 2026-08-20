import type { Prisma } from '@prisma/client';
import { prisma } from '../../../lib/prisma.js';
import { logger } from '../../../lib/logger.js';

export type SaveAgentMemoryStatus = 'Completed' | 'Failed';

export interface SaveAgentMemoryInput {
    sessionId: string;
    agentType: string;
    organizationId: string | null | undefined;
    messages: unknown;
    status?: SaveAgentMemoryStatus;
    errorMessage?: string | null;
}

const MAX_ERROR_MESSAGE_LENGTH = 500;

function truncateErrorMessage(message: string | null | undefined): string | null {
    if (!message) return null;
    return message.length > MAX_ERROR_MESSAGE_LENGTH ? `${message.slice(0, MAX_ERROR_MESSAGE_LENGTH)}…` : message;
}

/**
 * Ponto único de escrita em AgentMemory (AI-003, onda 31) — substitui o padrão duplicado em 4
 * arquivos (findFirst por sessionId+organizationId, sem agentType, seguido de create/update
 * condicional): esse padrão tinha uma janela de corrida real, já que as duas operações não eram
 * atômicas — duas chamadas concorrentes para o mesmo (sessionId, agentType, organizationId) podiam
 * ambas ver "não existe" no findFirst e ambas criarem uma linha, duplicando o registro. `upsert`
 * sobre a unique constraint (sessionId, agentType, organizationId — ver
 * prisma/migrations/20260820100000_agent_memory_status_and_unique) é uma única operação atômica no
 * Postgres (INSERT ... ON CONFLICT DO UPDATE): a segunda chamada concorrente espera a primeira e
 * aplica seu update sobre a linha que a primeira acabou de criar, nunca cria uma segunda.
 *
 * Nunca engole erro — ao contrário das 4 implementações anteriores, que capturavam qualquer falha
 * num try/catch, logavam e seguiam em frente como se a escrita tivesse funcionado. Quem chama
 * decide se quer capturar; propagar por padrão é o que torna a persistência "honesta": uma falha de
 * escrita fica visível a quem precisava daquela memória existir (ex.: GET /agents/sdr/status
 * consultando o resultado de uma qualificação), não só a uma linha de log que ninguém olha depois.
 */
export async function saveAgentMemory(input: SaveAgentMemoryInput): Promise<void> {
    const organizationId = input.organizationId ?? null;
    const status = input.status ?? 'Completed';
    const errorMessage = truncateErrorMessage(input.errorMessage);
    const messages = input.messages as Prisma.InputJsonValue;

    if (organizationId === null) {
        // Sem tenant conhecido (execução fora de uma requisição autenticada, ou chamador que não
        // passou organizationId explícito) — o Prisma nem aceita `null` na chave composta
        // sessionId_agentType_organizationId (o tipo gerado exige `string`), e a unique constraint
        // do Postgres não protegeria esse caso de qualquer forma (NULL nunca colide com outro NULL
        // num índice único — documentado em prisma/schema.prisma). Fallback ao padrão anterior
        // (findFirst seguido de create/update condicional), mantido só para este caso residual —
        // nenhum caminho de escrita vivo hoje deveria bater aqui em operação normal.
        const existing = await prisma.agentMemory.findFirst({
            where: { sessionId: input.sessionId, agentType: input.agentType, organizationId: null },
        });
        if (existing) {
            await prisma.agentMemory.update({
                where: { id: existing.id },
                data: { messages, status, errorMessage },
            });
        } else {
            await prisma.agentMemory.create({
                data: { sessionId: input.sessionId, agentType: input.agentType, organizationId: null, messages, status, errorMessage },
            });
        }
        return;
    }

    await prisma.agentMemory.upsert({
        where: {
            sessionId_agentType_organizationId: {
                sessionId: input.sessionId,
                agentType: input.agentType,
                organizationId,
            },
        },
        create: {
            sessionId: input.sessionId,
            agentType: input.agentType,
            organizationId,
            messages,
            status,
            errorMessage,
        },
        update: {
            messages,
            status,
            errorMessage,
        },
    });
}

/**
 * Registra o resultado de uma execução que falhou ANTES de gerar mensagens de sucesso (bloqueio de
 * guardrail, erro no grafo LangGraph) — sem isto, nenhuma linha era gravada nesses casos, e
 * GET /agents/sdr/status/:sessionId (o único consumidor real do status de execução) via a sessão
 * como "pending" para sempre, indistinguível de "ainda rodando". Best-effort de propósito: isto já
 * roda dentro do catch de uma falha real que o chamador vai reportar de qualquer forma (via
 * `{success:false,error}`); se a própria gravação da falha falhar, perdemos só o sinal para quem
 * está fazendo polling — não faz sentido derrubar a resposta já decidida por causa disso.
 */
export async function recordAgentFailure(input: {
    sessionId: string;
    agentType: string;
    organizationId: string | null | undefined;
    errorMessage: string;
}): Promise<void> {
    try {
        await saveAgentMemory({
            sessionId: input.sessionId,
            agentType: input.agentType,
            organizationId: input.organizationId,
            messages: [],
            status: 'Failed',
            errorMessage: input.errorMessage,
        });
    } catch (err) {
        logger.error({ err, sessionId: input.sessionId, agentType: input.agentType }, 'Failed to record agent failure in AgentMemory');
    }
}

/** Lê a linha mais recente de uma sessão — sempre no máximo uma, dada a unique constraint acima. */
export async function loadAgentMemory(input: {
    sessionId: string;
    agentType: string;
    organizationId: string | null | undefined;
}) {
    const organizationId = input.organizationId ?? null;
    if (organizationId === null) {
        // Mesmo caso residual documentado em saveAgentMemory acima — sem tenant, sem chave
        // composta possível; cai para o findFirst mais recente por createdAt.
        return prisma.agentMemory.findFirst({
            where: { sessionId: input.sessionId, agentType: input.agentType, organizationId: null },
            orderBy: { createdAt: 'desc' },
        });
    }
    return prisma.agentMemory.findUnique({
        where: {
            sessionId_agentType_organizationId: {
                sessionId: input.sessionId,
                agentType: input.agentType,
                organizationId,
            },
        },
    });
}
