import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import express, { type Express } from 'express';
import request from 'supertest';
import { createHmac } from 'crypto';
import { prisma } from '../../src/lib/prisma';
import { requestContext } from '../../src/lib/async-context';
import { errorHandler } from '../../src/shared/middlewares/errorHandler';
import { CompanyFactory, ContactFactory, LeadFactory } from '../helpers/factories';

/**
 * Prova, contra Postgres real, o CYC-003 (onda 26): o webhook de e-mail de entrada (stub de
 * transporte) grava `EmailMessage`/`ConversationSignal` de verdade e faz `hasLeadReplied` (o sinal
 * real que `advanceCadenceRun` usa para parar a cadência, ver `src/features/cadence/domain/
 * cadence.ts`) passar a enxergar réplica de e-mail — antes desta rodada, `EmailMessage` era tabela
 * órfã confirmada (nenhum transporte de entrada gravava nela) e `hasLeadReplied` só olhava
 * WhatsApp (ver `docs/CADENCE-CYCLE-AUDIT.md`, CYC-003).
 *
 * O classificador de intenção (`emailIntentClassifier`, chamada real a um LLM) é mockado — já tem
 * cobertura própria em `tests/unit/features/cadence/infra/emailIntentClassifier.test.ts` — para
 * este teste não depender de rede/credencial de IA.
 */

const classify = vi.fn().mockResolvedValue({
    intent: 'alta_intencao_compra',
    urgency: 'alta',
    objections: [],
    budgetMentioned: false,
    nextStep: 'Enviar contrato',
    summary: 'Cliente confirmou fechamento por e-mail.',
    confidence: 0.9,
    raw: {},
});
vi.mock('../../src/features/cadence/infra/emailIntentClassifier.js', () => ({
    emailIntentClassifier: { classify: (...args: unknown[]) => classify(...args) },
}));

// `env` (src/config/env.ts) parseia process.env uma única vez, no import — setar
// process.env.EMAIL_INBOUND_WEBHOOK_SECRET aqui embaixo chegaria tarde demais (outros módulos já
// importaram `env` antes desta linha rodar). `importOriginal` preserva o resto do `env` real
// (conexão real de Postgres/Redis) e só sobrescreve o segredo do webhook. O literal é repetido (não
// referenciado por `const`) porque a factory do vi.mock é hoisted para o topo do arquivo — uma
// variável declarada abaixo dela ainda não existiria nesse ponto.
vi.mock('../../src/config/env.js', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../../src/config/env.js')>();
    return { ...actual, env: { ...actual.env, EMAIL_INBOUND_WEBHOOK_SECRET: 'segredo-email-teste-integracao' } };
});

const { emailReplyWebhookRoutes } = await import('../../src/features/integrations/email/emailReply.webhook');
const { hasLeadReplied } = await import('../../src/features/cadence/infra/hasLeadReplied');

const SECRET = 'segredo-email-teste-integracao';

const RUN_ID = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const ORG = `test-email-reply-${RUN_ID}`;
const ORG_B = `${ORG}-b`;

const withRlsBypass = <T>(fn: () => Promise<T>): Promise<T> => requestContext.run({ bypassRls: true }, fn);
const asOrg = <T>(organizationId: string, fn: () => Promise<T>): Promise<T> => requestContext.run({ tenantId: organizationId }, fn);

function buildApp(): Express {
    const app = express();
    app.use('/api/webhooks/email', emailReplyWebhookRoutes);
    app.use(errorHandler);
    return app;
}

function sign(body: string): string {
    return createHmac('sha256', SECRET).update(body).digest('hex');
}

async function postSigned(payload: Record<string, unknown>) {
    const body = JSON.stringify(payload);
    return request(buildApp())
        .post('/api/webhooks/email/webhook')
        .set('x-email-inbound-signature', sign(body))
        .set('Content-Type', 'application/json')
        .send(body);
}

async function createLeadWithContact(organizationId: string, email: string) {
    return asOrg(organizationId, async () => {
        const company = await prisma.company.create({ data: CompanyFactory.build({ organizationId }) as never });
        const contactData = ContactFactory.build({ organizationId, email, companyId: company.id }) as Record<string, unknown>;
        delete contactData.company;
        const contact = await prisma.contact.create({ data: contactData as never });
        return prisma.lead.create({
            data: LeadFactory.build({ organizationId, status: 'Cadencia_Iniciada', contactId: contact.id }) as never,
        });
    });
}

