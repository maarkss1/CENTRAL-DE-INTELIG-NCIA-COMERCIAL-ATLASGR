import type { Request, Response, NextFunction } from 'express';
import type { AuthRequest } from './authenticateToken.js';
import { prisma } from '../../lib/prisma.js';
import { routeParam } from '../http/routeParams.js';

/**
 * CLOSER/SDR só pode editar/excluir/reenriquecer os leads que capturou — GESTOR/ADMIN já são
 * liberados por `requireRole` antes desta checagem e continuam sem restrição de dono (gerenciam
 * qualquer lead da organização).
 *
 * `Lead.owner` guarda, na maioria dos casos, o `User.id` de quem capturou o lead (atribuição
 * manual em LeadUseCases.createLead ou round-robin em assignment.service.ts) — mas leads
 * importados do Bitrix24 (`bitrix/service/leads.ts`/`deals.ts`, via
 * `resolveAtlasUserNameByEmail`) gravam o **nome** (`User.name`) de quem está marcado como
 * responsável lá, não o id. O campo mistura as duas convenções na mesma coluna (ver
 * `.agents/handoffs/onda-7/04-para-06-owner-bitrix-nome-nao-id.md` para o achado completo e o
 * pedido de correção na origem, dono do arquivo é o Agente 06). Até essa correção chegar na
 * origem, comparar só por id bloquearia (403 indevido) um CLOSER/SDR tentando editar um lead que
 * ele mesmo importou/recebeu do Bitrix — por isso o fallback por nome abaixo, restrito ao próprio
 * usuário autenticado (nunca compara contra o nome de outra pessoa).
 */
export function requireLeadOwnership() {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const authReq = req as AuthRequest;

    if (authReq.user.role !== 'CLOSER' && authReq.user.role !== 'SDR') {
      next();
      return;
    }

    const lead = await prisma.lead.findFirst({
      where: { id: routeParam(req.params.id, 'id'), organizationId: authReq.user.organizationId },
      select: { owner: true },
    });

    if (!lead) {
      res.status(404).json({ success: false, error: 'Lead not found' });
      return;
    }

    const ownsById = lead.owner === authReq.user.id;
    const ownsByLegacyName =
      !ownsById && lead.owner != null && (await ownerMatchesUserName(lead.owner, authReq.user.id));

    if (!ownsById && !ownsByLegacyName) {
      res.status(403).json({
        success: false,
        error: 'Você só pode editar leads que você capturou.',
      });
      return;
    }

    next();
  };
}

async function ownerMatchesUserName(owner: string, userId: string): Promise<boolean> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { name: true } });
  return !!user?.name && user.name === owner;
}
