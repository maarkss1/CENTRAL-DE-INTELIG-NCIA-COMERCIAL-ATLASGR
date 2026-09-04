// Camada de CALIBRAÇÃO do Fit Score — NÃO substitui `computeFitScore` (fitScore.ts). A fórmula
// original (pesos hardcoded do playbook comercial: +30 CNPJ ativo, +20 capital social, etc.)
// continua existindo e sendo a única coisa que decide o score/temperatura mostrados no produto.
// Este módulo só RESPONDE, com dado real, à pergunta "historicamente, leads que tiraram nota X de
// fit converteram Y% das vezes?" — auditoria encontrou que essa pergunta nunca era respondida
// (fitScore.ts nunca olhava para won/lost real).
//
// Referência de padrão: `crmEconomicCalibration.ts` (Agente 04/16, módulo Market Intelligence,
// removido do produto) resolvia "calibrar com dado real sem inventar confiança" para o simulador
// econômico de território — este módulo replica a mesma filosofia (níveis de qualidade amostral
// explícitos: INSUFICIENTE/BAIXA/MEDIA/ALTA, nunca um número de confiança fabricado) para o Fit
// Score de prospecção, mas com uma unidade de amostra diferente (fechamento de negócio por faixa
// de score, não série mensal agregada) — por isso nunca importou/reusou o arquivo original, só o
// padrão de design.
//
// Como o outcome real é associado a um fit score (schema real, ver prisma/schema.prisma):
// - `Lead.status` já tem os dois estados terminais do funil Negócio: `Negocios_Ganhos` e
//   `Negocios_Perdidos` (@map "Negócios Ganhos"/"Negócios Perdidos") — o mesmo par que
//   analytics.service.ts, crm360 e lookalike-scoring.service.ts já tratam como won/lost.
// - `Lead.closedAt` é setado só na transição para um desses status (nunca em updates genéricos —
//   ver comentário no schema), então é a data de fechamento real, não um `updatedAt` ruidoso.
// - `Lead.companyId` liga o lead fechado à `Company` prospectada/enriquecida.
//
// LIMITAÇÃO DE PROVENIÊNCIA (documentada, não escondida — ver AGENTS.md raiz, "Preservação de
// conteúdo"/seção de honestidade amostral): `Lead.score` NÃO é uma fonte confiável do fit score
// que este lead tinha quando foi fechado, por dois motivos reais encontrados nesta investigação:
//   1. `Lead.score` é reescrito depois da criação por um sistema DIFERENTE — a qualificação
//      manual do SDR (`calculateLeadScore`, checklist do Playbook Comercial, ver
//      `LeadDetailDrawer.tsx` → handleSaveQualification) usa o MESMO campo `Lead.score` para um
//      score conceitualmente distinto do Fit Score de prospecção.
//   2. Mesmo quando nunca reescrito, `Lead.score` congela o fit score do momento da promoção —
//      não há como saber, sem migração, se aquele valor ainda é o mesmo score que a Company
//      teria se recalculado hoje (ex.: reenriquecimento posterior mudou capital social/porte).
// Por isso este módulo NUNCA lê `Lead.score`. Em vez disso, RECALCULA o fit score atual a partir
// dos campos de `Company` hoje persistidos (mesmo padrão que `buildCachedEnrichmentResult`, em
// enrichment.service.ts, já usa para recalcular fit sem nova chamada paga) — determinístico,
// auditável, e não contaminado pelo score de qualificação do SDR. A troca é: perdemos
// `cnaeDescription` (não persistida em Company, só o código CNAE) e `fleetSizeHint` (input de
// busca, não persistido) — a mesma lacuna já documentada em `buildCachedEnrichmentResult`. Também
// não reconstruímos o score EXATO de quando o negócio fechou: se a Company foi reenriquecida
// depois, o score recalculado reflete o dado mais recente, não um snapshot histórico (não existe
// snapshot de fit score persistido hoje — registrar isso é o item de handoff mais honesto que esta
// missão pode deixar, não fingir uma reconstrução perfeita).
import { prisma } from '../../../../lib/prisma.js';
import { computeFitScore, type FitScoreResult } from './fitScore.js';

