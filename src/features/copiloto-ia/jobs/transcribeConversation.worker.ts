// Onda 3 do pacote atlasgr_copiloto_ai_pack ("Transcrição + Resumo"): worker assíncrono
// disparado por `POST .../audio/complete` (CopilotoIaController) depois que a extensão termina de
// subir o áudio da reunião pro storage S3-compatível. Baixa o objeto, transcreve via Whisper,
// grava os segmentos (reaproveita `CopilotoIaUseCases.addTranscriptSegments` — mesma validação de
// status/consentimento do resto do módulo, não duplicada aqui) e gera um resumo executivo
// reaproveitando `MeetingSynthesisService` (já existe em `src/features/chatbook/`).
//
// Onda 5 ("Intelligence"): também extrai objeções/concorrentes/buying signals
// (`conversationIntelligence.service.ts`, dono deste módulo — não cruza feature) e, se a conversa
// tem um Lead vinculado, calcula e grava um `CopilotoDealHealthSnapshot` com fórmula determinística
// (`dealHealthScoring.ts` — só a EXTRAÇÃO dos sinais usa IA, combinar em score é aritmética
// documentada e reproduzível).
//
// A dependência de síntese é injetada via `MeetingSynthesisPort` (`src/shared/contracts/
// meetingSynthesis.contract.ts`), nunca importada diretamente — `no-cross-feature-imports`
// (.dependency-cruiser.cjs) proíbe `copiloto-ia` importar internals de `chatbook`. Quem monta a
// instância real (`new MeetingSynthesisService()`) é a composição root de cada processo
// (`worker.ts`/`src/bootstrap/workers.ts`), passada para `createCopilotoTranscriptionWorker(...)`.
import { Worker, Queue, type Job } from 'bullmq';
import { connection, queuesEnabled } from '../../../lib/queue/redis.js';
import { requestContext } from '../../../lib/async-context.js';
import { assertAiBudgetNotExceeded } from '../../../lib/ai/budget.js';
import { prisma } from '../../../lib/prisma.js';
import { logger } from '../../../lib/logger.js';
import { getDownloadUrl } from '../../../lib/storage/index.js';
import { recordDeadLetter, isFinalAttempt } from '../../../lib/queue/deadLetter.js';
import {
  transcribeAudioWithWhisper,
  isWhisperConfigured,
  WHISPER_USD_PER_MINUTE,
} from '../infra/whisperTranscription.service.js';
import { extractConversationIntelligence } from '../infra/conversationIntelligence.service.js';
import { computeDealHealthScore, type SentimentScore } from '../application/dealHealthScoring.js';
import { CopilotoIaUseCases } from '../application/CopilotoIaUseCases.js';
import { PrismaCopilotoIaRepository } from '../infra/PrismaCopilotoIaRepository.js';
import type { MeetingSynthesisPort } from '../../../shared/contracts/meetingSynthesis.contract.js';

export const COPILOTO_TRANSCRIPTION_QUEUE_NAME = 'copiloto-ia-transcription-queue';

export interface TranscribeConversationJobData {
  conversationId: string;
  organizationId: string;
}

const repository = new PrismaCopilotoIaRepository();
const useCases = new CopilotoIaUseCases(repository);

/** Custo do Whisper é por MINUTO de áudio, não por token — não passa por `logAiUsage()` (feito
 * pra chat completions). Grava direto em `AILog` pra entrar na MESMA soma que
 * `assertAiBudgetNotExceeded()`/o dashboard de Consumo de IA já leem (`AILog.cost`). */
async function recordWhisperCost(organizationId: string, durationSeconds: number): Promise<void> {
  const cost = (durationSeconds / 60) * WHISPER_USD_PER_MINUTE;
  try {
    await prisma.aILog.create({
      data: {
        model: 'whisper-1',
        tokens: 0,
        cost,
        latencyMs: 0,
        promptId: 'copiloto-ia-transcription',
        organizationId,
      },
    });
  } catch (err) {
    logger.warn({ err, organizationId }, '[copiloto-ia] falha ao registrar custo do Whisper em AILog');
  }
}

