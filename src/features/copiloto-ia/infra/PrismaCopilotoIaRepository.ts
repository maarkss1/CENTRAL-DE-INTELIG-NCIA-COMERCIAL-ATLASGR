import { prisma } from '../../../lib/prisma.js';
import type {
  CopilotoIaRepository,
  CreateConversationInput,
  CopilotoConversationDTO,
  CopilotoConversationDetailDTO,
  ConversationFilter,
  ConversationStateDTO,
  CopilotoConversationStatus,
  CopilotoConsentStatus,
  AddTranscriptSegmentInput,
  CopilotoTranscriptSegmentDTO,
  CreateInsightInput,
  CopilotoInsightDTO,
  CreateCrmFieldSuggestionInput,
  CopilotoCrmFieldSuggestionDTO,
  CopilotoSuggestionStatus,
  CreateDealHealthSnapshotInput,
  CopilotoDealHealthSnapshotDTO,
  RecordConsentInput,
  CopilotoConsentRecordDTO,
  CompleteAudioUploadInput,
} from '../domain/CopilotoIa';

const CONVERSATION_DETAIL_INCLUDE = {
  transcriptSegments: { orderBy: { startMs: 'asc' as const } },
  insights: { orderBy: { createdAt: 'asc' as const } },
  crmFieldSuggestions: { orderBy: { createdAt: 'asc' as const } },
  consentRecords: { orderBy: { createdAt: 'asc' as const } },
};

export class PrismaCopilotoIaRepository implements CopilotoIaRepository {
  async leadExists(organizationId: string, id: string): Promise<boolean> {
    const count = await prisma.lead.count({ where: { id, organizationId } });
    return count > 0;
  }

  async companyExists(organizationId: string, id: string): Promise<boolean> {
    const count = await prisma.company.count({ where: { id, organizationId } });
    return count > 0;
  }

  async contactExists(organizationId: string, id: string): Promise<boolean> {
    const count = await prisma.contact.count({ where: { id, organizationId } });
    return count > 0;
  }

  async createConversation(
    organizationId: string,
    data: CreateConversationInput & { consentStatus: CopilotoConsentStatus; createdBy?: string },
  ): Promise<CopilotoConversationDTO> {
    return prisma.copilotoConversation.create({
      data: {
        organizationId,
        source: data.source,
        title: data.title,
        externalMeetingId: data.externalMeetingId,
        leadId: data.leadId,
        companyId: data.companyId,
        contactId: data.contactId,
        consentStatus: data.consentStatus,
        createdBy: data.createdBy,
      },
    });
  }

  async getConversationState(
    organizationId: string,
    id: string,
  ): Promise<ConversationStateDTO | null> {
    return prisma.copilotoConversation.findFirst({
      where: { id, organizationId },
      select: {
        status: true,
        consentStatus: true,
        title: true,
        audioObjectKey: true,
        audioMimeType: true,
      },
    });
  }

  async getConversationById(
    organizationId: string,
    id: string,
  ): Promise<CopilotoConversationDetailDTO | null> {
    return prisma.copilotoConversation.findFirst({
      where: { id, organizationId },
      include: CONVERSATION_DETAIL_INCLUDE,
    }) as Promise<CopilotoConversationDetailDTO | null>;
  }

