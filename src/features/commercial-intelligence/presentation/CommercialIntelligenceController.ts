import { Request, Response, NextFunction } from 'express';
import { CommercialIntelligenceUseCases, currentPeriod } from '../application/CommercialIntelligenceUseCases';
import { METRICS_DICTIONARY } from '../application/metricsDictionary';
import type { CommercialIntelligenceAiService } from '../infra/CommercialIntelligenceAiService';
import type { AuthRequest } from '../../../shared/middlewares/authenticateToken';
import type { CommercialIntelligenceFilter, DealDrillDownQuery, ForecastTier } from '../domain/CommercialIntelligence';

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

function parseMonth(raw: unknown): string {
    if (typeof raw === 'string' && MONTH_RE.test(raw)) return raw;
    return currentPeriod();
}

function parseOwner(raw: unknown): string | undefined {
    return typeof raw === 'string' && raw.trim() ? raw.trim() : undefined;
}

function parseFilter(req: Request): CommercialIntelligenceFilter {
    return {
        month: parseMonth(req.query.month),
        owner: parseOwner(req.query.owner),
        product: typeof req.query.product === 'string' ? req.query.product.trim() : undefined,
        source: typeof req.query.source === 'string' ? req.query.source.trim() : undefined,
        icp: typeof req.query.icp === 'string' ? req.query.icp.trim() : undefined,
    };
}

const VALID_TIERS: ForecastTier[] = ['Commit', 'BestCase', 'Pipeline', 'Upside'];

export class CommercialIntelligenceController {
    constructor(private useCases: CommercialIntelligenceUseCases, private aiService: CommercialIntelligenceAiService) {}

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
            const data = await this.useCases.aging(organizationId);
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
            const tier = typeof tierRaw === 'string' && VALID_TIERS.includes(tierRaw as ForecastTier) ? (tierRaw as ForecastTier) : undefined;
            const query: DealDrillDownQuery = {
                month: parseMonth(req.query.month),
                owner: parseOwner(req.query.owner),
                tier,
                stageId: typeof req.query.stageId === 'string' ? req.query.stageId : undefined,
                agingCritical: req.query.agingCritical === 'true',
                missingNextAction: req.query.missingNextAction === 'true',
                limit: Number.isFinite(Number(req.query.limit)) ? Number(req.query.limit) : undefined,
                offset: Number.isFinite(Number(req.query.offset)) ? Number(req.query.offset) : undefined,
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
            const data = await this.useCases.forecastExplain(organizationId, req.params.leadId);
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
                res.status(400).json({ success: false, error: 'amount precisa ser um número maior ou igual a zero' });
                return;
            }
            const currency = typeof req.body?.currency === 'string' && req.body.currency.trim() ? req.body.currency.toUpperCase() : 'BRL';
            const data = await this.useCases.setGoal(organizationId, period, amount, userId, currency);
            res.json({ success: true, data });
        } catch (error) {
            next(error);
        }
    };
}
