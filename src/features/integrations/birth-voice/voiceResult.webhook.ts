import express, { Router, type Request, type Response } from 'express';
import { createHash, timingSafeEqual } from 'crypto';
import { env } from '../../../config/env.js';
import { prisma } from '../../../lib/prisma.js';
import { logger } from '../../../lib/logger.js';
import { requestContext } from '../../../lib/async-context.js';
import { sendWhatsAppMessage } from '../whatsapp/whatsapp.service.js';
import { sseService } from '../../notifications/sse.service.js';
import {
  classifyCallOutcome,
  callResultedInConversation,
  detectRecordingConsentFromRawTranscript,
} from './birthVoice.helpers.js';
import { last8DigitsIndex } from '../../../lib/crypto/piiIndex.js';
import {
  claimWebhookDelivery,
  webhookDeliveryFingerprint,
} from '../../../shared/security/webhookReplayGuard.js';
import { container } from '../../../shared/di/container.js';
import type { CopilotoVoiceIngestionPort } from '../../../shared/contracts/copilotoVoiceIngestion.contract.js';

/**
 * Webhook de resultado de ligação da Bland AI (rota legada /api/webhooks/voice-result).
 *
 * Substitui o handler inline que vivia em server.ts, que tinha quatro defeitos graves:
 *  1. Montado antes do express.json() global — req.body chegava undefined e o handler quebrava
 *     na desestruturação (o webhook nunca funcionou nessa forma).
 *  2. Segredo com fallback hardcoded ('segredo_compartilhado_atlasgr_123') versionado no git —
 *     sem a env definida, qualquer um que lesse o repositório podia forjar resultados de chamada.
 *     Agora é fail-closed: sem ATLASGR_WEBHOOK_SECRET configurado, responde 503 (mesmo padrão do
 *     BIRTH_VOICES_WEBHOOK_SECRET em birthVoice.webhook.ts).
 *  3. Busca de lead por sufixo de telefone SEM filtro de organização e fora de qualquer
 *     requestContext — dependendo do papel do Postgres, ou vazava cross-tenant ou a RLS fazia a
 *     query nunca achar nada (falha silenciosa). Agora o tenant vem do request_data que NÓS
 *     enviamos ao criar a chamada (ver birthVoice.service.ts) e toda leitura/escrita roda dentro
 *     de requestContext.run({ tenantId }) — a RLS prova que o lead pertence à organização.
 *  4. Sem idempotência — cada reentrega do webhook duplicava nota e evento de timeline.
 */

interface VoiceResultContext {
  organizationId: string | null;
  leadId: string | null;
}

interface VoiceResultPayload {
  call_id?: unknown;
  phone_number?: unknown;
  to?: unknown;
  concatenated_transcript?: unknown;
  summary?: unknown;
  recording_url?: unknown;
  call_length?: unknown;
  request_data?: unknown;
  metadata?: unknown;
  variables?: unknown;
  /**
   * Campos que a Bland expõe em parte das suas versões de API mas que este payload ainda não lia
   * — quando presentes, têm prioridade sobre a heurística de duração/texto abaixo (ver
   * classifyCallOutcome). Todos opcionais de propósito: nenhum destes é garantido pela conta/
   * versão da API em uso hoje, então a ausência deles não pode quebrar a classificação, só
   * torná-la menos precisa (cai para a heurística).
   */
  status?: unknown;
  disposition_tag?: unknown;
  answered_by?: unknown;
  completed?: unknown;
}

const COMPETITORS = ['totvs', 'sap', 'senior', 'omnilink', 'sascar', 'autotrac'];

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

/**
 * O contexto (leadId/organizationId) foi enviado por nós em `request_data` ao criar a chamada
 * (birthVoice.service.ts). A Bland ecoa esse objeto no callback; algumas versões da API o expõem
 * como `metadata` ou `variables`, então os três são aceitos — sempre com a mesma validação.
 */
