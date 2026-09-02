import { prisma } from '../../lib/prisma.js';

/**
 * Ponto único de escrita de `LeadFieldChange` (ver comentário no schema). Mora em `src/shared/`
 * (não em `commercial-intelligence/infra/`) porque é consumido por três features distintas
 * (`crm`, `crm360`, e a própria `commercial-intelligence`, que lê o histórico) — um import
 * cross-feature novo quebraria `no-cross-feature-imports` (docs/architecture/DEPENDENCY_RULES.md);
 * `stageHistory.ts` continua em `commercial-intelligence/infra/` só porque já está na baseline de
 * violações conhecidas. Mesmo desenho daquele helper: chamado pelos pontos do CRM que JÁ alteram
 * `expectedCloseAt`/`owner`
 * (`PrismaLeadRepository.update`, `PrismaCrm360Repository.updateLeadStage`,
 * `LeadUseCases.batchUpdateLeads`, `assignment.service.ts`), nunca por um segundo caminho
 * paralelo que reinterprete "qual é o valor atual" do campo.
 *
 * Só grava quando o valor de fato mudou (comparação normalizada — datas por instante, texto por
 * string). Nunca lança: o histórico é observabilidade, não a fonte de verdade do campo (que
 * continua sendo a coluna em `Lead`).
 */

export type TrackedLeadField = 'expectedCloseAt' | 'owner';

export type FieldChangeSource = 'crm' | 'crm360' | 'batch' | 'round_robin';

export interface TrackedLeadFieldValues {
  expectedCloseAt?: Date | string | null;
  owner?: string | null;
}

function normalizeDate(value: Date | string | null | undefined): string | null {
  if (value == null || value === '') return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function normalizeText(value: string | null | undefined): string | null {
  if (value == null) return null;
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

/** Diferenças entre `previous` e `next` nos campos rastreados — pura, testável sem I/O. */
export function diffTrackedFields(
  previous: TrackedLeadFieldValues,
  next: TrackedLeadFieldValues,
): Array<{ field: TrackedLeadField; previousValue: string | null; newValue: string | null }> {
  const changes: Array<{
    field: TrackedLeadField;
    previousValue: string | null;
    newValue: string | null;
  }> = [];

  // `undefined` em `next` significa "campo não veio no payload" (não foi tocado) — diferente de
  // `null`, que significa "limpou o campo". Só o segundo é uma mudança real.
  if (next.expectedCloseAt !== undefined) {
    const before = normalizeDate(previous.expectedCloseAt);
    const after = normalizeDate(next.expectedCloseAt);
    if (before !== after)
      changes.push({ field: 'expectedCloseAt', previousValue: before, newValue: after });
  }
  if (next.owner !== undefined) {
    const before = normalizeText(previous.owner);
    const after = normalizeText(next.owner);
    if (before !== after) changes.push({ field: 'owner', previousValue: before, newValue: after });
  }
  return changes;
}

export async function recordLeadFieldChanges(
  organizationId: string,
  leadId: string,
  previous: TrackedLeadFieldValues,
  next: TrackedLeadFieldValues,
  options: { changedBy?: string | null; source: FieldChangeSource; now?: Date },
): Promise<void> {
  const changes = diffTrackedFields(previous, next);
  if (changes.length === 0) return;
  const changedAt = options.now ?? new Date();
  try {
    await prisma.leadFieldChange.createMany({
      data: changes.map((change) => ({
        organizationId,
        leadId,
        field: change.field,
        previousValue: change.previousValue,
        newValue: change.newValue,
        changedBy: options.changedBy ?? null,
        source: options.source,
        changedAt,
      })),
    });
  } catch (error) {
    const { logger } = await import('../../lib/logger.js');
    logger.error({ err: error, leadId, organizationId }, 'Falha ao registrar LeadFieldChange');
  }
}
