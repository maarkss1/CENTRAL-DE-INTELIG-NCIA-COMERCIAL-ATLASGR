export const VALID_BUG_REPORT_SEVERITIES = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as const;
export const VALID_BUG_REPORT_STATUSES = ['OPEN', 'TRIAGED', 'RESOLVED'] as const;

export type BugReportSeverity = (typeof VALID_BUG_REPORT_SEVERITIES)[number];
export type BugReportStatus = (typeof VALID_BUG_REPORT_STATUSES)[number];

export interface BugReportContext {
  url?: string;
  route?: string;
  brand?: string;
  userAgent?: string;
  viewport?: unknown;
  appVersion?: string;
  capturedAt: string;
  recentLogs: Array<{ level: string; message: string; timestamp: string }>;
}

export interface BugReport {
  id: string;
  organizationId: string;
  userId: string | null;
  userEmail: string | null;
  title: string;
  description: string;
  severity: BugReportSeverity;
  status: BugReportStatus;
  context: unknown;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateBugReportData {
  organizationId: string;
  userId?: string;
  userEmail?: string;
  title: string;
  description: string;
  severity: BugReportSeverity;
  context: BugReportContext;
}

export interface BugReportRepository {
  create(data: CreateBugReportData): Promise<BugReport>;
  findManyForOrganization(organizationId: string, status?: string): Promise<BugReport[]>;
  updateStatus(
    organizationId: string,
    id: string,
    status: BugReportStatus,
  ): Promise<BugReport | null>;
}
