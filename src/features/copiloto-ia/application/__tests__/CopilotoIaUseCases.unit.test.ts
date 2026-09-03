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
} from '../../domain/CopilotoIa';

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

  async getConversationById(): Promise<CopilotoConversationDetailDTO | null> {
    throw new Error('not needed in these tests');
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
  ) {
    return {
      id: 'insight-1',
      conversationId,
      type: data.type,
      valueJson: data.valueJson,
      confidence: data.confidence ?? null,
      evidenceSegmentIds: data.evidenceSegmentIds ?? [],
      createdAt: new Date(),
    };
  }

  async listInsights() {
    return [];
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

  async createDealHealthSnapshot(
    _organizationId: string,
    data: { leadId: string; score: number; factorsJson: unknown },
  ) {
    return {
      id: 'snap-1',
      leadId: data.leadId,
      score: data.score,
      factorsJson: data.factorsJson,
      createdAt: new Date(),
    };
  }

  async listDealHealthSnapshots() {
    return [];
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
    it('exige ao menos um vínculo de CRM (lead/company/contact)', async () => {
      await expect(
        useCases.createConversation(ORG_ID, { source: 'MEET' }, 'user-1'),
      ).rejects.toThrow('Informe ao menos um vínculo de CRM');
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
});
