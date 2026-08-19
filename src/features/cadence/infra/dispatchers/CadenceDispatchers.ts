import { logger } from '../../../../lib/logger.js';
import { sendWhatsAppMessage } from '../../../integrations/whatsapp/whatsapp.service.js';
import { sendEmail, MailerNotConfiguredError } from '../../../../lib/email/mailer.js';
import type { CadenceDispatcher } from '../../application/cadenceService.js';
import type { CadenceTouch, CadenceRunState } from '../../domain/cadence.js';
import { prisma } from '../../../../lib/prisma.js';

/**
 * Dispatchers reais de canal (CYC-008, onda-19) — a peça que faltava para `advanceCadenceRun`
 * (domínio puro, entregue na Onda 10) sair do papel: até aqui a única implementação de
 * `CadenceDispatcher` do repo era `ScriptedDispatcher`, só em teste.
 *
 * Limitação conhecida e deliberada, documentada em `docs/CADENCE-CYCLE-AUDIT.md`: não existe
 * ainda nenhuma UI/rota para criar uma `CadenceSequence` ou iniciar um `CadenceRun` — só o
 * schema e `startCadenceRun` (chamado hoje só em teste). `CadenceTouch.templateRef` também não
 * tem nenhum sistema de template por trás — é tratado aqui como o texto final da mensagem
 * (corpo, ou "assunto\n\ncorpo" para e-mail). Autoria de conteúdo/gatilho de início de cadência é
 * uma decisão de produto que este runtime não toma sozinho; sem ela, este dispatcher fica correto
 * mas ocioso (nenhum `CadenceRun` ativo existe para o worker varrer).
 */

async function resolveLeadPhone(organizationId: string, leadId: string): Promise<string | null> {
    const lead = await prisma.lead.findFirst({
        where: { id: leadId, organizationId },
        select: { contact: { select: { whatsapp: true, phone: true } } },
    });
    return lead?.contact?.whatsapp ?? lead?.contact?.phone ?? null;
}

async function resolveLeadEmail(organizationId: string, leadId: string): Promise<string | null> {
    const lead = await prisma.lead.findFirst({
        where: { id: leadId, organizationId },
        select: { contact: { select: { email: true } } },
    });
    return lead?.contact?.email ?? null;
}

/** Rotas para WhatsApp real. Opt-out já foi checado por `advanceCadenceRun` antes de chegar aqui, mas `sendWhatsAppMessage` checa de novo por padrão — redundante e seguro, não desativado (ver Sprint 06/CYC-001: já houve bug real de bypass desse flag). */
export const whatsAppCadenceDispatcher: Pick<CadenceDispatcher, 'dispatch'> = {
    async dispatch(touch: CadenceTouch, run: CadenceRunState) {
        const phone = await resolveLeadPhone(run.organizationId, run.leadId);
        if (!phone) {
            return { result: 'failed' as const, error: 'Lead sem telefone/WhatsApp cadastrado no contato.' };
        }
        try {
            await sendWhatsAppMessage(
                run.organizationId,
                phone,
                touch.templateRef ?? '(mensagem de cadência sem conteúdo configurado)',
                undefined,
                { leadId: run.leadId },
            );
            // sendWhatsAppMessage não devolve o id da mensagem do provedor (Baileys) hoje — ver
            // limitação documentada em docs/CADENCE-CYCLE-AUDIT.md.
            return { result: 'sent' as const, providerMessageId: null };
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            logger.warn({ err, organizationId: run.organizationId, leadId: run.leadId, touchOrder: touch.order }, 'Falha ao despachar toque de cadência via WhatsApp.');
            return { result: 'failed' as const, error: message };
        }
    },
};

function splitSubjectAndBody(templateRef: string | null | undefined, sequenceName: string): { subject: string; body: string } {
    if (!templateRef) return { subject: `Continuando nosso contato — ${sequenceName}`, body: '(mensagem de cadência sem conteúdo configurado)' };
    const [firstLine, ...rest] = templateRef.split('\n');
    if (rest.length === 0) return { subject: `Continuando nosso contato — ${sequenceName}`, body: firstLine };
    return { subject: firstLine, body: rest.join('\n').trimStart() };
}

/** Rotas para e-mail real via SMTP (`sendEmail`). Opt-out já foi checado por `advanceCadenceRun` — `sendEmail` não tem checagem própria (é transporte puro), diferente de `sendWhatsAppMessage`. */
export const emailCadenceDispatcher: Pick<CadenceDispatcher, 'dispatch'> = {
    async dispatch(touch: CadenceTouch, run: CadenceRunState) {
        const email = await resolveLeadEmail(run.organizationId, run.leadId);
        if (!email) {
            return { result: 'failed' as const, error: 'Lead sem e-mail cadastrado no contato.' };
        }
        const { subject, body } = splitSubjectAndBody(touch.templateRef, run.sequenceId);
        try {
            const { messageId } = await sendEmail({ to: email, subject, text: body });
            return { result: 'sent' as const, providerMessageId: messageId };
        } catch (err) {
            const message = err instanceof MailerNotConfiguredError
                ? 'Envio de e-mail não configurado (SMTP_HOST ausente).'
                : err instanceof Error ? err.message : String(err);
            logger.warn({ err, organizationId: run.organizationId, leadId: run.leadId, touchOrder: touch.order }, 'Falha ao despachar toque de cadência via e-mail.');
            return { result: 'failed' as const, error: message };
        }
    },
};

/** Roteia pelo canal do toque. Voz (CYC-004) não tem dispatcher real ainda — falha de forma honesta em vez de fingir envio. */
export const productionCadenceDispatcher: CadenceDispatcher = {
    async dispatch(touch, run) {
        switch (touch.channel) {
            case 'whatsapp':
                return whatsAppCadenceDispatcher.dispatch(touch, run);
            case 'email':
                return emailCadenceDispatcher.dispatch(touch, run);
            case 'voice':
                return { result: 'failed', error: 'Canal de voz ainda não tem dispatcher real de cadência (CYC-004 pendente).' };
        }
    },
};
