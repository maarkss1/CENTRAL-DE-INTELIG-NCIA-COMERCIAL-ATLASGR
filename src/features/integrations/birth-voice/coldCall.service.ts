import { env } from '../../../config/env.js';
import { prisma } from '../../../lib/prisma.js';
import { logger } from '../../../lib/logger.js';
import { requestContext } from '../../../lib/async-context.js';
import {
  callLead,
  NoPhoneNumberError,
  SuppressedNumberError,
  BirthVoiceNotConfiguredError,
} from './birthVoice.service.js';
import {
  isWithinCallWindow,
  evaluateLead,
  type CallWindow,
  type DialPolicy,
} from './coldCall.policy.js';

/**
 * Etapa do funil que a campanha fria ataca. Leads mais adiante já têm um humano conduzindo — uma
 * ligação automática no meio de uma negociação atrapalha em vez de ajudar.
 */
const COLD_STATUS = 'Lead_Recebido';

/**
 * Quantos leads são examinados por execução. Maior que o limite de ligações porque a maioria dos
 * candidatos é descartada pelas travas (sem telefone, em intervalo, tentativas esgotadas).
 */
const SCAN_LIMIT = 200;

export type SkipTally = {
  'max-attempts': number;
  cooldown: number;
  'no-phone': number;
  suppressed: number;
  error: number;
};

export interface ColdCallRunResult {
  organizationId: string;
  scanned: number;
  called: number;
  skipped: SkipTally;
  /** Preenchido quando a execução nem chegou a examinar leads. */
  haltedBy?: 'outside-window' | 'not-configured' | 'not-authorized';
}

export function callWindowFromEnv(): CallWindow {
  return {
    startHour: env.SDR_CALL_WINDOW_START,
    endHour: env.SDR_CALL_WINDOW_END,
    weekdaysOnly: true,
    timeZone: env.SDR_CALL_TIMEZONE,
  };
}

export function dialPolicyFromEnv(): DialPolicy {
  return {
    maxAttemptsPerLead: env.SDR_MAX_ATTEMPTS_PER_LEAD,
    retryCooldownHours: env.SDR_RETRY_COOLDOWN_HOURS,
  };
}

/**
 * Organizações autorizadas a receber discagem fria automática.
 *
 * Fail-closed por desenho: uma lista explícita de ids, e não um booleano global. Discar para
 * estranhos é a operação mais arriscada do sistema — habilitar por engano precisa ser difícil.
 */
export async function enabledOrganizations(): Promise<string[]> {
  if (!env.SDR_COLD_CALL_ENABLED) return [];
  const rawOrgs = (env.SDR_COLD_CALL_ORGANIZATIONS ?? '').trim();
  // Vazio precisa continuar fail-closed (ninguém habilitado) — só '*'/'all' DIGITADOS de propósito
  // contam como opt-in explícito pra todas as organizações. Sem essa distinção, esquecer de
  // preencher SDR_COLD_CALL_ORGANIZATIONS com SDR_COLD_CALL_ENABLED=true ligava a discagem fria
  // automática pra TODAS as organizações do banco por omissão — o oposto do desenho fail-closed
  // descrito acima, e o pior lugar possível pra isso acontecer por engano.
  if (!rawOrgs) return [];
  if (rawOrgs === '*' || rawOrgs === 'all') {
    // Achado real de finalização (2026-09-04): sem contexto de RLS, `Organization` (sob FORCE ROW
    // LEVEL SECURITY, migration 20260722020322_enable_rls) nega a leitura por completo — esta
    // chamada devolvia SEMPRE 0 organizações, então `SDR_COLD_CALL_ORGANIZATIONS=*` nunca
    // habilitava a discagem fria pra ninguém (fail-closed por acidente, não pela trava fail-closed
    // documentada acima). `Organization` está no allowlist de bypass (BYPASS_RLS_ALLOWED_MODELS,
    // src/lib/prisma.ts) exatamente para esta descoberta inicial.
    const orgs = await requestContext.run({ bypassRls: true }, () =>
      prisma.organization.findMany({ select: { id: true } }),
    );
    return orgs.map((o) => o.id);
  }
  return rawOrgs
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean);
}

function emptyTally(): SkipTally {
  return { 'max-attempts': 0, cooldown: 0, 'no-phone': 0, suppressed: 0, error: 0 };
}

/**
 * Grava o resultado da execução para a tela de acompanhamento poder mostrá-lo depois — sem isto a
 * campanha roda 100% invisível, só em `logger.info`. Nunca lança: um erro ao salvar o registro não
 * pode derrubar uma campanha que já discou de verdade.
 */
async function persistRun(result: ColdCallRunResult): Promise<ColdCallRunResult> {
  try {
    await prisma.coldCallRun.create({
      data: {
        organizationId: result.organizationId,
        scanned: result.scanned,
        called: result.called,
        skippedMaxAttempts: result.skipped['max-attempts'],
        skippedCooldown: result.skipped.cooldown,
        skippedNoPhone: result.skipped['no-phone'],
        skippedSuppressed: result.skipped.suppressed,
        skippedError: result.skipped.error,
        haltedBy: result.haltedBy ?? null,
      },
    });
  } catch (error) {
    logger.error(
      { err: error, organizationId: result.organizationId },
      'Falha ao registrar a execução da campanha fria.',
    );
  }
  return result;
}

