/**
 * Contrato de composição entre `src/features/copiloto-ia/` e `src/features/integrations/bitrix/`
 * — não é um DTO compartilhado (como os demais arquivos desta pasta), é uma PORTA de dependência
 * (padrão hexagonal): `copiloto-ia` depende só desta interface, nunca de
 * `integrations/bitrix/service/*` diretamente. Import direto de internals de outra feature é
 * proibido por `.dependency-cruiser.cjs` (regra `no-cross-feature-imports`) — "composição entre
 * features acontece via src/shared/ (contratos) ou via chamada HTTP à rota da outra feature, nunca
 * via import direto de application/infra/domain de um módulo vizinho".
 *
 * A implementação real (`BitrixLeadWritebackAdapter`, dono: feature `integrations/bitrix`) é
 * registrada no container de DI em `src/shared/di/setup.ts` — o único lugar do repositório que tem
 * licença para importar de ambas as features ao mesmo tempo (raiz de composição).
 */
export interface BitrixLeadWritebackPort {
  /**
   * Escreve um conjunto de campos customizados (`UF_CRM_*`) num Lead do Bitrix24 já sincronizado.
   * Reaproveita o cliente HTTP com retry/circuit-breaker de `service/client.ts` — o chamador não
   * precisa (e não deve) reimplementar retry.
   *
   * @throws sempre que a escrita não foi confirmada pelo Bitrix (erro definitivo, circuito aberto,
   * tentativas esgotadas) — nunca resolve silenciosamente numa falha parcial.
   */
  updateLeadFields(
    organizationId: string,
    bitrixLeadId: string,
    fields: Record<string, string>,
  ): Promise<void>;
  /** Mesmo contrato de `updateLeadFields`, para `entityType: COMPANY` (Onda 7) — `bitrixCompanyId`
   * só existe para Company importada a partir de um Negócio do Bitrix24 (ver `Company.bitrixCompanyId`
   * no schema). */
  updateCompanyFields(
    organizationId: string,
    bitrixCompanyId: string,
    fields: Record<string, string>,
  ): Promise<void>;
  /** Mesmo contrato de `updateLeadFields`, para `entityType: CONTACT` (Onda 7) — `bitrixContactId`
   * só existe para Contact importado a partir de um Negócio do Bitrix24 (ver `Contact.bitrixContactId`
   * no schema). */
  updateContactFields(
    organizationId: string,
    bitrixContactId: string,
    fields: Record<string, string>,
  ): Promise<void>;
}
