import { Queue, Worker, Job } from 'bullmq';
import type { Prisma } from '@prisma/client';
import { connection } from './redis.js';
import { logger } from '../logger.js';
import { prisma } from '../prisma.js';
import { searchCompanyNews } from '../../features/prospecting/services/news.service.js';

export const NEWS_MONITOR_QUEUE = 'news-monitor';
export const newsMonitorQueue = new Queue(NEWS_MONITOR_QUEUE, { connection });
newsMonitorQueue.on('error', (err) => logger.warn({ err }, 'NewsMonitorQueue offline'));

export function createNewsMonitorWorker() {
    const worker = new Worker(
        NEWS_MONITOR_QUEUE,
        async (job: Job) => {
            if (job.name === 'scan-company-news') {
                const { companyId } = job.data;
                const company = await prisma.company.findUnique({ where: { id: companyId } });
                if (!company) return;

                // Busca real via GDELT/SearXNG (mesmo serviço usado no enriquecimento de empresa) —
                // nunca fabrica notícia quando não há menção real encontrada.
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
                        .map((m) => m.url)
                );
                const newMentions = freshMentions.filter((m) => !knownUrls.has(m.url));
                if (newMentions.length === 0) {
                    logger.info(`News scan finished for company ${companyId} — sem menções novas`);
                    return;
                }

                await prisma.company.update({
                    where: { id: companyId },
                    data: { newsMentions: [...currentMentions, ...newMentions] as unknown as Prisma.InputJsonValue }
                });

                // Cria um sinal de intenção a partir da menção real mais recente.
                if (company.organizationId) {
                    const latest = newMentions[0];
                    await prisma.accountSignal.create({
                        data: {
                            organizationId: company.organizationId,
                            companyId: company.id,
                            type: 'news_mention',
                            taxonomyVersion: 'v1',
                            title: 'Menção em notícia recente',
                            description: latest.title,
                            source: latest.domain,
                            confidence: 0.85,
                            evidenceType: 'FACT',
                            dedupeKey: `news:${company.id}:${latest.url}`
                        }
                    });
                }

                logger.info(`News scan finished for company ${companyId} — ${newMentions.length} menção(ões) real(is) encontrada(s)`);
            } else if (job.name === 'scan-all-companies-news') {
                const companies = await prisma.company.findMany({ select: { id: true } });
                for (const c of companies) {
                    await newsMonitorQueue.add('scan-company-news', { companyId: c.id });
                }
            }
        },
        { connection, concurrency: 2 }
    );
    return worker;
}

export async function scheduleGlobalNewsScan() {
    await (newsMonitorQueue as any).add('scan-all-companies-news', {}, {
        repeat: { pattern: '0 8 * * *' }
    });
}
