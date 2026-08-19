import { Queue, Worker, Job } from 'bullmq';
import { connection } from './redis.js';
import { logger } from '../logger.js';
import { prisma } from '../prisma.js';

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

                // Mock de detecção de notícia
                const mockNews = [
                    "Empresa anuncia nova rodada de investimentos de R$ 50 Milhões.",
                    "Nova diretoria executiva assume e foca em expansão nacional.",
                    "Empresa lança novo produto revolucionário no mercado.",
                    "Fusão concluída: empresa adquire concorrente direto."
                ];
                const randomNews = mockNews[Math.floor(Math.random() * mockNews.length)];

                // Adiciona a menção ao json
                const currentMentions = Array.isArray(company.newsMentions) ? company.newsMentions : [];
                const updatedMentions = [...currentMentions, { date: new Date().toISOString(), snippet: randomNews, source: "GDELT-News" }];

                await prisma.company.update({
                    where: { id: companyId },
                    data: { newsMentions: updatedMentions }
                });

                // Cria um sinal de intenção baseado na notícia
                if (company.organizationId) {
                    await prisma.accountSignal.create({
                        data: {
                            organizationId: company.organizationId,
                            companyId: company.id,
                            type: 'news_mention',
                            taxonomyVersion: 'v1',
                            title: 'Menção em notícia recente',
                            description: randomNews,
                            source: 'GDELT-News',
                            confidence: 0.85,
                            evidenceType: 'FACT',
                            dedupeKey: `news:${company.id}:${Date.now()}`
                        }
                    });
                }

                logger.info(`News scan finished for company ${companyId}`);
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
