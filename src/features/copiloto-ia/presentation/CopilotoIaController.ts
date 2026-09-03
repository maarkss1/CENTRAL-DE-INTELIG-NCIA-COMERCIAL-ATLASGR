import { randomUUID } from 'node:crypto';
import type { Request, Response, NextFunction } from 'express';
import { AppError } from '../../../shared/middlewares/errorHandler';
import { AuditService } from '../../../lib/audit/audit.service';
import { getUploadUrl } from '../../../lib/storage/index.js';
import { enqueueTranscribeConversationJob } from '../jobs/transcribeConversation.worker.js';
import type { AuthRequest } from '../../../shared/middlewares/authenticateToken';
import type { CopilotoIaUseCases } from '../application/CopilotoIaUseCases';
import type { CopilotoBitrixWritebackUseCases } from '../application/CopilotoBitrixWritebackUseCases';
import type {
  CopilotoConversationSource,
  CopilotoConversationStatus,
  CopilotoCrmEntityType,
} from '../domain/CopilotoIa';

const VALID_SOURCES: CopilotoConversationSource[] = ['MEET', 'CALL', 'WHATSAPP', 'MANUAL', 'OTHER'];
const VALID_STATUSES: CopilotoConversationStatus[] = [
  'SCHEDULED',
  'CAPTURING',
  'PROCESSING',
  'READY',
  'FAILED',
  'CANCELLED',
];
const VALID_ENTITY_TYPES: CopilotoCrmEntityType[] = ['LEAD', 'COMPANY', 'CONTACT'];

function requireString(body: Record<string, unknown>, field: string): string {
  const value = body[field];
  if (typeof value !== 'string' || !value.trim()) {
    throw new AppError(`Campo obrigatório: "${field}".`, 400);
  }
  return value;
}

function optionalString(body: Record<string, unknown>, field: string): string | undefined {
  const value = body[field];
  return typeof value === 'string' && value.trim() ? value : undefined;
}

function requireNumber(body: Record<string, unknown>, field: string): number {
  const value = body[field];
  if (typeof value !== 'number' || Number.isNaN(value)) {
    throw new AppError(`Campo obrigatório numérico: "${field}".`, 400);
  }
  return value;
}

export class CopilotoIaController {
  constructor(
    private useCases: CopilotoIaUseCases,
    private writebackUseCases: CopilotoBitrixWritebackUseCases,
  ) {}

