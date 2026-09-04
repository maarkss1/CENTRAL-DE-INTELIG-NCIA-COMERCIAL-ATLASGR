/**
 * Client HTTP do Copiloto Comercial IA — mesmo padrão de `commercial-intelligence/
 * commercialIntelligence.api.ts` (funções tipadas sobre `api.get/post/patch/delete`, sem
 * React Query). Os tipos abaixo espelham `src/features/copiloto-ia/domain/CopilotoIa.ts` e
 * `application/whatsappResponseTime.ts` do backend — não são importáveis diretamente (o backend
 * não faz parte do bundle do cliente), então são redeclarados aqui. Datas chegam como string ISO
 * (serialização JSON), nunca como `Date`.
 */
import { api } from '../../lib/api';

const BASE = '/api/copiloto-ia';

export type CopilotoConversationSource = 'MEET' | 'CALL' | 'WHATSAPP' | 'MANUAL' | 'OTHER';
export type CopilotoConversationStatus =
  | 'SCHEDULED'
  | 'CAPTURING'
  | 'PROCESSING'
  | 'READY'
  | 'FAILED'
  | 'CANCELLED';
export type CopilotoConsentStatus = 'PENDING' | 'GRANTED' | 'DECLINED' | 'NOT_REQUIRED';
export type CopilotoCrmEntityType = 'LEAD' | 'COMPANY' | 'CONTACT';
export type CopilotoSuggestionStatus =
  | 'PENDING'
  | 'APPROVED'
  | 'REJECTED'
  | 'WRITTEN_BACK'
  | 'FAILED';

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
  startedAt: string | null;
  endedAt: string | null;
  audioObjectKey: string | null;
  audioMimeType: string | null;
  audioSizeBytes: number | null;
  audioDurationMs: number | null;
  transcriptionStartedAt: string | null;
  transcriptionCompletedAt: string | null;
  transcriptionError: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CopilotoTranscriptSegmentDTO {
  id: string;
  conversationId: string;
  speakerLabel: string | null;
  startMs: number;
  endMs: number;
  text: string;
  confidence: number | null;
  createdAt: string;
}

