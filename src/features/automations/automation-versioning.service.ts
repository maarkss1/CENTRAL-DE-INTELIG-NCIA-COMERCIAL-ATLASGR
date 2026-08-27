import { logger } from '../../lib/logger.js';
import type { Automation } from './domain/Automation';
import {
    diffAutomationSnapshots,
    type AutomationDiffLine,
    type AutomationVersionChangeReason,
    type AutomationVersionRecord,
    type AutomationVersionSnapshot,
    type AutomationVersionStore,
} from './domain/AutomationVersion';
import { PrismaAutomationVersionStore } from './infra/PrismaAutomationVersionStore.js';

/**
 * Único ponto de composição desta feature — implementação real (Postgres), ver
 * `PrismaAutomationVersionStore`. `InMemoryAutomationVersionStore` continua existindo para os
 * testes unitários deste módulo (não sobrevive a reinício de processo, nunca usada em produção).
 */
const store: AutomationVersionStore = new PrismaAutomationVersionStore();

export interface AutomationVersionActor {
    userId: string | null;
    email: string | null;
}

function snapshotFrom(automation: AutomationVersionSnapshot): AutomationVersionSnapshot {
    return {
        name: automation.name,
        enabled: automation.enabled,
        trigger: automation.trigger,
        conditions: automation.conditions,
        action: automation.action,
        actionConfig: automation.actionConfig,
    };
}

/** Uma entrada do histórico já pronta para a UI: o estado que a regra TINHA, quem/quando trocou
 *  por outra coisa, e o diff textual até o estado que a substituiu (a próxima entrada mais
 *  recente, ou o estado atual da automação quando esta é a edição mais recente). */
export interface AutomationVersionTimelineEntry {
    id: string;
    editedAt: string;
    editedByUserId: string | null;
    editedByEmail: string | null;
    changeReason: AutomationVersionChangeReason;
    snapshot: AutomationVersionSnapshot;
    /** O que mudou desta versão para a versão seguinte (mais recente). */
    diffToNext: AutomationDiffLine[];
}

export interface AutomationVersionTimeline {
    automationId: string;
    current: AutomationVersionSnapshot;
    currentUpdatedAt: string;
    /** Mais recente primeiro. Vazio quando a regra nunca foi editada desde a criação. */
    history: AutomationVersionTimelineEntry[];
}

export const automationVersioningService = {
    /**
     * Registra o estado ANTERIOR de uma automação como uma versão histórica, no momento em que ele
     * está prestes a deixar de ser o estado atual (edição ou remoção). Nunca lança: histórico é
     * auxiliar de auditoria, não pode derrubar a edição/remoção real que o motivou — mesmo
     * raciocínio de `recordHistorySafely` em `automation.engine.ts`.
     */
    async recordPriorState(
        organizationId: string,
        automationId: string,
        priorState: AutomationVersionSnapshot,
        actor: AutomationVersionActor,
        changeReason: AutomationVersionChangeReason,
    ): Promise<void> {
        try {
            await store.record({
                organizationId,
                automationId,
                editedByUserId: actor.userId,
                editedByEmail: actor.email,
                changeReason,
                ...snapshotFrom(priorState),
            });
        } catch (err) {
            logger.error({ err, automationId, organizationId }, 'Falha ao registrar versão anterior da automação.');
        }
    },

    /** Monta a linha do tempo completa (estado atual + histórico com diffs) para a tela. */
    async buildTimeline(organizationId: string, automation: Automation): Promise<AutomationVersionTimeline> {
        const history = await store.listByAutomation(organizationId, automation.id);
        // `listByAutomation` já devolve mais recente primeiro; a versão em `history[0]` é o estado
        // que existia imediatamente antes da automação virar o que é hoje (`current`).
        const entries: AutomationVersionTimelineEntry[] = history.map((record: AutomationVersionRecord, index: number) => {
            const next = index === 0 ? automation : history[index - 1];
            return {
                id: record.id,
                editedAt: record.createdAt.toISOString(),
                editedByUserId: record.editedByUserId,
                editedByEmail: record.editedByEmail,
                changeReason: record.changeReason,
                snapshot: snapshotFrom(record),
                diffToNext: diffAutomationSnapshots(snapshotFrom(record), snapshotFrom(next)),
            };
        });

        return {
            automationId: automation.id,
            current: snapshotFrom(automation),
            currentUpdatedAt: automation.updatedAt.toISOString(),
            history: entries,
        };
    },
};
