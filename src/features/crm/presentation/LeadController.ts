import type { Request, Response, NextFunction } from 'express';
import type { LeadUseCases } from '../application/LeadUseCases';
import type { AuthRequest } from '../../../shared/middlewares/authenticateToken';
import { routeParam } from '../../../shared/http/routeParams';
import { automationEngine } from '../../automations/automation.engine';
import { logger } from '../../../lib/logger';
import type { LeadFunnel } from '@prisma/client';

const UTF8_BOM = String.fromCharCode(0xfeff);

/**
 * Dispara as automações sem bloquear a resposta.
 *
 * O motor já engole os próprios erros; o `.catch` aqui registra eventuais exceções não tratadas
 * sem bloquear o fluxo do controller.
 */
function fireAutomations(event: Parameters<typeof automationEngine.handle>[0]): void {
  void automationEngine.handle(event).catch((err) => {
    logger.error({ err, event }, 'Erro não tratado no disparo assíncrono de automações');
  });
}

export class LeadController {
  constructor(private leadUseCases: LeadUseCases) {}

  getLeads = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { organizationId: orgId } = (req as AuthRequest).user;
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 50;
      const requestedFunnel = req.query.funnel;
      const funnel: LeadFunnel | undefined =
        requestedFunnel === 'Lead' || requestedFunnel === 'Negocio' ? requestedFunnel : undefined;
      // Mesmo padrão de ContactController.getContacts: `req.query.q`/`req.query.status`
      // podem chegar como array (`?q=a&q=b`) ou objeto (`?q[x]=y`), não só string —
      // `as string | undefined` só engana o TypeScript, não o runtime (CodeQL: "Type
      // confusion through parameter tampering").
      const query = typeof req.query.q === 'string' ? req.query.q : undefined;
      const status = typeof req.query.status === 'string' ? req.query.status : undefined;
      const result = await this.leadUseCases.findLeads(orgId, status, page, limit, funnel, query);
      res.json({ success: true, data: result.data, meta: result.meta });
    } catch (error) {
      next(error);
    }
  };

  getLeadById = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { organizationId: orgId } = (req as AuthRequest).user;
      const lead = await this.leadUseCases.findLeadById(orgId, routeParam(req.params.id, 'id'));
      if (!lead) {
        res.status(404).json({ success: false, error: 'Lead not found' });
        return;
      }
      res.json({ success: true, data: lead });
    } catch (error) {
      next(error);
    }
  };

  createLead = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { organizationId: orgId, id: userId, role } = (req as AuthRequest).user;
      const lead = await this.leadUseCases.createLead(orgId, req.body, { userId, role });
      fireAutomations({
        organizationId: orgId,
        trigger: 'Lead criado',
        entity: 'Lead',
        entityId: (lead as { id: string }).id,
        data: { ...(lead as unknown as Record<string, unknown>) },
      });
      res.status(201).json({ success: true, data: lead });
    } catch (error) {
      next(error);
    }
  };

  updateLead = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { organizationId: orgId, id: actorUserId } = (req as AuthRequest).user;
      const leadId = routeParam(req.params.id, 'id');
      let lead:
        | Awaited<ReturnType<typeof this.leadUseCases.updateLeadStatus>>
        | Awaited<ReturnType<typeof this.leadUseCases.updateLead>>;
      let statusMudou = false;
      if (req.body.status && Object.keys(req.body).length === 1) {
        lead = await this.leadUseCases.updateLeadStatus(
          orgId,
          leadId,
          req.body.status,
          actorUserId,
        );
        statusMudou = true;
      } else {
        lead = await this.leadUseCases.updateLead(orgId, leadId, req.body, actorUserId);
        statusMudou = req.body.status != null;
      }

      if (statusMudou) {
        fireAutomations({
          organizationId: orgId,
          trigger: 'Lead mudou de status',
          entity: 'Lead',
          entityId: leadId,
          data: { ...(lead as unknown as Record<string, unknown>) },
        });
      }

      res.json({ success: true, data: lead });
    } catch (error) {
      next(error);
    }
  };

  deleteLead = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { organizationId: orgId } = (req as AuthRequest).user;
      await this.leadUseCases.deleteLead(orgId, routeParam(req.params.id, 'id'));
      res.status(204).send();
    } catch (error) {
      next(error);
    }
  };

  enrichLead = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { organizationId: orgId } = (req as AuthRequest).user;
      const result = await this.leadUseCases.enrichLead(orgId, routeParam(req.params.id, 'id'));
      res.json({ success: true, data: result });
    } catch (error) {
      next(error);
    }
  };

  exportCsv = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { organizationId: orgId } = (req as AuthRequest).user;
      const csv = await this.leadUseCases.exportLeadsCsv(orgId);
      const filename = `leads-bitrix24-${new Date().toISOString().slice(0, 10)}.csv`;
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.send(UTF8_BOM + csv);
    } catch (error) {
      next(error);
    }
  };

  exportToBitrix24 = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { organizationId: orgId } = (req as AuthRequest).user;
      const { leadId, connectionId, statusId, assignedById } = req.body as {
        leadId?: string;
        connectionId?: unknown;
        statusId?: unknown;
        assignedById?: unknown;
      };
      // Sempre usa uma conexão salva em Integrações (ver bitrix.service.ts) — não aceita mais
      // uma webhookUrl solta no corpo, pra ter uma única fonte de verdade da conexão.
      // connectionId/statusId/assignedById são opcionais: sem eles, o comportamento é o
      // mesmo de antes (primeira conexão da organização, sem STATUS_ID/ASSIGNED_BY_ID
      // explícitos no Bitrix).
      const result = await this.leadUseCases.exportLeadToBitrix(orgId, leadId, {
        connectionId: typeof connectionId === 'string' ? connectionId : undefined,
        statusId: typeof statusId === 'string' ? statusId : undefined,
        assignedById: typeof assignedById === 'string' ? assignedById : undefined,
      });
      res.json({ success: true, data: result });
    } catch (error) {
      next(error);
    }
  };

  importFromBitrix24 = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { organizationId: orgId } = (req as AuthRequest).user;
      const result = await this.leadUseCases.importRecentBitrixLeads(orgId);
      res.json({ success: true, data: result });
    } catch (error) {
      next(error);
    }
  };

  enrichBatch = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { organizationId: orgId } = (req as AuthRequest).user;
      const result = await this.leadUseCases.enqueueBatchEnrichment(orgId);
      res.json({ success: true, data: result });
    } catch (error) {
      next(error);
    }
  };

  triggerStaleFollowups = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { organizationId: orgId } = (req as AuthRequest).user;
      const days = parseInt(req.query.days as string) || 3;

      // Dispara a automação para leads que não mudam de status há X dias
      fireAutomations({
        organizationId: orgId,
        trigger: 'Lead mudou de status',
        entity: 'Lead',
        entityId: 'BATCH',
        data: { daysStale: days },
      });

      res.json({
        success: true,
        message: `Follow-up automation triggered for leads stale for ${days} days.`,
      });
    } catch (error) {
      next(error);
    }
  };

  batchUpdate = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { organizationId: orgId, id: actorUserId } = (req as AuthRequest).user;
      const { leadIds, updates } = req.body as {
        leadIds?: string[];
        updates?: {
          status?: string;
          owner?: string;
          tags?: string[];
          addTags?: string[];
          removeTags?: string[];
        };
      };
      if (!Array.isArray(leadIds) || leadIds.length === 0) {
        res
          .status(400)
          .json({ success: false, error: 'leadIds é obrigatório e deve conter ao menos um id.' });
        return;
      }
      if (!updates || typeof updates !== 'object') {
        res.status(400).json({
          success: false,
          error: 'updates deve ser um objeto com as alterações desejadas.',
        });
        return;
      }
      const result = await this.leadUseCases.batchUpdateLeads(orgId, leadIds, updates, actorUserId);
      res.json({ success: true, data: result });
    } catch (error) {
      next(error);
    }
  };
}
