import { Router, type NextFunction, type Request, type Response } from 'express';
import { CrmDocumentStatus } from '@prisma/client';
import type { AuthRequest } from '../../../shared/middlewares/authenticateToken.js';
import { requireRole } from '../../../shared/middlewares/requireRole.js';
import {
    crmDealItemSchema,
    crmDealSchema,
    crmDocumentSchema,
    crmPipelineSchema,
    crmProductSchema,
    moveCrmRecordSchema,
} from '../crm360.schema.js';
import { crm360Service } from '../services/crm360.service.js';

const router = Router();
const managementRoles = requireRole(['ADMIN', 'GESTOR']);

function orgId(req: Request): string {
    return (req as AuthRequest).user.organizationId;
}

function route(handler: (req: Request, res: Response) => Promise<void>) {
    return (req: Request, res: Response, next: NextFunction) => {
        void handler(req, res).catch(next);
    };
}

router.get('/overview', route(async (req, res) => {
    res.json({ success: true, data: await crm360Service.overview(orgId(req)) });
}));

router.get('/pipelines', route(async (req, res) => {
    res.json({ success: true, data: await crm360Service.listPipelines(orgId(req)) });
}));

router.post('/pipelines', managementRoles, route(async (req, res) => {
    const input = crmPipelineSchema.parse(req.body);
    const pipeline = await crm360Service.createPipeline(orgId(req), input);
    res.status(201).json({ success: true, data: pipeline });
}));

router.put('/records/:id/stage', route(async (req, res) => {
    const { stageId } = moveCrmRecordSchema.parse(req.body);
    const record = await crm360Service.moveRecord(orgId(req), req.params.id, stageId);
    res.json({ success: true, data: record });
}));

router.post('/deals', route(async (req, res) => {
    const input = crmDealSchema.parse(req.body);
    const deal = await crm360Service.createDeal(orgId(req), input);
    res.status(201).json({ success: true, data: deal });
}));

router.post('/leads/:id/convert', route(async (req, res) => {
    const deal = await crm360Service.convertLead(orgId(req), req.params.id);
    res.json({ success: true, data: deal });
}));

router.get('/products', route(async (req, res) => {
    const query = typeof req.query.q === 'string' ? req.query.q : undefined;
    res.json({ success: true, data: await crm360Service.listProducts(orgId(req), query) });
}));

router.post('/products', route(async (req, res) => {
    const input = crmProductSchema.parse(req.body);
    const product = await crm360Service.createProduct(orgId(req), input);
    res.status(201).json({ success: true, data: product });
}));

router.put('/products/:id', route(async (req, res) => {
    const input = crmProductSchema.partial().parse(req.body);
    const product = await crm360Service.updateProduct(orgId(req), req.params.id, input);
    res.json({ success: true, data: product });
}));

router.delete('/products/:id', managementRoles, route(async (req, res) => {
    await crm360Service.archiveProduct(orgId(req), req.params.id);
    res.status(204).send();
}));

router.get('/deals/:leadId/items', route(async (req, res) => {
    res.json({ success: true, data: await crm360Service.listDealItems(orgId(req), req.params.leadId) });
}));

router.post('/deals/:leadId/items', route(async (req, res) => {
    const input = crmDealItemSchema.parse(req.body);
    const item = await crm360Service.addDealItem(orgId(req), req.params.leadId, input);
    res.status(201).json({ success: true, data: item });
}));

router.put('/deals/:leadId/items/:id', route(async (req, res) => {
    const input = crmDealItemSchema.parse(req.body);
    const item = await crm360Service.updateDealItem(orgId(req), req.params.leadId, req.params.id, input);
    res.json({ success: true, data: item });
}));

router.delete('/deals/:leadId/items/:id', route(async (req, res) => {
    await crm360Service.deleteDealItem(orgId(req), req.params.leadId, req.params.id);
    res.status(204).send();
}));

router.get('/documents', route(async (req, res) => {
    const query = typeof req.query.q === 'string' ? req.query.q : undefined;
    res.json({ success: true, data: await crm360Service.listDocuments(orgId(req), query) });
}));

router.post('/documents', route(async (req, res) => {
    const input = crmDocumentSchema.parse(req.body);
    const document = await crm360Service.createDocument(orgId(req), input);
    res.status(201).json({ success: true, data: document });
}));

router.put('/documents/:id/status', route(async (req, res) => {
    const status = CrmDocumentStatus[req.body?.status as keyof typeof CrmDocumentStatus];
    if (!status) {
        res.status(400).json({ success: false, error: 'Status de documento inválido' });
        return;
    }
    const document = await crm360Service.updateDocumentStatus(orgId(req), req.params.id, status);
    res.json({ success: true, data: document });
}));

router.get('/search', route(async (req, res) => {
    const query = typeof req.query.q === 'string' ? req.query.q : '';
    res.json({ success: true, data: await crm360Service.search(orgId(req), query) });
}));

export const crm360Routes = router;
