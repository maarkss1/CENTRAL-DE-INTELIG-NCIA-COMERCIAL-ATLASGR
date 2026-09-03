/**
 * Contrato de composição entre `src/features/integrations/birth-voice/` (dono do resultado real
 * da ligação: Note/Activity/TimelineEvent, isso NUNCA muda) e `src/features/copiloto-ia/` (Onda 7,
 * item 2 do pacote `atlasgr_copiloto_ai_pack` — "ponte ligações → Copiloto"). Mesmo raciocínio de
 * `bitrixWriteback.contract.ts`/`meetingSynthesis.contract.ts`: é uma PORTA (padrão hexagonal), não
 * um DTO compartilhado — `birth-voice` depende só desta interface, nunca de
 * `copiloto-ia/application|infra|domain` diretamente (proibido por `.dependency-cruiser.cjs`,
 * regra `no-cross-feature-imports`). A implementação real (`CopilotoVoiceIngestionAdapter`, dono:
 * feature `copiloto-ia`) é registrada em `src/shared/di/setup.ts` — o único lugar com licença de
 * importar as duas features ao mesmo tempo.
 *
 * Consentimento (LGPD) é um campo de ENTRADA desta porta, não uma decisão tomada aqui: quem grava
 * a ligação (Bland/Birth Voices Hub) e sabe o vocabulário exato de "a IA avisou que grava" e "o
 * lead recusou" é `birth-voice` (`detectRecordingConsent`/`detectRecordingConsentFromRawTranscript`
 * em `birthVoice.helpers.ts`) — `copiloto-ia` só honra o resultado dessa classificação: `GRANTED`
 * grava transcrição/gera insights, `DECLINED`/`PENDING` registram a chamada sem processar nenhum
 * conteúdo (ver `CopilotoVoiceIngestionAdapter` para o comportamento exato de cada status).
 */
export type VoiceCallConsentStatus = 'GRANTED' | 'DECLINED' | 'PENDING';

export interface VoiceCallConsentInput {
  status: VoiceCallConsentStatus;
  /** Trecho da transcrição que motivou a classificação (recusa) ou `null` quando não aplicável. */
  evidence: string | null;
}

export interface VoiceCallTranscriptTurn {
  speaker: 'assistant' | 'lead';
  text: string;
}

export interface VoiceCallIngestionInput {
  /** `call_id`/`callSid` do provedor — vira `externalMeetingId` da conversa, para rastreabilidade. */
  providerCallId: string;
  leadId: string;
  /** Transcrição segmentada por locutor, quando o provedor entrega (Birth Voices Hub). */
  turns?: VoiceCallTranscriptTurn[];
  /** Transcrição bruta sem segmentação por locutor (Bland, formato legado) — usada só quando
   * `turns` não está disponível. */
  rawTranscript?: string;
  durationSeconds: number;
  consent: VoiceCallConsentInput;
}

export interface CopilotoVoiceIngestionPort {
  /**
   * Ingere o resultado de uma ligação de voz automatizada no Copiloto Comercial IA. Pode lançar
   * (ex.: falha da chamada de IA de extração) — o chamador (webhook de `birth-voice`) SEMPRE
   * envolve esta chamada em try/catch, exatamente como já faz para `sendWhatsAppMessage`: esta
   * ingestão é um efeito colateral secundário, nunca pode derrubar o registro real do resultado da
   * ligação (Note/Activity/TimelineEvent, que já foi gravado antes desta chamada).
   */
  ingestCallResult(organizationId: string, input: VoiceCallIngestionInput): Promise<void>;
}