function extractContext(payload: VoiceResultPayload): VoiceResultContext {
  for (const source of [payload.request_data, payload.metadata, payload.variables]) {
    if (source && typeof source === 'object') {
      const record = source as Record<string, unknown>;
      const organizationId = asString(record.organizationId);
      const leadId = asString(record.leadId);
      if (organizationId || leadId) {
        return { organizationId, leadId };
      }
    }
  }
  return { organizationId: null, leadId: null };
}

/** Comparação em tempo constante — o hash iguala os comprimentos antes do timingSafeEqual. */
function secretMatches(provided: string | undefined, expected: string): boolean {
  if (!provided) return false;
  const a = createHash('sha256').update(provided).digest();
  const b = createHash('sha256').update(expected).digest();
  return timingSafeEqual(a, b);
}

async function handleVoiceResult(req: Request, res: Response): Promise<void> {
  const expectedSecret = env.ATLASGR_WEBHOOK_SECRET;
  if (!expectedSecret) {
    // Fail-closed: sem segredo configurado não há como distinguir a Bland de qualquer um que
    // descubra esta URL. Nunca cair para um valor default versionado no repositório.
    logger.error('Webhook voice-result recebido, mas ATLASGR_WEBHOOK_SECRET não está configurado.');
    res.status(503).json({ success: false, error: 'Webhook não configurado.' });
    return;
  }

  const provided = req.headers['x-atlasgr-webhook-secret'];
  if (!secretMatches(typeof provided === 'string' ? provided : undefined, expectedSecret)) {
    res.status(401).json({ success: false, error: 'Unauthorized webhook secret' });
    return;
  }

  const payload = (req.body ?? {}) as VoiceResultPayload;
  const callId = asString(payload.call_id) ?? 'sem-id';

  // Sem assinatura por requisição aqui (só um segredo fixo — ver secretMatches acima), então o
  // fingerprint vem do próprio conteúdo: call_id (identificador único da Bland) + corpo bruto.
  // Ver webhookReplayGuard.ts.
  const replayCheck = await claimWebhookDelivery(
    'voice-result',
    webhookDeliveryFingerprint(callId, JSON.stringify(payload)),
  );
  if (replayCheck === 'replay') {
    res.status(200).json({ success: true, outcome: 'duplicate-delivery' });
    return;
  }
  const phoneNumber = asString(payload.phone_number) ?? asString(payload.to) ?? '';
  const summary = asString(payload.summary);
  const transcript = asString(payload.concatenated_transcript);
  const recordingUrl = asString(payload.recording_url);
  const callLength = typeof payload.call_length === 'number' ? payload.call_length : 0;
  const providerStatus = asString(payload.status) ?? asString(payload.disposition_tag);
  const answeredByMachine =
    payload.answered_by === 'machine' || payload.answered_by === 'voicemail';

  const { organizationId, leadId } = extractContext(payload);
  logger.info({ callId, organizationId, leadId }, 'Voice result recebido da Bland AI');

  if (!organizationId) {
    // Sem tenant não há busca segura possível: varrer todos os tenants por sufixo de telefone
    // (comportamento antigo) anexava resultado de chamada ao lead de OUTRA organização com
    // final de número igual. 200 de propósito — reentregar não criaria o contexto que faltou.
    logger.warn(
      { callId },
      'Voice result sem organizationId no request_data — descartado com aviso.',
    );
    res
      .status(200)
      .json({ success: true, lead_found: false, reason: 'sem contexto de organização' });
    return;
  }

  try {
    const outcome = await requestContext.run({ tenantId: organizationId }, async () => {
      // Prioridade: id explícito do lead (enviado por nós na criação da chamada). O sufixo de
      // telefone é só fallback, e sempre DENTRO da organização do contexto (RLS + filtro).
      // Contact.phone/whatsapp cifrados em repouso (ver src/lib/crypto/piiFields.ts) — o
      // antigo `contains: últimos8Dígitos` contra o campo cifrado nunca mais casaria (IV
      // aleatório por valor); substituído por igualdade contra o índice cego dos últimos 8
      // dígitos, computado da mesma forma dos dois lados (ver src/lib/crypto/piiIndex.ts).
      const searchIndex = last8DigitsIndex(phoneNumber);

      const lead = leadId
        ? await prisma.lead.findFirst({
            where: { id: leadId, organizationId },
            include: { contact: true },
          })
        : searchIndex
          ? await prisma.lead.findFirst({
              where: {
                organizationId,
                OR: [
                  { contact: { phoneLast8Index: searchIndex } },
                  { contact: { whatsappLast8Index: searchIndex } },
                ],
              },
              include: { contact: true },
            })
          : null;

      if (!lead) return { leadFound: false as const, duplicate: false };

      // Idempotência: a Bland reentrega o callback em falha/timeout — a nota desta chamada
      // só pode existir uma vez. O call_id no corpo da nota é o marcador.
      const marker = `ID da Chamada**: ${callId}`;
      const existing =
        callId !== 'sem-id'
          ? await prisma.note.findFirst({
              where: { leadId: lead.id, content: { contains: marker } },
            })
          : null;
      if (existing) return { leadFound: true as const, duplicate: true, leadId: lead.id };

      // Estado honesto do resultado: um `call_length` positivo e um `summary` não significam,
      // por si só, que o decisor atendeu — a Bland já entregou "conversas" de segundos que
      // eram só a caixa postal. `voiceQualified`/o texto de follow-up dependem deste estado
      // classificado, nunca de "a chamada teve algum tamanho de resposta" isoladamente.
      const classifiedOutcome = classifyCallOutcome({
        providerOutcome: providerStatus,
        machineDetected: answeredByMachine,
        durationSeconds: callLength * 60,
        text: `${summary ?? ''} ${transcript ?? ''}`,
      });
      const hadConversation = callResultedInConversation(classifiedOutcome);

      const noteContent = `📞 **Resultado da Ligação de Voz (IA)**
- **ID da Chamada**: ${callId}
- **Estado**: ${classifiedOutcome}
- **Duração**: ${Math.round(callLength * 60)}s
- **Resumo Inteligente**: ${summary || 'Sem resumo disponível.'}
- **Gravação em Áudio**: ${recordingUrl ? `[Ouvir Gravação](${recordingUrl})` : 'Sem gravação de áudio.'}

---
### 📝 Transcrição Completa da Conversa:
${transcript || 'Nenhuma transcrição gravada.'}`;

      await prisma.note.create({
        data: {
          leadId: lead.id,
          content: noteContent,
          author: 'IA de Voz (Bland AI)',
        },
      });

      await prisma.timelineEvent.create({
        data: {
          type: 'activity',
          description: `SDR de voz ligou para o lead — estado: ${classifiedOutcome}. Resumo: ${summary || 'sem resumo'}.`,
          leadId: lead.id,
        },
      });

      const currentFields = (lead.customFields as Record<string, unknown>) || {};
      await prisma.lead.update({
        where: { id: lead.id },
        data: {
          customFields: {
            ...currentFields,
            // Só marca qualificado quando houve conversa real — AMD, não-atendimento,
            // número inválido e falha nunca inflam esta métrica de conversão.
            voiceQualified: hadConversation,
            voiceCallOutcome: classifiedOutcome,
          },
        },
      });

      // Follow-up automático via WhatsApp — respeita opt-out e nunca derruba o webhook. A
      // mensagem muda conforme o estado real (fallback "tentamos contato" para quem não
      // conversou; agradecimento para quem conversou de verdade) — nunca dispara duas vezes
      // por causa do guard de idempotência (`existing`) logo acima, então uma reentrega deste
      // mesmo call_id não gera uma segunda mensagem.
      if (!currentFields.optOutWhatsApp && lead.contact) {
        const contact = lead.contact as { whatsapp?: string | null; phone?: string | null };
        const phone = contact.whatsapp || contact.phone;
        if (phone) {
          try {
            await sendWhatsAppMessage(
              organizationId,
              phone,
              hadConversation
                ? 'Olá! Obrigado por conversar com nossa equipe. Confirmamos o interesse e seguimos à disposição para os próximos passos.\n\n*Responda SAIR para não receber mais mensagens.*'
                : 'Olá! Tentamos contato agora pouco por telefone mas não conseguimos falar. Quando seria o melhor horário para conversarmos rapidamente?\n\n*Responda SAIR para não receber mais mensagens.*',
            );
          } catch (err) {
            logger.warn(
              { err, leadId: lead.id },
              'Falha ao disparar WhatsApp automático pós-ligação',
            );
          }
        }
      }

      // Alerta de concorrente citado na transcrição.
      const transcriptLower = (transcript || '').toLowerCase();
      const mentionedCompetitors = COMPETITORS.filter((c) => transcriptLower.includes(c));

      let sseMessage = hadConversation
        ? `SDR concluiu chamada. Resumo: ${summary || 'Finalizada'}`
        : `SDR tentou ligar, sem conversa (${classifiedOutcome}).`;
      if (mentionedCompetitors.length > 0) {
        sseMessage = '[ALERTA] SDR concluiu chamada com citação de concorrente!';
        await prisma.note.create({
          data: {
            leadId: lead.id,
            content: `⚠️ ALERTA CONCORRENTE: O cliente mencionou: ${mentionedCompetitors.join(', ')}`,
            author: 'Sistema de Alerta (IA)',
          },
        });
      }

      sseService.notifyVoiceQualified(organizationId, lead.id, sseMessage);

      // Onda 7, item 2 — ponte para o Copiloto Comercial IA (src/shared/contracts/
      // copilotoVoiceIngestion.contract.ts). Só quando houve conversa real (nunca para
      // voicemail/não-atendida/etc — evitaria encher o módulo de conversas vazias) e há
      // transcrição pra processar. Efeito colateral SECUNDÁRIO: nunca pode derrubar este webhook
      // (o registro real do resultado da ligação, acima, já aconteceu) — sempre em try/catch,
      // mesmo padrão do fallback de WhatsApp acima.
      if (hadConversation && transcript) {
        try {
          const copilotoVoiceIngestionPort =
            container.resolve<CopilotoVoiceIngestionPort>('CopilotoVoiceIngestionPort');
          await copilotoVoiceIngestionPort.ingestCallResult(organizationId, {
            providerCallId: callId,
            leadId: lead.id,
            rawTranscript: transcript,
            durationSeconds: callLength * 60,
            consent: detectRecordingConsentFromRawTranscript(transcript),
          });
        } catch (err) {
          logger.warn(
            { err, callId, leadId: lead.id },
            'Falha ao ingerir resultado da ligação no Copiloto Comercial IA (efeito secundário, não afeta o registro da ligação).',
          );
        }
      }

      return { leadFound: true as const, duplicate: false, leadId: lead.id };
    });

    if (!outcome.leadFound) {
      logger.warn(
        { callId, organizationId, leadId },
        'Voice result sem lead correspondente nesta organização.',
      );
    } else if (!outcome.duplicate) {
      logger.info({ callId, leadId: outcome.leadId }, 'Voice result registrado no lead.');
    }
    res
      .status(200)
      .json({ success: true, lead_found: outcome.leadFound, duplicate: outcome.duplicate });
  } catch (err) {
    // 5xx de propósito: a Bland reentrega com backoff, e o marcador de idempotência acima
    // garante que a reentrega não duplica a nota caso a falha tenha sido depois da escrita.
    logger.error({ err, callId }, 'Erro ao processar voice result da Bland AI');
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
}

const router = Router();

// Parser local: esta rota é montada antes do express.json() global (junto dos outros webhooks) e
// precisa parsear o próprio corpo — era exatamente a ausência disto que deixava req.body undefined
// na versão inline.
router.post('/', express.json({ limit: '1mb' }), handleVoiceResult);

export const voiceResultWebhookRoutes = router;
