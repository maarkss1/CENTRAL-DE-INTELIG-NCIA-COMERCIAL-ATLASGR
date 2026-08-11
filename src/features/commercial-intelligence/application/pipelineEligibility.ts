/**
 * Critério de "Pipeline Elegível" (seção 9 do prompt de produto) — nunca "pipeline aberto =
 * forecast". Só entram negócios com condição mínima real de fechar. Critérios deterministas,
 * baseados em campos que já existem no schema (`Lead`) — nenhum deles é inferido/fabricado.
 */
import type { DealRow } from '../domain/CommercialIntelligence';

/**
 * Limiar de aging crítico por etapa. Hoje é um único valor global (não há SLA configurado por
 * etapa em `CrmPipelineStage` — ver seção 22 do prompt, que dá "7 dias" só como EXEMPLO
 * ilustrativo, não como configuração real do produto). Fabricar um SLA por etapa sem dado real
 * violaria a regra "não inventar histórico/SLA inexistente" — este valor único e documentado é a
 * política inicial até existir configuração de SLA por etapa no pipeline.
 */
export const STAGE_AGING_CRITICAL_DAYS = 45;

export function isDealOpen(deal: DealRow): boolean {
    return !deal.stageIsWon && !deal.stageIsLost && deal.closedAt == null;
}

/**
 * Dias na etapa atual. Usa o histórico real (`daysInCurrentStage`, resolvido pela camada de
 * aplicação a partir de `LeadStageHistory`) quando disponível; cai para `updatedAt` como
 * aproximação quando não há histórico (registro anterior à migration que criou a tabela) — nunca
 * finge ter uma medição exata que não existe.
 */
export function agingInStageDays(deal: DealRow, now: Date, measuredDaysInStage: number | null): number {
    if (measuredDaysInStage != null) return measuredDaysInStage;
    const reference = deal.updatedAt ?? deal.createdAt;
    return Math.max(0, Math.round((now.getTime() - reference.getTime()) / (24 * 60 * 60 * 1000)));
}

export interface EligibilityCheck {
    eligible: boolean;
    reasons: string[];
}

/**
 * Critérios de elegibilidade (todos precisam passar):
 * 1. Negócio aberto (não ganho/perdido).
 * 2. Valor válido (> 0).
 * 3. Data prevista de fechamento preenchida.
 * 4. Responsável preenchido.
 * 5. Próxima ação preenchida.
 * 6. Não excede o aging crítico da etapa atual.
 */
export function checkEligibility(deal: DealRow, now: Date, measuredDaysInStage: number | null): EligibilityCheck {
    const reasons: string[] = [];
    if (!isDealOpen(deal)) reasons.push('Negócio já fechado');
    if (!(deal.amount > 0)) reasons.push('Sem valor válido');
    if (!deal.expectedCloseAt) reasons.push('Sem data prevista de fechamento');
    if (!deal.owner) reasons.push('Sem responsável');
    if (!deal.nextAction) reasons.push('Sem próxima ação registrada');
    const aging = agingInStageDays(deal, now, measuredDaysInStage);
    if (aging > STAGE_AGING_CRITICAL_DAYS) reasons.push(`Acima do aging crítico da etapa (${aging}d > ${STAGE_AGING_CRITICAL_DAYS}d)`);

    return { eligible: reasons.length === 0, reasons };
}
