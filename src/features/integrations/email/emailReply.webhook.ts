import express, { Router, Request, Response } from 'express';
import { createHmac, timingSafeEqual } from 'crypto';
import { env } from '../../../config/env.js';
import { prisma } from '../../../lib/prisma.js';
import { logger } from '../../../lib/logger.js';
import { requestContext } from '../../../lib/async-context.js';
import { isGenuineLeadReply, handleEmailReply, type InboundEmailReply } from '../../cadence/domain/replyTracking.js';
import { emailIntentClassifier } from '../../cadence/infra/emailIntentClassifier.js';
import { prismaConversationSignalPort } from '../../cadence/infra/PrismaConversationSignalPort.js';

/**
 * CYC-003 (onda 26) — transporte de ENTRADA de e-mail, hoje um stub: nenhum provedor real
 * (IMAP/webhook de inbound-parse, ex. SendGrid/Postmark/Mailgun) está conectado ainda, então este
 * endpoint aceita diretamente o payload que uma integração desses provedores entregaria depois de
 * já ter resolvido a organização (decisão explícita do dono do produto: "construir com stub,
 * plugar depois" — mesmo padrão de CYC-004/CYC-006). Tudo a partir daqui — assinatura,
 * idempotência, filtro de auto-resposta (`isGenuineLeadReply`), classificação de intenção e
 * gravação de `ConversationSignal`/`EmailMessage` — é real, não simulado: plugar um provedor real
 * depois é só apontar o webhook dele para cá com o payload no mesmo formato.
 *
 * Sem `organizationId` explícito não há como resolver o tenant: diferente do WhatsApp (um único
 * número/QR code por organização já dá o tenant) e do voice (o `request_data` que nós mesmos
 * enviamos ao iniciar a ligação), este projeto não tem hoje uma caixa de e-mail dedicada por
 * organização (`SMTP_*` é uma conta compartilhada, ver `src/lib/email/mailer.ts`) — a integração
 * real, quando plugada, precisa resolver isso antes de chamar este endpoint (ex.: endereço de
 * resposta com tag por tenant, ou uma caixa dedicada por organização).
 */

interface EmailInboundPayload {
    organizationId?: unknown;
    /** Dica direta de lead, quando o provedor já souber (ex.: endereço de resposta com tag). Resolvido por e-mail do contato quando ausente. */
    leadId?: unknown;
    providerMessageId?: unknown;
    inReplyTo?: unknown;
    fromEmail?: unknown;
    toEmail?: unknown;
    subject?: unknown;
    body?: unknown;
    autoSubmittedHeader?: unknown;
    receivedAt?: unknown;
}

