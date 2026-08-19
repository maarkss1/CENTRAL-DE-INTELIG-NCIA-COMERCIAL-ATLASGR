import { Router } from 'express';
import { container } from '../../../shared/di/container.js';
import type { Crm360Controller } from '../presentation/Crm360Controller.js';
import { requireRole } from '../../../shared/middlewares/requireRole.js';
import {
    crmDealItemSchema,
    crmDocumentSchema,
    crmDocumentSignatureRequestSchema,
    crmDocumentUpdateSchema,
    crmProductSchema,
    moveCrmRecordSchema,
} from '../crm360.schema.js';

const router = Router();
const managementRoles = requireRole(['ADMIN', 'GESTOR']);
const writeRoles = requireRole(['ADMIN', 'GESTOR', 'CLOSER', 'SDR']);

router.get('/overview', (req, res, next) =>
    container.resolve<Crm360Controller>('Crm360Controller').getOverview(req, res, next)
);

router.get('/pipelines', (req, res, next) =>
    container.resolve<Crm360Controller>('Crm360Controller').getPipelines(req, res, next)
);

router.get('/board', (req, res, next) =>
    container.resolve<Crm360Controller>('Crm360Controller').getBoardLeads(req, res, next)
);

router.put('/records/:id/stage', writeRoles, (req, res, next) => {
    moveCrmRecordSchema.parse(req.body);
    return container.resolve<Crm360Controller>('Crm360Controller').moveRecord(req, res, next);
});

router.post('/leads/:id/convert', writeRoles, (req, res, next) =>
    container.resolve<Crm360Controller>('Crm360Controller').convertLead(req, res, next)
);

router.get('/products', (req, res, next) =>
    container.resolve<Crm360Controller>('Crm360Controller').listProducts(req, res, next)
);

router.post('/products', writeRoles, (req, res, next) => {
    crmProductSchema.parse(req.body);
    return container.resolve<Crm360Controller>('Crm360Controller').createProduct(req, res, next);
});

router.get('/deals/:leadId/items', (req, res, next) =>
    container.resolve<Crm360Controller>('Crm360Controller').getDealItems(req, res, next)
);

router.post('/deals/:leadId/items', writeRoles, (req, res, next) => {
    crmDealItemSchema.parse(req.body);
    return container.resolve<Crm360Controller>('Crm360Controller').addDealItem(req, res, next);
});

router.delete('/deals/:leadId/items/:id', managementRoles, (req, res, next) =>
    container.resolve<Crm360Controller>('Crm360Controller').removeDealItem(req, res, next)
);

router.get('/documents', (req, res, next) =>
    container.resolve<Crm360Controller>('Crm360Controller').listDocuments(req, res, next)
);

router.post('/documents', writeRoles, (req, res, next) => {
    crmDocumentSchema.parse(req.body);
    return container.resolve<Crm360Controller>('Crm360Controller').createDocument(req, res, next);
});

router.put('/documents/:id/status', writeRoles, (req, res, next) =>
    container.resolve<Crm360Controller>('Crm360Controller').updateDocumentStatus(req, res, next)
);

// CYC-005 (onda 25): edição de conteúdo cria uma nova versão — nunca sobrescreve o histórico.
router.put('/documents/:id', writeRoles, (req, res, next) => {
    crmDocumentUpdateSchema.parse(req.body);
    return container.resolve<Crm360Controller>('Crm360Controller').updateDocumentContent(req, res, next);
});

router.get('/documents/:id/versions', (req, res, next) =>
    container.resolve<Crm360Controller>('Crm360Controller').listDocumentVersions(req, res, next)
);

// CYC-006 (onda 28): solicita assinatura eletrônica real (provedor 'govbr', stub de transporte —
// ver GovBrSignatureProviderPort.ts). signerEmail/signerName no body são opcionais: caem no
// e-mail/nome do Contact vinculado ao documento quando ausentes.
router.post('/documents/:id/request-signature', writeRoles, (req, res, next) => {
    crmDocumentSignatureRequestSchema.parse(req.body);
    return container.resolve<Crm360Controller>('Crm360Controller').requestDocumentSignature(req, res, next);
});

export const crm360Routes = router;
