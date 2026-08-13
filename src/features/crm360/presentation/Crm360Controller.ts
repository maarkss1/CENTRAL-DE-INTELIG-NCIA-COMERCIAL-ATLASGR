import type { Request, Response, NextFunction } from 'express';
import type { Crm360UseCases } from '../application/Crm360UseCases.js';
import type { AuthRequest } from '../../../shared/middlewares/authenticateToken.js';

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
            const orgId = (req as AuthRequest).user.organizationId;
            const { stageId, expectedCloseDate } = req.body;
            const data = await this.crm360UseCases.updateLeadStage(
                orgId,
                req.params.id,
                stageId,
                expectedCloseDate ? new Date(expectedCloseDate) : undefined
            );
            res.json({ success: true, data });
        } catch (error) {
            next(error);
        }
    };

    convertLead = async (req: Request, res: Response, next: NextFunction) => {
        try {
            const orgId = (req as AuthRequest).user.organizationId;
            const data = await this.crm360UseCases.convertLead(orgId, req.params.id);
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
            const data = await this.crm360UseCases.getDealItems(orgId, req.params.leadId);
            res.json({ success: true, data });
        } catch (error) {
            next(error);
        }
    };

    addDealItem = async (req: Request, res: Response, next: NextFunction) => {
        try {
            const orgId = (req as AuthRequest).user.organizationId;
            const data = await this.crm360UseCases.addDealItem(orgId, req.params.leadId, req.body);
            res.status(201).json({ success: true, data });
        } catch (error) {
            next(error);
        }
    };

    removeDealItem = async (req: Request, res: Response, next: NextFunction) => {
        try {
            const orgId = (req as AuthRequest).user.organizationId;
            await this.crm360UseCases.removeDealItem(orgId, req.params.leadId, req.params.id);
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
            const orgId = (req as AuthRequest).user.organizationId;
            const data = await this.crm360UseCases.createDocument(orgId, req.body);
            res.status(201).json({ success: true, data });
        } catch (error) {
            next(error);
        }
    };

    updateDocumentStatus = async (req: Request, res: Response, next: NextFunction) => {
        try {
            const orgId = (req as AuthRequest).user.organizationId;
            const { status } = req.body;
            const data = await this.crm360UseCases.updateDocumentStatus(orgId, req.params.id, status);
            res.json({ success: true, data });
        } catch (error) {
            next(error);
        }
    };
}
