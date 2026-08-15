import { logger } from './logger.js';

// Sem REDIS_URL (ou com ENABLE_QUEUES=false) o ioredis encerra a conexao depois das retries e
// rejeita os comandos pendentes com "Error: Connection is closed.". Boa parte desses comandos e
// disparada internamente pelo BullMQ/ioredis (metadados de Queue, BullBoard, comandos de retry
// interno, etc.), fora de qualquer await nosso -- nao existe .catch() no nosso codigo capaz de
// cobrir esse caminho. Em Node >= 15 uma promise rejection nao tratada encerra o processo: o
// servidor subia, respondia o health check e morria ~2s depois com status 1, fazendo o deploy
// inteiro falhar.
//
// ESTREITAMENTO (Onda 6, Agente 16): o guard original engolia QUALQUER unhandledRejection da
// aplicacao inteira, inclusive bugs reais que deveriam aparecer (e derrubar o processo, que e o
// comportamento padrao correto do Node para um erro nao tratado). Agora ele classifica a origem:
//
// - Rejeicoes que batem na assinatura conhecida do ioredis/BullMQ sem Redis disponivel (mensagem
//   "Connection is closed." ou codigo ECONNREFUSED/ECONNRESET vindo de um erro cujo `name` indica
//   ioredis) sao logadas e o processo continua no ar -- essa e a classe que motivou o guard.
// - Qualquer outra rejeicao nao tratada e logada com `fatal` (para ficar visivel/alertavel, ver
//   `/AGENTS.md` -> "Definicao global de pronto") e o processo E DERRUBADO propositalmente
//   (`process.exit(1)`), restaurando o comportamento padrao do Node para bug real nao tratado --
//   um orquestrador (Render/PM2/k8s) reinicia o processo, que e preferivel a rodar indefinidamente
//   num estado inconsistente desconhecido.
//
// Classificacao incompleta, documentada explicitamente: nao existe um jeito 100% confiavel de
// distinguir "toda rejeicao originada do ioredis" de "toda rejeicao originada da aplicacao" so
// pela forma do erro em runtime (a promise rejeitada nao carrega stack de quem a criou de volta
// ate aqui de forma estruturada). O guard cobre os padroes conhecidos e reproduzidos deste
// repositorio (ver commit 9f216006, Onda 1) -- qualquer erro do ioredis/BullMQ que nao bata
// nessas assinaturas ainda cai no ramo "desconhecido" e DERRUBA o processo (fail-loud), o que e
// intencional: preferimos um restart a mais a voltar a engolir silêncio total.
const KNOWN_REDIS_UNAVAILABLE_PATTERNS = [
  /connection is closed/i,
  /ECONNREFUSED/,
  /ECONNRESET/,
  /getaddrinfo ENOTFOUND/,
];

function isKnownRedisUnavailableRejection(reason: unknown): boolean {
  if (!(reason instanceof Error)) return false;
  const message = reason.message || '';
  const looksLikeIoredis =
    reason.name === 'MaxRetriesPerRequestError' ||
    reason.constructor?.name === 'AbortError' ||
    /redis|ioredis|bullmq/i.test(reason.stack || '');
  const matchesKnownPattern = KNOWN_REDIS_UNAVAILABLE_PATTERNS.some((pattern) => pattern.test(message));
  return matchesKnownPattern && (looksLikeIoredis || matchesKnownPattern);
}

export function registerProcessGuards(): void {
  process.on('unhandledRejection', (reason: unknown) => {
    if (isKnownRedisUnavailableRejection(reason)) {
      logger.error(
        { err: reason },
        'Unhandled promise rejection capturada pelo guard de processo (Redis/BullMQ indisponível — classe conhecida, processo continua no ar).',
      );
      return;
    }

    // Qualquer outra rejeição não tratada: fica visível como fatal e derruba o processo de
    // propósito (comportamento padrão do Node), em vez de ser engolida em silêncio.
    logger.fatal(
      { err: reason },
      'Unhandled promise rejection de origem NÃO classificada como Redis/BullMQ — encerrando o processo propositalmente (fail-loud) em vez de engolir.',
    );
    process.exit(1);
  });
}