export type FitScoreCalibrationQuality = 'INSUFICIENTE' | 'BAIXA' | 'MEDIA' | 'ALTA';

/** Mesmas faixas de temperatura já usadas em `computeFitScore` — a calibração responde pela
 * mesma unidade que o produto já mostra ao usuário (badge Quente/Morno/Frio), em vez de inventar
 * um novo corte de faixas que ninguém vê hoje. */
export type FitScoreTier = FitScoreResult['temperature'];

export const FIT_SCORE_TIER_RANGES: Record<FitScoreTier, [number, number]> = {
  Frio: [0, 44],
  Morno: [45, 74],
  Quente: [75, 100],
};

const TIER_ORDER: FitScoreTier[] = ['Quente', 'Morno', 'Frio'];

function tierForScore(score: number): FitScoreTier {
  if (score >= 75) return 'Quente';
  if (score >= 45) return 'Morno';
  return 'Frio';
}

/** Um negócio real, já fechado (ganho ou perdido), com o fit score associado à sua Company. */
export interface ClosedLeadFitOutcome {
  leadId: string;
  /** Fit score 0-100 — ver limitação de proveniência no cabeçalho do módulo: recalculado a
   * partir da Company atual, nunca lido de `Lead.score`. */
  score: number;
  won: boolean;
  closedAt: Date;
}

export interface FitScoreTierCalibration {
  tier: FitScoreTier;
  scoreRange: [number, number];
  sampleSize: number;
  wonCount: number;
  lostCount: number;
  /** Meses civis (UTC) distintos com pelo menos um fechamento nesta faixa — evita que 30
   * fechamentos no mesmo dia/semana pareçam uma amostra robusta (mesmo raciocínio de
   * `monthsWithClosedSample` em crmEconomicCalibration.ts). */
  distinctMonthsWithClosedSample: number;
  /** Taxa de conversão real observada (%), com 1 casa decimal. `null` quando a amostra desta
   * faixa é INSUFICIENTE — nunca um número fabricado/estimado para preencher a lacuna. */
  observedWinRatePct: number | null;
  quality: FitScoreCalibrationQuality;
  /** Motivos legíveis de por que a faixa não é (ainda) elegível — vazio quando elegível. */
  blockers: string[];
}

export interface FitScoreCalibrationResult {
  totalClosedSample: number;
  fromClosedAt: string | null;
  toClosedAt: string | null;
  tiers: FitScoreTierCalibration[];
}

