import { prisma } from '../../../lib/prisma.js';
import { contactSearchIndexClauses } from '../../../lib/crypto/piiIndex.js';
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
  CopilotoCrmEntityType,
  CopilotoBitrixFieldMappingDTO,
  UpsertBitrixFieldMappingInput,
  CreateCoachingEvaluationInput,
  CopilotoCoachingEvaluationDTO,
  LeadLookupResultDTO,
} from '../domain/CopilotoIa';
import type { WhatsAppMessageTiming } from '../application/whatsappResponseTime';
import { parseLeadLookupQuery } from '../application/leadLookup.js';

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

  async findLeadByLookup(
    organizationId: string,
    query: string,
  ): Promise<LeadLookupResultDTO | null> {
    const parsed = parseLeadLookupQuery(query);
    const include = { company: true, contact: true } as const;

    let lead: {
      id: string;
      title: string | null;
      company: { tradeName: string | null; legalName: string | null } | null;
      contact: { name: string | null } | null;
    } | null = null;

    if (parsed.type === 'bitrix') {
      lead = await prisma.lead.findFirst({
        where: { organizationId, OR: [{ bitrixLeadId: parsed.id }, { bitrixDealId: parsed.id }] },
        include,
        orderBy: { updatedAt: 'desc' },
      });
    } else if (parsed.type === 'email') {
      // `contactSearchIndexClauses` também gera cláusula de telefone quando o texto tem dígitos
      // suficientes — aqui só o e-mail interessa (o telefone não é uma forma de lookup pedida),
      // então filtra pela chave certa em vez de aceitar qualquer cláusula que a função devolver.
      const emailClauses = contactSearchIndexClauses(parsed.value).filter(
        (clause) => 'emailIndex' in clause,
      );
      const contact =
        emailClauses.length > 0
          ? await prisma.contact.findFirst({ where: { organizationId, OR: emailClauses } })
          : null;
      lead = contact
        ? await prisma.lead.findFirst({
            where: { organizationId, contactId: contact.id },
            include,
            orderBy: { updatedAt: 'desc' },
          })
        : null;
    } else {
      lead = await prisma.lead.findFirst({
        where: { organizationId, id: parsed.value },
        include,
      });
    }

    if (!lead) return null;
    return {
      id: lead.id,
      title: lead.title,
      companyName: lead.company?.tradeName ?? lead.company?.legalName ?? null,
      contactName: lead.contact?.name ?? null,
    };
  }

  async searchLeadsByName(
    organizationId: string,
    query: string,
    limit: number,
  ): Promise<LeadLookupResultDTO[]> {
    const leads = await prisma.lead.findMany({
      where: {
        organizationId,
        OR: [
          { title: { contains: query, mode: 'insensitive' } },
          { contact: { name: { contains: query, mode: 'insensitive' } } },
          { company: { tradeName: { contains: query, mode: 'insensitive' } } },
          { company: { legalName: { contains: query, mode: 'insensitive' } } },
        ],
      },
      include: { company: true, contact: true },
      orderBy: { updatedAt: 'desc' },
      take: limit,
    });
    return leads.map((lead) => ({
      id: lead.id,
      title: lead.title,
      companyName: lead.company?.tradeName ?? lead.company?.legalName ?? null,
      contactName: lead.contact?.name ?? null,
    }));
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
        leadId: true,
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
    data: {
      status: CopilotoSuggestionStatus;
      approvedBy?: string;
      approvedAt?: Date;
      writebackAt?: Date;
      writebackError?: string | null;
    },
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
        forecastProbabilityAi: data.forecastProbabilityAi,
        forecastReasons: data.forecastReasons ?? [],
        churnRiskScore: data.churnRiskScore,
        churnFactorsJson: (data.churnFactorsJson ?? undefined) as never,
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

  async upsertBitrixFieldMapping(
    organizationId: string,
    data: UpsertBitrixFieldMappingInput,
  ): Promise<CopilotoBitrixFieldMappingDTO> {
    return prisma.copilotoBitrixFieldMapping.upsert({
      where: {
        organizationId_entityType_semanticField: {
          organizationId,
          entityType: data.entityType,
          semanticField: data.semanticField,
        },
      },
      create: {
        organizationId,
        entityType: data.entityType,
        semanticField: data.semanticField,
        bitrixFieldCode: data.bitrixFieldCode,
      },
      update: { bitrixFieldCode: data.bitrixFieldCode },
    });
  }

  async listBitrixFieldMappings(organizationId: string): Promise<CopilotoBitrixFieldMappingDTO[]> {
    return prisma.copilotoBitrixFieldMapping.findMany({
      where: { organizationId },
      orderBy: [{ entityType: 'asc' }, { semanticField: 'asc' }],
    });
  }

  async deleteBitrixFieldMapping(organizationId: string, id: string): Promise<void> {
    await prisma.copilotoBitrixFieldMapping.deleteMany({ where: { id, organizationId } });
  }

  async getBitrixFieldCode(
    organizationId: string,
    entityType: CopilotoCrmEntityType,
    semanticField: string,
  ): Promise<string | null> {
    const mapping = await prisma.copilotoBitrixFieldMapping.findFirst({
      where: { organizationId, entityType, semanticField },
      select: { bitrixFieldCode: true },
    });
    return mapping?.bitrixFieldCode ?? null;
  }

  async getLeadBitrixId(organizationId: string, leadId: string): Promise<string | null> {
    const lead = await prisma.lead.findFirst({
      where: { id: leadId, organizationId },
      select: { bitrixLeadId: true },
    });
    return lead?.bitrixLeadId ?? null;
  }

  async getCompanyBitrixId(organizationId: string, companyId: string): Promise<string | null> {
    const company = await prisma.company.findFirst({
      where: { id: companyId, organizationId },
      select: { bitrixCompanyId: true },
    });
    return company?.bitrixCompanyId ?? null;
  }

  async getContactBitrixId(organizationId: string, contactId: string): Promise<string | null> {
    const contact = await prisma.contact.findFirst({
      where: { id: contactId, organizationId },
      select: { bitrixContactId: true },
    });
    return contact?.bitrixContactId ?? null;
  }

  async getLeadProbability(organizationId: string, leadId: string): Promise<number | null> {
    const lead = await prisma.lead.findFirst({
      where: { id: leadId, organizationId },
      select: { probability: true },
    });
    return lead?.probability ?? null;
  }

  async latestDealHealthSnapshot(
    organizationId: string,
    leadId: string,
  ): Promise<CopilotoDealHealthSnapshotDTO | null> {
    return prisma.copilotoDealHealthSnapshot.findFirst({
      where: { organizationId, leadId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async createCoachingEvaluation(
    organizationId: string,
    conversationId: string,
    data: CreateCoachingEvaluationInput,
  ): Promise<CopilotoCoachingEvaluationDTO> {
    return prisma.copilotoCoachingEvaluation.create({
      data: {
        organizationId,
        conversationId,
        rubricJson: data.rubricJson as never,
        overallScore: data.overallScore,
      },
    });
  }

  async getCoachingEvaluationByConversation(
    organizationId: string,
    conversationId: string,
  ): Promise<CopilotoCoachingEvaluationDTO | null> {
    return prisma.copilotoCoachingEvaluation.findFirst({
      where: { organizationId, conversationId },
    });
  }

  async getWhatsAppMessageTimingsForLead(
    organizationId: string,
    leadId: string,
  ): Promise<WhatsAppMessageTiming[]> {
    const messages = await prisma.whatsAppMessage.findMany({
      where: { organizationId, leadId },
      select: { direction: true, receivedAt: true },
      orderBy: { receivedAt: 'asc' },
    });
    return messages.map((message) => ({
      direction: message.direction === 'outbound' ? 'outbound' : 'inbound',
      receivedAt: message.receivedAt,
    }));
  }
}
