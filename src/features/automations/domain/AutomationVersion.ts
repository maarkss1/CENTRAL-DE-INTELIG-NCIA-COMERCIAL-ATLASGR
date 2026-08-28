import type { AutomationTriggerLabel, AutomationActionLabel } from '../../../lib/enumMap';

/**
 * Histórico de versões da REGRA de uma automação (trigger/condições/ação/config), não das
 * execuções dela — isso já existe via `AuditLog`/`automation-history.service.ts`. Este arquivo
 * define o contrato de persistência; a implementação real (Postgres) depende de um model novo
 * (`AutomationVersion`) que ainda não existe em `prisma/schema.prisma` — ver handoff
 * `.agents/handoffs/onda-42/07-para-00-automation-versioning.md`. Até esse handoff ser resolvido,
 * `infra/InMemoryAutomationVersionStore.ts` é a única implementação (protótipo, não sobrevive a
 * reinício do processo) — mesmo padrão já usado neste repo para `ForecastSnapshotStore`
 * (`src/features/commercial-intelligence/domain/CommercialIntelligence.ts`).
 */

/** Estado da regra num dado momento — os mesmos 6 campos editáveis de `Automation`. */
export interface AutomationVersionSnapshot {
  name: string;
  enabled: boolean;
  trigger: AutomationTriggerLabel;
  conditions: unknown;
  action: AutomationActionLabel;
  actionConfig: unknown;
}

/** Motivo pelo qual este snapshot virou histórico: a regra foi editada, ou foi removida. */
export type AutomationVersionChangeReason = 'update' | 'delete';

export interface AutomationVersionRecord extends AutomationVersionSnapshot {
  id: string;
  automationId: string;
  organizationId: string;
  /**
   * Quem fez a edição/remoção que tornou este snapshot histórico (não quem criou o estado
   * snapshotado). Sem FK de propósito na proposta de schema — mesmo raciocínio de
   * `OrganizationFeatureFlag.updatedByUserId`/`BugReport.userId`: o histórico deve sobreviver à
   * remoção do usuário.
   */
  editedByUserId: string | null;
  editedByEmail: string | null;
  changeReason: AutomationVersionChangeReason;
  createdAt: Date;
}

export type AutomationVersionInput = Omit<AutomationVersionRecord, 'id' | 'createdAt'>;

export interface AutomationVersionStore {
  /** Grava um snapshot histórico. Append-only — nunca atualiza um registro existente. */
  record(input: AutomationVersionInput): Promise<void>;
  /** Histórico de UMA automação, mais recente primeiro. `limit` protege contra regra editada
   *  centenas de vezes sem paginação real (fora de escopo hoje — lista sempre coube numa tela). */
  listByAutomation(
    organizationId: string,
    automationId: string,
    limit?: number,
  ): Promise<AutomationVersionRecord[]>;
}

/** Uma diferença de campo entre dois snapshots, já formatada em texto (diff textual básico, ver
 *  CLAUDE.md/escopo da tarefa — não é diff visual). */
export interface AutomationDiffLine {
  field: string;
  before: string;
  after: string;
}

/** Serializa um valor de campo de forma estável e legível para exibir num diff textual. Objetos
 *  (`conditions`/`actionConfig`) viram JSON com chaves ordenadas, para não gerar "diferença" falsa
 *  só porque o Postgres devolveu as chaves em outra ordem. */
function stringifyForDiff(value: unknown): string {
  if (value == null) return '—';
  if (typeof value === 'string') return value;
  if (typeof value !== 'object') return String(value);
  const sortKeys = (input: unknown): unknown => {
    if (Array.isArray(input)) return input.map(sortKeys);
    if (input != null && typeof input === 'object') {
      return Object.fromEntries(
        Object.entries(input as Record<string, unknown>)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([k, v]) => [k, sortKeys(v)]),
      );
    }
    return input;
  };
  const sorted = sortKeys(value);
  return Object.keys(sorted as object).length === 0 ? '—' : JSON.stringify(sorted);
}

const FIELD_LABELS: Record<keyof AutomationVersionSnapshot, string> = {
  name: 'Nome',
  enabled: 'Status',
  trigger: 'Gatilho',
  conditions: 'Condições',
  action: 'Ação',
  actionConfig: 'Configuração da ação',
};

/**
 * Diff textual básico entre dois estados da mesma regra: uma linha por campo que mudou, omitindo
 * os campos idênticos. `enabled` vira "ativa"/"pausada" em vez de `true`/`false` cru, para o
 * histórico ler como frase, não como JSON de banco.
 */
export function diffAutomationSnapshots(
  before: AutomationVersionSnapshot,
  after: AutomationVersionSnapshot,
): AutomationDiffLine[] {
  const lines: AutomationDiffLine[] = [];
  (Object.keys(FIELD_LABELS) as Array<keyof AutomationVersionSnapshot>).forEach((field) => {
    const rawBefore = field === 'enabled' ? (before.enabled ? 'ativa' : 'pausada') : before[field];
    const rawAfter = field === 'enabled' ? (after.enabled ? 'ativa' : 'pausada') : after[field];
    const beforeText = stringifyForDiff(rawBefore);
    const afterText = stringifyForDiff(rawAfter);
    if (beforeText !== afterText) {
      lines.push({ field: FIELD_LABELS[field], before: beforeText, after: afterText });
    }
  });
  return lines;
}
