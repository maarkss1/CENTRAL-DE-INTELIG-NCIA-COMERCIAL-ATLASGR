import { logger } from '../../../lib/logger';
import { sendEmail, MailerNotConfiguredError } from '../../../lib/email/mailer.js';
import { toE164BR } from '../../../lib/phone.js';
import { isOptedOut } from '../../cadence/application/optOutService.js';
import { prismaOptOutRepository } from '../../cadence/infra/PrismaOptOutRepository.js';
import { resolveEmailStatus } from './enrichment/domainGuess.js';

export interface ColdEmailCampaign {
  id: string;
  targetEmail: string;
  subject: string;
  body: string;
  status: 'draft' | 'sent' | 'failed';
  legalBasis: 'legitimate_interest' | 'consent';
  dataSource: string;
  /**
   * Tenant do disparo. Obrigatório para checar opt-out unificado antes do envio (ver
   * `.agents/handoffs/onda-7/17-para-05-06-12-contrato-optout.md`) — sem isso não é possível
   * consultar `OptOutRecord` de forma isolada por organização.
   */
  organizationId: string;
  /** Quando o alvo já é um lead do CRM — casamento mais forte no opt-out unificado (ver contrato). */
  leadId?: string | null;
  /**
   * Telefone bruto do mesmo contato, quando já carregado pelo chamador. Necessário para que um
   * opt-out registrado por voz/WhatsApp (mesmo lead, canal diferente) também bloqueie este
   * e-mail — é o "ponto crítico" do contrato do Agente 17: passar `email` E `phoneE164` sempre
   * que ambos já estiverem disponíveis, mesmo que o envio em si só use o e-mail.
   */
  contactPhone?: string | null;
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
 * Correções sobre a versão anterior:
 * 1. Honestidade: antes, a função só validava os campos, LOGAVA sucesso e retornava `true` SEM
 *    enviar nada — não existia nenhum transporte real aqui. O chamador (rota
 *    POST /api/prospecting/cold-email) respondia "Email sent" para uma campanha que nunca saiu do
 *    processo. Agora só retorna `true` quando o e-mail foi de fato entregue ao servidor SMTP; sem
 *    SMTP_HOST configurado (`MailerNotConfiguredError`), bloqueado por opt-out, ou com qualquer
 *    falha de envio, retorna `false` — o chamador (fora do escopo desta correção, ver nota abaixo)
 *    já trata `false` como falha e responde 500, o que pelo menos é uma falha REAL em vez de um
 *    sucesso fictício.
 * 2. PII em log: `to: campaign.targetEmail` gravava o endereço completo do titular em texto puro
 *    no log estruturado. Agora só o domínio do e-mail é logado (nunca o endereço completo).
 * 3. Opt-out unificado (bloqueador LGPD, `.agents/handoffs/onda-7/17-para-05-06-12-contrato-optout.md`):
 *    antes de qualquer envio real, consulta `OptOutRecord` via `isOptedOut`. Um opt-out registrado
 *    em QUALQUER canal (voz, WhatsApp, e-mail) para o mesmo lead/e-mail/telefone bloqueia este
 *    disparo quando `scope` é `'global'` ou `'email'`. A tentativa bloqueada nunca é tratada como
 *    enviada — mesma disciplina de honestidade do item 1 acima (commit `2e42a557`).
 * 4. Verificação de entregabilidade (auditoria da plataforma): antes desta correção, um e-mail
 *    sintaticamente válido mas sem domínio real (sem registro MX) ainda recebia o disparo real,
 *    gerando bounce e custo de reputação de domínio — `resolveEmailStatus` (mesma verificação já
 *    usada em `enrichment.service.ts`/`enrichmentCascade.service.ts` ao salvar Contact) roda antes
 *    do envio; `emailStatus === 'invalid'` bloqueia o disparo com a mesma disciplina de honestidade
 *    do opt-out (nunca tratado como enviado).
 *
 * NOTA para o handoff: o ideal de UX (distinguir "não enviado por falta de config"/"bloqueado por
 * opt-out" de "falhou de verdade", sem responder 500 para os dois primeiros casos) exige mudar como
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

    if (!campaign.organizationId) {
      throw new Error('organizationId é obrigatório para checar opt-out antes do envio.');
    }

    // Ponto crítico do contrato: passar leadId + email + phoneE164 sempre que disponíveis —
    // é assim que um opt-out registrado por voz/WhatsApp do mesmo lead bloqueia este e-mail,
    // sem exigir uma tabela de resolução de identidade separada (ver domain/optOut.ts).
    const blocked = await isOptedOut(
      prismaOptOutRepository,
      campaign.organizationId,
      {
        leadId: campaign.leadId ?? null,
        email: campaign.targetEmail,
        phoneE164: toE164BR(campaign.contactPhone ?? undefined),
      },
      'email',
    );

    if (blocked) {
      // Nunca registrar/tratar como enviado — a tentativa foi pulada (skipped) por opt-out.
      logger.info(
        { campaignId: campaign.id, toDomain, reason: 'opt-out' },
        'Cold email não enviado: titular optou por não receber contato neste canal (opt-out).',
      );
      return false;
    }

    const emailStatus = await resolveEmailStatus(campaign.targetEmail);
    if (emailStatus === 'invalid') {
      // Mesma disciplina de honestidade do opt-out acima — nunca tratado como enviado.
      logger.info(
        { campaignId: campaign.id, toDomain, reason: 'invalid-email' },
        'Cold email não enviado: e-mail sem domínio/MX válido (checkEmailDeliverability).',
      );
      return false;
    }

    await sendEmail({ to: campaign.targetEmail, subject: campaign.subject, text: campaign.body });

    logger.info(
      { campaignId: campaign.id, toDomain, basis: campaign.legalBasis },
      'Cold email enviado',
    );
    return true;
  } catch (error) {
    if (error instanceof MailerNotConfiguredError) {
      logger.warn(
        { campaignId: campaign.id, toDomain },
        'Cold email não enviado: SMTP não configurado neste ambiente.',
      );
      return false;
    }
    logger.error({ err: error, campaignId: campaign.id, toDomain }, 'Failed to send cold email');
    return false;
  }
}
