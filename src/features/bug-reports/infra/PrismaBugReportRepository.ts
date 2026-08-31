import type { Prisma } from '@prisma/client';
import { prisma } from '../../../lib/prisma.js';
import type {
  BugReport,
  BugReportRepository,
  BugReportStatus,
  CreateBugReportData,
} from '../domain/BugReport.js';
import { VALID_BUG_REPORT_STATUSES } from '../domain/BugReport.js';

export class PrismaBugReportRepository implements BugReportRepository {
  async create(data: CreateBugReportData): Promise<BugReport> {
    return prisma.bugReport.create({
      data: {
        organizationId: data.organizationId,
        userId: data.userId,
        userEmail: data.userEmail,
        title: data.title,
        description: data.description,
        severity: data.severity,
        context: data.context as unknown as Prisma.InputJsonValue,
      },
    }) as unknown as Promise<BugReport>;
  }

  async findManyForOrganization(organizationId: string, status?: string): Promise<BugReport[]> {
    return prisma.bugReport.findMany({
      where: {
        organizationId,
        ...(status && isValidStatus(status) ? { status } : {}),
      },
      orderBy: { createdAt: 'desc' },
    }) as unknown as Promise<BugReport[]>;
  }

  async updateStatus(
    organizationId: string,
    id: string,
    status: BugReportStatus,
  ): Promise<BugReport | null> {
    const result = await prisma.bugReport.updateMany({
      where: { id, organizationId },
      data: { status },
    });

    if (result.count === 0) return null;

    return prisma.bugReport.findFirst({
      where: { id, organizationId },
    }) as unknown as Promise<BugReport | null>;
  }
}

function isValidStatus(value: string): value is (typeof VALID_BUG_REPORT_STATUSES)[number] {
  return VALID_BUG_REPORT_STATUSES.includes(value as (typeof VALID_BUG_REPORT_STATUSES)[number]);
}
