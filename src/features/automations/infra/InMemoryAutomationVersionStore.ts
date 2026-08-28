import { randomUUID } from 'node:crypto';
import type {
  AutomationVersionInput,
  AutomationVersionRecord,
  AutomationVersionStore,
} from '../domain/AutomationVersion';

/**
 * Implementação em memória de `AutomationVersionStore` — PROTÓTIPO, não persistência real.
 *
 * Existe porque o versionamento de regras (Onda 42 — dossiê CPI DEC-14, opção A) precisa de um
 * model novo no Postgres (`AutomationVersion`) e `prisma/schema.prisma` tem dono exclusivo (Agente
 * 01 — ver `/AGENTS.md` → "Propriedade exclusiva de arquivos"). A proposta de schema está em
 * `.agents/handoffs/onda-42/07-para-00-automation-versioning.md`; enquanto esse handoff não é
 * resolvido, esta classe é a ÚNICA implementação em uso, e os dados somem a cada reinício do
 * processo — documentado, não é para produção real depender disto para reter histórico.
 *
 * Mesmo padrão já usado neste repo para o mesmo tipo de bloqueio: `ForecastSnapshotStore` nasceu
 * como `InMemoryForecastSnapshotStore.ts` (Onda 39) até o schema correspondente ser aprovado; hoje
 * já tem `PrismaForecastSnapshotStore.ts` como implementação real. O caminho aqui é o mesmo: assim
 * que `AutomationVersion` existir no schema, troca-se a instância exportada em
 * `automation-versioning.service.ts` por uma `PrismaAutomationVersionStore` — nenhum outro arquivo
 * desta feature precisa mudar, porque tudo depende só da interface `AutomationVersionStore`.
 */
export class InMemoryAutomationVersionStore implements AutomationVersionStore {
  private records: AutomationVersionRecord[] = [];

  async record(input: AutomationVersionInput): Promise<void> {
    // Append-only — nunca sobrescreve um snapshot existente.
    this.records.push({ ...input, id: randomUUID(), createdAt: new Date() });
  }

  async listByAutomation(
    organizationId: string,
    automationId: string,
    limit = 100,
  ): Promise<AutomationVersionRecord[]> {
    // Duas edições podem cair no mesmo milissegundo (ex.: testes, ou automação de import em
    // lote) — `createdAt` sozinho empataria. `.reverse()` antes do sort estável garante que, em
    // caso de empate exato de timestamp, a inserção mais recente continua vencendo (Array.sort
    // é estável desde ES2019: um empate preserva a ordem relativa de entrada, que já é
    // "mais recente primeiro" depois do reverse).
    return this.records
      .filter((r) => r.organizationId === organizationId && r.automationId === automationId)
      .slice()
      .reverse()
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, limit);
  }
}