/**
 * Uma passada da campanha fria para uma organização: seleciona leads parados no topo do funil,
 * aplica as travas e disca até o limite da execução.
 *
 * Não lança: uma campanha que quebra no meio deixaria leads discados e o resto não, sem registro.
 * Cada falha individual é contabilizada e a execução segue.
 */
export async function runColdCallCampaign(
  organizationId: string,
  now: Date = new Date(),
): Promise<ColdCallRunResult> {
  const result: ColdCallRunResult = {
    organizationId,
    scanned: 0,
    called: 0,
    skipped: emptyTally(),
  };

  // O worker roda fora de uma requisição HTTP, então nada preencheria o tenant que a RLS exige
  // — inclusive para o registro do próprio resultado logo abaixo (persistRun).
  return requestContext.run({ tenantId: organizationId }, async () => {
    // Revalidado NA EXECUÇÃO, não só no agendamento: `scheduleColdCallCampaigns` só cria o
    // agendamento recorrente para organizações autorizadas no momento em que roda (normalmente
    // só uma vez, na subida do processo) — mas o agendamento fica persistido no Redis do BullMQ
    // e continua disparando a cada intervalo independente de qualquer mudança de env depois
    // disso. Se um operador revogar `SDR_COLD_CALL_ORGANIZATIONS` (ou desligar
    // `SDR_COLD_CALL_ENABLED`) sem reiniciar o processo — ou se `runColdCallCampaign` for
    // chamado por qualquer outro caminho que não seja o scheduler —, esta é a última linha de
    // defesa que impede a ligação de acontecer sem as duas travas. Nunca confiar apenas em quem
    // chamou já ter filtrado.
    const allowed = await enabledOrganizations();
    if (!allowed.includes(organizationId)) {
      return persistRun({ ...result, haltedBy: 'not-authorized' });
    }

    if (!isWithinCallWindow(now, callWindowFromEnv())) {
      return persistRun({ ...result, haltedBy: 'outside-window' });
    }

    const policy = dialPolicyFromEnv();
    const maxCalls = env.SDR_MAX_CALLS_PER_RUN;

    const candidates = await prisma.lead.findMany({
      where: { organizationId, status: COLD_STATUS as never },
      // Mais antigos primeiro: um lead recém-capturado ainda pode receber contato humano; o
      // que está parado há semanas é exatamente o que a campanha existe para resgatar.
      orderBy: { createdAt: 'asc' },
      take: SCAN_LIMIT,
      select: { id: true, lastInteraction: true },
    });
    result.scanned = candidates.length;
    if (candidates.length === 0) return persistRun(result);

    // Uma consulta agregada em vez de uma por lead — a contagem de tentativas é o dado que
    // decide a maior parte dos descartes.
    const attemptRows = await prisma.activity.groupBy({
      by: ['leadId'],
      where: { leadId: { in: candidates.map((l) => l.id) }, type: 'Ligacao' as never },
      _count: { _all: true },
    });
    const attemptsByLead = new Map(attemptRows.map((row) => [row.leadId, row._count._all]));

    for (const candidate of candidates) {
      if (result.called >= maxCalls) break;

      const verdict = evaluateLead(
        {
          id: candidate.id,
          lastInteraction: candidate.lastInteraction,
          attempts: attemptsByLead.get(candidate.id) ?? 0,
        },
        policy,
        now,
      );
      if (!verdict.eligible) {
        result.skipped[verdict.reason]++;
        continue;
      }

      try {
        await callLead(organizationId, candidate.id);
        // Marcado imediatamente, sem esperar o webhook: se o resultado nunca chegar, o
        // intervalo mínimo ainda impede a campanha de rediscar este lead em toda execução.
        await prisma.lead.update({ where: { id: candidate.id }, data: { lastInteraction: now } });
        result.called++;
      } catch (error) {
        if (error instanceof SuppressedNumberError) {
          result.skipped.suppressed++;
        } else if (error instanceof NoPhoneNumberError) {
          result.skipped['no-phone']++;
        } else if (error instanceof BirthVoiceNotConfiguredError) {
          // Falta de configuração não melhora no próximo lead: insistir só produziria uma
          // enxurrada de erros idênticos.
          logger.error(
            { err: error, organizationId },
            'Campanha fria interrompida: SDR de voz não configurado.',
          );
          return persistRun({ ...result, haltedBy: 'not-configured' });
        } else {
          result.skipped.error++;
          logger.error(
            { err: error, leadId: candidate.id },
            'Falha ao discar para lead na campanha fria.',
          );
        }
      }
    }

    logger.info({ ...result }, 'Campanha de prospecção fria executada.');
    return persistRun(result);
  });
}
