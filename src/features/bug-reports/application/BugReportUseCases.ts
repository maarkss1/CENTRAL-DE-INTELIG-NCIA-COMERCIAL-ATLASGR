import type {
  BugReportRepository,
  BugReportSeverity,
  BugReportStatus,
} from '../domain/BugReport.js';
import { VALID_BUG_REPORT_SEVERITIES, VALID_BUG_REPORT_STATUSES } from '../domain/BugReport.js';
import {
  sanitizeTitle,
  sanitizeDescription,
  sanitizeRecentLogs,
} from '../domain/bugReport.sanitize.js';
import { logger } from '../../../lib/logger.js';
import { AppError } from '../../../shared/middlewares/errorHandler.js';

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

export class BugReportUseCases {
  constructor(private bugReportRepository: BugReportRepository) {}

  async createBugReport(input: CreateBugReportInput) {
    const title = sanitizeTitle(input.title);
    const description = sanitizeDescription(input.description);
    if (!title || !description) {
      throw new AppError('Título e descrição são obrigatórios.', 400);
    }

    const severity: BugReportSeverity = VALID_BUG_REPORT_SEVERITIES.includes(
      input.severity as BugReportSeverity,
    )
      ? (input.severity as BugReportSeverity)
      : 'MEDIUM';

    const rawContext = input.context ?? {};
    const context = {
      url: typeof rawContext.url === 'string' ? rawContext.url.slice(0, 2000) : undefined,
      route: typeof rawContext.route === 'string' ? rawContext.route.slice(0, 500) : undefined,
      brand: typeof rawContext.brand === 'string' ? rawContext.brand.slice(0, 50) : undefined,
      userAgent:
        typeof rawContext.userAgent === 'string' ? rawContext.userAgent.slice(0, 500) : undefined,
      viewport:
        rawContext.viewport && typeof rawContext.viewport === 'object'
          ? rawContext.viewport
          : undefined,
      appVersion:
        typeof rawContext.appVersion === 'string' ? rawContext.appVersion.slice(0, 50) : undefined,
      capturedAt: new Date().toISOString(),
      recentLogs: sanitizeRecentLogs(rawContext.recentLogs),
    };

    const report = await this.bugReportRepository.create({
      organizationId: input.organizationId,
      userId: input.userId,
      userEmail: input.userEmail,
      title,
      description,
      severity,
      context,
    });

    logger.info(
      { organizationId: input.organizationId, bugReportId: report.id, severity },
      '[BugReport] Novo relato criado',
    );

    return report;
  }

  async listBugReports(organizationId: string, status?: string) {
    return this.bugReportRepository.findManyForOrganization(organizationId, status);
  }

  async updateBugReportStatus(organizationId: string, id: string, status: string) {
    if (!VALID_BUG_REPORT_STATUSES.includes(status as BugReportStatus)) {
      throw new AppError(
        `Status inválido. Use um de: ${VALID_BUG_REPORT_STATUSES.join(', ')}.`,
        400,
      );
    }

    const updated = await this.bugReportRepository.updateStatus(
      organizationId,
      id,
      status as BugReportStatus,
    );

    if (!updated) {
      throw new AppError('Relato não encontrado.', 404);
    }

    return updated;
  }
}
