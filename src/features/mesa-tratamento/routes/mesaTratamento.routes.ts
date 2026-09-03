import { Router, type Request, type Response, type NextFunction } from 'express';
import type { Prisma } from '@prisma/client';
import type { AuthRequest } from '../../../shared/middlewares/authenticateToken.js';
import { requireRole } from '../../../shared/middlewares/requireRole.js';
import { hasRequiredRole } from '../../../lib/auth/authorization.js';
import { prisma } from '../../../lib/prisma.js';
import { AppError } from '../../../shared/middlewares/errorHandler.js';
import { routeParam } from '../../../shared/http/routeParams.js';
import {
  findUnimportedBitrixLeadIds,
  importSelectedBitrixLeads,
  getLeadStatuses,
  getBitrixUsers,
  resolveOwnBitrixUserId,
  postCommentToBitrix,
  exportLeadToBitrixNow,
} from '../../integrations/bitrix/bitrix.service.js';
import { rankLeadsForQueue } from '../mesaTratamento.priority.js';

const router = Router();
const mesaRoles = requireRole(['ADMIN', 'GESTOR', 'CLOSER', 'SDR']);

/** Etapas "abertas" do funil de Lead (SDR) — as únicas que aparecem na Mesa de Tratamento.
 *  Convertido/Desqualificado saem da fila assim que o resultado é registrado. As etapas do funil
 *  Negócio (Nova_Oportunidade, Proposta_Enviada etc.) não são leads de SDR — nunca entram aqui. */
const OPEN_LEAD_STATUSES = [
  'Lead_Recebido',
  'Cadencia_Iniciada',
  'Qualificacao_SDR',
  'Reuniao_Agendada',
] as const;

const leadSelect = {
  id: true,
  status: true,
  temperature: true,
  score: true,
  owner: true,
  lastInteraction: true,
  nextAction: true,
  qualification: true,
  bitrixLeadId: true,
  bitrixStageLabel: true,
  company: { select: { tradeName: true, legalName: true, segment: true } },
  contact: { select: { name: true, role: true, phone: true, email: true } },
} satisfies Prisma.LeadSelect;

type QueueLead = Prisma.LeadGetPayload<{ select: typeof leadSelect }>;

function leadTitle(lead: QueueLead): string {
  return (
    lead.company?.tradeName || lead.company?.legalName || lead.contact?.name || `Lead ${lead.id}`
  );
}

function daysSince(date: Date | null): number | null {
  if (!date) return null;
  return Math.floor((Date.now() - date.getTime()) / 86_400_000);
}

function toQueueSummary(lead: QueueLead) {
  return {
    id: lead.id,
    title: leadTitle(lead),
    status: lead.status,
    temperature: lead.temperature,
    daysSinceTouch: daysSince(lead.lastInteraction),
    // ADMIN/GESTOR veem a fila do time todo sem filtro de dono (resolveScope acima) — sem isso,
    // não havia como saber de quem é cada lead da fila compartilhada (achado do Piloto 026). Para
    // CLOSER/SDR o valor é sempre o próprio nome (fila já vem filtrada por owner), inofensivo.
    owner: lead.owner ?? null,
  };
}

function toQueueDetail(lead: QueueLead) {
  return {
    ...toQueueSummary(lead),
    segment: lead.company?.segment ?? null,
    contactName: lead.contact?.name ?? null,
    contactRole: lead.contact?.role ?? null,
    phone: lead.contact?.phone ?? null,
    email: lead.contact?.email ?? null,
    score: lead.score,
    bitrixStageLabel: lead.bitrixStageLabel,
    nextAction: lead.nextAction,
    // Já buscado do banco (leadSelect) mas descartado antes desta correção (achado do Piloto
    // 026) — checklist de qualificação do SDR (Playbook Comercial AtlasGR §4.2), útil pra decidir
    // o que fazer agora sem reabrir o cadastro completo do lead em outra tela.
    qualification: lead.qualification,
  };
}

