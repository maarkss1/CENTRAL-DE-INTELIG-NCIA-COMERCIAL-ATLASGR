/**
 * Onda 7, item 2 — ponte "ligações (birth-voice/Bland AI) -> Copiloto Comercial IA". Implementa
 * `CopilotoVoiceIngestionPort` (`src/shared/contracts/copilotoVoiceIngestion.contract.ts`) do lado
 * de quem RECEBE o dado — `integrations/birth-voice` só conhece esta interface, nunca este arquivo
 * diretamente (`no-cross-feature-imports`).
 *
 * Espelha deliberadamente o pipeline de `jobs/transcribeConversation.worker.ts` (mesmos passos:
 * segmentos -> resumo executivo -> extração de objeções/concorrentes/sinais -> Deal Health Score),
 * reaproveitando as MESMAS funções (nunca reimplementadas aqui) — a única diferença real é que a
 * ligação já chega com transcrição pronta (não passa por Whisper) e não roda avaliação de coaching
 * (o rubric de `coachingEvaluation.service.ts` avalia TÉCNICA DE VENDA de um vendedor humano; a IA
 * de voz segue um roteiro fixo — avaliá-la pelo mesmo rubric mediria o roteiro, não um vendedor,
 * então fica fora de escopo aqui por decisão consciente, não omissão).
 *
 * Consentimento é a diferença estrutural mais importante deste caminho: `GRANTED` roda o pipeline
 * inteiro; `DECLINED` cancela a conversa sem gravar nenhum conteúdo (só o registro de consentimento
 * recusado, para auditoria); `PENDING` (divulgação da IA não detectada na transcrição) deixa a
 * conversa `SCHEDULED` sem processar nada — nunca fabrica consentimento por omissão.
 */
import { logger } from '../../../lib/logger.js';
import { assertPiiExternalConsent } from '../../../shared/services/aiPiiConsent.service.js';
import { CopilotoIaUseCases } from '../application/CopilotoIaUseCases.js';
import { PrismaCopilotoIaRepository } from './PrismaCopilotoIaRepository.js';
import { extractConversationIntelligence } from './conversationIntelligence.service.js';
import {
  computeDealHealthScore,
  computeChurnRiskScore,
  type SentimentScore,
} from '../application/dealHealthScoring.js';
import { computeAiProbabilityAdjustment } from '../application/forecastAdjustment.js';
import type { AddTranscriptSegmentInput } from '../domain/CopilotoIa.js';
import type {
  CopilotoVoiceIngestionPort,
  VoiceCallIngestionInput,
} from '../../../shared/contracts/copilotoVoiceIngestion.contract.js';
import type { MeetingSynthesisPort } from '../../../shared/contracts/meetingSynthesis.contract.js';

const repository = new PrismaCopilotoIaRepository();
const useCases = new CopilotoIaUseCases(repository);

function buildCombinedText(input: VoiceCallIngestionInput): string {
  if (input.turns && input.turns.length > 0) {
    return input.turns
      .map((turn) => `${turn.speaker === 'assistant' ? 'IA' : 'Lead'}: ${turn.text}`)
      .join('\n');
  }
  return (input.rawTranscript ?? '').trim();
}

/** A Bland/Hub não entrega timestamp por fala — os `startMs/endMs` sintéticos aqui só existem pra
 * preservar a ORDEM cronológica na listagem (`orderBy startMs asc`), nunca representam duração
 * real. Ver mesmo raciocínio documentado em `whatsappResponseTime.ts` sobre não fabricar precisão
 * que a fonte não tem. */
function buildSegments(input: VoiceCallIngestionInput): AddTranscriptSegmentInput[] {
  if (input.turns && input.turns.length > 0) {
    return input.turns
      .filter((turn) => turn.text.trim().length > 0)
      .map((turn, index) => ({
        speakerLabel: turn.speaker === 'assistant' ? 'Gessica (IA)' : 'Lead',
        startMs: index * 1000,
        endMs: index * 1000 + 500,
        text: turn.text,
      }));
  }
  const text = (input.rawTranscript ?? '').trim();
  if (!text) return [];
  return [
    {
      startMs: 0,
      endMs: Math.max(1000, Math.round(input.durationSeconds * 1000)),
      text,
    },
  ];
}

export class CopilotoVoiceIngestionAdapter implements CopilotoVoiceIngestionPort {
  constructor(private meetingSynthesisPort: MeetingSynthesisPort) {}