  createConversation = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { organizationId, id: userId } = (req as AuthRequest).user;
      const body = req.body as Record<string, unknown>;
      const source = requireString(body, 'source') as CopilotoConversationSource;
      if (!VALID_SOURCES.includes(source)) {
        throw new AppError(`source inválido. Valores aceitos: ${VALID_SOURCES.join(', ')}.`, 400);
      }
      const conversation = await this.useCases.createConversation(
        organizationId,
        {
          source,
          title: optionalString(body, 'title'),
          externalMeetingId: optionalString(body, 'externalMeetingId'),
          leadId: optionalString(body, 'leadId'),
          companyId: optionalString(body, 'companyId'),
          contactId: optionalString(body, 'contactId'),
        },
        userId,
      );
      res.status(201).json({ success: true, data: conversation });
    } catch (error) {
      next(error);
    }
  };

  listConversations = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { organizationId } = (req as AuthRequest).user;
      const query = req.query as Record<string, string | undefined>;
      const status =
        query.status && VALID_STATUSES.includes(query.status as CopilotoConversationStatus)
          ? (query.status as CopilotoConversationStatus)
          : undefined;
      const conversations = await this.useCases.listConversations(organizationId, {
        status,
        leadId: query.leadId || undefined,
        companyId: query.companyId || undefined,
        contactId: query.contactId || undefined,
      });
      res.json({ success: true, data: conversations });
    } catch (error) {
      next(error);
    }
  };

  getConversation = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { organizationId } = (req as AuthRequest).user;
      const conversation = await this.useCases.getConversation(organizationId, req.params.id);
      res.json({ success: true, data: conversation });
    } catch (error) {
      next(error);
    }
  };

  startCapture = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { organizationId } = (req as AuthRequest).user;
      const conversation = await this.useCases.startCapture(organizationId, req.params.id);
      res.json({ success: true, data: conversation });
    } catch (error) {
      next(error);
    }
  };

  stopCapture = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { organizationId } = (req as AuthRequest).user;
      const conversation = await this.useCases.stopCapture(organizationId, req.params.id);
      res.json({ success: true, data: conversation });
    } catch (error) {
      next(error);
    }
  };

  markReady = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { organizationId } = (req as AuthRequest).user;
      const conversation = await this.useCases.markReady(organizationId, req.params.id);
      res.json({ success: true, data: conversation });
    } catch (error) {
      next(error);
    }
  };

  markFailed = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { organizationId } = (req as AuthRequest).user;
      const conversation = await this.useCases.markFailed(organizationId, req.params.id);
      res.json({ success: true, data: conversation });
    } catch (error) {
      next(error);
    }
  };

  cancel = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { organizationId } = (req as AuthRequest).user;
      const conversation = await this.useCases.cancel(organizationId, req.params.id);
      res.json({ success: true, data: conversation });
    } catch (error) {
      next(error);
    }
  };

  recordConsent = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { organizationId, id: userId } = (req as AuthRequest).user;
      const body = req.body as Record<string, unknown>;
      const granted = body.granted === true;
      const method = requireString(body, 'method');
      const textVersion = requireString(body, 'textVersion');
      const actorId = optionalString(body, 'actorId') ?? userId;
      const record = await this.useCases.recordConsent(organizationId, req.params.id, {
        method,
        textVersion,
        actorId,
        granted,
      });
      // Consentimento é o registro mais sensível deste módulo (base legal da captura) —
      // auditoria explícita além do que a extensão automática do Prisma cobre, mesmo padrão de
      // src/features/lgpd/lgpd.routes.ts. Chamada aqui (não em CopilotoIaUseCases) para manter a
      // camada de aplicação testável sem Postgres real — ver AGENTS.md deste módulo.
      await AuditService.log({
        action: 'UPDATE',
        entity: 'COPILOTO_IA_CONSENT',
        entityId: req.params.id,
        actorId,
        tenantId: organizationId,
        ipAddress: req.ip,
        afterState: { granted, method, textVersion },
      });
      res.status(201).json({ success: true, data: record });
    } catch (error) {
      next(error);
    }
  };

  requestAudioUploadUrl = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { organizationId } = (req as AuthRequest).user;
      const conversationId = req.params.id;
      await this.useCases.assertCanUploadAudio(organizationId, conversationId);

      const body = req.body as Record<string, unknown>;
      const mimeType =
        typeof body.mimeType === 'string' && body.mimeType.trim()
          ? body.mimeType.trim()
          : 'audio/webm';
      const extension = mimeType.split('/')[1]?.split(';')[0] || 'bin';
      const objectKey = `copiloto-ia/${organizationId}/${conversationId}/${randomUUID()}.${extension}`;

      const { signedUrl } = await getUploadUrl(objectKey, mimeType);
      res.json({ success: true, data: { signedUrl, objectKey, mimeType } });
    } catch (error) {
      next(error);
    }
  };

  completeAudioUpload = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { organizationId } = (req as AuthRequest).user;
      const conversationId = req.params.id;
      const body = req.body as Record<string, unknown>;

      const conversation = await this.useCases.completeAudioUpload(organizationId, conversationId, {
        objectKey: requireString(body, 'objectKey'),
        mimeType: requireString(body, 'mimeType'),
        sizeBytes: requireNumber(body, 'sizeBytes'),
        durationMs: typeof body.durationMs === 'number' ? body.durationMs : undefined,
      });

      // Enfileirado aqui (não em CopilotoIaUseCases) pelo mesmo motivo de AuditService.log acima:
      // manter `application/` testável sem depender de Redis/BullMQ real.
      await enqueueTranscribeConversationJob({ conversationId, organizationId });

      res.json({ success: true, data: conversation });
    } catch (error) {
      next(error);
    }
  };

  addTranscriptSegments = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { organizationId } = (req as AuthRequest).user;
      const body = req.body as Record<string, unknown>;
      const rawSegments = Array.isArray(body.segments) ? body.segments : [body];
      const segments = rawSegments.map((raw) => {
        const segment = raw as Record<string, unknown>;
        return {
          speakerLabel: optionalString(segment, 'speakerLabel'),
          startMs: requireNumber(segment, 'startMs'),
          endMs: requireNumber(segment, 'endMs'),
          text: requireString(segment, 'text'),
          confidence:
            typeof segment.confidence === 'number' ? (segment.confidence as number) : undefined,
        };
      });
      const created = await this.useCases.addTranscriptSegments(
        organizationId,
        req.params.id,
        segments,
      );
      res.status(201).json({ success: true, data: created });
    } catch (error) {
      next(error);
    }
  };

  createInsight = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { organizationId } = (req as AuthRequest).user;
      const body = req.body as Record<string, unknown>;
      const insight = await this.useCases.createInsight(organizationId, req.params.id, {
        type: requireString(body, 'type'),
        valueJson: body.valueJson ?? {},
        confidence: typeof body.confidence === 'number' ? body.confidence : undefined,
        evidenceSegmentIds: Array.isArray(body.evidenceSegmentIds)
          ? (body.evidenceSegmentIds as string[])
          : undefined,
      });
      res.status(201).json({ success: true, data: insight });
    } catch (error) {
      next(error);
    }
  };

  listInsights = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { organizationId } = (req as AuthRequest).user;
      const insights = await this.useCases.listInsights(organizationId, req.params.id);
      res.json({ success: true, data: insights });
    } catch (error) {
      next(error);
    }
  };

  createCrmFieldSuggestion = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { organizationId } = (req as AuthRequest).user;
      const body = req.body as Record<string, unknown>;
      const entityType = requireString(body, 'entityType') as CopilotoCrmEntityType;
      if (!VALID_ENTITY_TYPES.includes(entityType)) {
        throw new AppError(
          `entityType inválido. Valores aceitos: ${VALID_ENTITY_TYPES.join(', ')}.`,
          400,
        );
      }
      const suggestion = await this.useCases.createCrmFieldSuggestion(
        organizationId,
        req.params.id,
        {
          entityType,
          entityId: requireString(body, 'entityId'),
          fieldCode: requireString(body, 'fieldCode'),
          previousValue: optionalString(body, 'previousValue'),
          suggestedValue: requireString(body, 'suggestedValue'),
          confidence: typeof body.confidence === 'number' ? body.confidence : undefined,
        },
      );
      res.status(201).json({ success: true, data: suggestion });
    } catch (error) {
      next(error);
    }
  };

  approveCrmFieldSuggestion = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { organizationId, id: userId } = (req as AuthRequest).user;
      const suggestion = await this.useCases.approveCrmFieldSuggestion(
        organizationId,
        req.params.id,
        userId,
      );
      // Aprovação é uma decisão humana sobre gravar um valor no CRM (mesmo antes do writeback
      // real — Onda 4/8 — existir) — auditoria explícita, mesmo raciocínio do consentimento acima.
      await AuditService.log({
        action: 'UPDATE',
        entity: 'COPILOTO_IA_CRM_FIELD_SUGGESTION',
        entityId: req.params.id,
        actorId: userId,
        tenantId: organizationId,
        ipAddress: req.ip,
        beforeState: { status: 'PENDING' },
        afterState: { status: 'APPROVED', fieldCode: suggestion.fieldCode },
      });
      res.json({ success: true, data: suggestion });
    } catch (error) {
      next(error);
    }
  };

  rejectCrmFieldSuggestion = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { organizationId, id: userId } = (req as AuthRequest).user;
      const suggestion = await this.useCases.rejectCrmFieldSuggestion(
        organizationId,
        req.params.id,
        userId,
      );
      await AuditService.log({
        action: 'UPDATE',
        entity: 'COPILOTO_IA_CRM_FIELD_SUGGESTION',
        entityId: req.params.id,
        actorId: userId,
        tenantId: organizationId,
        ipAddress: req.ip,
        beforeState: { status: 'PENDING' },
        afterState: { status: 'REJECTED', fieldCode: suggestion.fieldCode },
      });
      res.json({ success: true, data: suggestion });
    } catch (error) {
      next(error);
    }
  };

  createDealHealthSnapshot = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { organizationId } = (req as AuthRequest).user;
      const body = req.body as Record<string, unknown>;
      const snapshot = await this.useCases.recordDealHealthSnapshot(organizationId, {
        leadId: req.params.leadId,
        score: requireNumber(body, 'score'),
        factorsJson: body.factorsJson ?? {},
      });
      res.status(201).json({ success: true, data: snapshot });
    } catch (error) {
      next(error);
    }
  };

  listDealHealthSnapshots = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { organizationId } = (req as AuthRequest).user;
      const snapshots = await this.useCases.listDealHealthSnapshots(
        organizationId,
        req.params.leadId,
      );
      res.json({ success: true, data: snapshots });
    } catch (error) {
      next(error);
    }
  };

  // ─── Onda 4 — mapeamento de campo Bitrix + writeback ────────────────────

  listBitrixFieldMappings = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { organizationId } = (req as AuthRequest).user;
      const mappings = await this.writebackUseCases.listFieldMappings(organizationId);
      res.json({ success: true, data: mappings });
    } catch (error) {
      next(error);
    }
  };

  upsertBitrixFieldMapping = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { organizationId, id: userId } = (req as AuthRequest).user;
      const body = req.body as Record<string, unknown>;
      const entityType = requireString(body, 'entityType') as CopilotoCrmEntityType;
      if (!VALID_ENTITY_TYPES.includes(entityType)) {
        throw new AppError(
          `entityType inválido. Valores aceitos: ${VALID_ENTITY_TYPES.join(', ')}.`,
          400,
        );
      }
      const mapping = await this.writebackUseCases.upsertFieldMapping(organizationId, {
        entityType,
        semanticField: requireString(body, 'semanticField'),
        bitrixFieldCode: requireString(body, 'bitrixFieldCode'),
      });
      // Configuração de mapeamento é decisão administrativa que muda o destino de toda escrita
      // futura no Bitrix — auditada explicitamente, mesmo padrão do resto do módulo.
      await AuditService.log({
        action: 'UPDATE',
        entity: 'COPILOTO_IA_BITRIX_FIELD_MAPPING',
        entityId: mapping.id,
        actorId: userId,
        tenantId: organizationId,
        ipAddress: req.ip,
        afterState: { ...mapping },
      });
      res.status(201).json({ success: true, data: mapping });
    } catch (error) {
      next(error);
    }
  };

  deleteBitrixFieldMapping = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { organizationId, id: userId } = (req as AuthRequest).user;
      await this.writebackUseCases.deleteFieldMapping(organizationId, req.params.id);
      await AuditService.log({
        action: 'DELETE',
        entity: 'COPILOTO_IA_BITRIX_FIELD_MAPPING',
        entityId: req.params.id,
        actorId: userId,
        tenantId: organizationId,
        ipAddress: req.ip,
      });
      res.status(204).send();
    } catch (error) {
      next(error);
    }
  };

  writebackCrmFieldSuggestion = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { organizationId, id: userId } = (req as AuthRequest).user;
      const suggestion = await this.writebackUseCases.writebackSuggestion(
        organizationId,
        req.params.id,
      );
      // EXPORT é a mesma ação usada por exportLeadToBitrixNow (outboundSync.ts) para escrita
      // real no Bitrix — mantém o mesmo vocabulário de auditoria em toda a plataforma.
      await AuditService.log({
        action: 'EXPORT',
        entity: 'COPILOTO_IA_CRM_FIELD_SUGGESTION',
        entityId: suggestion.id,
        actorId: userId,
        tenantId: organizationId,
        ipAddress: req.ip,
        afterState: { status: suggestion.status, writebackError: suggestion.writebackError },
      });
      res.json({ success: true, data: suggestion });
    } catch (error) {
      next(error);
    }
  };

  // ─── Onda 6 — Coaching + Handoff ─────────────────────────────────────────

  getCoachingEvaluation = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { organizationId } = (req as AuthRequest).user;
      const evaluation = await this.useCases.getCoachingEvaluation(organizationId, req.params.id);
      res.json({ success: true, data: evaluation });
    } catch (error) {
      next(error);
    }
  };

  getHandoffSummary = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { organizationId } = (req as AuthRequest).user;
      const handoff = await this.useCases.getHandoffSummary(organizationId, req.params.id);
      res.json({ success: true, data: handoff });
    } catch (error) {
      next(error);
    }
  };
}
