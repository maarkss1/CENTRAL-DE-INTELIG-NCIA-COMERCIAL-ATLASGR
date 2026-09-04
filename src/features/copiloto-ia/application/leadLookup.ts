/**
 * Onda 7 — a extensão Chrome não tem busca de Lead por nome ainda (débito conhecido, ver
 * `chrome-extension/README.md`); em vez de exigir o id cru da Central colado à mão, aceita
 * também um e-mail do contato ou uma URL de lead/negócio do Bitrix24 — as duas formas que um
 * vendedor já tem à mão durante uma ligação/reunião. Função pura e determinística, sem I/O — só
 * classifica o texto digitado; quem resolve de fato é `PrismaCopilotoIaRepository.findLeadByLookup`.
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
