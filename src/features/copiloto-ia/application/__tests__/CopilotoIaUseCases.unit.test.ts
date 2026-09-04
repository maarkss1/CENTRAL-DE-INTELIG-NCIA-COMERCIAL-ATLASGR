import { describe, it, expect, beforeEach } from 'vitest';
import { CopilotoIaUseCases } from '../CopilotoIaUseCases';
import type {
  CopilotoIaRepository,
  CopilotoConversationDTO,
  CopilotoConversationDetailDTO,
  CopilotoConversationStatus,
  CopilotoConsentStatus,
  CopilotoCrmFieldSuggestionDTO,
  CopilotoSuggestionStatus,
  ConversationStateDTO,
  CopilotoBitrixFieldMappingDTO,
  UpsertBitrixFieldMappingInput,
  CopilotoInsightDTO,
  CopilotoCoachingEvaluationDTO,
  CopilotoDealHealthSnapshotDTO,
  LeadLookupResultDTO,
} from '../../domain/CopilotoIa';
import type { WhatsAppMessageTiming } from '../whatsappResponseTime';

const ORG_ID = 'org-1';

function baseConversation(
  overrides: Partial<CopilotoConversationDTO> = {},
): CopilotoConversationDTO {
  return {
    id: 'conv-1',
    organizationId: ORG_ID,
    source: 'MEET',
    status: 'SCHEDULED',
    title: null,
    externalMeetingId: null,
    leadId: 'lead-1',
    companyId: null,
    contactId: null,
    consentStatus: 'PENDING',
    createdBy: null,
    startedAt: null,
    endedAt: null,
    audioObjectKey: null,
    audioMimeType: null,
    audioSizeBytes: null,
    audioDurationMs: null,
    transcriptionStartedAt: null,
    transcriptionCompletedAt: null,
    transcriptionError: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

/** Repositório fake em memória — permite testar as regras de negócio sem Postgres real. */
class FakeCopilotoIaRepository implements CopilotoIaRepository {
  conversations = new Map<string, CopilotoConversationDTO>();
  transcriptSegmentIds = new Map<string, string[]>();
  suggestions = new Map<string, CopilotoCrmFieldSuggestionDTO>();
  insightsByConversation = new Map<string, CopilotoInsightDTO[]>();
  /** Por padrão todo lead/company/contact "existe" — testes que querem o caminho negativo
   * populam este Set com ids que devem ser tratados como inexistentes na organização. */
  missingCrmEntityIds = new Set<string>();

  async leadExists(_organizationId: string, id: string): Promise<boolean> {
    return !this.missingCrmEntityIds.has(id);
  }

  async companyExists(_organizationId: string, id: string): Promise<boolean> {
    return !this.missingCrmEntityIds.has(id);
  }

  async contactExists(_organizationId: string, id: string): Promise<boolean> {
    return !this.missingCrmEntityIds.has(id);
  }

  leadLookupResult: LeadLookupResultDTO | null = null;

  async findLeadByLookup(
    _organizationId: string,
    _query: string,
  ): Promise<LeadLookupResultDTO | null> {
    return this.leadLookupResult;
  }

  leadSearchResults: LeadLookupResultDTO[] = [];

  async searchLeadsByName(
    _organizationId: string,
    _query: string,
    limit: number,
  ): Promise<LeadLookupResultDTO[]> {
    return this.leadSearchResults.slice(0, limit);
  }

  async createConversation(
    organizationId: string,
    data: Parameters<CopilotoIaRepository['createConversation']>[1],
  ): Promise<CopilotoConversationDTO> {
    const conversation = baseConversation({
      organizationId,
      ...data,
      id: `conv-${this.conversations.size + 1}`,
    });
    this.conversations.set(conversation.id, conversation);
    return conversation;
  }

  async getConversationState(
    _organizationId: string,
    id: string,
  ): Promise<ConversationStateDTO | null> {
    const conversation = this.conversations.get(id);
    if (!conversation) return null;
    return {
      status: conversation.status,
      consentStatus: conversation.consentStatus,
      title: conversation.title,
      audioObjectKey: conversation.audioObjectKey,
      audioMimeType: conversation.audioMimeType,
      leadId: conversation.leadId,
    };
  }

  async getConversationById(
    _organizationId: string,
    id: string,
  ): Promise<CopilotoConversationDetailDTO | null> {
    const conversation = this.conversations.get(id);
    if (!conversation) return null;
    return {
      ...conversation,
      transcriptSegments: [],
      insights: this.insightsByConversation.get(id) ?? [],
      crmFieldSuggestions: Array.from(this.suggestions.values()).filter(
        (suggestion) => suggestion.conversationId === id,
      ),
      consentRecords: [],
    };
  }

  async listConversations(): Promise<CopilotoConversationDTO[]> {
    return Array.from(this.conversations.values());
  }

  async updateConversationStatus(
    _organizationId: string,
    id: string,
    data: { status: CopilotoConversationStatus; startedAt?: Date; endedAt?: Date },
  ): Promise<CopilotoConversationDTO> {
    const conversation = this.conversations.get(id);
    if (!conversation) throw new Error('not found');
    const updated = { ...conversation, ...data };
    this.conversations.set(id, updated);
    return updated;
  }

  async updateConversationConsentStatus(
    _organizationId: string,
    id: string,
    consentStatus: CopilotoConsentStatus,
  ): Promise<CopilotoConversationDTO> {
    const conversation = this.conversations.get(id);
    if (!conversation) throw new Error('not found');
    const updated = { ...conversation, consentStatus };
    this.conversations.set(id, updated);
    return updated;
  }

  async updateConversationAudio(
    _organizationId: string,
    id: string,
    data: { objectKey: string; mimeType: string; sizeBytes: number; durationMs?: number },
  ): Promise<CopilotoConversationDTO> {
    const conversation = this.conversations.get(id);
    if (!conversation) throw new Error('not found');
    const updated = {
      ...conversation,
      audioObjectKey: data.objectKey,
      audioMimeType: data.mimeType,
      audioSizeBytes: data.sizeBytes,
      audioDurationMs: data.durationMs ?? null,
    };
    this.conversations.set(id, updated);
    return updated;
  }

  async updateTranscriptionStatus(
    _organizationId: string,
    id: string,
    data: {
      transcriptionStartedAt?: Date;
      transcriptionCompletedAt?: Date;
      transcriptionError?: string | null;
    },
  ): Promise<CopilotoConversationDTO> {
    const conversation = this.conversations.get(id);
    if (!conversation) throw new Error('not found');
    const updated = { ...conversation, ...data };
    this.conversations.set(id, updated);
    return updated;
  }

  async createConsentRecord(
    _organizationId: string,
    conversationId: string,
    data: { method: string; textVersion: string; actorId?: string; granted: boolean },
  ) {
    return {
      id: 'consent-1',
      conversationId,
      method: data.method,
      textVersion: data.textVersion,
      actorId: data.actorId ?? null,
      grantedAt: data.granted ? new Date() : null,
      declinedAt: data.granted ? null : new Date(),
      createdAt: new Date(),
    };
  }

  async addTranscriptSegments(
    _organizationId: string,
    conversationId: string,
    segments: {
      speakerLabel?: string;
      startMs: number;
      endMs: number;
      text: string;
      confidence?: number;
    }[],
  ) {
    const created = segments.map((segment, index) => ({
      id: `seg-${conversationId}-${index}`,
      conversationId,
      speakerLabel: segment.speakerLabel ?? null,
      startMs: segment.startMs,
      endMs: segment.endMs,
      text: segment.text,
      confidence: segment.confidence ?? null,
      createdAt: new Date(),
    }));
    const existing = this.transcriptSegmentIds.get(conversationId) ?? [];
    this.transcriptSegmentIds.set(
      conversationId,
      existing.concat(created.map((segment) => segment.id)),
    );
    return created;
  }

  async listTranscriptSegmentIds(_organizationId: string, conversationId: string) {
    return this.transcriptSegmentIds.get(conversationId) ?? [];
  }

  async createInsight(
    _organizationId: string,
    conversationId: string,
    data: { type: string; valueJson: unknown; confidence?: number; evidenceSegmentIds?: string[] },
  ): Promise<CopilotoInsightDTO> {
    const existing = this.insightsByConversation.get(conversationId) ?? [];
    const insight: CopilotoInsightDTO = {
      id: `insight-${conversationId}-${existing.length + 1}`,
      conversationId,
      type: data.type,
      valueJson: data.valueJson,
      confidence: data.confidence ?? null,
      evidenceSegmentIds: data.evidenceSegmentIds ?? [],
      createdAt: new Date(),
    };
    this.insightsByConversation.set(conversationId, [...existing, insight]);
    return insight;
  }

  async listInsights(
    _organizationId: string,
    conversationId: string,
  ): Promise<CopilotoInsightDTO[]> {
    return this.insightsByConversation.get(conversationId) ?? [];
  }

  async createCrmFieldSuggestion(
    _organizationId: string,
    conversationId: string,
    data: {
      entityType: 'LEAD' | 'COMPANY' | 'CONTACT';
      entityId: string;
      fieldCode: string;
      previousValue?: string;
      suggestedValue: string;
      confidence?: number;
    },
  ) {
    const suggestion: CopilotoCrmFieldSuggestionDTO = {
      id: `sugg-${this.suggestions.size + 1}`,
      conversationId,
      entityType: data.entityType,
      entityId: data.entityId,
      fieldCode: data.fieldCode,
      previousValue: data.previousValue ?? null,
      suggestedValue: data.suggestedValue,
      confidence: data.confidence ?? null,
      status: 'PENDING',
      approvedBy: null,
      approvedAt: null,
      writebackAt: null,
      writebackError: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.suggestions.set(suggestion.id, suggestion);
    return suggestion;
  }

  async getCrmFieldSuggestionById(_organizationId: string, id: string) {
    return this.suggestions.get(id) ?? null;
  }

  async updateCrmFieldSuggestionStatus(
    _organizationId: string,
    id: string,
    data: {
      status: CopilotoSuggestionStatus;
      approvedBy?: string;
      approvedAt?: Date;
      writebackAt?: Date;
      writebackError?: string | null;
    },
  ) {
    const suggestion = this.suggestions.get(id);
    if (!suggestion) throw new Error('not found');
    const updated = { ...suggestion, ...data };
    this.suggestions.set(id, updated);
    return updated;
  }

  dealHealthSnapshots: CopilotoDealHealthSnapshotDTO[] = [];

  async createDealHealthSnapshot(
    _organizationId: string,
    data: {
      leadId: string;
      score: number;
      factorsJson: unknown;
      forecastProbabilityAi?: number;
      forecastReasons?: string[];
      churnRiskScore?: number;
      churnFactorsJson?: unknown;
    },
  ): Promise<CopilotoDealHealthSnapshotDTO> {
    const snapshot: CopilotoDealHealthSnapshotDTO = {
      id: `snap-${this.dealHealthSnapshots.length + 1}`,
      leadId: data.leadId,
      score: data.score,
      factorsJson: data.factorsJson,
      forecastProbabilityAi: data.forecastProbabilityAi ?? null,
      forecastReasons: data.forecastReasons ?? [],
      churnRiskScore: data.churnRiskScore ?? null,
      churnFactorsJson: data.churnFactorsJson ?? null,
      createdAt: new Date(),
    };
    this.dealHealthSnapshots.push(snapshot);
    return snapshot;
  }

  async listDealHealthSnapshots() {
    return this.dealHealthSnapshots;
  }

  async getLeadProbability(): Promise<number | null> {
    return null;
  }

  async latestDealHealthSnapshot(
    _organizationId: string,
    leadId: string,
  ): Promise<CopilotoDealHealthSnapshotDTO | null> {
    const forLead = this.dealHealthSnapshots.filter((s) => s.leadId === leadId);
    return forLead[forLead.length - 1] ?? null;
  }

  coachingEvaluations = new Map<string, CopilotoCoachingEvaluationDTO>();

  async createCoachingEvaluation(
    _organizationId: string,
    conversationId: string,
    data: { rubricJson: unknown; overallScore: number },
  ): Promise<CopilotoCoachingEvaluationDTO> {
    const evaluation: CopilotoCoachingEvaluationDTO = {
      id: `coaching-${conversationId}`,
      conversationId,
      rubricJson: data.rubricJson,
      overallScore: data.overallScore,
      createdAt: new Date(),
    };
    this.coachingEvaluations.set(conversationId, evaluation);
    return evaluation;
  }

  async getCoachingEvaluationByConversation(
    _organizationId: string,
    conversationId: string,
  ): Promise<CopilotoCoachingEvaluationDTO | null> {
    return this.coachingEvaluations.get(conversationId) ?? null;
  }

  whatsAppMessageTimingsByLead = new Map<string, WhatsAppMessageTiming[]>();

  async getWhatsAppMessageTimingsForLead(
    _organizationId: string,
    leadId: string,
  ): Promise<WhatsAppMessageTiming[]> {
    return this.whatsAppMessageTimingsByLead.get(leadId) ?? [];
  }

  fieldMappings = new Map<string, CopilotoBitrixFieldMappingDTO>();
  leadBitrixIds = new Map<string, string>();

  async upsertBitrixFieldMapping(
    _organizationId: string,
    data: UpsertBitrixFieldMappingInput,
  ): Promise<CopilotoBitrixFieldMappingDTO> {
    const key = `${data.entityType}:${data.semanticField}`;
    const mapping: CopilotoBitrixFieldMappingDTO = {
      id: key,
      entityType: data.entityType,
      semanticField: data.semanticField,
      bitrixFieldCode: data.bitrixFieldCode,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.fieldMappings.set(key, mapping);
    return mapping;
  }

  async listBitrixFieldMappings(): Promise<CopilotoBitrixFieldMappingDTO[]> {
    return Array.from(this.fieldMappings.values());
  }

  async deleteBitrixFieldMapping(_organizationId: string, id: string): Promise<void> {
    this.fieldMappings.delete(id);
  }

  async getBitrixFieldCode(
    _organizationId: string,
    entityType: 'LEAD' | 'COMPANY' | 'CONTACT',
    semanticField: string,
  ): Promise<string | null> {
    return this.fieldMappings.get(`${entityType}:${semanticField}`)?.bitrixFieldCode ?? null;
  }

  async getLeadBitrixId(_organizationId: string, leadId: string): Promise<string | null> {
    return this.leadBitrixIds.get(leadId) ?? null;
  }
}

describe('CopilotoIaUseCases', () => {
  let repository: FakeCopilotoIaRepository;
  let useCases: CopilotoIaUseCases;

  beforeEach(() => {
    repository = new FakeCopilotoIaRepository();
    useCases = new CopilotoIaUseCases(repository);
  });

  describe('createConversation', () => {
    it('permite criar sem nenhum vínculo de CRM (captura de propósito geral)', async () => {
      // FakeCopilotoIaRepository.createConversation preenche leadId com o default de
      // baseConversation() quando `data` não traz a chave — não é fidelidade ao Prisma real (que
      // gravaria null), só confirma aqui que criar SEM leadId/companyId/contactId no input não é
      // mais rejeitado (o que era o comportamento antes desta mudança).
      await expect(
        useCases.createConversation(ORG_ID, { source: 'MEET' }, 'user-1'),
      ).resolves.toMatchObject({ source: 'MEET' });
    });

    it('MEET/CALL exigem consentimento (consentStatus = PENDING)', async () => {
      const conversation = await useCases.createConversation(
        ORG_ID,
        { source: 'MEET', leadId: 'lead-1' },
        'user-1',
      );
      expect(conversation.consentStatus).toBe('PENDING');
    });

    it('MANUAL dispensa consentimento (consentStatus = NOT_REQUIRED)', async () => {
      const conversation = await useCases.createConversation(
        ORG_ID,
        { source: 'MANUAL', leadId: 'lead-1' },
        'user-1',
      );
      expect(conversation.consentStatus).toBe('NOT_REQUIRED');
    });

    it('rejeita leadId que não pertence à organização (defesa contra referência cross-tenant)', async () => {
      repository.missingCrmEntityIds.add('lead-de-outro-tenant');
      await expect(
        useCases.createConversation(
          ORG_ID,
          { source: 'MANUAL', leadId: 'lead-de-outro-tenant' },
          'user-1',
        ),
      ).rejects.toThrow('Lead informado não existe nesta organização');
    });
  });

  describe('startCapture — gate de consentimento (LGPD)', () => {
    it('rejeita iniciar captura com consentimento PENDING', async () => {
      const conversation = await useCases.createConversation(
        ORG_ID,
        { source: 'MEET', leadId: 'lead-1' },
        'user-1',
      );
      await expect(useCases.startCapture(ORG_ID, conversation.id)).rejects.toThrow('consentimento');
    });

    it('permite iniciar captura depois de consentimento concedido', async () => {
      const conversation = await useCases.createConversation(
        ORG_ID,
        { source: 'MEET', leadId: 'lead-1' },
        'user-1',
      );
      await useCases.recordConsent(ORG_ID, conversation.id, {
        method: 'meet_banner',
        textVersion: 'v1',
        granted: true,
      });
      const started = await useCases.startCapture(ORG_ID, conversation.id);
      expect(started.status).toBe('CAPTURING');
      expect(started.startedAt).not.toBeNull();
    });

    it('permite iniciar captura direto quando consentimento é NOT_REQUIRED (fonte MANUAL)', async () => {
      const conversation = await useCases.createConversation(
        ORG_ID,
        { source: 'MANUAL', leadId: 'lead-1' },
        'user-1',
      );
      const started = await useCases.startCapture(ORG_ID, conversation.id);
      expect(started.status).toBe('CAPTURING');
    });

    it('rejeita iniciar captura depois de consentimento recusado', async () => {
      const conversation = await useCases.createConversation(
        ORG_ID,
        { source: 'MEET', leadId: 'lead-1' },
        'user-1',
      );
      await useCases.recordConsent(ORG_ID, conversation.id, {
        method: 'meet_banner',
        textVersion: 'v1',
        granted: false,
      });
      await expect(useCases.startCapture(ORG_ID, conversation.id)).rejects.toThrow('consentimento');
    });
  });

  describe('máquina de estados', () => {
    async function grantedConversation() {
      const conversation = await useCases.createConversation(
        ORG_ID,
        { source: 'MANUAL', leadId: 'lead-1' },
        'user-1',
      );
      return conversation;
    }

    it('segue o ciclo feliz SCHEDULED -> CAPTURING -> PROCESSING -> READY', async () => {
      const conversation = await grantedConversation();
      await useCases.startCapture(ORG_ID, conversation.id);
      const stopped = await useCases.stopCapture(ORG_ID, conversation.id);
      expect(stopped.status).toBe('PROCESSING');
      expect(stopped.endedAt).not.toBeNull();
      const ready = await useCases.markReady(ORG_ID, conversation.id);
      expect(ready.status).toBe('READY');
    });

    it('rejeita transição inválida (READY não pode voltar para CAPTURING)', async () => {
      const conversation = await grantedConversation();
      await useCases.startCapture(ORG_ID, conversation.id);
      await useCases.stopCapture(ORG_ID, conversation.id);
      await useCases.markReady(ORG_ID, conversation.id);
      await expect(useCases.startCapture(ORG_ID, conversation.id)).rejects.toThrow(
        'Transição de status inválida',
      );
    });

    it('rejeita cancelar uma conversa já READY (estado final)', async () => {
      const conversation = await grantedConversation();
      await useCases.startCapture(ORG_ID, conversation.id);
      await useCases.stopCapture(ORG_ID, conversation.id);
      await useCases.markReady(ORG_ID, conversation.id);
      await expect(useCases.cancel(ORG_ID, conversation.id)).rejects.toThrow(
        'Transição de status inválida',
      );
    });

    it('permite cancelar direto de SCHEDULED', async () => {
      const conversation = await grantedConversation();
      const cancelled = await useCases.cancel(ORG_ID, conversation.id);
      expect(cancelled.status).toBe('CANCELLED');
    });
  });

  describe('completeAudioUpload — Onda 3', () => {
    it('rejeita upload de áudio fora de CAPTURING/PROCESSING', async () => {
      const conversation = await useCases.createConversation(
        ORG_ID,
        { source: 'MEET', leadId: 'lead-1' },
        'user-1',
      );
      await expect(
        useCases.completeAudioUpload(ORG_ID, conversation.id, {
          objectKey: 'copiloto-ia/org-1/conv-1/audio.webm',
          mimeType: 'audio/webm',
          sizeBytes: 1024,
        }),
      ).rejects.toThrow('Só é possível anexar áudio');
    });

    it('aceita upload de áudio durante CAPTURING e persiste os metadados', async () => {
      const conversation = await useCases.createConversation(
        ORG_ID,
        { source: 'MEET', leadId: 'lead-1' },
        'user-1',
      );
      await useCases.recordConsent(ORG_ID, conversation.id, {
        method: 'meet_banner',
        textVersion: 'v1',
        granted: true,
      });
      await useCases.startCapture(ORG_ID, conversation.id);

      const updated = await useCases.completeAudioUpload(ORG_ID, conversation.id, {
        objectKey: 'copiloto-ia/org-1/conv-1/audio.webm',
        mimeType: 'audio/webm',
        sizeBytes: 2048,
        durationMs: 60_000,
      });
      expect(updated.audioObjectKey).toBe('copiloto-ia/org-1/conv-1/audio.webm');
      expect(updated.audioDurationMs).toBe(60_000);
    });
  });

  describe('addTranscriptSegments', () => {
    it('rejeita anexar transcrição fora de CAPTURING/PROCESSING', async () => {
      const conversation = await useCases.createConversation(
        ORG_ID,
        { source: 'MANUAL', leadId: 'lead-1' },
        'user-1',
      );
      await expect(
        useCases.addTranscriptSegments(ORG_ID, conversation.id, [
          { startMs: 0, endMs: 1000, text: 'oi' },
        ]),
      ).rejects.toThrow('Só é possível anexar transcrição');
    });

    it('rejeita segmento com endMs menor que startMs', async () => {
      const conversation = await useCases.createConversation(
        ORG_ID,
        { source: 'MANUAL', leadId: 'lead-1' },
        'user-1',
      );
      await useCases.startCapture(ORG_ID, conversation.id);
      await expect(
        useCases.addTranscriptSegments(ORG_ID, conversation.id, [
          { startMs: 1000, endMs: 500, text: 'oi' },
        ]),
      ).rejects.toThrow('endMs não pode ser menor que startMs');
    });

    it('aceita segmentos válidos durante CAPTURING', async () => {
      const conversation = await useCases.createConversation(
        ORG_ID,
        { source: 'MANUAL', leadId: 'lead-1' },
        'user-1',
      );
      await useCases.startCapture(ORG_ID, conversation.id);
      const segments = await useCases.addTranscriptSegments(ORG_ID, conversation.id, [
        { startMs: 0, endMs: 1000, text: 'Olá, tudo bem?' },
      ]);
      expect(segments).toHaveLength(1);
    });
  });

  describe('createInsight — rastreabilidade de evidência', () => {
    it('rejeita evidenceSegmentIds que não pertencem à conversa', async () => {
      const conversation = await useCases.createConversation(
        ORG_ID,
        { source: 'MANUAL', leadId: 'lead-1' },
        'user-1',
      );
      await useCases.startCapture(ORG_ID, conversation.id);
      await useCases.addTranscriptSegments(ORG_ID, conversation.id, [
        { startMs: 0, endMs: 1000, text: 'segmento real' },
      ]);
      await expect(
        useCases.createInsight(ORG_ID, conversation.id, {
          type: 'objecao',
          valueJson: { text: 'preço alto' },
          evidenceSegmentIds: ['seg-de-outra-conversa'],
        }),
      ).rejects.toThrow('não pertencem a esta conversa');
    });

    it('aceita evidenceSegmentIds que pertencem à conversa', async () => {
      const conversation = await useCases.createConversation(
        ORG_ID,
        { source: 'MANUAL', leadId: 'lead-1' },
        'user-1',
      );
      await useCases.startCapture(ORG_ID, conversation.id);
      const [segment] = await useCases.addTranscriptSegments(ORG_ID, conversation.id, [
        { startMs: 0, endMs: 1000, text: 'segmento real' },
      ]);
      const insight = await useCases.createInsight(ORG_ID, conversation.id, {
        type: 'objecao',
        valueJson: { text: 'preço alto' },
        evidenceSegmentIds: [segment.id],
      });
      expect(insight.evidenceSegmentIds).toEqual([segment.id]);
    });
  });

  describe('aprovação/rejeição de sugestão de campo de CRM', () => {
    it('só aprova sugestão PENDING', async () => {
      const conversation = await useCases.createConversation(
        ORG_ID,
        { source: 'MANUAL', leadId: 'lead-1' },
        'user-1',
      );
      const suggestion = await useCases.createCrmFieldSuggestion(ORG_ID, conversation.id, {
        entityType: 'LEAD',
        entityId: 'lead-1',
        fieldCode: 'principal_dor',
        suggestedValue: 'Custo de frete alto',
      });
      const approved = await useCases.approveCrmFieldSuggestion(ORG_ID, suggestion.id, 'user-1');
      expect(approved.status).toBe('APPROVED');
      await expect(
        useCases.approveCrmFieldSuggestion(ORG_ID, suggestion.id, 'user-1'),
      ).rejects.toThrow('Só é possível aprovar sugestão PENDING');
    });
  });

  describe('recordDealHealthSnapshot', () => {
    it('rejeita score fora de 0-100', async () => {
      await expect(
        useCases.recordDealHealthSnapshot(ORG_ID, {
          leadId: 'lead-1',
          score: 150,
          factorsJson: {},
        }),
      ).rejects.toThrow('score precisa ser um inteiro entre 0 e 100');
    });

    it('aceita score válido', async () => {
      const snapshot = await useCases.recordDealHealthSnapshot(ORG_ID, {
        leadId: 'lead-1',
        score: 82,
        factorsJson: { engagement: 'alto' },
      });
      expect(snapshot.score).toBe(82);
    });

    it('rejeita leadId que não pertence à organização', async () => {
      repository.missingCrmEntityIds.add('lead-de-outro-tenant');
      await expect(
        useCases.recordDealHealthSnapshot(ORG_ID, {
          leadId: 'lead-de-outro-tenant',
          score: 50,
          factorsJson: {},
        }),
      ).rejects.toThrow('Lead informado não existe nesta organização');
    });
  });

  describe('Onda 6 — recordCoachingEvaluation / getCoachingEvaluation', () => {
    it('rejeita overallScore fora de 0-100', async () => {
      const conversation = await useCases.createConversation(
        ORG_ID,
        { source: 'MANUAL', leadId: 'lead-1' },
        'user-1',
      );
      await expect(
        useCases.recordCoachingEvaluation(ORG_ID, conversation.id, {
          rubricJson: {},
          overallScore: 150,
        }),
      ).rejects.toThrow('overallScore precisa ser um inteiro entre 0 e 100');
    });

    it('grava e lê a avaliação de coaching de uma conversa', async () => {
      const conversation = await useCases.createConversation(
        ORG_ID,
        { source: 'MANUAL', leadId: 'lead-1' },
        'user-1',
      );
      await useCases.recordCoachingEvaluation(ORG_ID, conversation.id, {
        rubricJson: { descoberta: { score: 8, evidence: 'Perguntou sobre o volume mensal' } },
        overallScore: 74,
      });
      const found = await useCases.getCoachingEvaluation(ORG_ID, conversation.id);
      expect(found?.overallScore).toBe(74);
    });
  });

  describe('Onda 6 — getHandoffSummary', () => {
    it('sinaliza incompleto quando a conversa ainda não está READY', async () => {
      const conversation = await useCases.createConversation(
        ORG_ID,
        { source: 'MANUAL', leadId: 'lead-1' },
        'user-1',
      );
      const handoff = await useCases.getHandoffSummary(ORG_ID, conversation.id);
      expect(handoff.isComplete).toBe(false);
      expect(handoff.missingParts.join(' ')).toContain('Transcrição');
      expect(handoff.missingParts.join(' ')).toContain('Resumo');
    });

    it('agrupa insights por tipo e fica completo quando tudo existe', async () => {
      const conversation = await useCases.createConversation(
        ORG_ID,
        { source: 'MANUAL', leadId: 'lead-1' },
        'user-1',
      );
      await useCases.createInsight(ORG_ID, conversation.id, {
        type: 'resumo',
        valueJson: { executiveSummary: 'Reunião produtiva' },
      });
      await useCases.createInsight(ORG_ID, conversation.id, {
        type: 'objecao',
        valueJson: { text: 'Preço alto', resolved: true },
      });
      await useCases.recordDealHealthSnapshot(ORG_ID, {
        leadId: 'lead-1',
        score: 80,
        factorsJson: {},
      });
      // Marca READY passando pelo ciclo real (evita reimplementar a máquina de estados aqui).
      await useCases.startCapture(ORG_ID, conversation.id);
      await useCases.stopCapture(ORG_ID, conversation.id);
      await useCases.markReady(ORG_ID, conversation.id);

      const handoff = await useCases.getHandoffSummary(ORG_ID, conversation.id);
      expect(handoff.objections).toHaveLength(1);
      expect(handoff.summary).toEqual({ executiveSummary: 'Reunião produtiva' });
      expect(handoff.latestDealHealth?.score).toBe(80);
      expect(handoff.isComplete).toBe(true);
      expect(handoff.missingParts).toEqual([]);
    });
  });

  describe('getWhatsAppResponseTimeStats', () => {
    it('busca as mensagens do lead no repositório e delega o cálculo à função pura', async () => {
      const timings: WhatsAppMessageTiming[] = [
        { direction: 'inbound', receivedAt: new Date('2026-09-02T10:00:00Z') },
        { direction: 'outbound', receivedAt: new Date('2026-09-02T10:05:00Z') },
      ];
      repository.whatsAppMessageTimingsByLead.set('lead-1', timings);

      const stats = await useCases.getWhatsAppResponseTimeStats(ORG_ID, 'lead-1');

      expect(stats.firstResponseMs).toBe(5 * 60 * 1000);
      expect(stats.sampleCount).toBe(1);
    });

    it('lead sem nenhuma mensagem retorna estatísticas vazias, não erro', async () => {
      const stats = await useCases.getWhatsAppResponseTimeStats(ORG_ID, 'lead-sem-mensagem');
      expect(stats.sampleCount).toBe(0);
      expect(stats.firstResponseMs).toBeNull();
      expect(stats.hasPendingResponse).toBe(false);
    });
  });

  describe('lookupLead', () => {
    it('rejeita query vazia sem chegar a chamar o repositório', async () => {
      await expect(useCases.lookupLead(ORG_ID, '   ')).rejects.toThrow(
        'Informe um e-mail, link do Bitrix24 ou id de Lead.',
      );
    });

    it('devolve null quando o repositório não resolve nada, sem lançar 404', async () => {
      repository.leadLookupResult = null;
      await expect(useCases.lookupLead(ORG_ID, 'ninguem@nada.com')).resolves.toBeNull();
    });

    it('repassa o resultado do repositório quando resolve', async () => {
      repository.leadLookupResult = {
        id: 'lead-9',
        title: 'Lead Teste',
        companyName: 'Empresa Teste',
        contactName: 'Fulano',
      };
      const result = await useCases.lookupLead(ORG_ID, 'fulano@empresa.com');
      expect(result?.id).toBe('lead-9');
    });
  });

  describe('searchLeads — busca por nome', () => {
    it('rejeita query com menos de 2 caracteres sem chegar a chamar o repositório', async () => {
      await expect(useCases.searchLeads(ORG_ID, 'a')).rejects.toThrow(
        'Digite ao menos 2 caracteres para buscar por nome.',
      );
    });

    it('rejeita query vazia (só espaços)', async () => {
      await expect(useCases.searchLeads(ORG_ID, '   ')).rejects.toThrow(
        'Digite ao menos 2 caracteres para buscar por nome.',
      );
    });

    it('repassa os candidatos encontrados pelo repositório', async () => {
      repository.leadSearchResults = [
        { id: 'lead-1', title: 'Frota XPTO', companyName: 'Transportes XPTO', contactName: 'João' },
        { id: 'lead-2', title: 'Frota XPTO 2', companyName: 'XPTO Log', contactName: 'Maria' },
      ];
      const results = await useCases.searchLeads(ORG_ID, 'xpto');
      expect(results).toHaveLength(2);
      expect(results[0].id).toBe('lead-1');
    });

    it('sem nenhum candidato retorna lista vazia, não erro', async () => {
      const results = await useCases.searchLeads(ORG_ID, 'ninguem encontrado');
      expect(results).toEqual([]);
    });
  });
});
