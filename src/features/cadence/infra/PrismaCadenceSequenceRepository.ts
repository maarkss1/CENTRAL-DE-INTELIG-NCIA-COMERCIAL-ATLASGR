import { prisma } from '../../../lib/prisma.js';
import type {
  CadenceSequenceRepository,
  CadenceSequenceRow,
} from '../application/sequenceService.js';

/**
 * Adaptador Prisma real de `CadenceSequenceRepository` (tabela `CadenceSequence`, ver
 * `prisma/schema.prisma`). `CadenceSequence` já vem 1:1 no domínio (sem enum Postgres a mapear,
 * diferente de `PrismaCadenceRunRepository`/`PrismaOptOutRepository`), então este adaptador é só
 * leitura/escrita direta — a regra de negócio (idempotência, "não existe" vs "já encerrada") vive
 * em `application/sequenceService.ts`, não aqui.
 */
export class PrismaCadenceSequenceRepository implements CadenceSequenceRepository {
  async findById(organizationId: string, id: string): Promise<CadenceSequenceRow | null> {
    return prisma.cadenceSequence.findFirst({
      where: { id, organizationId, deletedAt: null },
    });
  }

  /**
   * `where` só por `id` — mesmo padrão de `PrismaCadenceRunRepository.save` (upsert por `id`
   * apenas): `id` (cuid) já é globalmente único no Prisma, e a posse pela organização já foi
   * verificada por `findById` (que filtra por `organizationId`) antes de `setActive` ser chamado
   * em `deactivateCadenceSequence`. `organizationId` não pode compor `where` de um `update` sem
   * um índice único composto que inclua os dois campos, e não existe um aqui.
   */
  async setActive(
    _organizationId: string,
    id: string,
    active: boolean,
  ): Promise<CadenceSequenceRow> {
    return prisma.cadenceSequence.update({
      where: { id },
      data: { active },
    });
  }
}

/** Instância única, sem estado próprio além da conexão Prisma já compartilhada pelo app. */
export const prismaCadenceSequenceRepository = new PrismaCadenceSequenceRepository();
