import { logger } from '../../../lib/logger';
import { sendEmail, MailerNotConfiguredError } from '../../../lib/email/mailer.js';

export interface ColdEmailCampaign {
    id: string;
    targetEmail: string;
    subject: string;
    body: string;
    status: 'draft' | 'sent' | 'failed';
    legalBasis: 'legitimate_interest' | 'consent';
    dataSource: string;
}

/** Domínio do e-mail, para log — nunca o endereço completo (PII em texto puro). */
function emailDomain(email: string | undefined): string | undefined {
    if (!email) return undefined;
    const at = email.lastIndexOf('@');
    return at === -1 ? undefined : email.slice(at + 1);
}

/**
 * Envia um cold email de prospecção via SMTP (mesmo transporte real de src/lib/email/mailer.ts,
 * já usado por aiPendingAction.service.ts e src/lib/auth.ts).
 *
 * Duas correções sobre a versão anterior:
 * 1. Honestidade: antes, a função só validava os campos, LOGAVA sucesso e retornava `true` SEM
 *    enviar nada — não existia nenhum transporte real aqui. O chamador (rota
 *    POST /api/prospecting/cold-email) respondia "Email sent" para uma campanha que nunca saiu do
 *    processo. Agora só retorna `true` quando o e-mail foi de fato entregue ao servidor SMTP; sem
 *    SMTP_HOST configurado (`MailerNotConfiguredError`) ou com qualquer falha de envio, retorna
 *    `false` — o chamador (fora do escopo desta correção, ver nota abaixo) já trata `false` como
 *    falha e responde 500, o que pelo menos é uma falha REAL em vez de um sucesso fictício.
 * 2. PII em log: `to: campaign.targetEmail` gravava o endereço completo do titular em texto puro
 *    no log estruturado. Agora só o domínio do e-mail é logado (nunca o endereço completo).
 *
 * NOTA para o handoff: o ideal de UX (distinguir "não enviado por falta de config" de "falhou de
 * verdade", sem responder 500 para o primeiro caso) exige mudar como
 * src/features/prospecting/routes/prospecting.routes.ts interpreta o retorno desta função — esse
 * arquivo está fora do escopo de arquivos deste agente.
 */
export async function sendColdEmail(campaign: ColdEmailCampaign): Promise<boolean> {
    const toDomain = emailDomain(campaign.targetEmail);
    try {
        if (!campaign.targetEmail || !campaign.subject || !campaign.body) {
            throw new Error('Missing required fields for cold email.');
        }

        if (!campaign.legalBasis || !campaign.dataSource) {
            throw new Error('LGPD compliance requires legal basis and data source for cold outreach.');
        }

        await sendEmail({ to: campaign.targetEmail, subject: campaign.subject, text: campaign.body });

        logger.info({ campaignId: campaign.id, toDomain, basis: campaign.legalBasis }, 'Cold email enviado');
        return true;
    } catch (error) {
        if (error instanceof MailerNotConfiguredError) {
            logger.warn({ campaignId: campaign.id, toDomain }, 'Cold email não enviado: SMTP não configurado neste ambiente.');
            return false;
        }
        logger.error({ err: error, campaignId: campaign.id, toDomain }, 'Failed to send cold email');
        return false;
    }
}