  async ingestCallResult(organizationId: string, input: VoiceCallIngestionInput): Promise<void> {
    const conversation = await useCases.createConversation(
      organizationId,
      {
        source: 'CALL',
        title: 'Ligação SDR de voz (IA)',
        externalMeetingId: input.providerCallId,
        leadId: input.leadId,
      },
      undefined,
    );

    // `recordConsent` só tem dois desfechos (GRANTED/DECLINED, ver CopilotoIaUseCases) — PENDING
    // não é um valor que se "grava", é a ausência de qualquer registro (o estado inicial de
    // `createConversation` já é PENDING). Chamá-lo com granted:false aqui gravaria DECLINED por
    // engano para o caso "divulgação não confirmada", que é uma conclusão mais forte do que os
    // dados sustentam — por isso só chama quando há uma classificação real (GRANTED ou DECLINED).
    if (input.consent.status !== 'PENDING') {
      await useCases.recordConsent(organizationId, conversation.id, {
        method: 'ai_voice_disclosure',
        textVersion: 'atlas-gr-voice-disclosure-v1',
        granted: input.consent.status === 'GRANTED',
      });
    }

    if (input.consent.status !== 'GRANTED') {
      // DECLINED (recusa explícita) ou PENDING (divulgação da IA não confirmada na transcrição) —
      // nos dois casos, nenhum conteúdo desta ligação entra no Copiloto. `startCapture` já
      // bloquearia isso estruturalmente (ver CopilotoIaUseCases), mas cancelar deixa o estado
      // final explícito em vez de uma conversa presa em SCHEDULED indefinidamente.
      if (input.consent.status === 'DECLINED') {
        await useCases.cancel(organizationId, conversation.id);
      }
      logger.info(
        { organizationId, conversationId: conversation.id, consent: input.consent.status },
        '[copiloto-ia] ligação registrada sem processar conteúdo (consentimento não concedido)',
      );
      return;
    }

    // Achado real de finalização (2026-09-04): `input.consent.status` acima é o consentimento do
    // INTERLOCUTOR para a ligação ser gravada/analisada (divulgação da IA) — um eixo LGPD
    // diferente de `assertPiiExternalConsent`, a base legal da ORGANIZAÇÃO (tenant) para enviar
    // PII a um provedor de IA externo (mesmo gate que já protege WhatsApp/SDR/Ops/Learning/
    // Supervisor e a transcrição de reunião do próprio Copiloto — ver guardrails.service.ts).
    // Esta ponte enviava `combinedText` (transcrição real da ligação) ao gateway de IA sem
    // nenhuma checagem deste segundo eixo — corrigido aqui, fail-closed.
    try {
      assertPiiExternalConsent(organizationId);
    } catch (error) {
      logger.warn(
        { err: error, organizationId, conversationId: conversation.id },
        '[copiloto-ia] ponte de voz bloqueada: sem base legal LGPD registrada para enviar dado pessoal a provedor de IA externo.',
      );
      await useCases.cancel(organizationId, conversation.id);
      return;
    }

    const segments = buildSegments(input);
    if (segments.length === 0) {
      await useCases.cancel(organizationId, conversation.id);
      return;
    }

    try {
      await useCases.startCapture(organizationId, conversation.id);
      await useCases.addTranscriptSegments(organizationId, conversation.id, segments);
      await useCases.stopCapture(organizationId, conversation.id);

      const combinedText = buildCombinedText(input);
      let sentimentScore: SentimentScore | null = null;
      let unresolvedObjectionsCount = 0;
      let buyingSignalsCount = 0;
      let competitorMentionsCount = 0;
      let complaintsCount = 0;
      let highSeverityComplaintsCount = 0;
      let blockersCount = 0;

      if (combinedText) {
        const synthesis = await this.meetingSynthesisPort.synthesizeMeeting({
          meetingTitle: 'Ligação SDR de voz (IA)',
          participants: ['Gessica (IA)', 'Lead'],
          rawTranscript: combinedText,
        });
        await useCases.createInsight(organizationId, conversation.id, {
          type: 'resumo',
          valueJson: synthesis,
        });
        sentimentScore = synthesis.sentimentScore ?? null;

        const intelligence = await extractConversationIntelligence(combinedText);
        for (const objection of intelligence.objections) {
          await useCases.createInsight(organizationId, conversation.id, {
            type: 'objecao',
            valueJson: objection,
          });
        }
        for (const competitor of intelligence.competitors) {
          await useCases.createInsight(organizationId, conversation.id, {
            type: 'concorrente',
            valueJson: competitor,
          });
        }
        for (const signal of intelligence.buyingSignals) {
          await useCases.createInsight(organizationId, conversation.id, {
            type: 'buying_signal',
            valueJson: signal,
          });
        }
        for (const complaint of intelligence.complaints) {
          await useCases.createInsight(organizationId, conversation.id, {
            type: 'reclamacao',
            valueJson: complaint,
          });
        }
        for (const promise of intelligence.promises) {
          await useCases.createInsight(organizationId, conversation.id, {
            type: 'promessa',
            valueJson: promise,
          });
        }
        for (const blocker of intelligence.blockers) {
          await useCases.createInsight(organizationId, conversation.id, {
            type: 'bloqueio',
            valueJson: blocker,
          });
        }
        unresolvedObjectionsCount = intelligence.objections.filter((o) => !o.resolved).length;
        buyingSignalsCount = intelligence.buyingSignals.length;
        competitorMentionsCount = intelligence.competitors.length;
        complaintsCount = intelligence.complaints.length;
        highSeverityComplaintsCount = intelligence.complaints.filter(
          (c) => c.severity === 'alta',
        ).length;
        blockersCount = intelligence.blockers.length;
      }

      const { score, factors } = computeDealHealthScore({
        sentimentScore,
        unresolvedObjectionsCount,
        buyingSignalsCount,
        competitorMentionsCount,
      });
      const { score: churnRiskScore, factors: churnFactors } = computeChurnRiskScore({
        sentimentScore,
        complaintsCount,
        highSeverityComplaintsCount,
        blockersCount,
      });
      const crmProbability = await repository.getLeadProbability(organizationId, input.leadId);
      const { probabilityAi, reasons } = computeAiProbabilityAdjustment({
        crmProbability,
        dealHealthScore: score,
      });
      await useCases.recordDealHealthSnapshot(organizationId, {
        leadId: input.leadId,
        score,
        factorsJson: { ...factors, conversationId: conversation.id, sentimentScore },
        forecastProbabilityAi: probabilityAi,
        forecastReasons: reasons,
        churnRiskScore,
        churnFactorsJson: churnFactors,
      });

      await useCases.markReady(organizationId, conversation.id);
    } catch (err) {
      await useCases.markFailed(organizationId, conversation.id).catch(() => {});
      throw err;
    }
  }
}