export async function runTranscribeConversationJob(
  data: TranscribeConversationJobData,
  deps: { meetingSynthesisPort: MeetingSynthesisPort },
): Promise<void> {
  const { conversationId, organizationId } = data;

  await requestContext.run({ tenantId: organizationId }, async () => {
    const state = await repository.getConversationState(organizationId, conversationId);
    if (!state) {
      logger.warn(
        { conversationId, organizationId },
        '[copiloto-ia] conversa não encontrada para transcrição — job descartado',
      );
      return;
    }
    if (!state.audioObjectKey) {
      logger.warn(
        { conversationId, organizationId },
        '[copiloto-ia] conversa sem áudio associado — nada para transcrever',
      );
      return;
    }
    if (!isWhisperConfigured()) {
      // Falha explícita (não silenciosa): sem OPENAI_API_KEY, todo job cai aqui até alguém
      // configurar — melhor um FAILED visível no backend do que um READY fabricado sem transcrição.
      await repository.updateTranscriptionStatus(organizationId, conversationId, {
        transcriptionError: 'OPENAI_API_KEY não configurada — transcrição indisponível.',
      });
      await useCases.markFailed(organizationId, conversationId).catch(() => {});
      throw new Error('OPENAI_API_KEY não configurada.');
    }

    await repository.updateTranscriptionStatus(organizationId, conversationId, {
      transcriptionStartedAt: new Date(),
    });

    try {
      // AI-011: mesmo circuit breaker de orçamento mensal usado pelo gateway de chat — Whisper
      // não passa por `getAiModel()` (não é chat completion), então precisa da checagem explícita.
      await assertAiBudgetNotExceeded();

      const { signedUrl } = await getDownloadUrl(state.audioObjectKey);
      const audioRes = await fetch(signedUrl);
      if (!audioRes.ok) {
        throw new Error(`Download do áudio da conversa falhou (HTTP ${audioRes.status}).`);
      }
      const audioBuffer = Buffer.from(await audioRes.arrayBuffer());

      const whisperResult = await transcribeAudioWithWhisper(
        audioBuffer,
        state.audioMimeType || 'audio/webm',
      );
      await recordWhisperCost(organizationId, whisperResult.durationSeconds);

      const segments = whisperResult.segments
        .filter((segment) => segment.text.trim().length > 0)
        .map((segment) => ({
          startMs: Math.max(0, Math.round(segment.start * 1000)),
          endMs: Math.max(0, Math.round(segment.end * 1000)),
          text: segment.text,
        }));
      if (segments.length > 0) {
        await useCases.addTranscriptSegments(organizationId, conversationId, segments);
      }

      let sentimentScore: SentimentScore | null = null;
      let unresolvedObjectionsCount = 0;
      let buyingSignalsCount = 0;
      let competitorMentionsCount = 0;

      if (whisperResult.text.trim()) {
        const synthesis = await deps.meetingSynthesisPort.synthesizeMeeting({
          meetingTitle: state.title || 'Reunião comercial',
          participants: [],
          rawTranscript: whisperResult.text,
        });
        await useCases.createInsight(organizationId, conversationId, {
          type: 'resumo',
          valueJson: synthesis,
        });
        sentimentScore = synthesis.sentimentScore ?? null;

        // Onda 5 — extração de objeções/concorrentes/buying signals, cada um como um
        // `CopilotoInsight` PRÓPRIO (não só aninhado dentro do resumo) para consumo futuro
        // (ex.: sugestão automática de campo de CRM a partir de uma objeção detectada).
        const intelligence = await extractConversationIntelligence(whisperResult.text);
        for (const objection of intelligence.objections) {
          await useCases.createInsight(organizationId, conversationId, {
            type: 'objecao',
            valueJson: objection,
          });
        }
        for (const competitor of intelligence.competitors) {
          await useCases.createInsight(organizationId, conversationId, {
            type: 'concorrente',
            valueJson: competitor,
          });
        }
        for (const signal of intelligence.buyingSignals) {
          await useCases.createInsight(organizationId, conversationId, {
            type: 'buying_signal',
            valueJson: signal,
          });
        }
        unresolvedObjectionsCount = intelligence.objections.filter((o) => !o.resolved).length;
        buyingSignalsCount = intelligence.buyingSignals.length;
        competitorMentionsCount = intelligence.competitors.length;
      }

      if (state.leadId) {
        const { score, factors } = computeDealHealthScore({
          sentimentScore,
          unresolvedObjectionsCount,
          buyingSignalsCount,
          competitorMentionsCount,
        });
        await useCases.recordDealHealthSnapshot(organizationId, {
          leadId: state.leadId,
          score,
          factorsJson: { ...factors, conversationId, sentimentScore },
        });
      }

      await repository.updateTranscriptionStatus(organizationId, conversationId, {
        transcriptionCompletedAt: new Date(),
      });
      await useCases.markReady(organizationId, conversationId);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await repository
        .updateTranscriptionStatus(organizationId, conversationId, { transcriptionError: message })
        .catch(() => {});
      await useCases.markFailed(organizationId, conversationId).catch(() => {});
      throw err; // deixa o BullMQ decidir retry — dead-letter só na tentativa final (ver worker.on('failed')).
    }
  });
}

