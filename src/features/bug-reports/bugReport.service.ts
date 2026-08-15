import type { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma.js';
import { logger } from '../../lib/logger.js';
import { AppError } from '../../shared/middlewares/errorHandler.js';
import { sanitizeTitle, sanitizeDescription, sanitizeRecentLogs } from './bugReport.sanitize.js';

const VALID_SEVERITIES = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as const;
const VALID_STATUSES = ['OPEN', 'TRIAGED', 'RESOLVED'] as const;
type Severity = (typeof VALID_SEVERITIES)[number];
type Status = (typeof VALID_STATUSES)[number];

export interface CreateBugReportInput {
    organizationId: string;
    userId?: string;
    userEmail?: string;
    title: string;
    description: string;
    severity?: string;
    /** Estrutura livre vinda do frontend (URL, marca, user agent, viewport, logs recentes) —
     *  sanitizada campo a campo abaixo, nunca persistida como veio. */
    context: Record<string, unknown>;
}

export class BugReportService {
    async create(input: CreateBugReportInput) {
        const title = sanitizeTitle(input.title);
        const description = sanitizeDescription(input.description);
        if (!title || !description) {
            throw new AppError('Título e descrição são obrigatórios.', 400);
        }

        const severity: Severity = VALID_SEVERITIES.includes(input.severity as Severity)
            ? (input.severity as Severity)
            : 'MEDIUM';

        const rawContext = input.context ?? {};
        const context = {
            url: typeof rawContext.url === 'string' ? rawContext.url.slice(0, 2000) : undefined,
            route: typeof rawContext.route === 'string' ? rawContext.route.slice(0, 500) : undefined,
            brand: typeof rawContext.brand === 'string' ? rawContext.brand.slice(0, 50) : undefined,
            userAgent: typeof rawContext.userAgent === 'string' ? rawContext.userAgent.slice(0, 500) : undefined,
            viewport: rawContext.viewport && typeof rawContext.viewport === 'object' ? rawContext.viewport : undefined,
            appVersion: typeof rawContext.appVersion === 'string' ? rawContext.appVersion.slice(0, 50) : undefined,
            capturedAt: new Date().toISOString(),
            recentLogs: sanitizeRecentLogs(rawContext.recentLogs),
        };

        const report = await prisma.bugReport.create({
            data: {
                organizationId: input.organizationId,
                userId: input.userId,
                userEmail: input.userEmail,
                title,
                description,
                severity,
                context: context as unknown as Prisma.InputJsonValue,
            },
        });

        logger.info(
            { organizationId: input.organizationId, bugReportId: report.id, severity },
            '[BugReport] Novo relato criado'
        );

        return report;
    }

    async listForOrganization(organizationId: string, status?: string) {
        return prisma.bugReport.findMany({
            where: {
                organizationId,
                ...(status && VALID_STATUSES.includes(status as Status) ? { status } : {}),
            },
            orderBy: { createdAt: 'desc' },
        });
    }

    async updateStatus(organizationId: string, id: string, status: string) {
        if (!VALID_STATUSES.includes(status as Status)) {
            throw new AppError(`Status inválido. Use um de: ${VALID_STATUSES.join(', ')}.`, 400);
        }

        const result = await prisma.bugReport.updateMany({
            where: { id, organizationId },
            data: { status },
        });

        if (result.count === 0) {
            throw new AppError('Relato não encontrado.', 404);
        }

        return prisma.bugReport.findFirst({ where: { id, organizationId } });
    }
}

export const bugReportService = new BugReportService();
