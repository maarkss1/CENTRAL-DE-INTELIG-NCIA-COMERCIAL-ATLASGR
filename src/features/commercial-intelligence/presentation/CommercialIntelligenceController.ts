import type { Request, Response, NextFunction } from 'express';
import {
  type CommercialIntelligenceUseCases,
  currentPeriod,
} from '../application/CommercialIntelligenceUseCases';
import { METRICS_DICTIONARY } from '../application/metricsDictionary';
import type { CommercialIntelligenceAiService } from '../infra/CommercialIntelligenceAiService';
import type { AuthRequest } from '../../../shared/middlewares/authenticateToken';
import type {
  CommercialIntelligenceFilter,
  DealDrillDownQuery,
  ForecastTier,
  ExportFormat,
} from '../domain/CommercialIntelligence';
import { routeParam } from '../../../shared/http/routeParams';

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

export function parseMonth(raw: unknown): string {
  if (typeof raw === 'string' && MONTH_RE.test(raw)) return raw;
  return currentPeriod();
}

export function parseOwner(raw: unknown): string | undefined {
  return typeof raw === 'string' && raw.trim() ? raw.trim() : undefined;
}

/**
 * Lê o filtro de `req.query` (rotas GET) com fallback para `req.body` (rotas POST de IA — ver
 * `postAiExecutiveSummary`/`postAiMentorPlaybook` — o client posta o filtro como JSON body, nunca
 * como query string; sem este fallback, todo endpoint de IA ignorava silenciosamente o mês/
 * vendedor/produto/origem/ICP selecionado na tela e sempre respondia pelo mês atual).
 */
function pick(req: Request, key: string): unknown {
  return (
    (req.query as Record<string, unknown>)[key] ??
    (req.body as Record<string, unknown> | undefined)?.[key]
  );
}

export function parseFilter(req: Request): CommercialIntelligenceFilter {
  return {
    month: parseMonth(pick(req, 'month')),
    owner: parseOwner(pick(req, 'owner')),
    product:
      typeof pick(req, 'product') === 'string'
        ? (pick(req, 'product') as string).trim()
        : undefined,
    source:
      typeof pick(req, 'source') === 'string' ? (pick(req, 'source') as string).trim() : undefined,
    icp: typeof pick(req, 'icp') === 'string' ? (pick(req, 'icp') as string).trim() : undefined,
    company:
      typeof pick(req, 'company') === 'string'
        ? (pick(req, 'company') as string).trim()
        : undefined,
  };
}

const VALID_TIERS: ForecastTier[] = ['Commit', 'BestCase', 'Pipeline', 'Upside'];
const VALID_EXPORT_FORMATS: ExportFormat[] = ['csv', 'json', 'html'];

export class CommercialIntelligenceController {
  constructor(
    private useCases: CommercialIntelligenceUseCases,
    private aiService: CommercialIntelligenceAiService,
  ) {}

