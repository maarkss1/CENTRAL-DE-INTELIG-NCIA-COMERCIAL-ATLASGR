import { Router, type Request, type Response, type NextFunction } from 'express';
import multer from 'multer';
import { z } from 'zod';

import {
  discoverCandidates,
  promoteToCrm,
  discoverDecisionMakers,
  rejectCandidate,
} from '../services/prospecting.service.js';
import { checkApolloConnection } from '../services/apollo.service.js';
import { fetchCnpjData } from '../services/enrichment.service.js';
import { rntrcRiskByUf } from '../../../shared/services/rntrcTerritorialRisk.service.js';
import { normalizeCompanyDomain } from '../utils/domain.js';
import { routeParam } from '../../../shared/http/routeParams.js';
import {
  extractTextFromImage,
  structureOcrCandidate,
  OcrValidationError,
} from '../services/ocr.service.js';
import { IcebreakerService } from '../../intelligence/services/IcebreakerService.js';
import { discoverCriteriaSchema } from '../schemas/discoverCriteria.schema.js';
import { findSearchExecution } from '../services/searchExecution.service.js';
import type { AuthRequest } from '../../../shared/middlewares/authenticateToken.js';
import { requireRole } from '../../../shared/middlewares/requireRole.js';
import { validateRequest } from '../../../shared/middlewares/validateRequest.js';

const icebreakerService = new IcebreakerService();

const router = Router();

const rejectCandidateSchema = z.object({
  tradeName: z.string().trim().min(1, 'tradeName é obrigatório').max(200),
  website: z.string().trim().max(300).optional(),
  reason: z.string().trim().max(300).optional(),
});

// Só em memória (nunca grava em disco) — a imagem só existe pelo tempo do OCR, não é um asset
// que o app precisa reter depois de extrair o texto.
const ocrUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 },
});

// Revalida o login técnico da Apollo por API key sem consumir créditos.
router.post(
  '/apollo/reconnect',
  async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const status = await checkApolloConnection();
      res.json({ success: true, data: status });
    } catch (error) {
      next(error);
    }
  },
);

// Descoberta de candidatos via IA a partir de um ICP (Perfil de Cliente Ideal).
router.post(
  '/discover',
  validateRequest(discoverCriteriaSchema),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const criteria = req.body as import('../services/prospecting.service.js').ProspectCriteria;
      const { organizationId } = (req as AuthRequest).user;
      const result = await discoverCandidates(criteria, organizationId);
      res.json({ success: true, data: result });
    } catch (error) {
      next(error);
    }
  },
);

// Lê uma foto (cartão de visita, fachada, lista impressa) via OCR local + IA e devolve um
// candidato no mesmo formato da Descoberta — o cadastro real no CRM usa o /promote já existente,
// depois que o usuário confere os dados extraídos (OCR erra; não promovemos sozinho).
router.post(
  '/ocr',
  ocrUpload.single('image'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.file) {
        res.status(400).json({ success: false, error: 'Envie uma imagem no campo "image".' });
        return;
      }
      const brandName = typeof req.body?.brandName === 'string' ? req.body.brandName : 'AtlasGR';
      const brandDescription =
        typeof req.body?.brandDescription === 'string'
          ? req.body.brandDescription
          : 'Gestão de risco e inteligência logística B2B';

      const rawText = await extractTextFromImage(req.file.buffer, req.file.mimetype);
      const candidate = await structureOcrCandidate(rawText, {
        name: brandName,
        description: brandDescription,
      });
      res.json({ success: true, data: { candidate, rawText } });
    } catch (error) {
      if (error instanceof OcrValidationError) {
        res.status(422).json({ success: false, error: error.message });
        return;
      }
      next(error);
    }
  },
);

