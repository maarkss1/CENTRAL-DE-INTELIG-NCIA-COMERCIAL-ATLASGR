/**
 * Regras de negócio do Copiloto Comercial IA (fundação — Onda 1). Duas regras estruturais que
 * existem desde já, mesmo sem captura real conectada, porque são as que o pacote de especificação
 * (agents/AGENT_02_SEGURANCA_LGPD.md) trata como não-opcionais:
 *
 *  1. Nunca inicia captura (`startCapture`) sem consentimento concedido ou dispensado — a máquina
 *     de estados de `CopilotoConversationStatus` não deixa `SCHEDULED -> CAPTURING` acontecer com
 *     `consentStatus = PENDING/DECLINED`.
 *  2. Um `CopilotoInsight` com evidência (`evidenceSegmentIds`) só pode referenciar segmentos que
 *     pertencem à MESMA conversa — nunca aceita um id de outra conversa/tenant por engano.
 */
import { AppError } from '../../../shared/middlewares/errorHandler';
import type {
  CopilotoIaRepository,
  CreateConversationInput,
  CopilotoConversationDTO,
  CopilotoConversationDetailDTO,
  ConversationFilter,
  CopilotoConversationSource,
  CopilotoConversationStatus,
  AddTranscriptSegmentInput,
  CopilotoTranscriptSegmentDTO,
  CreateInsightInput,
  CopilotoInsightDTO,
  CreateCrmFieldSuggestionInput,
  CopilotoCrmFieldSuggestionDTO,
  CreateDealHealthSnapshotInput,
  CopilotoDealHealthSnapshotDTO,
  RecordConsentInput,
  CopilotoConsentRecordDTO,
  CompleteAudioUploadInput,
  ConversationStateDTO,
  CreateCoachingEvaluationInput,
  CopilotoCoachingEvaluationDTO,
  HandoffSummaryDTO,
  LeadLookupResultDTO,
} from '../domain/CopilotoIa';
import {
  computeWhatsAppResponseTimeStats,
  type WhatsAppResponseTimeStats,
} from './whatsappResponseTime';

/** Únicas fontes que não gravam áudio/vídeo — dispensam consentimento explícito de gravação. */
const SOURCES_WITHOUT_RECORDING_CONSENT: readonly CopilotoConversationSource[] = ['MANUAL'];

/** Transições de status permitidas — qualquer outra combinação é rejeitada (409). */
const ALLOWED_TRANSITIONS: Record<CopilotoConversationStatus, CopilotoConversationStatus[]> = {
  SCHEDULED: ['CAPTURING', 'CANCELLED'],
  CAPTURING: ['PROCESSING', 'FAILED', 'CANCELLED'],
  PROCESSING: ['READY', 'FAILED'],
  READY: [],
  FAILED: [],
  CANCELLED: [],
};

function assertTransition(from: CopilotoConversationStatus, to: CopilotoConversationStatus): void {
  if (!ALLOWED_TRANSITIONS[from].includes(to)) {
    throw new AppError(
      `Transição de status inválida: ${from} -> ${to}. Transições permitidas a partir de ${from}: ${
        ALLOWED_TRANSITIONS[from].join(', ') || '(nenhuma — estado final)'
      }.`,
      409,
    );
  }
}

export class CopilotoIaUseCases {
  constructor(private repository: CopilotoIaRepository) {}

  /**
   * Vínculo de CRM (`leadId`/`companyId`/`contactId`) é opcional — capturar uma conversa sem
   * vincular a nada ainda serve a transcrição/resumo/insights de propósito geral; só os recursos
   * que dependem de uma oportunidade específica (Deal Health Score, forecast, churn, sugestão de
   * campo de CRM/writeback) ficam indisponíveis para uma conversa sem `leadId` — o worker de
   * transcrição já trata isso condicionalmente (`if (state.leadId)`), nada aqui precisa mudar por
   * causa disso.
   */
  async createConversation(
    organizationId: string,
    input: CreateConversationInput,
    createdBy?: string,
  ): Promise<CopilotoConversationDTO> {
    if (input.leadId && !(await this.repository.leadExists(organizationId, input.leadId))) {
      throw new AppError('Lead informado não existe nesta organização.', 404);
    }
    if (
      input.companyId &&
      !(await this.repository.companyExists(organizationId, input.companyId))
    ) {
      throw new AppError('Empresa informada não existe nesta organização.', 404);
    }
    if (
      input.contactId &&
      !(await this.repository.contactExists(organizationId, input.contactId))
    ) {
      throw new AppError('Contato informado não existe nesta organização.', 404);
    }
    const consentStatus = SOURCES_WITHOUT_RECORDING_CONSENT.includes(input.source)
      ? 'NOT_REQUIRED'
      : 'PENDING';
    return this.repository.createConversation(organizationId, {
      ...input,
      consentStatus,
      createdBy,
    });
  }

