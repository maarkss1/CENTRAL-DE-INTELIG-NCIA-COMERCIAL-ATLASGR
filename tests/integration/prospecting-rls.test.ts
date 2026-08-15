import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { prisma, withRlsContext } from '../../src/lib/prisma';
import { requestContext } from '../../src/lib/async-context';

// Onda 6 / handoff 01A-para-00-raw-sql-fora-de-rls-fail-closed.md: updateCompanyProfileEmbedding,
// computeLookalikeScore e findExistingCompany (dedupe por CNPJ) rodavam prisma.$executeRaw/
// $queryRaw FORA de withRlsContext. Como esses métodos não passam pela extensão $allOperations de
// src/lib/prisma.ts, a conexão nunca tinha app.current_tenant_id setado — e a policy FORCE ROW
// LEVEL SECURITY de "Company" é fail-closed: sem tenant no contexto, toda leitura/escrita raw
// devolvia silenciosamente zero linhas, mesmo com o WHERE de organizationId certo. Não era
// vazamento cross-tenant (a policy nunca deixa passar tudo sem contexto), mas as duas features
// ficavam mortas em produção. Este teste roda contra Postgres real (RLS incluída, sem bypass) e
// prova que, depois de embrulhar as 3 chamadas em withRlsContext, as duas features voltam a
// funcionar de verdade — e que o isolamento entre tenants continua valendo.
vi.mock('../../src/lib/ai/gateway', () => ({
    // Vetor fixo (mesmo padrão de tests/integration/knowledge-rag-tenant-isolation.test.ts) — o que
    // está sob teste é o pipeline de RLS/tenant scoping do lookalike scoring (a query real roda,
    // acha os vizinhos certos, persiste o score), não a qualidade do embedding em si.
    generateEmbedding: vi.fn(async () => new Array(768).fill(0).map((_, i) => Math.sin(i + 1))),
}));

vi.mock('../../src/features/prospecting/services/enrichment.service', () => ({
    enrichCompany: vi.fn(),
}));

import { updateCompanyProfileEmbedding, computeLookalikeScore } from '../../src/features/prospecting/services/lookalike-scoring.service';
import { promoteToCrm, type PromoteInput } from '../../src/features/prospecting/services/prospecting.service';

// Orgs dedicadas (não a 'test-org-id' compartilhada por todo o resto da suíte de integração):
// Company/Lead são modelos "auditáveis" na extensão $allOperations de src/lib/prisma.ts — um
// `deleteMany()` neles é um SOFT delete (seta deletedAt), não remove a linha. As queries cruas
// deste módulo (lookalike-scoring.service.ts/prospecting.service.ts) não filtram deletedAt — não
// fazem parte do escopo desta correção — então, se este teste reaproveitasse o tenant
// compartilhado, sobras (soft-deletadas) de QUALQUER outro teste de integração que já rodou
// naquele tenant poderiam contaminar os resultados. Um tenant só deste arquivo evita o problema.
const ORG_A = 'test-org-prospecting-rls-a';
const ORG_B = 'test-org-prospecting-rls-b';

// `enterWith` (não `run`) de propósito, no mesmo padrão de tests/helpers/integration-setup.ts
// (que já seta o tenant padrão da suíte inteira desta forma): troca o tenant do RequestContext
// para o resto da execução síncrona/assíncrona atual, sem precisar embrulhar cada chamada num
// callback. Cada `it` troca de tenant explicitamente sempre que precisa, e o `beforeEach` global
// da suíte de integração já reseta para 'test-org-id' antes do próximo teste.
const asTenant = (tenantId: string) => requestContext.enterWith({ tenantId });
const asBypass = () => requestContext.enterWith({ bypassRls: true });

/** Hard delete de verdade (bypassa a interceptação de soft-delete do model client) — necessário
 * para os testes deste arquivo não vazarem Company/Lead de um `it` para o próximo. */
