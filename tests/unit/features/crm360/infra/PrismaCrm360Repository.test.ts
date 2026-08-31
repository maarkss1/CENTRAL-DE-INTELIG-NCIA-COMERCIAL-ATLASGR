/**
 * Onda 43 (achado da auditoria de N+1 da Onda 42, "observação relacionada"): ensureDefaultPipelines
 * roda em toda leitura do CRM360 (getOverviewData/getPipelines/getBoardLeads), não só na primeira
 * vez — cada chamada fazia um `upsert` (grava mesmo sem mudança real) + uma releitura completa,
 * por pipeline, mesmo quando o pipeline já estava provisionado. Este teste prova que o fast path
 * novo pula upsert/releitura quando não há nada para provisionar, sem deixar de rodar
 * attachLegacyRecords (o mecanismo real de atribuição de pipeline/estágio a lead).
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CrmPipelineEntity, LeadFunnel, LeadStatus } from '@prisma/client';

const crmPipelineFindUnique = vi.fn();
const crmPipelineUpsert = vi.fn();
const crmPipelineFindFirstOrThrow = vi.fn();
const crmPipelineStageCreateMany = vi.fn();
const leadUpdateMany = vi.fn();

vi.mock('../../../../../src/lib/prisma.js', () => ({
    prisma: {
        crmPipeline: {
            findUnique: (...args: unknown[]) => crmPipelineFindUnique(...args),
            upsert: (...args: unknown[]) => crmPipelineUpsert(...args),
            findFirstOrThrow: (...args: unknown[]) => crmPipelineFindFirstOrThrow(...args),
        },
        crmPipelineStage: {
            createMany: (...args: unknown[]) => crmPipelineStageCreateMany(...args),
        },
        lead: {
            updateMany: (...args: unknown[]) => leadUpdateMany(...args),
        },
    },
}));

const { ensureDefaultPipelines } = await import(
    '../../../../../src/features/crm360/infra/PrismaCrm360Repository.js'
);

const ORG = 'org-1';

// 12 estágios simulados — cobre tanto LEAD_STAGES (6) quanto DEAL_STAGES (12) no arquivo fonte,
// usado só para provar "já tem estágio suficiente" sem depender do conteúdo exato de cada um.
function fullPipeline(overrides: Record<string, unknown> = {}) {
    return {
        id: 'pipe-1',
        organizationId: ORG,
        active: true,
        isDefault: true,
        entity: CrmPipelineEntity.Lead,
        sortOrder: 0,
        stages: Array.from({ length: 12 }, (_, i) => ({
            id: `stage-${i}`,
            leadStatus: LeadStatus.Lead_Recebido,
            probability: 5,
        })),
        ...overrides,
    };
}

afterEach(() => {
    vi.clearAllMocks();
});

describe('ensureDefaultPipelines — fast path (Onda 43)', () => {
    it('pipeline já provisionado: nunca chama upsert nem releitura, mas continua rodando attachLegacyRecords', async () => {
        crmPipelineFindUnique
            .mockResolvedValueOnce(fullPipeline({ entity: CrmPipelineEntity.Lead, sortOrder: 0 }))
            .mockResolvedValueOnce(fullPipeline({ id: 'pipe-2', entity: CrmPipelineEntity.Negocio, sortOrder: 1 }));
        leadUpdateMany.mockResolvedValue({ count: 0 });

        await ensureDefaultPipelines(ORG);

        expect(crmPipelineUpsert).not.toHaveBeenCalled();
        expect(crmPipelineFindFirstOrThrow).not.toHaveBeenCalled();
        expect(crmPipelineStageCreateMany).not.toHaveBeenCalled();
        // attachLegacyRecords roda sempre — 12 estágios simulados por pipeline × 2 pipelines.
        expect(leadUpdateMany).toHaveBeenCalledTimes(24);
    });

    it('organização nova (nenhum pipeline ainda): cai no caminho antigo de provisionamento', async () => {
        crmPipelineFindUnique.mockResolvedValue(null);
        crmPipelineUpsert.mockResolvedValue(fullPipeline());
        leadUpdateMany.mockResolvedValue({ count: 0 });

        await ensureDefaultPipelines(ORG);

        expect(crmPipelineUpsert).toHaveBeenCalledTimes(2);
        // upsert já devolveu os 6 estágios (create aninhado) — não precisa recriar nem reler.
        expect(crmPipelineStageCreateMany).not.toHaveBeenCalled();
        expect(crmPipelineFindFirstOrThrow).not.toHaveBeenCalled();
    });

    it('pipeline existe mas com menos estágios que o esperado: provisiona os que faltam e relê antes de anexar leads legados', async () => {
        crmPipelineFindUnique.mockResolvedValue(fullPipeline({ stages: [] }));
        crmPipelineUpsert.mockResolvedValue(fullPipeline({ stages: [] }));
        crmPipelineFindFirstOrThrow.mockResolvedValue(fullPipeline());
        leadUpdateMany.mockResolvedValue({ count: 0 });

        await ensureDefaultPipelines(ORG);

        expect(crmPipelineStageCreateMany).toHaveBeenCalledTimes(2);
        expect(crmPipelineFindFirstOrThrow).toHaveBeenCalledTimes(2);
    });

    it('attachLegacyRecords ainda atribui leads órfãos (pipelineId null) mesmo no fast path', async () => {
        crmPipelineFindUnique
            .mockResolvedValueOnce(fullPipeline({ entity: CrmPipelineEntity.Lead, sortOrder: 0 }))
            .mockResolvedValueOnce(fullPipeline({ id: 'pipe-2', entity: CrmPipelineEntity.Negocio, sortOrder: 1 }));
        leadUpdateMany.mockResolvedValue({ count: 3 });

        await ensureDefaultPipelines(ORG);

        expect(leadUpdateMany).toHaveBeenCalledWith({
            where: {
                organizationId: ORG,
                funnel: LeadFunnel.Lead,
                status: LeadStatus.Lead_Recebido,
                pipelineId: null,
            },
            data: { pipelineId: 'pipe-1', pipelineStageId: 'stage-0', probability: 5 },
        });
    });
});