/** "Cada usuário só vê o próprio dado do Bitrix", mesmo princípio de resolveScopedAssignedById em
 *  bitrix.routes.ts (não exportada de lá — reimplementada aqui com as mesmas peças exportadas). */
async function resolveScope(
  req: Request,
  organizationId: string,
  connectionId: string,
): Promise<{
  ownerName: string | undefined;
  assignedById: string | undefined;
  restricted: boolean;
  matched: boolean;
}> {
  const { role, id: userId, email } = (req as AuthRequest).user;
  if (hasRequiredRole(role, ['ADMIN', 'GESTOR'])) {
    return { ownerName: undefined, assignedById: undefined, restricted: false, matched: true };
  }
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { name: true } });
  const bitrixUsers = await getBitrixUsers(organizationId, connectionId);
  const assignedById = resolveOwnBitrixUserId(bitrixUsers, email) ?? undefined;
  return {
    ownerName: user?.name,
    assignedById,
    restricted: true,
    matched: !!user?.name && !!assignedById,
  };
}

router.get(
  '/queue',
  mesaRoles,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { organizationId } = (req as AuthRequest).user;
      const connection = await prisma.bitrixConnection.findFirst({
        where: { organizationId },
        orderBy: { createdAt: 'asc' },
      });
      if (!connection) {
        res.json({
          success: true,
          data: { queue: [], current: null, connectionId: null, leadStatuses: [] },
        });
        return;
      }

      const scope = await resolveScope(req, organizationId, connection.id);
      if (scope.restricted && !scope.matched) {
        res.json({
          success: true,
          data: { queue: [], current: null, connectionId: connection.id, leadStatuses: [] },
          meta: {
            warning:
              'Seu usuário não foi encontrado no Bitrix24 (confira o e-mail cadastrado) — não é possível montar sua fila.',
          },
        });
        return;
      }

      // Traz pro Prisma qualquer lead do Bitrix ainda não importado, atribuído a este usuário
      // (ADMIN/GESTOR: sem filtro — importa novidades do time todo, até um teto por chamada).
      const { ids } = await findUnimportedBitrixLeadIds(organizationId, connection.id, 50, {
        assignedById: scope.assignedById,
      });
      if (ids.length > 0) {
        await importSelectedBitrixLeads(organizationId, connection.id, ids, scope.assignedById);
      }

      const where: Prisma.LeadWhereInput = {
        organizationId,
        bitrixLeadId: { not: null },
        status: { in: [...OPEN_LEAD_STATUSES] },
      };
      if (scope.ownerName) where.owner = scope.ownerName;

      const [leads, leadStatuses] = await Promise.all([
        prisma.lead.findMany({ where, select: leadSelect }),
        getLeadStatuses(organizationId, connection.id),
      ]);

      const ranked = rankLeadsForQueue(leads);
      res.json({
        success: true,
        data: {
          queue: ranked.map(toQueueSummary),
          current: ranked[0] ? toQueueDetail(ranked[0]) : null,
          connectionId: connection.id,
          leadStatuses,
        },
      });
    } catch (error) {
      next(error);
    }
  },
);

