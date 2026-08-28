import { Queue, Worker, Job } from 'bullmq';
import type { Prisma } from '@prisma/client';
import { connection } from './redis.js';
import { logger } from '../logger.js';
import { prisma } from '../prisma.js';
import { requestContext } from '../async-context.js';
import { recordDeadLetter, isFinalAttempt } from './deadLetter.js';
import { searchCompanyNews } from '../../features/prospecting/services/news.service.js';

/**
 * D.2 do audit da Fase 0 (`.agents/runs/ldr-fase-0-auditoria.md`): este worker já existia com
 * lógica real (busca de notícia via GDELT/SearXNG, nunca fabrica menção), mas nunca era registrado
 * em `worker.ts` e tinha dois defeitos que o teriam deixado quebrado/silencioso em produção mesmo
 * depois de registrado:
 * 1. `scheduleGlobalNewsScan` usava `repeat` em `Queue.add`, opção removida no BullMQ v6 — corrigido
 *    para `upsertJobScheduler` (mesmo padrão de `cadenceRun.worker.ts`).
 * 2. `scan-all-companies-news`/`scan-company-news` liam/escreviam `Company`/`AccountSignal` sem
 *    nenhum `requestContext.run` — sem tenant conhecido, a query cross-tenant sempre devolvia 0
 *    linhas em produção (FORCE ROW LEVEL SECURITY), mesma falha silenciosa já corrigida para
 *    Lead/CadenceRun em `followUp.worker.ts`/`cadenceRun.worker.ts`. Corrigido: `Company` NUNCA é
 *    lido sob bypass — `tests/integration/rls-bypass-allowlist.test.ts` prova que Company foi
 *    deliberadamente excluído do bypass (ITEM-02, dado comercial sensível). A descoberta bypassa
 *    só `Organization` (lista de organizações) e escopa `Company` por tenant real
 *    (`requestContext.run({ tenantId })`) uma organização de cada vez; o `organizationId` resolvido
 *    ali é propagado no job data para que `scan-company-news` rode toda leitura/escrita seguinte
 *    dentro do mesmo escopo de tenant, sem bypass.
 */

export const NEWS_MONITOR_QUEUE = 'news-monitor';
export const newsMonitorQueue = new Queue(NEWS_MONITOR_QUEUE, { connection });
newsMonitorQueue.on('error', (err) => logger.warn({ err }, 'NewsMonitorQueue offline'));

const SCAN_INTERVAL_CRON = '0 8 * * *';
const MAX_COMPANIES_PER_SCAN = 500;
const MAX_COMPANIES_PER_ORGANIZATION_PER_SCAN = 100;

interface ScanCompanyNewsJobData {
  companyId: string;
  organizationId: string;
}

async function scanCompanyNews({
  companyId,
  organizationId,
}: ScanCompanyNewsJobData): Promise<void> {
  await requestContext.run({ tenantId: organizationId }, async () => {
    const company = await prisma.company.findUnique({ where: { id: companyId } });
    if (!company) return;

    // Busca real via GDELT/SearXNG (mesmo serviço usado no enriquecimento de empresa) — nunca
    // fabrica notícia quando não há menção real encontrada.
    const companyName = company.tradeName || company.legalName;
    const freshMentions = await searchCompanyNews(companyName || '');
    if (freshMentions.length === 0) {
      logger.info(`News scan finished for company ${companyId} — nenhuma menção real encontrada`);
      return;
    }

    const currentMentions = Array.isArray(company.newsMentions) ? company.newsMentions : [];
    const knownUrls = new Set(
      currentMentions
        .filter((m): m is { url?: string } => typeof m === 'object' && m !== null)
        .map((m) => m.url),
    );
    const newMentions = freshMentions.filter((m) => !knownUrls.has(m.url));
    if (newMentions.length === 0) {
      logger.info(`News scan finished for company ${companyId} — sem menções novas`);
      return;
    }

    await prisma.company.update({
      where: { id: companyId },
      data: {
        newsMentions: [...currentMentions, ...newMentions] as unknown as Prisma.InputJsonValue,
      },
    });

    // Cria um sinal de intenção a partir da menção real mais recente.
    const latest = newMentions[0];
    await prisma.accountSignal.create({
      data: {
        organizationId,
        companyId: company.id,
        type: 'news_mention',
        taxonomyVersion: 'v1',
        title: 'Menção em notícia recente',
        description: latest.title,
        source: latest.domain,
        confidence: 0.85,
        evidenceType: 'FACT',
        dedupeKey: `news:${company.id}:${latest.url}`,
      },
    });

    logger.info(
      `News scan finished for company ${companyId} — ${newMentions.length} menção(ões) real(is) encontrada(s)`,
    );
  });
}

async function scanAllCompaniesNews(): Promise<void> {
  const organizationIds = await requestContext.run({ bypassRls: true }, async () => {
    const organizations = await prisma.organization.findMany({ select: { id: true } });
    return organizations.map((organization) => organization.id);
  });

  let scanned = 0;
  for (const organizationId of organizationIds) {
    if (scanned >= MAX_COMPANIES_PER_SCAN) break;
    // Company nunca é lida sob bypass (ver comentário do módulo) — cada organização é escopada
    // por tenant real antes de listar suas próprias contas.
    const companies = await requestContext.run({ tenantId: organizationId }, () =>
      prisma.company.findMany({
        where: { deletedAt: null },
        select: { id: true },
        take: Math.min(MAX_COMPANIES_PER_ORGANIZATION_PER_SCAN, MAX_COMPANIES_PER_SCAN - scanned),
      }),
    );
    for (const company of companies) {
      const data: ScanCompanyNewsJobData = { companyId: company.id, organizationId };
      await newsMonitorQueue.add('scan-company-news', data);
      scanned += 1;
    }
  }
}

export function createNewsMonitorWorker(): Worker {
  const worker = new Worker(
    NEWS_MONITOR_QUEUE,
    async (job: Job) => {
      if (job.name === 'scan-company-news') {
        await scanCompanyNews(job.data as ScanCompanyNewsJobData);
      } else if (job.name === 'scan-all-companies-news') {
        await scanAllCompaniesNews();
      }
    },
    { connection, concurrency: 2 },
  );

  worker.on('failed', (job, err) => {
    logger.error({ err, jobId: job?.id }, 'News monitor worker job falhou');
    if (!job || !isFinalAttempt(job.attemptsMade, job.opts.attempts)) return;
    void recordDeadLetter({
      queue: NEWS_MONITOR_QUEUE,
      jobId: job.id,
      jobName: job.name,
      organizationId: (job.data as Partial<ScanCompanyNewsJobData>)?.organizationId ?? null,
      attemptsMade: job.attemptsMade,
      error: err,
    });
  });

  worker.on('error', (err) => {
    logger.warn({ err }, 'News monitor worker error suppressed (Redis offline)');
  });

  return worker;
}

export async function scheduleGlobalNewsScan(): Promise<void> {
  await newsMonitorQueue.upsertJobScheduler(
    'news-monitor-daily-scan',
    { pattern: SCAN_INTERVAL_CRON },
    { name: 'scan-all-companies-news', data: {} },
  );
  logger.info({ pattern: SCAN_INTERVAL_CRON }, 'News monitor scan job scheduled');
}
