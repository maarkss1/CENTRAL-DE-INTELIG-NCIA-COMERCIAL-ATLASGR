/**
 * Onda 7 — classifica o texto que o usuário cola em `GET /leads/lookup` (extensão Chrome) para
 * resolver a UM Lead exato: e-mail do contato, URL de lead/negócio do Bitrix24, ou id cru da
 * Central — as formas que um vendedor já tem à mão durante uma ligação/reunião quando não quer
 * (ou não consegue) digitar o nome. Busca por NOME, que pode retornar vários candidatos, é um
 * fluxo separado (`GET /leads/search` → `searchLeadsByName`), porque um nome não classifica para
 * um resultado único do jeito que e-mail/URL/id classificam. Função pura e determinística, sem
 * I/O — só classifica o texto digitado; quem resolve de fato é
 * `PrismaCopilotoIaRepository.findLeadByLookup`.
 */
export type LeadLookupQuery =
  | { type: 'bitrix'; id: string }
  | { type: 'email'; value: string }
  | { type: 'rawId'; value: string };

/** Bate com `/crm/lead/details/123/` e `/crm/deal/details/123/` em qualquer portal `.bitrix24.*`
 * — a parte que varia entre portais/idiomas é só o domínio, o caminho `/crm/.../details/<id>/` é
 * fixo na UI do Bitrix24. */
const BITRIX_CRM_URL_PATTERN = /\/crm\/(?:lead|deal)\/details\/(\d+)/i;

export function parseLeadLookupQuery(rawQuery: string): LeadLookupQuery {
  const query = rawQuery.trim();
  const bitrixMatch = query.match(BITRIX_CRM_URL_PATTERN);
  if (bitrixMatch) return { type: 'bitrix', id: bitrixMatch[1] };
  if (query.includes('@')) return { type: 'email', value: query };
  return { type: 'rawId', value: query };
}