export interface CopilotoInsightDTO {
  id: string;
  conversationId: string;
  type: string;
  valueJson: unknown;
  confidence: number | null;
  evidenceSegmentIds: string[];
  createdAt: string;
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
  approvedAt: string | null;
  writebackAt: string | null;
  writebackError: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CopilotoConsentRecordDTO {
  id: string;
  conversationId: string;
  method: string;
  textVersion: string;
  actorId: string | null;
  grantedAt: string | null;
  declinedAt: string | null;
  createdAt: string;
}

export interface CopilotoConversationDetailDTO extends CopilotoConversationDTO {
  transcriptSegments: CopilotoTranscriptSegmentDTO[];
  insights: CopilotoInsightDTO[];
  crmFieldSuggestions: CopilotoCrmFieldSuggestionDTO[];
  consentRecords: CopilotoConsentRecordDTO[];
}

export interface CopilotoDealHealthSnapshotDTO {
  id: string;
  leadId: string;
  score: number;
  factorsJson: unknown;
  forecastProbabilityAi: number | null;
  forecastReasons: string[];
  churnRiskScore: number | null;
  churnFactorsJson: unknown;
  createdAt: string;
}

export interface CopilotoCoachingEvaluationDTO {
  id: string;
  conversationId: string;
  rubricJson: unknown;
  overallScore: number;
  createdAt: string;
}

export interface HandoffSummaryDTO {
  conversation: CopilotoConversationDetailDTO;
  summary: MeetingSynthesisOutput | null;
  objections: CopilotoInsightDTO[];
  competitors: CopilotoInsightDTO[];
  buyingSignals: CopilotoInsightDTO[];
  complaints: CopilotoInsightDTO[];
  promises: CopilotoInsightDTO[];
  blockers: CopilotoInsightDTO[];
  latestDealHealth: CopilotoDealHealthSnapshotDTO | null;
  coachingEvaluation: CopilotoCoachingEvaluationDTO | null;
  isComplete: boolean;
  missingParts: string[];
}

export interface CopilotoBitrixFieldMappingDTO {
  id: string;
  entityType: CopilotoCrmEntityType;
  semanticField: string;
  bitrixFieldCode: string;
  createdAt: string;
  updatedAt: string;
}

export interface WhatsAppResponseTimeStats {
  firstResponseMs: number | null;
  averageResponseMs: number | null;
  medianResponseMs: number | null;
  sampleCount: number;
  hasPendingResponse: boolean;
  pendingSinceMs: number | null;
}

// ─── Shapes de `valueJson` por tipo de insight (infra/conversationIntelligence.service.ts) ───────

export interface ObjectionSignal {
  text: string;
  resolved: boolean;
}
export interface CompetitorSignal {
  name: string;
  context: string;
}
export interface BuyingSignalItem {
  text: string;
  strength: 'alta' | 'media' | 'baixa';
}
export interface ComplaintSignal {
  text: string;
  severity: 'alta' | 'media' | 'baixa';
}
export interface PromiseSignal {
  text: string;
  owner: 'atlas' | 'cliente' | 'indefinido';
}
export interface BlockerSignal {
  text: string;
}

/** `valueJson` do insight `type: 'resumo'` (`src/shared/contracts/meetingSynthesis.contract.ts`). */
export interface MeetingSynthesisOutput {
  executiveSummary: string;
  keyPainsIdentified: string[];
  agreedPoints: string[];
  unresolvedObjections: string[];
  actionItems: { assignee: string; description: string; deadlineDays?: number }[];
  dealStageRecommendation?: string;
  sentimentScore: 'Muito Positivo' | 'Positivo' | 'Neutro / Cauteloso' | 'Negativo';
}

/** `factorsJson` do Deal Health Score (`application/dealHealthScoring.ts`). */
export interface DealHealthScoreFactors {
  sentimentBase: number;
  objectionPenalty: number;
  buyingSignalBonus: number;
  competitorPenalty: number;
  conversationId?: string;
  sentimentScore?: string | null;
}

/** `churnFactorsJson` do risco de churn (`application/dealHealthScoring.ts`). */
export interface ChurnRiskScoreFactors {
  sentimentBase: number;
  complaintPenalty: number;
  highSeverityComplaintPenalty: number;
  blockerPenalty: number;
}

/** Uma dimensão do rubric de coaching (`infra/coachingEvaluation.service.ts`). */
export interface CoachingRubricDimension {
  score: number;
  evidence: string;
}

/** `rubricJson` completo — as 9 dimensões fixas do coaching. */
export interface CoachingRubricOutput {
  descoberta: CoachingRubricDimension;
  qualificacao: CoachingRubricDimension;
  escuta: CoachingRubricDimension;
  objecoes: CoachingRubricDimension;
  clareza: CoachingRubricDimension;
  produto: CoachingRubricDimension;
  proximoPasso: CoachingRubricDimension;
  aderenciaPlaybook: CoachingRubricDimension;
  qualidadeRegistro: CoachingRubricDimension;
}

export const SUGGESTION_STATUS_LABEL: Record<CopilotoSuggestionStatus, string> = {
  PENDING: 'Pendente',
  APPROVED: 'Aprovada',
  REJECTED: 'Rejeitada',
  WRITTEN_BACK: 'Enviada ao Bitrix24',
  FAILED: 'Falhou',
};

export const COACHING_DIMENSION_LABELS: Record<keyof CoachingRubricOutput, string> = {
  descoberta: 'Descoberta',
  qualificacao: 'Qualificação',
  escuta: 'Escuta ativa',
  objecoes: 'Tratamento de objeções',
  clareza: 'Clareza da proposta',
  produto: 'Domínio de produto',
  proximoPasso: 'Próximo passo',
  aderenciaPlaybook: 'Aderência ao playbook',
  qualidadeRegistro: 'Qualidade do registro',
};

// ─── Requests ──────────────────────────────────────────────────────────────────────────────────

export interface ConversationFilter {
  status?: CopilotoConversationStatus;
  leadId?: string;
  companyId?: string;
  contactId?: string;
}

export interface UpsertBitrixFieldMappingInput {
  entityType: CopilotoCrmEntityType;
  semanticField: string;
  bitrixFieldCode: string;
}

function qs(params: Record<string, string | undefined>): string {
  const entries = Object.entries(params).filter(
    (entry): entry is [string, string] => entry[1] !== undefined && entry[1] !== '',
  );
  if (entries.length === 0) return '';
  return `?${new URLSearchParams(entries).toString()}`;
}

export const copilotoIaApi = {
  listConversations: (filter: ConversationFilter = {}) =>
    api.get<CopilotoConversationDTO[]>(
      `${BASE}/conversations${qs(filter as Record<string, string | undefined>)}`,
    ),
  getConversation: (id: string) =>
    api.get<CopilotoConversationDetailDTO>(`${BASE}/conversations/${id}`),
  getHandoff: (id: string) => api.get<HandoffSummaryDTO>(`${BASE}/conversations/${id}/handoff`),
  getCoaching: (id: string) =>
    api.get<CopilotoCoachingEvaluationDTO | null>(`${BASE}/conversations/${id}/coaching`),

  approveSuggestion: (suggestionId: string) =>
    api.patch<CopilotoCrmFieldSuggestionDTO>(
      `${BASE}/crm-field-suggestions/${suggestionId}/approve`,
    ),
  rejectSuggestion: (suggestionId: string) =>
    api.patch<CopilotoCrmFieldSuggestionDTO>(
      `${BASE}/crm-field-suggestions/${suggestionId}/reject`,
    ),
  writebackSuggestion: (suggestionId: string) =>
    api.post<CopilotoCrmFieldSuggestionDTO>(
      `${BASE}/crm-field-suggestions/${suggestionId}/writeback`,
    ),

  getLeadDealHealth: (leadId: string) =>
    api.get<CopilotoDealHealthSnapshotDTO[]>(`${BASE}/leads/${leadId}/deal-health`),
  getLeadWhatsAppResponseTime: (leadId: string) =>
    api.get<WhatsAppResponseTimeStats>(`${BASE}/leads/${leadId}/whatsapp-response-time`),

  listBitrixFieldMappings: () =>
    api.get<CopilotoBitrixFieldMappingDTO[]>(`${BASE}/bitrix-field-mappings`),
  upsertBitrixFieldMapping: (input: UpsertBitrixFieldMappingInput) =>
    api.post<CopilotoBitrixFieldMappingDTO>(`${BASE}/bitrix-field-mappings`, input),
  deleteBitrixFieldMapping: (id: string) => api.delete<void>(`${BASE}/bitrix-field-mappings/${id}`),
};