router.post(
  '/lead/:id/register',
  mesaRoles,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { organizationId } = (req as AuthRequest).user;
      const id = routeParam(req.params.id, 'id');
      const body = req.body as {
        outcome?:
          | 'contato'
          | 'reuniao_agendada'
          | 'reuniao_realizada'
          | 'retorno'
          | 'convertido'
          | 'sem_fit'
          | 'dados_invalidos'
          | 'revisao';
        note?: string;
        bitrixStatusId?: string;
        lossReasonId?: string;
        nextActionTitle?: string;
        nextActionWhen?: string;
      };

      if (!body.outcome) throw new AppError('Selecione o resultado do contato.', 400);
      if (!body.note?.trim())
        throw new AppError('Registre uma observação antes de continuar.', 400);

      const isDisqualify = body.outcome === 'sem_fit' || body.outcome === 'dados_invalidos';
      if (isDisqualify && !body.lossReasonId)
        throw new AppError('Selecione o motivo de desqualificação.', 400);

      const lead = await prisma.lead.findFirst({
        where: { id, organizationId },
        select: { id: true, owner: true, bitrixLeadId: true },
      });
      if (!lead) throw new AppError('Lead não encontrado.', 404);
      if (!lead.bitrixLeadId)
        throw new AppError('Este Lead ainda não está vinculado ao Bitrix24.', 400);

      // CLOSER/SDR só registra em leads que são dele — mesmo princípio de requireLeadOwnership.ts
      // (lead.routes.ts), reimplementado aqui pois aquele middleware é específico da rota /api/leads.
      const { role, id: userId } = (req as AuthRequest).user;
      if (!hasRequiredRole(role, ['ADMIN', 'GESTOR'])) {
        const user = await prisma.user.findUnique({
          where: { id: userId },
          select: { name: true },
        });
        if (!user?.name || lead.owner !== user.name)
          throw new AppError('Este Lead não é seu.', 403);
      }

      const connection = await prisma.bitrixConnection.findFirst({
        where: { organizationId },
        orderBy: { createdAt: 'asc' },
      });
      if (!connection)
        throw new AppError('Bitrix24 não está conectado para esta organização.', 400);

      const data: Prisma.LeadUpdateInput = {
        lastInteraction: new Date(),
        nextAction: body.nextActionWhen ? new Date(body.nextActionWhen) : undefined,
      };
      // Só mexemos no status local do Atlas nos dois casos inequívocos (desqualificar/converter)
      // — os demais resultados mudam a etapa real só no Bitrix (via bitrixStatusId abaixo), que é
      // a fonte da verdade pro funil de SDR. Ver AGENTS.md desta pasta.
      if (isDisqualify) {
        data.status = 'Lead_Desqualificado';
        data.lossReason = body.lossReasonId;
      } else if (body.outcome === 'convertido') {
        data.status = 'Convertido_em_Oportunidade';
      }

      // Bitrix é a fonte da verdade pro funil de SDR (ver AGENTS.md desta pasta) — grava lá
      // primeiro. Se a escrita no Bitrix falhar (rede, webhook inválido, rate limit), o Atlas não
      // muda nada localmente antes de propagar o erro, evitando os dois sistemas divergirem: antes
      // desta correção, `prisma.lead.update` já commitava o novo status local (podendo tirar o
      // lead da fila via `OPEN_LEAD_STATUSES`) mesmo quando a chamada ao Bitrix falhava depois,
      // deixando Atlas e Bitrix dessincronizados sem que o SDR soubesse (achado do Piloto 026).
      const comment = `Mesa de Tratamento SDR • ${new Date().toLocaleString('pt-BR')}\nResultado: ${body.outcome}\nObservação: ${body.note.trim()}`;
      await postCommentToBitrix(organizationId, id, comment);
      await exportLeadToBitrixNow(
        organizationId,
        id,
        connection.id,
        body.bitrixStatusId ? { statusId: body.bitrixStatusId } : undefined,
      );

      await prisma.lead.update({ where: { id }, data });

      if (body.nextActionTitle && body.nextActionWhen) {
        const owner = await prisma.user.findUnique({
          where: { id: userId },
          select: { name: true },
        });
        await prisma.activity.create({
          data: {
            type: 'Tarefa',
            owner: owner?.name || 'Mesa de Tratamento',
            date: new Date(body.nextActionWhen),
            status: 'Pendente',
            observations: body.nextActionTitle,
            leadId: id,
            organizationId,
          },
        });
      }

      res.json({ success: true, data: { registered: true } });
    } catch (error) {
      next(error);
    }
  },
);

export const mesaTratamentoRoutes = router;
