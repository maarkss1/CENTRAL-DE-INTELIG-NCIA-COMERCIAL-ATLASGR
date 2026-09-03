import express, { Router, type Request, type Response } from 'express';
import { env } from '../../../config/env.js';
import { prisma } from '../../../lib/prisma.js';
import { logger } from '../../../lib/logger.js';
import { requestContext } from '../../../lib/async-context.js';
import {
  isValidSignature,
  callMarker,
  buildObservations,
  detectOptOut,
  detectRecordingConsent,
  pickCallablePhone,
  classifyCallOutcome,
  callResultedInConversation,
  type CallEndedData,
} from './birthVoice.helpers.js';
import { recordOptOut } from './callSuppression.service.js';
import { sendWhatsAppMessage } from '../whatsapp/whatsapp.service.js';
import {
  claimWebhookDelivery,
  webhookDeliveryFingerprint,
} from '../../../shared/security/webhookReplayGuard.js';
import { container } from '../../../shared/di/container.js';
import type { CopilotoVoiceIngestionPort } from '../../../shared/contracts/copilotoVoiceIngestion.contract.js';

type RecordOutcome = 'recorded' | 'duplicate' | 'lead-not-found';

async function recordCallResult(
  organizationId: string,
  leadId: string,
  data: CallEndedData,
): Promise<RecordOutcome> {
  // Roda com o tenant no contexto para a RLS enxergar a organização certa: este webhook não tem
  // JWT (quem chama é o Birth Voices Hub, não um usuário logado), então nada preencheria isso.
  return requestContext.run({ tenantId: organizationId }, async () => {
    // Como a RLS já limita à organização do contexto, achar o lead aqui é o que prova que o
    // organizationId que veio no payload é mesmo o dono deste lead.
    const lead = await prisma.lead.findFirst({
      where: { id: leadId },
      include: { contact: true, company: true },
    });
    if (!lead) return 'lead-not-found';

    // Antes da checagem de duplicidade e antes de qualquer escrita de atividade: o bloqueio é o
    // efeito mais importante deste webhook, e é o único que não pode se perder se uma escrita
    // posterior falhar. `recordOptOut` é idempotente, então a reentrega do evento não duplica.
    const detection = detectOptOut(data);
    if (detection.optOut) {
      // O número efetivamente discado é a fonte certa: o cadastro do lead pode ter vários, e
      // quem pediu para não ser incomodado foi quem atendeu neste. Só cai no cadastro quando
      // o Hub não informa `to`.
      const dialed = data.to ?? pickCallablePhone(lead.contact, lead.company);
      await recordOptOut({
        organizationId,
        phone: dialed,
        source: 'call-opt-out',
        reason: detection.evidence
          ? `Pedido na ligação (${detection.source}): "${detection.evidence}"`
          : `Pedido na ligação (${detection.source}).`,
        leadId,
        // Trecho real da transcrição, separado do texto de `reason` — o registro unificado
        // (`OptOutRecord`) distingue as duas coisas, ver `RecordOptOutInput.evidence`.
        evidence: detection.evidence ?? null,
      });
    }

    const marker = callMarker(data.callSid || 'sem-id');
    const existing = await prisma.activity.findFirst({
      where: { leadId, observations: { contains: marker } },
    });
    if (existing) return 'duplicate';

    // Estado honesto do resultado — AMD/não-atendimento/número inválido/falha/timeout nunca
    // colapsam em "Concluida". ActivityStatus (schema) só tem Pendente/Em_andamento/Concluida/
    // Cancelada — sem um valor dedicado por estado, "Cancelada" é o único que não afirma
    // falsamente que houve conversa; o estado granular de verdade vai no texto da observação
    // (ver buildObservations) para quem olha a atividade conseguir distinguir os casos.
    const outcome = classifyCallOutcome({
      providerOutcome: data.outcome ?? data.status ?? null,
      durationSeconds: typeof data.durationSeconds === 'number' ? data.durationSeconds : null,
      text: (data.transcript ?? []).map((turn) => turn.content).join(' '),
    });
    const hadConversation = callResultedInConversation(outcome);

    await prisma.activity.create({
      data: {
        leadId,
        type: 'Ligacao' as never,
        status: (hadConversation ? 'Concluida' : 'Cancelada') as never,
        owner: lead.owner || 'SDR IA',
        date: new Date(),
        observations: buildObservations(data),
      },
    });

    await prisma.timelineEvent.create({
      data: {
        type: 'activity',
        description:
          `SDR de voz ligou para o lead — ${data.outcome || data.status || 'resultado desconhecido'}.` +
          // O opt-out precisa aparecer no histórico que o SDR humano lê, não só na tabela
          // de bloqueio: é o que explica por que o lead parou de ser discado.
          (detection.optOut
            ? ' O lead pediu para não receber mais ligações; número bloqueado.'
            : ''),
        leadId,
      },
    });

    await prisma.lead.update({ where: { id: leadId }, data: { lastInteraction: new Date() } });

    // Fallback automático para WhatsApp quando a ligação não resultou em conversa real — mesma
    // regra já aplicada no webhook legado da Bland (voiceResult.webhook.ts). Fica DEPOIS de toda
    // gravação de atividade/timeline e ANTES de qualquer retorno cedo por duplicidade (o guard de
    // `existing` acima já impede isto de rodar duas vezes na reentrega do mesmo call_id) —
    // portanto não há corrida possível com este mesmo webhook: o fallback só é avaliado depois
    // que o resultado real da ligação já é conhecido, nunca antes.
    const contactForWhatsApp = lead.contact as {
      whatsapp?: string | null;
      phone?: string | null;
    } | null;
    const currentFields = (lead.customFields as Record<string, unknown>) || {};
    if (
      !hadConversation &&
      !detection.optOut &&
      !currentFields.optOutWhatsApp &&
      contactForWhatsApp
    ) {
      const whatsappNumber = contactForWhatsApp.whatsapp || contactForWhatsApp.phone;
      if (whatsappNumber) {
        try {
          await sendWhatsAppMessage(
            organizationId,
            whatsappNumber,
            'Olá! Tentamos contato agora pouco por telefone mas não conseguimos falar. Quando seria o melhor horário para conversarmos rapidamente?\n\n*Responda SAIR para não receber mais mensagens.*',
          );
        } catch (err) {
          logger.warn(
            { err, leadId },
            'Falha ao disparar fallback de WhatsApp pós-ligação (Hub de voz)',
          );
        }
      }
    }

    // Onda 7, item 2 — ponte para o Copiloto Comercial IA (src/shared/contracts/
    // copilotoVoiceIngestion.contract.ts). Mesmo raciocínio do webhook legado
    // (voiceResult.webhook.ts): só quando houve conversa real e há transcrição, e nunca pode
    // derrubar este webhook (efeito colateral secundário) — sempre em try/catch, depois de todo o
    // registro real da ligação já ter acontecido acima.
    if (hadConversation && data.transcript && data.transcript.length > 0) {
      try {
        const copilotoVoiceIngestionPort = container.resolve<CopilotoVoiceIngestionPort>(
          'CopilotoVoiceIngestionPort',
        );
        await copilotoVoiceIngestionPort.ingestCallResult(organizationId, {
          providerCallId: data.callSid || 'sem-id',
          leadId,
          turns: data.transcript.map((turn) => ({
            speaker: turn.role === 'assistant' ? 'assistant' : 'lead',
            text: turn.content,
          })),
          durationSeconds: typeof data.durationSeconds === 'number' ? data.durationSeconds : 0,
          consent: detectRecordingConsent(data),
        });
      } catch (err) {
        logger.warn(
          { err, leadId, callSid: data.callSid },
          'Falha ao ingerir resultado da ligação no Copiloto Comercial IA (efeito secundário, não afeta o registro da ligação).',
        );
      }
    }

    return 'recorded';
  });
}