beforeAll(async () => {
    await withRlsBypass(async () => {
        await prisma.organization.create({ data: { id: ORG, name: 'Test Org (email reply)' } });
        await prisma.organization.create({ data: { id: ORG_B, name: 'Test Org B (email reply)' } });
    });
});

afterEach(async () => {
    vi.clearAllMocks();
    classify.mockResolvedValue({
        intent: 'alta_intencao_compra',
        urgency: 'alta',
        objections: [],
        budgetMentioned: false,
        nextStep: 'Enviar contrato',
        summary: 'Cliente confirmou fechamento por e-mail.',
        confidence: 0.9,
        raw: {},
    });
    await withRlsBypass(async () => {
        await prisma.conversationSignal.deleteMany({ where: { organizationId: { in: [ORG, ORG_B] } } });
        await prisma.timelineEvent.deleteMany({ where: { lead: { organizationId: { in: [ORG, ORG_B] } } } });
        await prisma.emailMessage.deleteMany({ where: { organizationId: { in: [ORG, ORG_B] } } });
        await prisma.lead.deleteMany({ where: { organizationId: { in: [ORG, ORG_B] } } });
        await prisma.contact.deleteMany({ where: { organizationId: { in: [ORG, ORG_B] } } });
        await prisma.company.deleteMany({ where: { organizationId: { in: [ORG, ORG_B] } } });
    });
});

afterAll(async () => {
    await withRlsBypass(() => prisma.organization.deleteMany({ where: { id: { in: [ORG, ORG_B] } } }));
});