// Consulta em tempo real (sem persistir) de um CNPJ na Receita Federal via BrasilAPI.
router.post(
  '/enrich-cnpj',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { cnpj } = req.body as { cnpj?: string };
      if (!cnpj || typeof cnpj !== 'string') {
        res.status(400).json({ success: false, error: 'CNPJ é obrigatório' });
        return;
      }
      const result = await fetchCnpjData(cnpj);
      // MI-014 (dossiê CPI, DEC-15 opção A): a UF devolvida pela Receita Federal já basta para
      // reaproveitar o indicador RNTRC/ANTT territorial que o módulo de Market Intelligence
      // publica (ver `rntrcRiskByUf` — mesmo dataset/cache de `rntrcTerritorialSnapshot`, sem
      // recalcular nada). `marketRisk` fica `null` só quando a Receita não devolveu empresa.
      const marketRisk = result.found && result.data ? rntrcRiskByUf(result.data.state) : null;
      res.json({ success: true, data: { ...result, marketRisk } });
    } catch (error) {
      next(error);
    }
  },
);

// Promove um candidato (IA ou CNPJ) para o CRM: cria Company + Contact + Lead e enriquece automaticamente.
router.post(
  '/promote',
  requireRole(['ADMIN', 'GESTOR', 'CLOSER', 'SDR']),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
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
  },
);

// Marca um candidato da Descoberta como "Não é esse perfil" — passa a ser excluído de buscas
// futuras deste tenant (ver `fetchKnownExclusions` em prospecting.service.ts).
router.post(
  '/reject',
  validateRequest(rejectCandidateSchema),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { organizationId } = (req as AuthRequest).user;
      await rejectCandidate({ ...req.body, organizationId });
      res.status(201).json({ success: true });
    } catch (error) {
      next(error);
    }
  },
);

// Busca de decisores para uma empresa específica
router.post(
  '/decision-makers',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { domain, criteria } = req.body as {
        domain?: string;
        criteria?: Record<string, unknown>;
      };
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
  },
);

// Gera um quebra-gelo comercial sob demanda a partir de recortes públicos reais da empresa.
// ARCH-006 (auditoria de dívida técnica): substitui o placeholder de UI que só mostrava um
// alert() sem chamar IA nenhuma.
router.post(
  '/icebreaker',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
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
  },
);

// Import the cold email service
import { sendColdEmail, type ColdEmailCampaign } from '../services/cold-email.service.js';

// Envia um cold email (ex: template de prospecção) com rotulagem LGPD
router.post(
  '/cold-email',
  requireRole(['ADMIN', 'GESTOR', 'CLOSER', 'SDR']),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { organizationId } = (req as AuthRequest).user;
      // organizationId sempre vem do tenant autenticado, nunca do corpo da requisição — é o que
      // permite checar opt-out por organização antes do envio (ver cold-email.service.ts).
      const campaign = { ...(req.body as ColdEmailCampaign), organizationId };
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
  },
);

// ───────────────────── Enriquecimento em Cascata (Apollo ➔ Hunter ➔ Google Places) ─────────────────────
import { runEnrichmentCascade } from '../services/enrichmentCascade.service.js';
import { enrichmentCascadeQueue } from '../../../lib/queue/enrichmentCascade.worker.js';
import { prisma } from '../../../lib/prisma.js';

router.post(
  '/companies/:id/enrich-cascade',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { organizationId } = (req as AuthRequest).user;
      const companyId = routeParam(req.params.id, 'id');
      const { async: isAsync, ...options } = req.body || {};

      if (isAsync && enrichmentCascadeQueue) {
        const job = await enrichmentCascadeQueue.add('enrich-cascade-job', {
          companyId,
          organizationId,
          options,
        });
        res
          .status(202)
          .json({ success: true, message: 'Enriquecimento em cascata enfileirado', jobId: job.id });
        return;
      }

      const result = await runEnrichmentCascade(organizationId, companyId, options);
      res.json({ success: true, data: result });
    } catch (error) {
      next(error);
    }
  },
);

// ───────────────────── Listas Salvas de Prospecção & Agendamento ─────────────────────
router.get(
  '/saved-searches',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { organizationId } = (req as AuthRequest).user;
      const items = await prisma.savedSearch.findMany({
        where: { organizationId },
        orderBy: { createdAt: 'desc' },
      });
      res.json({ success: true, data: items });
    } catch (error) {
      next(error);
    }
  },
);

