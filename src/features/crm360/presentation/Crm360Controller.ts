import type { Request, Response, NextFunction } from 'express';
import type { Crm360UseCases } from '../application/Crm360UseCases.js';
import type { AuthRequest } from '../../../shared/middlewares/authenticateToken.js';
import { routeParam } from '../../../shared/http/routeParams.js';

export class Crm360Controller {
  constructor(private crm360UseCases: Crm360UseCases) {}

  getOverview = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const orgId = (req as AuthRequest).user.organizationId;
      const data = await this.crm360UseCases.getOverview(orgId);
      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  };

  getPipelines = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const orgId = (req as AuthRequest).user.organizationId;
      const data = await this.crm360UseCases.getPipelines(orgId);
      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  };

  getBoardLeads = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const orgId = (req as AuthRequest).user.organizationId;
      const { funnel, pipelineId } = req.query as { funnel?: string; pipelineId?: string };
      const data = await this.crm360UseCases.getBoardLeads(orgId, funnel, pipelineId);
      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  };

  moveRecord = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { organizationId: orgId, id: actorUserId } = (req as AuthRequest).user;
      const { stageId, expectedCloseDate } = req.body;
      const data = await this.crm360UseCases.updateLeadStage(
        orgId,
        routeParam(req.params.id, 'id'),
        stageId,
        expectedCloseDate ? new Date(expectedCloseDate) : undefined,
        actorUserId,
      );
      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  };

  convertLead = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const orgId = (req as AuthRequest).user.organizationId;
      const data = await this.crm360UseCases.convertLead(orgId, routeParam(req.params.id, 'id'));
      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  };

  listProducts = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const orgId = (req as AuthRequest).user.organizationId;
      const search = typeof req.query.q === 'string' ? req.query.q : undefined;
      const data = await this.crm360UseCases.listProducts(orgId, search);
      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  };

  createProduct = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const orgId = (req as AuthRequest).user.organizationId;
      const data = await this.crm360UseCases.createProduct(orgId, req.body);
      res.status(201).json({ success: true, data });
    } catch (error) {
      next(error);
    }
  };

  getDealItems = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const orgId = (req as AuthRequest).user.organizationId;
      const data = await this.crm360UseCases.getDealItems(
        orgId,
        routeParam(req.params.leadId, 'leadId'),
      );
      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  };

  addDealItem = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const orgId = (req as AuthRequest).user.organizationId;
      const data = await this.crm360UseCases.addDealItem(
        orgId,
        routeParam(req.params.leadId, 'leadId'),
        req.body,
      );
      res.status(201).json({ success: true, data });
    } catch (error) {
      next(error);
    }
  };

  removeDealItem = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const orgId = (req as AuthRequest).user.organizationId;
      await this.crm360UseCases.removeDealItem(
        orgId,
        routeParam(req.params.leadId, 'leadId'),
        routeParam(req.params.id, 'id'),
      );
      res.status(204).send();
    } catch (error) {
      next(error);
    }
  };

  listDocuments = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const orgId = (req as AuthRequest).user.organizationId;
      const leadId = typeof req.query.leadId === 'string' ? req.query.leadId : undefined;
      const data = await this.crm360UseCases.listDocuments(orgId, leadId);
      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  };

  createDocument = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { organizationId: orgId, id: actorUserId } = (req as AuthRequest).user;
      const data = await this.crm360UseCases.createDocument(orgId, req.body, actorUserId);
      res.status(201).json({ success: true, data });
    } catch (error) {
      next(error);
    }
  };

  updateDocumentContent = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { organizationId: orgId, id: actorUserId } = (req as AuthRequest).user;
      const data = await this.crm360UseCases.updateDocumentContent(
        orgId,
        routeParam(req.params.id, 'id'),
        req.body,
        actorUserId,
      );
      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  };

  listDocumentVersions = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const orgId = (req as AuthRequest).user.organizationId;
      const data = await this.crm360UseCases.listDocumentVersions(
        orgId,
        routeParam(req.params.id, 'id'),
      );
      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  };

  updateDocumentStatus = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const orgId = (req as AuthRequest).user.organizationId;
      const { status } = req.body;
      const data = await this.crm360UseCases.updateDocumentStatus(
        orgId,
        routeParam(req.params.id, 'id'),
        status,
      );
      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  };

  /** Rota pública (sem `authenticateToken`) — ver `crm360Public.routes.ts`. */
  viewPublicDocument = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = await this.crm360UseCases.recordDocumentView(
        routeParam(req.params.token, 'token'),
      );
      if (!data) {
        res.status(404).json({ success: false, error: 'Proposta não encontrada.' });
        return;
      }
      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  };

  requestDocumentSignature = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { organizationId: orgId, id: actorUserId } = (req as AuthRequest).user;
      const data = await this.crm360UseCases.requestDocumentSignature(
        orgId,
        routeParam(req.params.id, 'id'),
        actorUserId,
        req.body,
      );
      res.status(201).json({ success: true, data });
    } catch (error) {
      next(error);
    }
  };
}
