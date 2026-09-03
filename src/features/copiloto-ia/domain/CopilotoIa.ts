/**
 * Tipos de domínio do módulo "Copiloto Comercial IA" (fundação — Onda 1 do pacote
 * `atlasgr_copiloto_ai_pack`, ver `.claude/PILOTS.md` e AGENTS.md desta pasta).
 *
 * Este módulo NÃO substitui `ConversationSignal` (`src/features/intelligence` lê janelas de
 * `WhatsAppMessage`/e-mail já persistidas) — ele é a fundação de dados para captura de conversa
 * com transcrição bruta e consentimento auditável (Google Meet, ligação), que ainda não existia.
 * Onda 1 só cria o esqueleto de domínio/persistência/RBAC; captura real (extensão Chrome),
 * transcrição, inteligência de conversação e writeback no Bitrix ficam para as ondas seguintes.
 */
import type {
  CopilotoConversationSource,
  CopilotoConversationStatus,
  CopilotoConsentStatus,
  CopilotoCrmEntityType,
  CopilotoSuggestionStatus,
} from '@prisma/client';

export type {
  CopilotoConversationSource,
  CopilotoConversationStatus,
  CopilotoConsentStatus,
  CopilotoCrmEntityType,
  CopilotoSuggestionStatus,
};

export interface CopilotoConversationDTO {
  id: string;
  organizationId: string;
  source: CopilotoConversationSource;
  status: CopilotoConversationStatus;
  title: string | null;
  externalMeetingId: string | null;
  leadId: string | null;
  companyId: string | null;
  contactId: string | null;
  consentStatus: CopilotoConsentStatus;
  createdBy: string | null;
  startedAt: Date | null;
  endedAt: Date | null;
  audioObjectKey: string | null;
  audioMimeType: string | null;
  audioSizeBytes: number | null;
  audioDurationMs: number | null;
  transcriptionStartedAt: Date | null;
  transcriptionCompletedAt: Date | null;
  transcriptionError: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CompleteAudioUploadInput {
  objectKey: string;
  mimeType: string;
  sizeBytes: number;
  durationMs?: number;
}

export interface CreateConversationInput {
  source: CopilotoConversationSource;
  title?: string;
  externalMeetingId?: string;
  leadId?: string;
  companyId?: string;
  contactId?: string;
}

export interface CopilotoTranscriptSegmentDTO {
  id: string;
  conversationId: string;
  speakerLabel: string | null;
  startMs: number;
  endMs: number;
  text: string;
  confidence: number | null;
  createdAt: Date;
}

export interface AddTranscriptSegmentInput {
  speakerLabel?: string;
  startMs: number;
  endMs: number;
  text: string;
  confidence?: number;
}

export interface CopilotoInsightDTO {
  id: string;
  conversationId: string;
  type: string;
  valueJson: unknown;
  confidence: number | null;
  evidenceSegmentIds: string[];
  createdAt: Date;
}

export interface CreateInsightInput {
  type: string;
  valueJson: unknown;
  confidence?: number;
  evidenceSegmentIds?: string[];
}

export interface CopilotoCrmFieldSuggestionDTO {
  id: string;
  conversationId: string;
  entityType: CopilotoCrmEntityType;
  entityId: string;
  fieldCode: string;
  previousValue: string | null;
  suggestedValue: string;
  confidence: number | null;
  status: CopilotoSuggestionStatus;
  approvedBy: string | null;
  approvedAt: Date | null;
  writebackAt: Date | null;
  writebackError: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/** Onda 4 — mapeamento `semantic_field -> UF_CRM_*` real do portal Bitrix DESTA organização,
 * nunca um código assumido/hardcoded (ver comentário grande em `CopilotoBitrixFieldMapping` no
 * schema). */
export interface CopilotoBitrixFieldMappingDTO {
  id: string;
  entityType: CopilotoCrmEntityType;
  semanticField: string;
  bitrixFieldCode: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface UpsertBitrixFieldMappingInput {
  entityType: CopilotoCrmEntityType;
  semanticField: string;
  bitrixFieldCode: string;
}

export interface CreateCrmFieldSuggestionInput {
  entityType: CopilotoCrmEntityType;
  entityId: string;
  fieldCode: string;
  previousValue?: string;
  suggestedValue: string;
  confidence?: number;
}

export interface CopilotoDealHealthSnapshotDTO {
  id: string;
  leadId: string;
  score: number;
  factorsJson: unknown;
  createdAt: Date;
}

export interface CreateDealHealthSnapshotInput {
  leadId: string;
  score: number;
  factorsJson: unknown;
}

export interface CopilotoConsentRecordDTO {
  id: string;
  conversationId: string;
  method: string;
  textVersion: string;
  actorId: string | null;
  grantedAt: Date | null;
  declinedAt: Date | null;
  createdAt: Date;
}

export interface RecordConsentInput {
  method: string;
  textVersion: string;
  actorId?: string;
  granted: boolean;
}

export interface ConversationFilter {
  status?: CopilotoConversationStatus;
  leadId?: string;
  companyId?: string;
  contactId?: string;
}

export interface CopilotoConversationDetailDTO extends CopilotoConversationDTO {
  transcriptSegments: CopilotoTranscriptSegmentDTO[];
  insights: CopilotoInsightDTO[];
  crmFieldSuggestions: CopilotoCrmFieldSuggestionDTO[];
  consentRecords: CopilotoConsentRecordDTO[];
}

/** Estado mínimo lido antes de mudar/anexar dado a uma conversa — evita buscar as 4 listas
 * aninhadas de `CopilotoConversationDetailDTO` só para checar uma transição de status. */
export interface ConversationStateDTO {
  status: CopilotoConversationStatus;
  consentStatus: CopilotoConsentStatus;
  title: string | null;
  audioObjectKey: string | null;
  audioMimeType: string | null;
  /** Onda 5: sem Lead vinculado, não há "oportunidade" pra calcular Deal Health Score sobre. */
  leadId: string | null;
}

export interface CopilotoIaRepository {
  /**
   * Confirma que o Lead/Company/Contact referenciado pertence à MESMA organização antes de gravar
   * o vínculo — o FK do Postgres sozinho não garante isso (checagem de FK roda sem RLS, ver
   * AGENTS.md deste módulo), então sem esta checagem explícita um `leadId`/`companyId`/`contactId`
   * de outro tenant seria aceito silenciosamente.
   */
  leadExists(organizationId: string, id: string): Promise<boolean>;
  companyExists(organizationId: string, id: string): Promise<boolean>;
  contactExists(organizationId: string, id: string): Promise<boolean>;
  createConversation(
    organizationId: string,
    data: CreateConversationInput & { consentStatus: CopilotoConsentStatus; createdBy?: string },
  ): Promise<CopilotoConversationDTO>;
  getConversationState(organizationId: string, id: string): Promise<ConversationStateDTO | null>;
  getConversationById(
    organizationId: string,
    id: string,
  ): Promise<CopilotoConversationDetailDTO | null>;
  listConversations(
    organizationId: string,
    filter: ConversationFilter,
  ): Promise<CopilotoConversationDTO[]>;
  updateConversationStatus(
    organizationId: string,
    id: string,
    data: { status: CopilotoConversationStatus; startedAt?: Date; endedAt?: Date },
  ): Promise<CopilotoConversationDTO>;
  updateConversationConsentStatus(
    organizationId: string,
    id: string,
    consentStatus: CopilotoConsentStatus,
  ): Promise<CopilotoConversationDTO>;
  updateConversationAudio(
    organizationId: string,
    id: string,
    data: CompleteAudioUploadInput,
  ): Promise<CopilotoConversationDTO>;
  updateTranscriptionStatus(
    organizationId: string,
    id: string,
    data: {
      transcriptionStartedAt?: Date;
      transcriptionCompletedAt?: Date;
      transcriptionError?: string | null;
    },
  ): Promise<CopilotoConversationDTO>;
  createConsentRecord(
    organizationId: string,
    conversationId: string,
    data: RecordConsentInput,
  ): Promise<CopilotoConsentRecordDTO>;
  addTranscriptSegments(
    organizationId: string,
    conversationId: string,
    segments: AddTranscriptSegmentInput[],
  ): Promise<CopilotoTranscriptSegmentDTO[]>;
  listTranscriptSegmentIds(organizationId: string, conversationId: string): Promise<string[]>;
  createInsight(
    organizationId: string,
    conversationId: string,
    data: CreateInsightInput,
  ): Promise<CopilotoInsightDTO>;
  listInsights(organizationId: string, conversationId: string): Promise<CopilotoInsightDTO[]>;
  createCrmFieldSuggestion(
    organizationId: string,
    conversationId: string,
    data: CreateCrmFieldSuggestionInput,
  ): Promise<CopilotoCrmFieldSuggestionDTO>;
  getCrmFieldSuggestionById(
    organizationId: string,
    id: string,
  ): Promise<CopilotoCrmFieldSuggestionDTO | null>;
  updateCrmFieldSuggestionStatus(
    organizationId: string,
    id: string,
    data: {
      status: CopilotoSuggestionStatus;
      approvedBy?: string;
      approvedAt?: Date;
      writebackAt?: Date;
      writebackError?: string | null;
    },
  ): Promise<CopilotoCrmFieldSuggestionDTO>;
  createDealHealthSnapshot(
    organizationId: string,
    data: CreateDealHealthSnapshotInput,
  ): Promise<CopilotoDealHealthSnapshotDTO>;
  listDealHealthSnapshots(
    organizationId: string,
    leadId: string,
  ): Promise<CopilotoDealHealthSnapshotDTO[]>;

  /** Onda 4 — mapeamento de campo Bitrix, ver `CopilotoBitrixFieldMappingDTO`. */
  upsertBitrixFieldMapping(
    organizationId: string,
    data: UpsertBitrixFieldMappingInput,
  ): Promise<CopilotoBitrixFieldMappingDTO>;
  listBitrixFieldMappings(organizationId: string): Promise<CopilotoBitrixFieldMappingDTO[]>;
  deleteBitrixFieldMapping(organizationId: string, id: string): Promise<void>;
  getBitrixFieldCode(
    organizationId: string,
    entityType: CopilotoCrmEntityType,
    semanticField: string,
  ): Promise<string | null>;
  /** `null` quando o Lead não existe nesta organização OU ainda não tem `bitrixLeadId` (nunca
   * sincronizado com o Bitrix) — o chamador não distingue os dois casos, ambos impedem writeback. */
  getLeadBitrixId(organizationId: string, leadId: string): Promise<string | null>;
}