  async listConversations(
    organizationId: string,
    filter: ConversationFilter,
  ): Promise<CopilotoConversationDTO[]> {
    return prisma.copilotoConversation.findMany({
      where: {
        organizationId,
        status: filter.status,
        leadId: filter.leadId,
        companyId: filter.companyId,
        contactId: filter.contactId,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async updateConversationStatus(
    organizationId: string,
    id: string,
    data: { status: CopilotoConversationStatus; startedAt?: Date; endedAt?: Date },
  ): Promise<CopilotoConversationDTO> {
    return prisma.copilotoConversation.update({
      where: { id, organizationId },
      data,
    });
  }

  async updateConversationConsentStatus(
    organizationId: string,
    id: string,
    consentStatus: CopilotoConsentStatus,
  ): Promise<CopilotoConversationDTO> {
    return prisma.copilotoConversation.update({
      where: { id, organizationId },
      data: { consentStatus },
    });
  }

  async updateConversationAudio(
    organizationId: string,
    id: string,
    data: CompleteAudioUploadInput,
  ): Promise<CopilotoConversationDTO> {
    return prisma.copilotoConversation.update({
      where: { id, organizationId },
      data: {
        audioObjectKey: data.objectKey,
        audioMimeType: data.mimeType,
        audioSizeBytes: data.sizeBytes,
        audioDurationMs: data.durationMs,
      },
    });
  }

  async updateTranscriptionStatus(
    organizationId: string,
    id: string,
    data: {
      transcriptionStartedAt?: Date;
      transcriptionCompletedAt?: Date;
      transcriptionError?: string | null;
    },
  ): Promise<CopilotoConversationDTO> {
    return prisma.copilotoConversation.update({
      where: { id, organizationId },
      data,
    });
  }

  async createConsentRecord(
    organizationId: string,
    conversationId: string,
    data: RecordConsentInput,
  ): Promise<CopilotoConsentRecordDTO> {
    const now = new Date();
    return prisma.copilotoConsentRecord.create({
      data: {
        organizationId,
        conversationId,
        method: data.method,
        textVersion: data.textVersion,
        actorId: data.actorId,
        grantedAt: data.granted ? now : null,
        declinedAt: data.granted ? null : now,
      },
    });
  }

  async addTranscriptSegments(
    organizationId: string,
    conversationId: string,
    segments: AddTranscriptSegmentInput[],
  ): Promise<CopilotoTranscriptSegmentDTO[]> {
    await prisma.copilotoTranscriptSegment.createMany({
      data: segments.map((segment) => ({
        organizationId,
        conversationId,
        speakerLabel: segment.speakerLabel,
        startMs: segment.startMs,
        endMs: segment.endMs,
        text: segment.text,
        confidence: segment.confidence,
      })),
    });
    return prisma.copilotoTranscriptSegment.findMany({
      where: { organizationId, conversationId },
      orderBy: { startMs: 'asc' },
    });
  }

  async listTranscriptSegmentIds(
    organizationId: string,
    conversationId: string,
  ): Promise<string[]> {
    const rows = await prisma.copilotoTranscriptSegment.findMany({
      where: { organizationId, conversationId },
      select: { id: true },
    });
    return rows.map((row) => row.id);
  }

  async createInsight(
    organizationId: string,
    conversationId: string,
    data: CreateInsightInput,
  ): Promise<CopilotoInsightDTO> {
    return prisma.copilotoInsight.create({
      data: {
        organizationId,
        conversationId,
        type: data.type,
        valueJson: data.valueJson as never,
        confidence: data.confidence,
        evidenceSegmentIds: data.evidenceSegmentIds ?? [],
      },
    });
  }

  async listInsights(
    organizationId: string,
    conversationId: string,
  ): Promise<CopilotoInsightDTO[]> {
    return prisma.copilotoInsight.findMany({
      where: { organizationId, conversationId },
      orderBy: { createdAt: 'asc' },
    });
  }

  async createCrmFieldSuggestion(
    organizationId: string,
    conversationId: string,
    data: CreateCrmFieldSuggestionInput,
  ): Promise<CopilotoCrmFieldSuggestionDTO> {
    return prisma.copilotoCrmFieldSuggestion.create({
      data: {
        organizationId,
        conversationId,
        entityType: data.entityType,
        entityId: data.entityId,
        fieldCode: data.fieldCode,
        previousValue: data.previousValue,
        suggestedValue: data.suggestedValue,
        confidence: data.confidence,
      },
    });
  }

  async getCrmFieldSuggestionById(
    organizationId: string,
    id: string,
  ): Promise<CopilotoCrmFieldSuggestionDTO | null> {
    return prisma.copilotoCrmFieldSuggestion.findFirst({ where: { id, organizationId } });
  }

  async updateCrmFieldSuggestionStatus(
    organizationId: string,
    id: string,
    data: { status: CopilotoSuggestionStatus; approvedBy?: string; approvedAt?: Date },
  ): Promise<CopilotoCrmFieldSuggestionDTO> {
    return prisma.copilotoCrmFieldSuggestion.update({
      where: { id, organizationId },
      data,
    });
  }

  async createDealHealthSnapshot(
    organizationId: string,
    data: CreateDealHealthSnapshotInput,
  ): Promise<CopilotoDealHealthSnapshotDTO> {
    return prisma.copilotoDealHealthSnapshot.create({
      data: {
        organizationId,
        leadId: data.leadId,
        score: data.score,
        factorsJson: data.factorsJson as never,
      },
    });
  }

  async listDealHealthSnapshots(
    organizationId: string,
    leadId: string,
  ): Promise<CopilotoDealHealthSnapshotDTO[]> {
    return prisma.copilotoDealHealthSnapshot.findMany({
      where: { organizationId, leadId },
      orderBy: { createdAt: 'desc' },
    });
  }
}
