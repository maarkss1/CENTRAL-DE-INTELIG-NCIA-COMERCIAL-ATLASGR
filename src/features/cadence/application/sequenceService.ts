/**
 * Encerrar uma `CadenceSequence` (Piloto 016, achado fora de escopo — `active`/`deletedAt` já
 * existiam no schema e já eram filtrados em toda leitura (`GET /sequences`, `POST /runs`), mas não
 * existia NENHUMA ação de escrita que os usasse: uma vez criada, uma sequência só podia crescer,
 * nunca ser desligada.
 *
 * Reversível de propósito (`active: false`), não exclusão física: `CadenceSequence` não está em
 * `auditableModels` (`src/lib/prisma.ts`) e `deletedAt` nunca é setado por nenhuma rota existente
 * hoje — inventar um caminho de soft-delete "de verdade" aqui seria um padrão novo sem precedente
 * no módulo, não seguir um já estabelecido. Uma sequência encerrada some de `GET /sequences` e não
 * pode mais ser escolhida em `POST /runs` (mesmo filtro `active: true` de sempre), mas seu
 * histórico (`CadenceRun`s já criados a partir dela) continua intacto e consultável.
 *
 * Idempotente por construção, mesmo espírito de `pauseCadenceRun`/`stopCadenceManually`
 * (`domain/cadence.ts`): encerrar uma sequência já encerrada não é um erro, devolve a própria
 * sequência inalterada em vez de lançar.
 */

export interface CadenceSequenceRow {
  id: string;
  organizationId: string;
  name: string;
  description: string | null;
  touches: unknown;
  active: boolean;
  createdBy: string | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

export interface CadenceSequenceRepository {
  /** `null` quando a sequência não existe, é de outra organização, ou já foi excluída (`deletedAt` setado). */
  findById(organizationId: string, id: string): Promise<CadenceSequenceRow | null>;
  setActive(organizationId: string, id: string, active: boolean): Promise<CadenceSequenceRow>;
}

/**
 * Use case de escrita: encerra (`active: false`) uma sequência da organização do ator. Devolve
 * `null` quando a sequência não existe nesta organização (a rota decide o 404 — este módulo não
 * conhece HTTP). Nunca reativa nem apaga fisicamente.
 */
export async function deactivateCadenceSequence(
  repo: CadenceSequenceRepository,
  organizationId: string,
  id: string,
): Promise<CadenceSequenceRow | null> {
  const sequence = await repo.findById(organizationId, id);
  if (!sequence) return null;
  if (!sequence.active) return sequence; // idempotente — já encerrada
  return repo.setActive(organizationId, id, false);
}
