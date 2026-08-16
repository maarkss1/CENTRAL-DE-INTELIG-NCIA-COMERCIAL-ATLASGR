import type { Lead } from '@prisma/client';

/**
 * Ordem de urgência das etapas do funil de Lead (SDR) — quanto menor o índice, mais cedo aparece
 * na fila. `Lead_Desqualificado` e `Convertido_em_Oportunidade` nunca chegam aqui (já filtrados
 * na query — ver mesaTratamento.routes.ts), mas ficam no fim só por segurança caso um dia entrem.
 */
const STAGE_URGENCY: Record<string, number> = {
    Reuniao_Agendada: 0,
    Qualificacao_SDR: 1,
    Cadencia_Iniciada: 2,
    Lead_Recebido: 3,
};

const TEMPERATURE_WEIGHT: Record<string, number> = {
    Quente: 0,
    Morno: 1,
    Frio: 2,
};

function daysSince(date: Date | null): number {
    if (!date) return Number.MAX_SAFE_INTEGER; // nunca tocado = máxima prioridade de resgate
    return Math.floor((Date.now() - date.getTime()) / 86_400_000);
}

/**
 * Ordena a fila do SDR: etapa mais urgente primeiro, depois quem está há mais tempo sem toque
 * (`lastInteraction`), com temperatura como desempate final. Critério simples e auditável — sem
 * pontuação numérica opaca (essa fica pra uma próxima rodada, ver AGENTS.md desta pasta).
 */
export function rankLeadsForQueue<T extends Pick<Lead, 'status' | 'lastInteraction' | 'temperature'>>(
    leads: T[],
): T[] {
    return [...leads].sort((a, b) => {
        const stageDiff = (STAGE_URGENCY[a.status] ?? 99) - (STAGE_URGENCY[b.status] ?? 99);
        if (stageDiff !== 0) return stageDiff;

        const touchDiff = daysSince(b.lastInteraction) - daysSince(a.lastInteraction);
        if (touchDiff !== 0) return touchDiff;

        return (TEMPERATURE_WEIGHT[a.temperature ?? ''] ?? 3) - (TEMPERATURE_WEIGHT[b.temperature ?? ''] ?? 3);
    });
}