  /** Onda 7 — resolve um Lead a partir de e-mail/URL do Bitrix24/id cru, para a extensão Chrome
   * (busca por nome, quando o texto não é nenhuma das três formas, é `searchLeads` abaixo).
   * `null` quando nada resolve — nunca lança 404, quem chama decide o que fazer (ex.: deixar o
   * usuário colar o id manualmente). */
  async lookupLead(organizationId: string, query: string): Promise<LeadLookupResultDTO | null> {
    const trimmed = query.trim();
    if (!trimmed) throw new AppError('Informe um e-mail, link do Bitrix24 ou id de Lead.', 400);
    return this.repository.findLeadByLookup(organizationId, trimmed);
  }

  /** Busca por nome do Lead/Contato/Company para a extensão Chrome (ver `LeadLookupResultDTO`).
   * Exige ao menos 2 caracteres úteis para não escanear a tabela inteira a cada tecla digitada. */
  async searchLeads(organizationId: string, query: string): Promise<LeadLookupResultDTO[]> {
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      throw new AppError('Digite ao menos 2 caracteres para buscar por nome.', 400);
    }
    return this.repository.searchLeadsByName(organizationId, trimmed, 10);
  }

  async getConversation(
    organizationId: string,
    id: string,
  ): Promise<CopilotoConversationDetailDTO> {
    const conversation = await this.repository.getConversationById(organizationId, id);
    if (!conversation) throw new AppError('Conversa não encontrada.', 404);
    return conversation;
  }

  async listConversations(
    organizationId: string,
    filter: ConversationFilter,
  ): Promise<CopilotoConversationDTO[]> {
    return this.repository.listConversations(organizationId, filter);
  }

  private async requireState(organizationId: string, id: string) {
    const state = await this.repository.getConversationState(organizationId, id);
    if (!state) throw new AppError('Conversa não encontrada.', 404);
    return state;
  }

  async recordConsent(
    organizationId: string,
    conversationId: string,
    input: RecordConsentInput,
  ): Promise<CopilotoConsentRecordDTO> {
    await this.requireState(organizationId, conversationId);
    const record = await this.repository.createConsentRecord(organizationId, conversationId, input);
    await this.repository.updateConversationConsentStatus(
      organizationId,
      conversationId,
      input.granted ? 'GRANTED' : 'DECLINED',
    );
    return record;
  }

  async startCapture(organizationId: string, id: string): Promise<CopilotoConversationDTO> {
    const state = await this.requireState(organizationId, id);
    assertTransition(state.status, 'CAPTURING');
    if (state.consentStatus !== 'GRANTED' && state.consentStatus !== 'NOT_REQUIRED') {
      throw new AppError(
        'Não é possível iniciar a captura sem consentimento concedido (ver POST .../consent).',
        400,
      );
    }
    return this.repository.updateConversationStatus(organizationId, id, {
      status: 'CAPTURING',
      startedAt: new Date(),
    });
  }

  async stopCapture(organizationId: string, id: string): Promise<CopilotoConversationDTO> {
    const state = await this.requireState(organizationId, id);
    assertTransition(state.status, 'PROCESSING');
    return this.repository.updateConversationStatus(organizationId, id, {
      status: 'PROCESSING',
      endedAt: new Date(),
    });
  }

  /**
   * Confirma que a conversa existe e está num status onde faz sentido ter um áudio anexado
   * (CAPTURING — upload iniciado antes de `stopCapture`; PROCESSING — upload logo depois). Não
   * gera a URL assinada em si — isso é infraestrutura (`src/lib/storage`), fica no controller,
   * mesmo raciocínio de manter `application/` testável sem depender de S3 real (ver AGENTS.md
   * deste módulo e o comentário equivalente sobre `AuditService.log` no controller).
   */
  async assertCanUploadAudio(organizationId: string, id: string): Promise<ConversationStateDTO> {
    const state = await this.requireState(organizationId, id);
    if (state.status !== 'CAPTURING' && state.status !== 'PROCESSING') {
      throw new AppError(
        `Só é possível anexar áudio durante CAPTURING/PROCESSING (status atual: ${state.status}).`,
        409,
      );
    }
    return state;
  }

  async completeAudioUpload(
    organizationId: string,
    id: string,
    input: CompleteAudioUploadInput,
  ): Promise<CopilotoConversationDTO> {
    await this.assertCanUploadAudio(organizationId, id);
    if (!input.objectKey.trim()) throw new AppError('objectKey vazio.', 400);
    return this.repository.updateConversationAudio(organizationId, id, input);
  }

  async markReady(organizationId: string, id: string): Promise<CopilotoConversationDTO> {
    const state = await this.requireState(organizationId, id);
    assertTransition(state.status, 'READY');
    return this.repository.updateConversationStatus(organizationId, id, { status: 'READY' });
  }

  async markFailed(organizationId: string, id: string): Promise<CopilotoConversationDTO> {
    const state = await this.requireState(organizationId, id);
    assertTransition(state.status, 'FAILED');
    return this.repository.updateConversationStatus(organizationId, id, { status: 'FAILED' });
  }

  async cancel(organizationId: string, id: string): Promise<CopilotoConversationDTO> {
    const state = await this.requireState(organizationId, id);
    assertTransition(state.status, 'CANCELLED');
    return this.repository.updateConversationStatus(organizationId, id, { status: 'CANCELLED' });
  }

  async addTranscriptSegments(
    organizationId: string,
    conversationId: string,
    segments: AddTranscriptSegmentInput[],
  ): Promise<CopilotoTranscriptSegmentDTO[]> {
    const state = await this.requireState(organizationId, conversationId);
    if (state.status !== 'CAPTURING' && state.status !== 'PROCESSING') {
      throw new AppError(
        `Só é possível anexar transcrição durante CAPTURING/PROCESSING (status atual: ${state.status}).`,
        409,
      );
    }
    if (segments.length === 0) {
      throw new AppError('Envie ao menos um segmento de transcrição.', 400);
    }
    for (const segment of segments) {
      if (segment.endMs < segment.startMs) {
        throw new AppError('endMs não pode ser menor que startMs em um segmento.', 400);
      }
      if (!segment.text.trim()) {
        throw new AppError('Segmento de transcrição sem texto.', 400);
      }
    }
    return this.repository.addTranscriptSegments(organizationId, conversationId, segments);
  }

  async createInsight(
    organizationId: string,
    conversationId: string,
    input: CreateInsightInput,
  ): Promise<CopilotoInsightDTO> {
    await this.requireState(organizationId, conversationId);
    if (!input.type.trim()) throw new AppError('Insight sem "type".', 400);
    const evidenceSegmentIds = input.evidenceSegmentIds ?? [];
    if (evidenceSegmentIds.length > 0) {
      const validIds = new Set(
        await this.repository.listTranscriptSegmentIds(organizationId, conversationId),
      );
      const invalid = evidenceSegmentIds.filter((segId) => !validIds.has(segId));
      if (invalid.length > 0) {
        throw new AppError(
          `evidenceSegmentIds inclui segmento(s) que não pertencem a esta conversa: ${invalid.join(', ')}.`,
          400,
        );
      }
    }
    return this.repository.createInsight(organizationId, conversationId, {
      ...input,
      evidenceSegmentIds,
    });
  }

  async listInsights(
    organizationId: string,
    conversationId: string,
  ): Promise<CopilotoInsightDTO[]> {
    await this.requireState(organizationId, conversationId);
    return this.repository.listInsights(organizationId, conversationId);
  }

  async createCrmFieldSuggestion(
    organizationId: string,
    conversationId: string,
    input: CreateCrmFieldSuggestionInput,
  ): Promise<CopilotoCrmFieldSuggestionDTO> {
    await this.requireState(organizationId, conversationId);
    if (!input.fieldCode.trim()) throw new AppError('Sugestão sem "fieldCode".', 400);
    if (!input.suggestedValue.trim()) throw new AppError('Sugestão sem "suggestedValue".', 400);
    return this.repository.createCrmFieldSuggestion(organizationId, conversationId, input);
  }

  private async requireSuggestion(organizationId: string, id: string) {
    const suggestion = await this.repository.getCrmFieldSuggestionById(organizationId, id);
    if (!suggestion) throw new AppError('Sugestão de campo de CRM não encontrada.', 404);
    return suggestion;
  }

  async approveCrmFieldSuggestion(
    organizationId: string,
    id: string,
    approvedBy: string,
  ): Promise<CopilotoCrmFieldSuggestionDTO> {
    const suggestion = await this.requireSuggestion(organizationId, id);
    if (suggestion.status !== 'PENDING') {
      throw new AppError(
        `Só é possível aprovar sugestão PENDING (status atual: ${suggestion.status}).`,
        409,
      );
    }
    return this.repository.updateCrmFieldSuggestionStatus(organizationId, id, {
      status: 'APPROVED',
      approvedBy,
      approvedAt: new Date(),
    });
  }

  async rejectCrmFieldSuggestion(
    organizationId: string,
    id: string,
    approvedBy: string,
  ): Promise<CopilotoCrmFieldSuggestionDTO> {
    const suggestion = await this.requireSuggestion(organizationId, id);
    if (suggestion.status !== 'PENDING') {
      throw new AppError(
        `Só é possível rejeitar sugestão PENDING (status atual: ${suggestion.status}).`,
        409,
      );
    }
    return this.repository.updateCrmFieldSuggestionStatus(organizationId, id, {
      status: 'REJECTED',
      approvedBy,
      approvedAt: new Date(),
    });
  }

  async recordDealHealthSnapshot(
    organizationId: string,
    input: CreateDealHealthSnapshotInput,
  ): Promise<CopilotoDealHealthSnapshotDTO> {
    if (!Number.isInteger(input.score) || input.score < 0 || input.score > 100) {
      throw new AppError('score precisa ser um inteiro entre 0 e 100.', 400);
    }
    if (!(await this.repository.leadExists(organizationId, input.leadId))) {
      throw new AppError('Lead informado não existe nesta organização.', 404);
    }
    return this.repository.createDealHealthSnapshot(organizationId, input);
  }

  async listDealHealthSnapshots(
    organizationId: string,
    leadId: string,
  ): Promise<CopilotoDealHealthSnapshotDTO[]> {
    return this.repository.listDealHealthSnapshots(organizationId, leadId);
  }

  // ─── Onda 6 — Coaching ────────────────────────────────────────────────

  async recordCoachingEvaluation(
    organizationId: string,
    conversationId: string,
    input: CreateCoachingEvaluationInput,
  ): Promise<CopilotoCoachingEvaluationDTO> {
    await this.requireState(organizationId, conversationId);
    if (
      !Number.isInteger(input.overallScore) ||
      input.overallScore < 0 ||
      input.overallScore > 100
    ) {
      throw new AppError('overallScore precisa ser um inteiro entre 0 e 100.', 400);
    }
    return this.repository.createCoachingEvaluation(organizationId, conversationId, input);
  }

  async getCoachingEvaluation(
    organizationId: string,
    conversationId: string,
  ): Promise<CopilotoCoachingEvaluationDTO | null> {
    return this.repository.getCoachingEvaluationByConversation(organizationId, conversationId);
  }

  // ─── Onda 6 — Handoff ─────────────────────────────────────────────────
  // Só agrega o que já existe (resumo + insights + Deal Health + coaching) — nenhuma chamada de
  // IA nova. "isComplete"/"missingParts" tornam "handoff incompleto" (AGENT_12 do pacote) um fato
  // checável, não uma impressão subjetiva de quem está lendo.

  async getHandoffSummary(
    organizationId: string,
    conversationId: string,
  ): Promise<HandoffSummaryDTO> {
    const conversation = await this.getConversation(organizationId, conversationId);

    const byType = (type: string) =>
      conversation.insights.filter((insight) => insight.type === type);
    const summaryInsight = byType('resumo')[0] ?? null;

    const latestDealHealth = conversation.leadId
      ? await this.repository.latestDealHealthSnapshot(organizationId, conversation.leadId)
      : null;
    const coachingEvaluation = await this.repository.getCoachingEvaluationByConversation(
      organizationId,
      conversationId,
    );

    const missingParts: string[] = [];
    if (conversation.status !== 'READY') {
      missingParts.push('Transcrição/processamento ainda não concluído.');
    }
    if (!summaryInsight) {
      missingParts.push('Resumo executivo ainda não gerado.');
    }
    if (conversation.leadId && !latestDealHealth) {
      missingParts.push('Deal Health Score ainda não calculado para o Lead vinculado.');
    }

    return {
      conversation,
      summary: summaryInsight?.valueJson ?? null,
      objections: byType('objecao'),
      competitors: byType('concorrente'),
      buyingSignals: byType('buying_signal'),
      complaints: byType('reclamacao'),
      promises: byType('promessa'),
      blockers: byType('bloqueio'),
      latestDealHealth,
      coachingEvaluation,
      isComplete: missingParts.length === 0,
      missingParts,
    };
  }

  // ─── Onda 7 — SLA/tempo de resposta no WhatsApp ──────────────────────────

  /** Só leitura sobre `WhatsAppMessage` já persistida (Baileys) — não envia nem altera mensagem
   * nenhuma. Cálculo determinístico em `whatsappResponseTime.ts`, sem IA. */
  async getWhatsAppResponseTimeStats(
    organizationId: string,
    leadId: string,
  ): Promise<WhatsAppResponseTimeStats> {
    const messages = await this.repository.getWhatsAppMessageTimingsForLead(organizationId, leadId);
    return computeWhatsAppResponseTimeStats(messages);
  }
}