router.post(
  '/saved-searches',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { organizationId } = (req as AuthRequest).user;
      const { name, criteria, schedule } = req.body || {};

      if (!name || typeof name !== 'string') {
        res.status(400).json({ success: false, error: 'name é obrigatório' });
        return;
      }

      const nextRunAt =
        schedule === 'daily'
          ? new Date(Date.now() + 24 * 60 * 60 * 1000)
          : schedule === 'weekly'
            ? new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
            : null;

      const created = await prisma.savedSearch.create({
        data: {
          name,
          criteria: criteria || {},
          schedule: schedule || null,
          nextRunAt,
          organizationId,
        },
      });

      res.status(201).json({ success: true, data: created });
    } catch (error) {
      next(error);
    }
  },
);

router.delete(
  '/saved-searches/:id',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { organizationId } = (req as AuthRequest).user;
      const id = routeParam(req.params.id, 'id');

      await prisma.savedSearch.deleteMany({
        where: { id, organizationId },
      });

      res.json({ success: true, message: 'Busca salva removida' });
    } catch (error) {
      next(error);
    }
  },
);

router.post(
  '/saved-searches/:id/run',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { organizationId } = (req as AuthRequest).user;
      const id = routeParam(req.params.id, 'id');

      const savedSearch = await prisma.savedSearch.findFirst({
        where: { id, organizationId },
      });

      if (!savedSearch) {
        res.status(404).json({ success: false, error: 'Busca salva não encontrada' });
        return;
      }

      const criteria = (savedSearch.criteria as any) || {};
      const result = await discoverCandidates(criteria, organizationId, id);
      const count = result?.candidates?.length || 0;

      const updated = await prisma.savedSearch.update({
        where: { id },
        data: {
          lastRunAt: new Date(),
          leadsDiscovered: { increment: count },
          nextRunAt:
            savedSearch.schedule === 'daily'
              ? new Date(Date.now() + 24 * 60 * 60 * 1000)
              : savedSearch.schedule === 'weekly'
                ? new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
                : savedSearch.nextRunAt,
        },
      });

      res.json({
        success: true,
        data: {
          savedSearch: updated,
          candidates: result?.candidates || [],
          count,
          searchId: result?.searchId,
        },
      });
    } catch (error) {
      next(error);
    }
  },
);

// ───────────────────── Search-ID: auditoria/replay de execuções de busca ─────────────────────
// Onda 42 (dossiê CPI, DEC-13, opção A): toda execução real de /discover (e de
// /saved-searches/:id/run) grava um ProspectingSearchExecution com o Search-ID já devolvido no
// corpo da resposta original (`data.searchId`) — esta rota lê esse registro de volta, escopado por
// tenant (RLS + organizationId explícito, ver findSearchExecution em searchExecution.service.ts).
router.get(
  '/searches/:searchId',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { organizationId } = (req as AuthRequest).user;
      const searchId = routeParam(req.params.searchId, 'searchId');
      const execution = await findSearchExecution(searchId, organizationId);
      if (!execution) {
        res.status(404).json({ success: false, error: 'Execução de busca não encontrada' });
        return;
      }
      res.json({ success: true, data: execution });
    } catch (error) {
      next(error);
    }
  },
);

// Enriquecimento web via scraper Crawlee — ainda não implementado (achado MEDIUM da auditoria de
// release-readiness: respondia sempre `success:true` com dados fabricados, o que enganaria
// qualquer integrador que a chamasse. 501 é honesto sobre o estado real; a rota fica reservada
// para quando o scraper Crawlee for implementado de verdade.
router.post('/enrich', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { url } = req.body as { url?: string };
    if (!url) {
      res.status(400).json({ success: false, error: 'A URL é obrigatória para o scraper' });
      return;
    }

    res.status(501).json({
      success: false,
      error: 'Enriquecimento via scraper (Crawlee) ainda não foi implementado.',
    });
  } catch (error) {
    next(error);
  }
});

export const prospectingRoutes = router;
