import { logger } from './logger.js';

// Sem REDIS_URL (ou com ENABLE_QUEUES=false) o ioredis encerra a conexao depois das retries e
// rejeita os comandos pendentes com "Error: Connection is closed.". Boa parte desses comandos e
// disparada internamente pelo BullMQ (metadados de Queue, BullBoard, etc.), fora de qualquer
// await nosso -- nao existe .catch() no nosso codigo capaz de cobrir esse caminho. Em Node >= 15
// uma promise rejection nao tratada encerra o processo: o servidor subia, respondia o health
// check e morria ~2s depois com status 1, fazendo o deploy inteiro falhar.
// Aqui essas rejeicoes viram log estruturado e o processo segue no ar, degradando as filas em
// vez de derrubar a API -- mesma politica ja adotada pelo rate limiter e pelos workers, ambos
// condicionados a queuesEnabled.
export function registerProcessGuards(): void {
  process.on('unhandledRejection', (reason: unknown) => {
    logger.error({ err: reason }, 'Unhandled promise rejection capturada pelo guard de processo');
  });
}