export function createCopilotoTranscriptionWorker(deps: {
  meetingSynthesisPort: MeetingSynthesisPort;
}) {
  const worker = new Worker(
    COPILOTO_TRANSCRIPTION_QUEUE_NAME,
    async (job: Job) =>
      runTranscribeConversationJob(job.data as TranscribeConversationJobData, deps),
    { connection: connection as any, concurrency: 2 },
  );

  worker.on('failed', (job, err) => {
    logger.error(
      { err, jobId: job?.id, conversationId: job?.data?.conversationId },
      '[copiloto-ia] job de transcrição falhou',
    );
    if (!job || !isFinalAttempt(job.attemptsMade, job.opts.attempts)) return;
    void recordDeadLetter({
      queue: COPILOTO_TRANSCRIPTION_QUEUE_NAME,
      jobId: job.id,
      jobName: job.name,
      organizationId: job.data?.organizationId,
      attemptsMade: job.attemptsMade,
      error: err,
    });
  });

  worker.on('error', (err) => {
    logger.warn(
      { message: err.message },
      '[copiloto-ia] transcription worker error suprimido (Redis offline)',
    );
  });

  return worker;
}

// Mesmo padrão de `leadsQueue` (src/lib/queue/index.ts): `null` fora de `queuesEnabled` — não
// conecta no Redis avidamente em ambiente sem fila (ex.: suíte de testes de integração).
export const copilotoTranscriptionQueue = queuesEnabled
  ? new Queue(COPILOTO_TRANSCRIPTION_QUEUE_NAME, {
      connection: connection as any,
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 10_000 },
        removeOnComplete: { age: 24 * 60 * 60 },
        removeOnFail: { age: 7 * 24 * 60 * 60 },
      },
    })
  : null;

/**
 * Enfileira a transcrição — silencioso (loga e segue) quando a fila está desabilitada, mesmo
 * raciocínio de tolerância a falha do resto do módulo: a conversa já está `PROCESSING` com o
 * áudio salvo no storage, então nada se perde — um reprocessamento manual (fora do escopo desta
 * onda) sempre pode reenfileirar a partir do `audioObjectKey` já persistido.
 */
export async function enqueueTranscribeConversationJob(
  data: TranscribeConversationJobData,
): Promise<void> {
  if (!copilotoTranscriptionQueue) {
    logger.warn(
      { conversationId: data.conversationId },
      '[copiloto-ia] fila de transcrição desabilitada (ENABLE_QUEUES=false) — job não enfileirado',
    );
    return;
  }
  await copilotoTranscriptionQueue.add('transcribe-conversation', data, {
    jobId: `transcribe-${data.conversationId}`,
  });
}
