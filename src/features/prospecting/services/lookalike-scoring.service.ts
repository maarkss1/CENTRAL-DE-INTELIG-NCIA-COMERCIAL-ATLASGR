import type { Company, Prisma } from '@prisma/client';
import { prisma } from '../../../lib/prisma.js';
import { generateEmbedding } from '../../../lib/ai/gateway.js';
import { logger } from '../../../lib/logger.js';

// Um ou dois "vizinhos" não são sinal, são ruído — sem um mínimo de empresas já ganhas no tenant,
// devolvemos null em vez de fingir confiança que não existe (cold start).
const MIN_REFERENCE_COMPANIES = 3;
const TOP_K_MATCHES = 5;

export interface LookalikeMatch {
    companyId: string;
    tradeName: string;
    similarity: number;
}

export interface LookalikeScoreResult {
    score: number;
    matches: LookalikeMatch[];
}

type CompanyProfileFields = Pick<
    Company,
    'tradeName' | 'segment' | 'cnae' | 'city' | 'state' | 'size' | 'employeeCount' | 'technologies' | 'keywords'
>;

/**
 * Texto determinístico do perfil firmográfico — os mesmos campos reais já usados em
 * `computeFitScore`/`leadQualification.ts` (nunca inventados), servindo de base pro embedding.
 */
export function buildCompanyProfileText(company: CompanyProfileFields): string {
    const parts = [
        company.tradeName,
        company.segment && `Segmento: ${company.segment}`,
        company.cnae && `CNAE: ${company.cnae}`,
        (company.city || company.state) && `Localização: ${[company.city, company.state].filter(Boolean).join(', ')}`,
        company.size && `Porte: ${company.size}${company.employeeCount ? ` (~${company.employeeCount} funcionários)` : ''}`,
        company.technologies?.length ? `Tecnologias: ${company.technologies.slice(0, 10).join(', ')}` : null,
        company.keywords?.length ? `Palavras-chave: ${company.keywords.slice(0, 10).join(', ')}` : null,
    ].filter(Boolean);
    return parts.join(' | ');
}

/** Gera (ou regenera) o embedding do perfil firmográfico desta empresa e grava no banco. */
export async function updateCompanyProfileEmbedding(companyId: string, organizationId: string): Promise<boolean> {
    if (!organizationId) return false;
    try {
        const company = await prisma.company.findFirst({ where: { id: companyId, organizationId } });
        if (!company) return false;

        const text = buildCompanyProfileText(company);
        if (!text.trim()) return false;

        const vector = await generateEmbedding(text);
        const vectorString = `[${vector.join(',')}]`;

        await prisma.$executeRaw`
            UPDATE "Company"
            SET "profileEmbedding" = ${vectorString}::vector
            WHERE id = ${companyId} AND "organizationId" = ${organizationId}
        `;
        return true;
    } catch (error) {
        logger.error({ err: error, companyId }, 'Falha ao gerar embedding de perfil da empresa');
        return false;
    }
}

interface LookalikeRow {
    id: string;
    tradeName: string;
    similarity: number;
}

/**
 * Mede a semelhança firmográfica desta empresa com empresas do mesmo tenant que já fecharam
 * negócio ("Fechado Ganho"), por distância de cosseno entre embeddings — sem treinar nenhum
 * modelo, mesma técnica que `VectorSearchService` já usa pra busca semântica na Base de
 * Conhecimento. Devolve `null` quando não há histórico de vitórias suficiente pra ser um sinal
 * confiável (tenant novo, ou nenhuma empresa ganha ainda tem embedding — ver limitação no
 * comentário do módulo).
 *
 * Limitação conhecida: só empresas que já passaram por `enrichCompany` têm `profileEmbedding`
 * gravado. Negócios ganhos antes desta feature (ou nunca reenriquecidos depois de ganhos) não
 * entram no pool de comparação até serem enriquecidos de novo — não há backfill automático.
 */
export async function computeLookalikeScore(companyId: string, organizationId: string): Promise<LookalikeScoreResult | null> {
    if (!organizationId) return null;

    try {
        await updateCompanyProfileEmbedding(companyId, organizationId);

        const [target] = await prisma.$queryRaw<Array<{ profileEmbedding: string | null }>>`
            SELECT "profileEmbedding"::text as "profileEmbedding" FROM "Company"
            WHERE id = ${companyId} AND "organizationId" = ${organizationId}
        `;
        if (!target?.profileEmbedding) return null;

        const matches = await prisma.$queryRaw<LookalikeRow[]>`
            SELECT DISTINCT ON (c.id) c.id, c."tradeName",
                1 - (c."profileEmbedding" <=> ${target.profileEmbedding}::vector) as similarity
            FROM "Company" c
            INNER JOIN "Lead" l ON l."companyId" = c.id
            WHERE c."organizationId" = ${organizationId}
              AND c.id != ${companyId}
              AND c."profileEmbedding" IS NOT NULL
              AND l.status = 'Fechado Ganho'
            ORDER BY c.id, similarity DESC
        `;

        if (matches.length < MIN_REFERENCE_COMPANIES) return null;

        const top = [...matches].sort((a, b) => b.similarity - a.similarity).slice(0, TOP_K_MATCHES);
        const avgSimilarity = top.reduce((sum, m) => sum + m.similarity, 0) / top.length;
        const score = Math.round(Math.max(0, Math.min(1, avgSimilarity)) * 100);

        const result: LookalikeScoreResult = {
            score,
            matches: top.map((m) => ({
                companyId: m.id,
                tradeName: m.tradeName,
                similarity: Math.round(m.similarity * 100) / 100,
            })),
        };

        await prisma.company.update({
            where: { id: companyId },
            data: {
                lookalikeScore: result.score,
                lookalikeTopMatches: result.matches as unknown as Prisma.InputJsonValue,
            },
        });

        return result;
    } catch (error) {
        logger.error({ err: error, companyId }, 'Falha ao calcular lookalike score');
        return null;
    }
}
