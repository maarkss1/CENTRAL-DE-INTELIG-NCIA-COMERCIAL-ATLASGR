import { Request, Response, NextFunction } from 'express';
import { LeadUseCases } from '../application/LeadUseCases';
import { AuthRequest } from '../../../shared/middlewares/authenticateToken';
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
            const funnel: LeadFunnel | undefined = requestedFunnel === 'Lead' || requestedFunnel === 'Negocio'
                ? requestedFunnel
                : undefined;
            const result = await this.leadUseCases.findLeads(orgId, req.query.status as string | undefined, page, limit, funnel);
            res.json({ success: true, data: result.data, meta: result.meta });
        } catch (error) {
            next(error);
        }
    };

    getLeadById = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
        try {
            const { organizationId: orgId } = (req as AuthRequest).user;
            const lead = await this.leadUseCases.findLeadById(orgId, req.params.id);
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
            const { organizationId: orgId } = (req as AuthRequest).user;
            const lead = await this.leadUseCases.createLead(orgId, req.body);
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
            const { organizationId: orgId } = (req as AuthRequest).user;
            const leadId = req.params.id;
            let lead;
            let statusMudou = false;
            if (req.body.status && Object.keys(req.body).length === 1) {
                lead = await this.leadUseCases.updateLeadStatus(orgId, leadId, req.body.status);
                statusMudou = true;
            } else {
                lead = await this.leadUseCases.updateLead(orgId, leadId, req.body);
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
            await this.leadUseCases.deleteLead(orgId, req.params.id);
            res.status(204).send();
        } catch (error) {
            next(error);
        }
    };

    enrichLead = async (req: Request, res: Response, next: NextFunction) => {
        try {
            const { organizationId: orgId } = (req as AuthRequest).user;
            const result = await this.leadUseCases.enrichLead(orgId, req.params.id);
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
            const { leadId } = req.body;
            // Sempre usa a conexão salva em Integrações (ver bitrix.service.ts) — não aceita mais
            // uma webhookUrl solta no corpo, pra ter uma única fonte de verdade da conexão.
            const result = await this.leadUseCases.exportLeadToBitrix(orgId, leadId);
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
}