function monthKey(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

/** Mesmos limiares numéricos de `qualityFor` em crmEconomicCalibration.ts (10/2, 20/3, 50/4) —
 * reaproveitados de propósito para manter um único vocabulário de "amostra suficiente" no
 * produto, em vez de cada calibração inventar seu próprio corte. */
function qualityForTier(sampleSize: number, distinctMonths: number): FitScoreCalibrationQuality {
  if (sampleSize < 10 || distinctMonths < 2) return 'INSUFICIENTE';
  if (sampleSize >= 50 && distinctMonths >= 4) return 'ALTA';
  if (sampleSize >= 20 && distinctMonths >= 3) return 'MEDIA';
  return 'BAIXA';
}

/**
 * Calibra o Fit Score contra outcomes reais de negócios fechados, por faixa de temperatura.
 *
 * Função pura (sem Prisma) — testável sem banco. `fetchClosedLeadFitOutcomes`/
 * `calibrateFitScoreForOrganization`, abaixo, buscam os dados reais e chamam esta função.
 */
export function calibrateFitScoreFromClosedLeads(
  samples: ClosedLeadFitOutcome[],
): FitScoreCalibrationResult {
  const ordered = [...samples].sort((a, b) => a.closedAt.getTime() - b.closedAt.getTime());

  const byTier = new Map<FitScoreTier, ClosedLeadFitOutcome[]>(
    TIER_ORDER.map((tier) => [tier, []]),
  );
  for (const sample of ordered) {
    byTier.get(tierForScore(sample.score))!.push(sample);
  }

  const tiers: FitScoreTierCalibration[] = TIER_ORDER.map((tier) => {
    const points = byTier.get(tier) ?? [];
    const sampleSize = points.length;
    const wonCount = points.filter((p) => p.won).length;
    const lostCount = sampleSize - wonCount;
    const distinctMonths = new Set(points.map((p) => monthKey(p.closedAt))).size;
    const quality = qualityForTier(sampleSize, distinctMonths);
    const eligible = quality !== 'INSUFICIENTE';

    const blockers: string[] = [];
    if (sampleSize < 10) {
      blockers.push(
        `Amostra insuficiente na faixa ${tier}: são necessários ao menos 10 negócios fechados (há ${sampleSize}).`,
      );
    }
    if (distinctMonths < 2) {
      blockers.push(
        `Cobertura temporal insuficiente na faixa ${tier}: são necessários ao menos 2 meses distintos com fechamento (há ${distinctMonths}).`,
      );
    }

    return {
      tier,
      scoreRange: FIT_SCORE_TIER_RANGES[tier],
      sampleSize,
      wonCount,
      lostCount,
      distinctMonthsWithClosedSample: distinctMonths,
      observedWinRatePct:
        eligible && sampleSize > 0 ? Math.round((wonCount / sampleSize) * 1000) / 10 : null,
      quality,
      blockers,
    };
  });

  return {
    totalClosedSample: ordered.length,
    fromClosedAt: ordered.at(0)?.closedAt.toISOString() ?? null,
    toClosedAt: ordered.at(-1)?.closedAt.toISOString() ?? null,
    tiers,
  };
}

/**
 * Busca os negócios fechados (won/lost) do tenant e recalcula o fit score de cada um a partir da
 * Company associada (ver limitação de proveniência no cabeçalho do módulo).
 *
 * `prisma.lead.findMany` passa pela extensão `$allOperations` de `lib/prisma.ts` (RLS por
 * tenant) — mesmo padrão já usado por `enrichment.service.ts`/`prospecting.service.ts` nesta
 * mesma pasta, sem precisar de `withRlsContext` (reservado a `$queryRaw`/`$executeRaw` cru, ver
 * lookalike-scoring.service.ts). O filtro explícito de `organizationId` fica como defesa em
 * profundidade, não como único mecanismo de isolamento.
 */
export async function fetchClosedLeadFitOutcomes(
  organizationId: string,
): Promise<ClosedLeadFitOutcome[]> {
  if (!organizationId) return [];

  const leads = await prisma.lead.findMany({
    where: {
      organizationId,
      deletedAt: null,
      companyId: { not: null },
      closedAt: { not: null },
      status: { in: ['Negocios_Ganhos', 'Negocios_Perdidos'] },
    },
    select: {
      id: true,
      status: true,
      closedAt: true,
      company: {
        select: {
          situacaoCadastral: true,
          capitalSocial: true,
          employeeCount: true,
          segment: true,
          city: true,
          state: true,
          technologies: true,
        },
      },
    },
  });

  const outcomes: ClosedLeadFitOutcome[] = [];
  for (const lead of leads) {
    if (!lead.company || !lead.closedAt) continue;
    const fit = computeFitScore({
      situacaoCadastral: lead.company.situacaoCadastral,
      capitalSocial: lead.company.capitalSocial,
      employeeCountEstimate: lead.company.employeeCount,
      segment: lead.company.segment,
      city: lead.company.city,
      state: lead.company.state,
      technologies: lead.company.technologies,
    });
    outcomes.push({
      leadId: lead.id,
      score: fit.score,
      won: lead.status === 'Negocios_Ganhos',
      closedAt: lead.closedAt,
    });
  }
  return outcomes;
}

/** Atalho de conveniência: busca + calibra, para os consumidores (rota/relatório) que só
 * precisam do resultado final por organização. */
export async function calibrateFitScoreForOrganization(
  organizationId: string,
): Promise<FitScoreCalibrationResult> {
  const outcomes = await fetchClosedLeadFitOutcomes(organizationId);
  return calibrateFitScoreFromClosedLeads(outcomes);
}
