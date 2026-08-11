import { Router, Request, Response, NextFunction } from 'express';
import multer from 'multer';

import { discoverCandidates, promoteToCrm, discoverDecisionMakers } from '../services/prospecting.service.js';
import { checkApolloConnection } from '../services/apollo.service.js';
import { fetchCnpjData } from '../services/enrichment.service.js';
import { normalizeCompanyDomain } from '../utils/domain.js';
import { extractTextFromImage, structureOcrCandidate, OcrValidationError } from '../services/ocr.service.js';
import { IcebreakerService } from '../../intelligence/services/IcebreakerService.js';
import type { AuthRequest } from '../../../shared/middlewares/authenticateToken.js';
import { requireRole } from '../../../shared/middlewares/requireRole.js';

const icebreakerService = new IcebreakerService();

const router = Router();

// Só em memória (nunca grava em disco) — a imagem só existe pelo tempo do OCR, não é um asset
// que o app precisa reter depois de extrair o texto.
const ocrUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 8 * 1024 * 1024 } });

// Revalida o login técnico da Apollo por API key sem consumir créditos.
router.post('/apollo/reconnect', async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        const status = await checkApolloConnection();
        res.json({ success: true, data: status });
    } catch (error) {
        next(error);
    }
});

// Descoberta de candidatos via IA a partir de um ICP (Perfil de Cliente Ideal).
router.post('/discover', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        const criteria = req.body as import("../services/prospecting.service.js").ProspectCriteria;
        if (!criteria || typeof criteria !== 'object') {
            res.status(400).json({ success: false, error: 'Critérios de busca inválidos' });
            return;
        }
        const result = await discoverCandidates(criteria);
        res.json({ success: true, data: result });
    } catch (error) {
        next(error);
    }
});

// Lê uma foto (cartão de visita, fachada, lista impressa) via OCR local + IA e devolve um
// candidato no mesmo formato da Descoberta — o cadastro real no CRM usa o /promote já existente,
// depois que o usuário confere os dados extraídos (OCR erra; não promovemos sozinho).
router.post('/ocr', ocrUpload.single('image'), async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        if (!req.file) {
            res.status(400).json({ success: false, error: 'Envie uma imagem no campo "image".' });
            return;
        }
        const brandName = typeof req.body?.brandName === 'string' ? req.body.brandName : 'AtlasGR';
        const brandDescription = typeof req.body?.brandDescription === 'string'
            ? req.body.brandDescription
            : 'Gestão de risco e inteligência logística B2B';

        const rawText = await extractTextFromImage(req.file.buffer, req.file.mimetype);
        const candidate = await structureOcrCandidate(rawText, { name: brandName, description: brandDescription });
        res.json({ success: true, data: { candidate, rawText } });
    } catch (error) {
        if (error instanceof OcrValidationError) {
            res.status(422).json({ success: false, error: error.message });
            return;
        }
        next(error);
    }
});

// Consulta em tempo real (sem persistir) de um CNPJ na Receita Federal via BrasilAPI.
router.post('/enrich-cnpj', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        const { cnpj } = req.body as { cnpj?: string };
        if (!cnpj || typeof cnpj !== 'string') {
            res.status(400).json({ success: false, error: 'CNPJ é obrigatório' });
            return;
        }
        const result = await fetchCnpjData(cnpj);
        res.json({ success: true, data: result });
    } catch (error) {
        next(error);
    }
});

// Promove um candidato (IA ou CNPJ) para o CRM: cria Company + Contact + Lead e enriquece automaticamente.
router.post('/promote', requireRole(['ADMIN', 'GESTOR', 'VENDEDOR']), async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        const body = req.body as { tradeName?: string; source?: string };
        if (!body.tradeName || !body.source) {
            res.status(400).json({ success: false, error: 'tradeName e source são obrigatórios' });
            return;
        }
        const { organizationId } = (req as AuthRequest).user;
        const result = await promoteToCrm({ ...req.body, organizationId });
        res.status(201).json({ success: true, data: result });
    } catch (error) {
        next(error);
    }
});

// Busca de decisores para uma empresa específica
router.post('/decision-makers', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        const { domain, criteria } = req.body as { domain?: string; criteria?: Record<string, unknown> };
        const normalizedDomain = typeof domain === 'string' ? normalizeCompanyDomain(domain) : '';
        if (!normalizedDomain) {
            res.status(400).json({ success: false, error: 'Informe um domínio válido da empresa' });
            return;
        }
        const result = await discoverDecisionMakers(normalizedDomain, criteria ?? {});
        res.json({ success: true, data: result });
    } catch (error) {
        next(error);
    }
});

// Gera um quebra-gelo comercial sob demanda a partir de recortes públicos reais da empresa.
// ARCH-006 (auditoria de dívida técnica): substitui o placeholder de UI que só mostrava um
// alert() sem chamar IA nenhuma.
router.post('/icebreaker', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        const { companyName } = req.body as { companyName?: string };
        if (!companyName || typeof companyName !== 'string') {
            res.status(400).json({ success: false, error: 'companyName é obrigatório' });
            return;
        }
        const icebreaker = await icebreakerService.generateIcebreaker(companyName);
        res.json({ success: true, data: { icebreaker } });
    } catch (error) {
        next(error);
    }
});

// Import the cold email service
import { sendColdEmail, ColdEmailCampaign } from '../services/cold-email.service.js';

// Envia um cold email (ex: template de prospecção) com rotulagem LGPD
router.post('/cold-email', requireRole(['ADMIN', 'GESTOR', 'VENDEDOR']), async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        const campaign = req.body as ColdEmailCampaign;
        if (!campaign || !campaign.targetEmail) {
            res.status(400).json({ success: false, error: 'targetEmail é obrigatório' });
            return;
        }
        
        const success = await sendColdEmail(campaign);
        if (success) {
            res.json({ success: true, message: 'Email sent' });
        } else {
            res.status(500).json({ success: false, error: 'Failed to send cold email' });
        }
    } catch (error) {
        next(error);
    }
});

export const prospectingRoutes = router;
