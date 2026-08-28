import { prisma } from '../../../../lib/prisma.js';
import type { RejectCandidateInput } from './types.js';

/**
 * Registra um candidato como "Não é esse perfil" — passa a ser excluído de futuras descobertas
 * deste tenant (ver `fetchKnownExclusions` em discovery.ts). Não referencia Company/Lead: o
 * candidato rejeitado nunca chegou a ser promovido, então não existe registro nenhum pra apontar.
 */
export async function rejectCandidate(input: RejectCandidateInput) {
  return prisma.prospectRejection.create({
    data: {
      organizationId: input.organizationId,
      tradeName: input.tradeName,
      website: input.website || null,
      reason: input.reason || null,
    },
  });
}