const hardDeleteOrgData = async (organizationId: string) => {
    asBypass();
    await withRlsContext(async (tx) => {
        await tx.$executeRaw`DELETE FROM "Lead" WHERE "organizationId" = ${organizationId}`;
        await tx.$executeRaw`DELETE FROM "Company" WHERE "organizationId" = ${organizationId}`;
    });
};

describe('Prospecção — regressão RLS fail-closed (SQL cru fora de withRlsContext)', () => {
    beforeEach(async () => {
        asBypass();
        for (const [id, name] of [[ORG_A, 'Test Org Prospecting RLS A'], [ORG_B, 'Test Org Prospecting RLS B']]) {
            const exists = await prisma.organization.findUnique({ where: { id } });
            if (!exists) await prisma.organization.create({ data: { id, name } });
        }
    });

    afterEach(async () => {
        await hardDeleteOrgData(ORG_A);
        await hardDeleteOrgData(ORG_B);
        asBypass();
        await prisma.organization.deleteMany({ where: { id: { in: [ORG_A, ORG_B] } } });
    });

    describe('updateCompanyProfileEmbedding / computeLookalikeScore', () => {
        it('grava o embedding de verdade (UPDATE não afeta mais zero linhas) dentro do tenant certo', async () => {
            asTenant(ORG_A);
            const company = await prisma.company.create({
                data: { legalName: 'Alvo Lookalike', tradeName: 'Alvo Lookalike', segment: 'Transporte', organizationId: ORG_A },
            });

            const ok = await updateCompanyProfileEmbedding(company.id, ORG_A);
            expect(ok).toBe(true);

            // Confirma que o UPDATE realmente persistiu (não é um resultado fabricado) lendo de
            // volta via withRlsContext, exatamente como o código de produção faz.
            const [row] = await withRlsContext((tx) => tx.$queryRaw<{ hasEmbedding: boolean }[]>`
                SELECT ("profileEmbedding" IS NOT NULL) AS "hasEmbedding" FROM "Company" WHERE id = ${company.id}
            `);
            expect(row.hasEmbedding).toBe(true);
        });

        it('computeLookalikeScore encontra vizinhos reais (Negócios Ganhos) do mesmo tenant e persiste o score', async () => {
            asTenant(ORG_A);
            const winners = [];
            for (const name of ['Ganha Alpha', 'Ganha Beta', 'Ganha Gama']) {
                const c = await prisma.company.create({
                    data: { legalName: name, tradeName: name, segment: 'Transporte de cargas', organizationId: ORG_A },
                });
                await updateCompanyProfileEmbedding(c.id, ORG_A);
                await prisma.lead.create({
                    data: { companyId: c.id, organizationId: ORG_A, status: 'Negocios_Ganhos', source: 'teste' },
                });
                winners.push(c);
            }

            const target = await prisma.company.create({
                data: { legalName: 'Empresa Alvo', tradeName: 'Empresa Alvo', segment: 'Transporte de cargas', organizationId: ORG_A },
            });

            const result = await computeLookalikeScore(target.id, ORG_A);

            expect(result).not.toBeNull();
            expect(result!.score).toBeGreaterThan(0);
            expect(result!.matches).toHaveLength(3);
            expect(result!.matches.map((m) => m.companyId).sort()).toEqual(winners.map((w) => w.id).sort());

            // O score também precisa ter sido persistido na Company (não só devolvido em memória).
            // Sem `select` de propósito: um select parcial que omite `deletedAt` faz o filtro de
            // soft-delete da extensão $allOperations (src/lib/prisma.ts) tratar o campo não
            // selecionado (undefined) como "diferente de null" e devolver null — não é o que este
            // teste está verificando, então busca o registro inteiro.
            const persisted = await prisma.company.findUnique({ where: { id: target.id } });
            expect(persisted?.lookalikeScore).toBe(result!.score);
            expect(persisted?.lookalikeTopMatches).toEqual(result!.matches);
        });

        it('não-regressão de isolamento de tenant: vizinhos "Negócios Ganhos" de outro tenant nunca entram no cálculo', async () => {
            // 3 vencedoras no tenant B — sozinhas, teriam sinal suficiente (>= MIN_REFERENCE_COMPANIES).
            asTenant(ORG_B);
            for (const name of ['B Ganha 1', 'B Ganha 2', 'B Ganha 3']) {
                const c = await prisma.company.create({
                    data: { legalName: name, tradeName: name, segment: 'Transporte de cargas', organizationId: ORG_B },
                });
                await updateCompanyProfileEmbedding(c.id, ORG_B);
                await prisma.lead.create({
                    data: { companyId: c.id, organizationId: ORG_B, status: 'Negocios_Ganhos', source: 'teste' },
                });
            }

            // Só 1 vencedora no tenant A — abaixo do mínimo, então o cold-start deve prevalecer
            // (a busca não pode "emprestar" as vencedoras do tenant B para completar o mínimo).
            asTenant(ORG_A);
            const winner = await prisma.company.create({
                data: { legalName: 'A Ganha 1', tradeName: 'A Ganha 1', segment: 'Transporte de cargas', organizationId: ORG_A },
            });
            await updateCompanyProfileEmbedding(winner.id, ORG_A);
            await prisma.lead.create({
                data: { companyId: winner.id, organizationId: ORG_A, status: 'Negocios_Ganhos', source: 'teste' },
            });

            const target = await prisma.company.create({
                data: { legalName: 'Empresa Alvo A', tradeName: 'Empresa Alvo A', segment: 'Transporte de cargas', organizationId: ORG_A },
            });

            const result = await computeLookalikeScore(target.id, ORG_A);

            expect(result).toBeNull(); // cold start real, não vazamento cross-tenant mascarando o mínimo
        });
    });

    describe('findExistingCompany (dedupe por CNPJ) via promoteToCrm', () => {
        const CNPJ_PUNCTUATED = '11.222.333/0001-81';
        const CNPJ_DIGITS = '11222333000181';

        it('reaproveita a Company já cadastrada mesmo com o CNPJ gravado em formato de pontuação diferente', async () => {
            asTenant(ORG_A);
            const existing = await prisma.company.create({
                data: {
                    legalName: 'Transportadora Já Cadastrada',
                    tradeName: 'Transportadora Já Cadastrada',
                    // Gravado com pontuação de propósito — reproduz o cenário real do handoff:
                    // o dedupe por regexp_replace precisa normalizar antes de comparar.
                    cnpj: CNPJ_PUNCTUATED,
                    organizationId: ORG_A,
                },
            });

            const input: PromoteInput = {
                tradeName: 'Nome Diferente Do Candidato', // nome não bate — só o CNPJ deve casar
                source: 'Descoberta',
                organizationId: ORG_A,
                cnpj: CNPJ_DIGITS, // mesmo CNPJ, só dígitos
                autoEnrich: false,
            };

            const result = await promoteToCrm(input);

            expect(result.lead.companyId).toBe(existing.id);

            const companiesWithThisCnpj = await prisma.company.count({ where: { organizationId: ORG_A, cnpj: CNPJ_PUNCTUATED } });
            expect(companiesWithThisCnpj).toBe(1); // não duplicou
        });

        it('não-regressão de isolamento de tenant: mesmo CNPJ em outro tenant não é reaproveitado', async () => {
            asTenant(ORG_B);
            await prisma.company.create({
                data: {
                    legalName: 'Transportadora Do Tenant B',
                    tradeName: 'Transportadora Do Tenant B',
                    cnpj: CNPJ_PUNCTUATED,
                    organizationId: ORG_B,
                },
            });

            asTenant(ORG_A);
            const input: PromoteInput = {
                tradeName: 'Candidato Tenant A',
                source: 'Descoberta',
                organizationId: ORG_A,
                cnpj: CNPJ_DIGITS,
                autoEnrich: false,
            };

            const result = await promoteToCrm(input);

            const createdCompany = await prisma.company.findUnique({ where: { id: result.lead.companyId! } });
            expect(createdCompany?.organizationId).toBe(ORG_A);
            expect(createdCompany?.tradeName).toBe('Candidato Tenant A'); // criou uma nova, não reaproveitou a do tenant B
        });
    });
});