async function handleWebhook(req: Request, res: Response): Promise<void> {
  const secret = env.BIRTH_VOICES_WEBHOOK_SECRET;
  if (!secret) {
    // Fail-closed: sem segredo não há como distinguir o Hub de qualquer um que descubra esta
    // URL, e aceitar o payload deixaria qualquer pessoa escrever atividades nos leads.
    logger.error(
      'Webhook do SDR de voz recebido, mas BIRTH_VOICES_WEBHOOK_SECRET não está configurado.',
    );
    res.status(503).json({ success: false, error: 'Webhook não configurado.' });
    return;
  }

  const rawBody = req.body;
  if (!Buffer.isBuffer(rawBody)) {
    logger.error(
      'Webhook do SDR de voz sem corpo bruto — a rota precisa ser montada antes do express.json().',
    );
    res.status(500).json({ success: false, error: 'Configuração de rota inválida.' });
    return;
  }

  const signature = req.header('x-birthvoices-signature');
  if (!isValidSignature(rawBody, signature, secret)) {
    logger.warn('Webhook do SDR de voz com assinatura inválida — descartado.');
    res.status(401).json({ success: false, error: 'Assinatura inválida.' });
    return;
  }

  // A assinatura já é função do corpo cru — reenvio idêntico (retry legítimo ou captura repetida)
  // produz o mesmo fingerprint. Ver webhookReplayGuard.ts para o raciocínio completo.
  const replayCheck = await claimWebhookDelivery(
    'birth-voice',
    webhookDeliveryFingerprint(signature),
  );
  if (replayCheck === 'replay') {
    res.status(200).json({ success: true, outcome: 'duplicate-delivery' });
    return;
  }

  let event: { type?: string; data?: CallEndedData };
  try {
    event = JSON.parse(rawBody.toString('utf8'));
  } catch {
    res.status(400).json({ success: false, error: 'Corpo não é JSON válido.' });
    return;
  }

  // Eventos que ainda não tratamos são aceitos de propósito: devolver erro faria o Hub reentregar
  // cinco vezes e mandar para a fila de mortos algo que nunca vamos querer.
  if (event.type !== 'agent.call.ended') {
    res.status(200).json({ success: true, ignored: event.type ?? null });
    return;
  }

  const data = event.data ?? {};
  const context = (data.context ?? {}) as Record<string, unknown>;
  const organizationId = typeof context.organizationId === 'string' ? context.organizationId : null;
  const leadId = typeof context.leadId === 'string' ? context.leadId : null;

  if (!organizationId || !leadId) {
    // Ligação feita fora do Prospector (inbound, teste manual) — nada a registrar, e reentregar
    // não mudaria isso.
    res.status(200).json({ success: true, ignored: 'sem contexto de lead' });
    return;
  }

  try {
    const outcome = await recordCallResult(organizationId, leadId, data);
    if (outcome === 'lead-not-found') {
      logger.warn(
        { leadId, organizationId },
        'Webhook do SDR de voz para um lead inexistente nesta organização.',
      );
    }
    res.status(200).json({ success: true, outcome });
  } catch (error) {
    // 5xx aqui é proposital: o Hub reentrega com backoff, e o marcador de idempotência garante
    // que a reentrega não duplique a atividade caso a falha tenha sido depois da escrita.
    logger.error({ err: error, leadId }, 'Falha ao registrar resultado da ligação do SDR de voz.');
    res.status(500).json({ success: false, error: 'Falha ao registrar resultado.' });
  }
}

const router = Router();

// express.raw porque a assinatura HMAC é calculada sobre os bytes exatos do corpo. Esta rota é
// montada antes do express.json() global em server.ts.
router.post('/webhook', express.raw({ type: '*/*', limit: '1mb' }), handleWebhook);

export const birthVoiceWebhookRoutes = router;