  getOverview = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { organizationId } = (req as AuthRequest).user;
      const data = await this.useCases.executiveOverview(organizationId, parseFilter(req));
      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  };

  getPipelineCreation = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { organizationId } = (req as AuthRequest).user;
      const data = await this.useCases.pipelineCreation(organizationId, parseFilter(req));
      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  };

  getPerformance = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { organizationId } = (req as AuthRequest).user;
      const data = await this.useCases.performance(organizationId, parseFilter(req));
      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  };

  getAging = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { organizationId } = (req as AuthRequest).user;
      const data = await this.useCases.aging(organizationId, parseFilter(req));
      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  };

  getLosses = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { organizationId } = (req as AuthRequest).user;
      const data = await this.useCases.losses(organizationId, parseFilter(req));
      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  };

  getLeadingIndicators = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { organizationId } = (req as AuthRequest).user;
      const data = await this.useCases.leadingIndicators(organizationId);
      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  };

  getAlerts = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { organizationId } = (req as AuthRequest).user;
      const data = await this.useCases.alerts(organizationId, parseFilter(req));
      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  };

  getCrmQuality = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { organizationId } = (req as AuthRequest).user;
      const data = await this.useCases.crmQuality(organizationId, parseFilter(req));
      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  };

  getDeals = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { organizationId } = (req as AuthRequest).user;
      const tierRaw = req.query.tier;
      const tier =
        typeof tierRaw === 'string' && VALID_TIERS.includes(tierRaw as ForecastTier)
          ? (tierRaw as ForecastTier)
          : undefined;
      const sort = req.query.sort === 'riskImpact' ? 'riskImpact' : undefined;
      const idsRaw = req.query.ids;
      const ids =
        typeof idsRaw === 'string' && idsRaw.trim()
          ? idsRaw
              .split(',')
              .map((v) => v.trim())
              .filter(Boolean)
          : undefined;
      const query: DealDrillDownQuery = {
        month: parseMonth(req.query.month),
        owner: parseOwner(req.query.owner),
        tier,
        stageId: typeof req.query.stageId === 'string' ? req.query.stageId : undefined,
        agingCritical: req.query.agingCritical === 'true',
        missingNextAction: req.query.missingNextAction === 'true',
        ids,
        limit: Number.isFinite(Number(req.query.limit)) ? Number(req.query.limit) : undefined,
        offset: Number.isFinite(Number(req.query.offset)) ? Number(req.query.offset) : undefined,
        sort,
      };
      const data = await this.useCases.dealsDrillDown(organizationId, query);
      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  };

  getForecastExplain = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { organizationId } = (req as AuthRequest).user;
      const data = await this.useCases.forecastExplain(
        organizationId,
        routeParam(req.params.leadId, 'leadId'),
      );
      if (!data) {
        res.status(404).json({ success: false, error: 'Negócio não encontrado' });
        return;
      }
      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  };

  getMetricsDictionary = (_req: Request, res: Response) => {
    res.json({ success: true, data: METRICS_DICTIONARY });
  };

  getFilterOptions = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { organizationId } = (req as AuthRequest).user;
      const data = await this.useCases.filterOptions(organizationId);
      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  };

  // Devolve o CONTEÚDO cru (csv/json/html), com Content-Type/Content-Disposition explícitos —
  // não o envelope `{success,data}` do resto deste controller. Mesmo padrão já usado por
  // `LeadController.exportCsv` (`/api/leads/export/csv`), consumido no front por um `fetch` bruto
  // + `Blob`/`URL.createObjectURL` (ver `commercialIntelligenceApi.downloadExecutiveExport`),
  // nunca pelo `apiFetch`/`api.get` que assume corpo JSON `{success,data}`.
  getExport = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { organizationId } = (req as AuthRequest).user;
      const formatRaw = typeof req.query.format === 'string' ? req.query.format : '';
      const format: ExportFormat = VALID_EXPORT_FORMATS.includes(formatRaw as ExportFormat)
        ? (formatRaw as ExportFormat)
        : 'json';
      const filter = parseFilter(req);
      const { content, mimeType, fileExtension } = await this.useCases.executiveExport(
        organizationId,
        filter,
        format,
      );
      const filename = `comercial-inteligente_${filter.month}_${new Date().toISOString().slice(0, 10)}.${fileExtension}`;
      res.setHeader('Content-Type', mimeType);
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.send(content);
    } catch (error) {
      next(error);
    }
  };

  getHealthScore = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { organizationId } = (req as AuthRequest).user;
      const data = await this.useCases.healthScore(organizationId, parseFilter(req));
      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  };

  getForecastAccuracy = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { organizationId } = (req as AuthRequest).user;
      const data = await this.useCases.forecastAccuracy(organizationId);
      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  };

  getCloseDateIntelligence = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { organizationId } = (req as AuthRequest).user;
      const data = await this.useCases.closeDateIntelligence(organizationId, parseFilter(req));
      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  };

  getJourney = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { organizationId } = (req as AuthRequest).user;
      const data = await this.useCases.journey(organizationId, parseFilter(req));
      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  };

  getHistoricalTrends = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { organizationId } = (req as AuthRequest).user;
      const data = await this.useCases.historicalTrends(organizationId, parseFilter(req));
      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  };

  getGoal = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { organizationId } = (req as AuthRequest).user;
      const month = parseMonth(req.query.month);
      const data = await this.useCases.getGoal(organizationId, month);
      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  };

  postAiExecutiveSummary = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { organizationId } = (req as AuthRequest).user;
      const data = await this.aiService.generateExecutiveSummary(organizationId, parseFilter(req));
      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  };

  postAiMentorPlaybook = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { organizationId } = (req as AuthRequest).user;
      const data = await this.aiService.generateMentorPlaybook(organizationId, parseFilter(req));
      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  };

  postAiBitrixNote = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { organizationId } = (req as AuthRequest).user;
      const leadId = typeof req.body?.leadId === 'string' ? req.body.leadId : '';
      if (!leadId) {
        res.status(400).json({ success: false, error: 'leadId é obrigatório.' });
        return;
      }
      const data = await this.aiService.draftBitrixRiskNote(organizationId, leadId);
      if (!data) {
        res.status(404).json({ success: false, error: 'Negócio não encontrado' });
        return;
      }
      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  };

  putGoal = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { organizationId, id: userId } = (req as AuthRequest).user;
      const period = parseMonth(req.body?.period);
      const amount = Number(req.body?.amount);
      if (!Number.isFinite(amount) || amount < 0) {
        res
          .status(400)
          .json({ success: false, error: 'amount precisa ser um número maior ou igual a zero' });
        return;
      }
      const currency =
        typeof req.body?.currency === 'string' && req.body.currency.trim()
          ? req.body.currency.toUpperCase()
          : 'BRL';
      const data = await this.useCases.setGoal(organizationId, period, amount, userId, currency);
      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  };
}