function asString(value: unknown): string | null {
    return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

/** Comparação em tempo constante da assinatura HMAC — mesmo esquema de `birthVoice.webhook.ts`. */
function isValidSignature(rawBody: Buffer, receivedSignature: string | undefined, secret: string): boolean {
    if (!receivedSignature) return false;
    const expected = Buffer.from(createHmac('sha256', secret).update(rawBody).digest('hex'), 'utf8');
    const received = Buffer.from(receivedSignature, 'utf8');
    return received.length === expected.length && timingSafeEqual(received, expected);
}

/**
 * Resolve o lead em aberto cujo contato tem este e-mail, dentro da organização do contexto —
 * mesmo raciocínio de `findContactByPhone` em `whatsappMessage.service.ts`, mas por e-mail em vez
 * de telefone (não precisa de `$queryRaw`/normalização de dígitos: e-mail já é um campo exato).
 */
async function findOpenLeadByEmail(organizationId: string, email: string): Promise<{ id: string } | null> {
    const lead = await prisma.lead.findFirst({
        where: {
            organizationId,
            status: { notIn: ['Negocios_Ganhos', 'Negocios_Perdidos', 'Lead_Desqualificado'] },
            contact: { email: { equals: email, mode: 'insensitive' } },
        },
        orderBy: { createdAt: 'desc' },
        select: { id: true },
    });
    return lead;
}

type HandleOutcome =
    | { status: 'ignored-auto-reply' }
    | { status: 'duplicate' }
    | { status: 'lead-not-found' }
    | { status: 'recorded'; leadId: string };

async function recordInboundEmail(organizationId: string, email: InboundEmailReply, toEmail: string, leadIdHint: string | null): Promise<HandleOutcome> {
    return requestContext.run({ tenantId: organizationId }, async () => {
        // Filtro de auto-resposta/bounce ANTES de qualquer escrita — o próprio módulo de domínio
        // (`replyTracking.ts`) documenta que isso nunca deve virar sinal nem persistência.
        if (!isGenuineLeadReply(email)) {
            return { status: 'ignored-auto-reply' };
        }

        const existing = await prisma.emailMessage.findUnique({
            where: { organizationId_providerMessageId: { organizationId, providerMessageId: email.providerMessageId } },
            select: { id: true },
        });
        if (existing) return { status: 'duplicate' };

        const lead = leadIdHint
            ? await prisma.lead.findFirst({ where: { id: leadIdHint, organizationId }, select: { id: true } })
            : await findOpenLeadByEmail(organizationId, email.fromEmail);

        await prisma.emailMessage.create({
            data: {
                organizationId,
                providerMessageId: email.providerMessageId,
                inReplyTo: email.inReplyTo,
                direction: 'inbound',
                fromEmail: email.fromEmail,
                toEmail,
                subject: email.subject,
                body: email.body,
                leadId: lead?.id,
                receivedAt: email.receivedAt,
            },
        });

        if (!lead) return { status: 'lead-not-found' };

        const priorMessages = await prisma.emailMessage.findMany({
            where: { organizationId, leadId: lead.id, providerMessageId: { not: email.providerMessageId } },
            orderBy: { receivedAt: 'asc' },
            take: 40,
            select: { direction: true, body: true },
        });

        const outcome = await handleEmailReply(
            { ...email, leadId: lead.id },
            priorMessages as Array<{ direction: 'inbound' | 'outbound'; body: string | null }>,
            emailIntentClassifier,
        );

        if (outcome.signalDraft) {
            await prismaConversationSignalPort.record(outcome.signalDraft);
        }

        await prisma.timelineEvent.create({
            data: {
                type: 'email',
                description: email.subject
                    ? `Resposta recebida por e-mail: "${email.subject.slice(0, 200)}"`
                    : 'Resposta recebida por e-mail.',
                leadId: lead.id,
            },
        }).catch((error) => {
            // A mensagem já foi persistida acima — a falha aqui não pode apagar essa evidência.
            logger.error({ err: error, leadId: lead.id }, 'Falha ao registrar réplica de e-mail no timeline do lead.');
        });

        return { status: 'recorded', leadId: lead.id };
    });
}

async function handleInboundEmail(req: Request, res: Response): Promise<void> {
    const secret = env.EMAIL_INBOUND_WEBHOOK_SECRET;
    if (!secret) {
        // Fail-closed: sem segredo configurado, aceitar o payload deixaria qualquer um que
        // descobrisse esta URL forjar réplicas de e-mail em nome de um lead.
        logger.error('Webhook de e-mail de entrada recebido, mas EMAIL_INBOUND_WEBHOOK_SECRET não está configurado.');
        res.status(503).json({ success: false, error: 'Webhook não configurado.' });
        return;
    }

    const rawBody = req.body;
    if (!Buffer.isBuffer(rawBody)) {
        logger.error('Webhook de e-mail de entrada sem corpo bruto — a rota precisa ser montada antes do express.json().');
        res.status(500).json({ success: false, error: 'Configuração de rota inválida.' });
        return;
    }

    if (!isValidSignature(rawBody, req.header('x-email-inbound-signature'), secret)) {
        logger.warn('Webhook de e-mail de entrada com assinatura inválida — descartado.');
        res.status(401).json({ success: false, error: 'Assinatura inválida.' });
        return;
    }

    let payload: EmailInboundPayload;
    try {
        payload = JSON.parse(rawBody.toString('utf8'));
    } catch {
        res.status(400).json({ success: false, error: 'Corpo não é JSON válido.' });
        return;
    }

    const organizationId = asString(payload.organizationId);
    const providerMessageId = asString(payload.providerMessageId);
    const fromEmail = asString(payload.fromEmail);
    const toEmail = asString(payload.toEmail) ?? '';
    const body = asString(payload.body);

    if (!organizationId || !providerMessageId || !fromEmail) {
        res.status(400).json({ success: false, error: 'organizationId, providerMessageId e fromEmail são obrigatórios.' });
        return;
    }

    const email: InboundEmailReply = {
        organizationId,
        leadId: asString(payload.leadId) ?? '',
        providerMessageId,
        inReplyTo: asString(payload.inReplyTo),
        fromEmail,
        subject: asString(payload.subject),
        body: body ?? '',
        autoSubmittedHeader: asString(payload.autoSubmittedHeader),
        receivedAt: (() => {
            const raw = asString(payload.receivedAt);
            const parsed = raw ? new Date(raw) : new Date();
            return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
        })(),
    };

    try {
        const outcome = await recordInboundEmail(organizationId, email, toEmail, asString(payload.leadId));
        res.status(200).json({ success: true, outcome: outcome.status });
    } catch (error) {
        // 5xx de propósito: um provedor real reentrega com backoff, e a idempotência por
        // providerMessageId garante que a reentrega não duplica a mensagem já persistida.
        logger.error({ err: error, organizationId }, 'Falha ao processar webhook de e-mail de entrada.');
        res.status(500).json({ success: false, error: 'Falha ao processar réplica de e-mail.' });
    }
}

const router = Router();

// express.raw porque a assinatura HMAC é calculada sobre os bytes exatos do corpo — mesmo esquema
// de birthVoice.webhook.ts. Rota montada antes do express.json() global em server.ts.
router.post('/webhook', express.raw({ type: '*/*', limit: '1mb' }), handleInboundEmail);

export const emailReplyWebhookRoutes = router;
