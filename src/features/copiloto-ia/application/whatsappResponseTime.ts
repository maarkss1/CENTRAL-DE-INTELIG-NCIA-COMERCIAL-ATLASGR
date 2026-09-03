/**
 * "Tempo de resposta" (Onda 7, AGENT_13 do pacote) — lacuna confirmada real: não existia NENHUM
 * cálculo de SLA/tempo de primeira resposta sobre `WhatsAppMessage` em nenhum lugar do
 * repositório antes desta onda (busca ampla feita antes de escrever este arquivo). Função pura e
 * determinística — não depende de IA, só aritmética sobre timestamps já persistidos.
 *
 * Semântica: uma "rajada" de mensagens INBOUND consecutivas do lead conta como UM ciclo de espera
 * (medido a partir da PRIMEIRA mensagem da rajada, não da última) — três mensagens seguidas do
 * lead sem resposta do time não deveriam contar como três SLAs distintos, é um único atendimento
 * pendente. Uma mensagem OUTBOUND sem nenhum inbound pendente é o time sendo proativo (ex.:
 * follow-up de cadência) — não entra no cálculo de tempo de resposta.
 */
export interface WhatsAppMessageTiming {
  direction: 'inbound' | 'outbound';
  receivedAt: Date;
}

export interface WhatsAppResponseTimeStats {
  /** Da primeira mensagem do lead até a primeira resposta do time, em toda a thread — `null` se
   * o time nunca respondeu ainda (não fabricado). */
  firstResponseMs: number | null;
  averageResponseMs: number | null;
  medianResponseMs: number | null;
  /** Quantos ciclos inbound→resposta entraram no cálculo. */
  sampleCount: number;
  /** Há uma rajada de mensagens do lead agora mesmo sem resposta do time. */
  hasPendingResponse: boolean;
  /** Há quanto tempo a rajada pendente está esperando (relativo a `now`) — `null` se não há
   * pendência. */
  pendingSinceMs: number | null;
}

export function computeWhatsAppResponseTimeStats(
  messages: WhatsAppMessageTiming[],
  now: Date = new Date(),
): WhatsAppResponseTimeStats {
  const sorted = [...messages].sort((a, b) => a.receivedAt.getTime() - b.receivedAt.getTime());

  const gaps: number[] = [];
  let firstResponseMs: number | null = null;
  let pendingInboundAt: Date | null = null;

  for (const message of sorted) {
    if (message.direction === 'inbound') {
      // Só a PRIMEIRA mensagem de uma rajada marca o início da espera — mensagens seguintes do
      // mesmo lead antes de qualquer resposta não reiniciam o relógio.
      if (!pendingInboundAt) pendingInboundAt = message.receivedAt;
    } else if (pendingInboundAt) {
      const gap = message.receivedAt.getTime() - pendingInboundAt.getTime();
      gaps.push(gap);
      if (firstResponseMs === null) firstResponseMs = gap;
      pendingInboundAt = null;
    }
    // outbound sem inbound pendente = mensagem proativa do time (ex.: cadência) — não é resposta
    // a nada, não entra no cálculo de tempo de resposta.
  }

  const sortedGaps = [...gaps].sort((a, b) => a - b);
  const averageResponseMs = gaps.length
    ? Math.round(gaps.reduce((sum, gap) => sum + gap, 0) / gaps.length)
    : null;
  const medianResponseMs = sortedGaps.length
    ? sortedGaps.length % 2 === 1
      ? sortedGaps[(sortedGaps.length - 1) / 2]
      : Math.round((sortedGaps[sortedGaps.length / 2 - 1] + sortedGaps[sortedGaps.length / 2]) / 2)
    : null;

  return {
    firstResponseMs,
    averageResponseMs,
    medianResponseMs,
    sampleCount: gaps.length,
    hasPendingResponse: pendingInboundAt !== null,
    pendingSinceMs: pendingInboundAt ? now.getTime() - pendingInboundAt.getTime() : null,
  };
}
