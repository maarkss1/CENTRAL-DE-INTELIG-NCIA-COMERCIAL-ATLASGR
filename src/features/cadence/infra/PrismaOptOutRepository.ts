import { prisma } from '../../../lib/prisma.js';
import type {
    NormalizedOptOutSubject,
    OptOutRecord,
    OptOutRepository,
    OptOutScope,
} from '../domain/optOut.js';

/**
 * Adaptador Prisma real de `OptOutRepository` (tabela `OptOutRecord`, ver migration
 * `20260815120000_opt_out_record`). Antes deste arquivo, a única implementação era
 * `InMemoryOptOutRepository` (só para teste) — sem isto, `isOptedOut`/`recordOptOut` não tinham
 * como ser chamados de verdade pelos canais reais (05/06/12), ver
 * `.agents/handoffs/onda-7/17-para-05-06-12-contrato-optout.md`.
 *
 * `scope`/`originChannel` no domínio são lowercase (`'email'|'whatsapp'|'voice'|'global'`); o
 * enum Postgres é PascalCase (`Email|WhatsApp|Voice|Global`) — mapeados aqui, não propagados pro
 * resto do código para não vazar detalhe de schema pra fora da camada de persistência.
 */

const SCOPE_TO_DB: Record<OptOutScope, 'Email' | 'WhatsApp' | 'Voice' | 'Global'> = {
    email: 'Email',
    whatsapp: 'WhatsApp',
    voice: 'Voice',
    global: 'Global',
};

const SCOPE_FROM_DB: Record<'Email' | 'WhatsApp' | 'Voice' | 'Global', OptOutScope> = {
    Email: 'email',
    WhatsApp: 'whatsapp',
    Voice: 'voice',
    Global: 'global',
};

type OptOutRecordRow = {
    id: string;
    organizationId: string;
    scope: 'Email' | 'WhatsApp' | 'Voice' | 'Global';
    leadId: string | null;
    email: string | null;
    phoneE164: string | null;
    originChannel: string;
    reason: string | null;
    evidence: string | null;
    requestedBy: string | null;
    createdAt: Date;
};

function toDomain(row: OptOutRecordRow): OptOutRecord {
    return {
        id: row.id,
        organizationId: row.organizationId,
        scope: SCOPE_FROM_DB[row.scope],
        leadId: row.leadId,
        email: row.email,
        phoneE164: row.phoneE164,
        originChannel: row.originChannel as OptOutRecord['originChannel'],
        reason: row.reason,
        evidence: row.evidence,
        requestedBy: row.requestedBy,
        createdAt: row.createdAt,
    };
}

export class PrismaOptOutRepository implements OptOutRepository {
    async create(record: Omit<OptOutRecord, 'id' | 'createdAt'>): Promise<OptOutRecord> {
        const row = await prisma.optOutRecord.create({
            data: {
                organizationId: record.organizationId,
                scope: SCOPE_TO_DB[record.scope],
                leadId: record.leadId,
                email: record.email,
                phoneE164: record.phoneE164,
                originChannel: record.originChannel,
                reason: record.reason,
                evidence: record.evidence,
                requestedBy: record.requestedBy,
            },
        });
        return toDomain(row);
    }

    async findMatches(organizationId: string, subject: NormalizedOptOutSubject): Promise<OptOutRecord[]> {
        const or: Array<Record<string, unknown>> = [];
        if (subject.leadId) or.push({ leadId: subject.leadId });
        if (subject.email) or.push({ email: subject.email });
        if (subject.phoneE164) or.push({ phoneE164: subject.phoneE164 });
        if (or.length === 0) return [];

        const rows = await prisma.optOutRecord.findMany({
            where: { organizationId, OR: or },
        });
        return rows.map(toDomain);
    }

    async list(organizationId: string, limit = 200): Promise<OptOutRecord[]> {
        const rows = await prisma.optOutRecord.findMany({
            where: { organizationId },
            orderBy: { createdAt: 'desc' },
            take: Math.min(Math.max(limit, 1), 500),
        });
        return rows.map(toDomain);
    }
}

/** Instância única, sem estado próprio além da conexão Prisma já compartilhada pelo app. */
export const prismaOptOutRepository = new PrismaOptOutRepository();
