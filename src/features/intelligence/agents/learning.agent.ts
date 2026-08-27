import { SystemMessage, HumanMessage } from '@langchain/core/messages';
import { getAiModel } from '../../../lib/ai/gateway.js';
import { prisma } from '../../../lib/prisma.js';
import { logger } from '../../../lib/logger.js';
import { saveAgentMemory, loadAgentMemory } from './agentMemory.store.js';
import { assertPiiExternalConsent } from '../services/guardrails.service.js';

// AgentMemory não tem colunas dedicadas para "perfil de aprendizado", mas sessionId+agentType já
// bastam pra guardar um registro por (tenant, ator) sem precisar de migração nova.
function learningProfileSessionId(tenantId: string, actorId: string): string {
    return `learning-profile:${tenantId}:${actorId}`;
}

interface LearningProfilePayload {
    guidelines: string;
    updatedAt: string;
}

/**
 * Lê as diretrizes de estilo aprendidas para um (tenant, ator), se existirem.
 * Usado pelos agentes SDR/BDR/CRM para incorporar o estilo do usuário no system prompt.
 * Best-effort: falhas de leitura nunca devem interromper o agente que está consultando.
 */
export async function getLearningProfile(tenantId: string, actorId: string): Promise<string | null> {
    try {
        const memory = await loadAgentMemory({
            sessionId: learningProfileSessionId(tenantId, actorId),
            agentType: 'LEARNING_PROFILE',
            organizationId: tenantId,
        });
        const payload = memory?.messages as unknown as LearningProfilePayload | undefined;
        return payload?.guidelines?.trim() || null;
    } catch (error) {
        logger.warn({ err: error, tenantId, actorId }, 'Failed to read learning profile');
        return null;
    }
}

/**
 * LearningAgent (Self-Reflection)
 * Este agente roda em background para observar as ações manuais do usuário (via AuditLog)
 * e sintetizar um "Manual de Estilo" dinâmico.
 * Esse manual (Few-Shot) é persistido em AgentMemory e injetado nos agentes SDR/BDR/CRM
 * (via getLearningProfile) para que eles ajam de acordo com o estilo do usuário humano.
 */
export class LearningAgent {
    async reflectAndLearn(actorId: string, tenantId: string) {
        // AI-007 (parte 3): mesmo gate fail-closed já em vigor em base.agent.ts/
        // sdrQualification.agent.ts/ops.agent.ts/supervisor.agent.ts — até esta correção, este era
        // o único dos agentes do enxame que montava e enviava um prompt a um provedor de IA externo
        // (getAiModel) sem nenhuma checagem de base legal LGPD. `AuditLog.details` rotineiramente
        // carrega PII real de um titular (nome/e-mail/telefone de lead ou contato citado nos
        // detalhes de uma ação manual do vendedor — ex: "Lead atualizado: contato joão@empresa.com"),
        // então o mesmo risco que motivou a checagem nos demais agentes se aplica aqui.
        try {
            assertPiiExternalConsent(tenantId);
        } catch (error) {
            logger.warn({ err: error, actorId, tenantId }, 'LearningAgent bloqueado: sem base legal LGPD registrada para enviar dado pessoal (AuditLog) a provedor de IA externo.');
            return null;
        }

        try {
            // Busca as últimas 50 ações manuais do usuário (ex: mudanças de lead, qualificações, e-mails enviados)
            const recentActions = await prisma.auditLog.findMany({
                where: { actorId, tenantId },
                orderBy: { timestamp: 'desc' },
                take: 50,
            });

            if (recentActions.length === 0) {
                return null;
            }

            const actionsText = recentActions.map(a => 
                `[Ação: ${a.action}] Entidade: ${a.entity} | Detalhes: ${JSON.stringify(a.details)}`
            ).join('\n');

            const model = getAiModel('local-llama3-fast', 0.1, 'learning-agent');
            const systemPrompt = new SystemMessage(
                `Você é o Agente de Reflexão (Learning Agent) da Atlas.
Sua missão é analisar o log de ações manuais de um usuário humano no CRM e deduzir o "Estilo de Qualificação e Vendas" dele.
Descubra padrões: Como ele classifica um lead? O que faz ele descartar um lead? Que tom ele usa?
Gere um parágrafo denso e direto contendo as DIRETRIZES DE ESTILO APRENDIDAS. Estas diretrizes serão injetadas no Agente SDR autônomo para clonar o comportamento do usuário.`
            );

            const response = await model.invoke([
                systemPrompt,
                new HumanMessage(`Ações manuais recentes do usuário no CRM:\n${actionsText}`)
            ]);

            const learnedStyle = response.content.trim();

            // Persiste as diretrizes aprendidas em AgentMemory para os outros agentes carregarem
            // dinamicamente via getLearningProfile (um registro por tenant+ator, sobrescrito a cada reflexão).
            await this.persistProfile(tenantId, actorId, learnedStyle);

            logger.info({ actorId, tenantId }, 'LearningAgent updated user style guidelines successfully.');

            return learnedStyle;

        } catch (error) {
            logger.error({ err: error }, 'LearningAgent failed to reflect and learn');
            return null;
        }
    }

    // AI-003: delega para o upsert atômico compartilhado — não engole mais erro localmente; quem
    // chama (`reflectAndLearn`) já tem seu próprio try/catch que loga e devolve null em qualquer
    // falha, então o comportamento observável não muda, só deixa de haver dois pontos de log
    // silenciosos para o mesmo tipo de falha.
    private async persistProfile(tenantId: string, actorId: string, guidelines: string): Promise<void> {
        const sessionId = learningProfileSessionId(tenantId, actorId);
        const payload: LearningProfilePayload = { guidelines, updatedAt: new Date().toISOString() };
        await saveAgentMemory({
            sessionId,
            agentType: 'LEARNING_PROFILE',
            organizationId: tenantId,
            messages: payload,
            status: 'Completed',
        });
    }
}