describe('CYC-003 — webhook de e-mail de entrada (stub de transporte) contra Postgres real', () => {
    it('réplica genuína: persiste EmailMessage, grava ConversationSignal (channel email) e o lead passa a "ter respondido"', async () => {
        const lead = await createLeadWithContact(ORG, 'lead-reply@empresa.com');
        await expect(asOrg(ORG, () => hasLeadReplied(ORG, lead.id))).resolves.toBe(false);

        const res = await postSigned({
            organizationId: ORG,
            providerMessageId: `<msg-${RUN_ID}-1@lead.com>`,
            fromEmail: 'lead-reply@empresa.com',
            toEmail: 'vendas@atlasgr.com.br',
            subject: 'Re: Proposta',
            body: 'Fechado, pode enviar o contrato.',
            receivedAt: new Date().toISOString(),
        });

        expect(res.status).toBe(200);
        expect(res.body).toMatchObject({ success: true, outcome: 'recorded' });

        const persisted = await asOrg(ORG, () => prisma.emailMessage.findMany({ where: { organizationId: ORG, leadId: lead.id } }));
        expect(persisted).toHaveLength(1);
        expect(persisted[0]).toMatchObject({ direction: 'inbound', fromEmail: 'lead-reply@empresa.com' });

        const signals = await asOrg(ORG, () => prisma.conversationSignal.findMany({ where: { organizationId: ORG, leadId: lead.id } }));
        expect(signals).toHaveLength(1);
        expect(signals[0]).toMatchObject({ channel: 'email', intent: 'alta_intencao_compra' });

        // Dois eventos de timeline, mesmo padrão do canal WhatsApp: um pela chegada da réplica
        // (recordInboundEmail) e outro pelo sinal extraído pela IA (prismaConversationSignalPort).
        const timeline = await asOrg(ORG, () => prisma.timelineEvent.findMany({ where: { leadId: lead.id, type: 'email' } }));
        expect(timeline.map((t) => t.description).sort()).toEqual([
            'Resposta recebida por e-mail: "Re: Proposta"',
            'Sinal de conversa (IA, e-mail): Cliente confirmou fechamento por e-mail.',
        ]);

        await expect(asOrg(ORG, () => hasLeadReplied(ORG, lead.id))).resolves.toBe(true);
    });

    it('auto-resposta/bounce nunca vira EmailMessage nem ConversationSignal — hasLeadReplied continua false', async () => {
        const lead = await createLeadWithContact(ORG, 'lead-oof@empresa.com');

        const res = await postSigned({
            organizationId: ORG,
            providerMessageId: `<msg-${RUN_ID}-2@lead.com>`,
            fromEmail: 'lead-oof@empresa.com',
            subject: 'Out of Office',
            body: 'Estou de férias até dia 30.',
            receivedAt: new Date().toISOString(),
        });

        expect(res.status).toBe(200);
        expect(res.body).toMatchObject({ success: true, outcome: 'ignored-auto-reply' });

        const persisted = await asOrg(ORG, () => prisma.emailMessage.findMany({ where: { organizationId: ORG, leadId: lead.id } }));
        expect(persisted).toHaveLength(0);
        expect(classify).not.toHaveBeenCalled();
        await expect(asOrg(ORG, () => hasLeadReplied(ORG, lead.id))).resolves.toBe(false);
    });

    it('é idempotente: reentrega do mesmo providerMessageId não duplica a mensagem nem reclassifica', async () => {
        const lead = await createLeadWithContact(ORG, 'lead-dup@empresa.com');
        const payload = {
            organizationId: ORG,
            providerMessageId: `<msg-${RUN_ID}-3@lead.com>`,
            fromEmail: 'lead-dup@empresa.com',
            subject: 'Re: Proposta',
            body: 'Confirmado.',
            receivedAt: new Date().toISOString(),
        };

        const first = await postSigned(payload);
        expect(first.body.outcome).toBe('recorded');

        const second = await postSigned(payload);
        expect(second.status).toBe(200);
        expect(second.body).toMatchObject({ success: true, outcome: 'duplicate' });

        const persisted = await asOrg(ORG, () => prisma.emailMessage.findMany({ where: { organizationId: ORG, leadId: lead.id } }));
        expect(persisted).toHaveLength(1);
        expect(classify).toHaveBeenCalledTimes(1);
    });

    it('RLS: resolve o lead pelo e-mail do contato só dentro da própria organização, mesmo com o mesmo e-mail cadastrado em duas organizações', async () => {
        const sharedEmail = `lead-cross-tenant-${RUN_ID}@empresa.com`;
        const leadOrgA = await createLeadWithContact(ORG, sharedEmail);
        const leadOrgB = await createLeadWithContact(ORG_B, sharedEmail);

        const res = await postSigned({
            organizationId: ORG,
            providerMessageId: `<msg-${RUN_ID}-4@lead.com>`,
            fromEmail: sharedEmail,
            subject: 'Re: Proposta',
            body: 'Confirmado, pode seguir.',
            receivedAt: new Date().toISOString(),
        });

        expect(res.body).toMatchObject({ success: true, outcome: 'recorded' });

        const persistedA = await asOrg(ORG, () => prisma.emailMessage.findMany({ where: { organizationId: ORG } }));
        expect(persistedA).toHaveLength(1);
        expect(persistedA[0].leadId).toBe(leadOrgA.id);

        const persistedB = await asOrg(ORG_B, () => prisma.emailMessage.findMany({ where: { organizationId: ORG_B } }));
        expect(persistedB).toHaveLength(0);
        await expect(asOrg(ORG_B, () => hasLeadReplied(ORG_B, leadOrgB.id))).resolves.toBe(false);
    });

    it('sem lead correspondente: persiste a mensagem para auditoria (leadId nulo), sem classificar nem gravar sinal', async () => {
        const res = await postSigned({
            organizationId: ORG,
            providerMessageId: `<msg-${RUN_ID}-5@lead.com>`,
            fromEmail: 'ninguem-cadastrado@empresa.com',
            subject: 'Re: Proposta',
            body: 'Confirmado.',
            receivedAt: new Date().toISOString(),
        });

        expect(res.body).toMatchObject({ success: true, outcome: 'lead-not-found' });
        expect(classify).not.toHaveBeenCalled();

        const persisted = await withRlsBypass(() => prisma.emailMessage.findFirst({ where: { organizationId: ORG, fromEmail: 'ninguem-cadastrado@empresa.com' } }));
        expect(persisted).not.toBeNull();
        expect(persisted?.leadId).toBeNull();
    });
});
