import { Router, type Request, type Response, type NextFunction } from 'express';
import type { AuthRequest } from '../../../shared/middlewares/authenticateToken.js';
import { routeParam } from '../../../shared/http/routeParams.js';
import {
  connectBitrix,
  listBitrixConnections,
  disconnectBitrix,
  regenerateWebhookSecret,
  setInboundEventsEnabled,
  listBitrixLeads,
  importSelectedBitrixLeads,
  getDealPipelines,
  getDealStages,
  getBitrixUsers,
  listBitrixDeals,
  importSelectedBitrixDeals,
  listSyncRules,
  createSyncRule,
  setSyncRuleActive,
  deleteSyncRule,
  getLeadStatuses,
  testBitrixConnection,
  getEntityFields,
  getConnectionWebhookUrl,
  postCommentToBitrix,
  exportLeadToBitrixNow,
  resolveOwnBitrixUserId,
  listRecentBitrixSyncLogs,
  createExtractionRun,
  listExtractionRuns,
  getExtractionRun,
  cancelExtractionRun,
  deleteExtractionRun,
  downloadExtractionFile,
} from './bitrix.service.js';
import type { ExtractionFileFormat } from './service/extractionFiles.js';
import { requireRole } from '../../../shared/middlewares/requireRole.js';
import { hasRequiredRole } from '../../../lib/auth/authorization.js';

const router = Router();
const managementRoles = requireRole(['ADMIN', 'GESTOR']);
// CLOSER/SDR podem importar/sincronizar Bitrix24 — mas só o próprio dado (ver resolveScopedAssignedById
// abaixo). VISUALIZADOR continua de fora: é o papel só-leitura em todo o resto do produto.
const importRoles = requireRole(['ADMIN', 'GESTOR', 'CLOSER', 'SDR']);

/**
 * Trava o filtro `ASSIGNED_BY_ID` (Bitrix) ao próprio usuário quando ele não é ADMIN/GESTOR — "cada
 * usuário só vê/sincroniza o seu próprio dado do Bitrix". ADMIN/GESTOR continuam com escolha livre
 * (dependem disso o Pipeline CRM e o Comercial Inteligente, que agregam o time inteiro). O
 * casamento com o usuário Bitrix é por e-mail (ver userMapping.ts) — sem coluna nova no schema.
 * `matched: false` sinaliza "papel restrito, mas sem usuário Bitrix com este e-mail" — o chamador
 * decide se isso vira lista vazia ou erro explicativo, mas nunca cai para "sem filtro" (que
 * vazaria o portal inteiro pra quem não devia ver).
 */
async function resolveScopedAssignedById(
  req: Request,
  organizationId: string,
  connectionId: string,
  requestedAssignedById: string | undefined,
): Promise<{ assignedById: string | undefined; restricted: boolean; matched: boolean }> {
  const { role, email } = (req as AuthRequest).user;
  if (hasRequiredRole(role, ['ADMIN', 'GESTOR'])) {
    return { assignedById: requestedAssignedById, restricted: false, matched: true };
  }
  const bitrixUsers = await getBitrixUsers(organizationId, connectionId);
  const ownId = resolveOwnBitrixUserId(bitrixUsers, email);
  return { assignedById: ownId ?? undefined, restricted: true, matched: ownId !== null };
}

// ── Conexões (uma organização pode ter mais de um portal Bitrix — ex.: AtlasGR e TotalTrac) ────

router.get(
  '/connections',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { organizationId } = (req as AuthRequest).user;
      const result = await listBitrixConnections(organizationId);
      res.json({ success: true, data: result });
    } catch (error) {
      next(error);
    }
  },
);

// Valida a URL do webhook contra o Bitrix24 de verdade (chamada real a profile.json) antes de
// salvar — assim um erro de digitação ou token revogado aparece na hora, não só na primeira
// exportação de lead.
router.post(
  '/connect',
  managementRoles,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { organizationId } = (req as AuthRequest).user;
      const { webhookUrl, label } = req.body;
      const result = await connectBitrix(organizationId, webhookUrl, label);
      res.json({ success: true, data: result });
    } catch (error) {
      next(error);
    }
  },
);

router.post(
  '/connections/:connectionId/test',
  managementRoles,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { organizationId } = (req as AuthRequest).user;
      const result = await testBitrixConnection(
        organizationId,
        routeParam(req.params.connectionId, 'connectionId'),
      );
      res.json({ success: true, data: result });
    } catch (error) {
      next(error);
    }
  },
);

router.post(
  '/disconnect/:connectionId',
  managementRoles,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { organizationId } = (req as AuthRequest).user;
      await disconnectBitrix(organizationId, routeParam(req.params.connectionId, 'connectionId'));
      res.json({ success: true });
    } catch (error) {
      next(error);
    }
  },
);

// Gera/substitui o segredo do webhook de ENTRADA (Bitrix → Atlas, ver bitrix.webhook.ts) — o
// valor em texto puro só aparece nesta resposta, a pessoa precisa colar no admin do Bitrix agora.
router.post(
  '/connections/:connectionId/webhook-secret',
  managementRoles,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { organizationId } = (req as AuthRequest).user;
      const result = await regenerateWebhookSecret(
        organizationId,
        routeParam(req.params.connectionId, 'connectionId'),
      );
      res.json({ success: true, data: result });
    } catch (error) {
      next(error);
    }
  },
);

router.put(
  '/connections/:connectionId/inbound-events',
  managementRoles,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { organizationId } = (req as AuthRequest).user;
      const { enabled } = req.body as { enabled?: unknown };
      if (typeof enabled !== 'boolean') {
        res.status(400).json({ success: false, error: 'enabled deve ser booleano.' });
        return;
      }
      await setInboundEventsEnabled(
        organizationId,
        routeParam(req.params.connectionId, 'connectionId'),
        enabled,
      );
      res.json({ success: true });
    } catch (error) {
      next(error);
    }
  },
);

function requireConnectionId(req: Request, res: Response): string | null {
  const connectionId = req.query.connectionId ? String(req.query.connectionId) : '';
  if (!connectionId) {
    res
      .status(400)
      .json({ success: false, error: 'Informe connectionId (qual portal Bitrix consultar).' });
    return null;
  }
  return connectionId;
}

// Lista uma página de leads do Bitrix24 para a pessoa escolher o que importar — nunca grava
// nada sozinho (ver bitrix.service.ts sobre por que a importação é sempre seletiva/manual).
router.get('/leads', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { organizationId } = (req as AuthRequest).user;
    const connectionId = requireConnectionId(req, res);
    if (!connectionId) return;
    const start = Number(req.query.start) || 0;
    const scope = await resolveScopedAssignedById(
      req,
      organizationId,
      connectionId,
      req.query.assignedById ? String(req.query.assignedById) : undefined,
    );
    if (scope.restricted && !scope.matched) {
      res.json({
        success: true,
        data: { leads: [], next: null, total: 0 },
        meta: {
          restricted: true,
          warning:
            'Seu e-mail não corresponde a nenhum usuário deste portal Bitrix24 — peça a um Admin/Gestor para conferir.',
        },
      });
      return;
    }
    const result = await listBitrixLeads(organizationId, connectionId, start, {
      search: req.query.search ? String(req.query.search) : undefined,
      statusId: req.query.statusId ? String(req.query.statusId) : undefined,
      assignedById: scope.assignedById,
      customFieldCode: req.query.customFieldCode ? String(req.query.customFieldCode) : undefined,
      customFieldValue: req.query.customFieldValue ? String(req.query.customFieldValue) : undefined,
    });
    res.json({ success: true, data: result, meta: { restricted: scope.restricted } });
  } catch (error) {
    next(error);
  }
});

router.post(
  '/leads/import',
  importRoles,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { organizationId } = (req as AuthRequest).user;
      const { connectionId, bitrixLeadIds } = req.body as {
        connectionId?: unknown;
        bitrixLeadIds?: unknown;
      };
      if (typeof connectionId !== 'string' || !connectionId) {
        res.status(400).json({ success: false, error: 'connectionId é obrigatório.' });
        return;
      }
      if (!Array.isArray(bitrixLeadIds) || bitrixLeadIds.some((id) => typeof id !== 'string')) {
        res
          .status(400)
          .json({ success: false, error: 'bitrixLeadIds deve ser uma lista de strings.' });
        return;
      }
      const scope = await resolveScopedAssignedById(req, organizationId, connectionId, undefined);
      if (scope.restricted && !scope.matched) {
        res.status(400).json({
          success: false,
          error:
            'Seu e-mail não corresponde a nenhum usuário deste portal Bitrix24 — peça a um Admin/Gestor para conferir.',
        });
        return;
      }
      const result = await importSelectedBitrixLeads(
        organizationId,
        connectionId,
        bitrixLeadIds,
        scope.restricted ? scope.assignedById : undefined,
      );
      res.json({ success: true, data: result });
    } catch (error) {
      next(error);
    }
  },
);

// ── Importação a partir de Deals (Negócios) — funil real com pipeline/etapa ────────────────────

router.get(
  '/deal-pipelines',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { organizationId } = (req as AuthRequest).user;
      const connectionId = requireConnectionId(req, res);
      if (!connectionId) return;
      const result = await getDealPipelines(organizationId, connectionId);
      res.json({ success: true, data: result });
    } catch (error) {
      next(error);
    }
  },
);

router.get(
  '/deal-stages',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { organizationId } = (req as AuthRequest).user;
      const connectionId = requireConnectionId(req, res);
      if (!connectionId) return;
      const categoryId = String(req.query.categoryId || '');
      if (!categoryId) {
        res.status(400).json({ success: false, error: 'Informe categoryId.' });
        return;
      }
      const result = await getDealStages(organizationId, connectionId, categoryId);
      res.json({ success: true, data: result });
    } catch (error) {
      next(error);
    }
  },
);

router.get(
  '/lead-statuses',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { organizationId } = (req as AuthRequest).user;
      const connectionId = requireConnectionId(req, res);
      if (!connectionId) return;
      const result = await getLeadStatuses(organizationId, connectionId);
      res.json({ success: true, data: result });
    } catch (error) {
      next(error);
    }
  },
);

router.get('/users', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { organizationId } = (req as AuthRequest).user;
    const connectionId = requireConnectionId(req, res);
    if (!connectionId) return;
    const result = await getBitrixUsers(organizationId, connectionId);
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
});

// Lista todos os campos (fixos + UF_CRM_* personalizados) de Lead ou Negócio deste portal — a
// tela de importação usa isso para deixar a pessoa escolher, por nome, um campo para filtrar a
// busca (ex.: "Segmento") sem precisar saber o código UF_CRM_ de cor.
router.get('/fields', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { organizationId } = (req as AuthRequest).user;
    const connectionId = requireConnectionId(req, res);
    if (!connectionId) return;
    const entity = req.query.entity === 'lead' ? 'lead' : 'deal';
    const webhookUrl = await getConnectionWebhookUrl(organizationId, connectionId);
    const result = await getEntityFields(webhookUrl, entity);
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
});

router.get('/deals', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { organizationId } = (req as AuthRequest).user;
    const connectionId = requireConnectionId(req, res);
    if (!connectionId) return;
    const start = Number(req.query.start) || 0;
    const month = req.query.month ? Number(req.query.month) : undefined;
    const year = req.query.year ? Number(req.query.year) : undefined;
    const scope = await resolveScopedAssignedById(
      req,
      organizationId,
      connectionId,
      req.query.assignedById ? String(req.query.assignedById) : undefined,
    );
    if (scope.restricted && !scope.matched) {
      res.json({
        success: true,
        data: { deals: [], next: null, total: 0 },
        meta: {
          restricted: true,
          warning:
            'Seu e-mail não corresponde a nenhum usuário deste portal Bitrix24 — peça a um Admin/Gestor para conferir.',
        },
      });
      return;
    }
    const result = await listBitrixDeals(organizationId, connectionId, start, {
      categoryId: req.query.categoryId ? String(req.query.categoryId) : undefined,
      stageId: req.query.stageId ? String(req.query.stageId) : undefined,
      assignedById: scope.assignedById,
      month: Number.isInteger(month) && month! >= 1 && month! <= 12 ? month : undefined,
      year: Number.isInteger(year) && year! > 2000 ? year : undefined,
      search: req.query.search ? String(req.query.search) : undefined,
      customFieldCode: req.query.customFieldCode ? String(req.query.customFieldCode) : undefined,
      customFieldValue: req.query.customFieldValue ? String(req.query.customFieldValue) : undefined,
    });
    res.json({ success: true, data: result, meta: { restricted: scope.restricted } });
  } catch (error) {
    next(error);
  }
});

router.post(
  '/deals/import',
  importRoles,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { organizationId } = (req as AuthRequest).user;
      const { connectionId, bitrixDealIds } = req.body as {
        connectionId?: unknown;
        bitrixDealIds?: unknown;
      };
      if (typeof connectionId !== 'string' || !connectionId) {
        res.status(400).json({ success: false, error: 'connectionId é obrigatório.' });
        return;
      }
      if (!Array.isArray(bitrixDealIds) || bitrixDealIds.some((id) => typeof id !== 'string')) {
        res
          .status(400)
          .json({ success: false, error: 'bitrixDealIds deve ser uma lista de strings.' });
        return;
      }
      const scope = await resolveScopedAssignedById(req, organizationId, connectionId, undefined);
      if (scope.restricted && !scope.matched) {
        res.status(400).json({
          success: false,
          error:
            'Seu e-mail não corresponde a nenhum usuário deste portal Bitrix24 — peça a um Admin/Gestor para conferir.',
        });
        return;
      }
      const result = await importSelectedBitrixDeals(
        organizationId,
        connectionId,
        bitrixDealIds,
        scope.restricted ? scope.assignedById : undefined,
      );
      res.json({ success: true, data: result });
    } catch (error) {
      next(error);
    }
  },
);

// Registra um comentário na timeline do Lead/Deal Bitrix vinculado a este negócio local — usado
// pelo Comercial Inteligente para notificar um risco (estagnação, sem próxima ação etc.) sem sair
// da plataforma. Mesmo gate de ADMIN/GESTOR das outras escritas nesta rota: é uma ação que grava
// no CRM do cliente do outro lado do webhook, não uma leitura.
router.post(
  '/leads/:leadId/comment',
  managementRoles,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { organizationId } = (req as AuthRequest).user;
      const { comment } = req.body as { comment?: unknown };
      if (typeof comment !== 'string' || !comment.trim()) {
        res.status(400).json({ success: false, error: 'comment é obrigatório.' });
        return;
      }
      const result = await postCommentToBitrix(
        organizationId,
        routeParam(req.params.leadId, 'leadId'),
        comment.trim(),
      );
      res.json({ success: true, data: result });
    } catch (error) {
      next(error);
    }
  },
);

// Exporta/atualiza um lead individual para o Bitrix24 manualmente sob demanda (botão "Enviar para o Bitrix")
router.post(
  '/leads/:leadId/export',
  importRoles,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { organizationId } = (req as AuthRequest).user;
      const { connectionId, statusId, assignedById } = req.body as {
        connectionId?: unknown;
        statusId?: unknown;
        assignedById?: unknown;
      };
      const result = await exportLeadToBitrixNow(
        organizationId,
        routeParam(req.params.leadId, 'leadId'),
        typeof connectionId === 'string' ? connectionId : undefined,
        {
          statusId: typeof statusId === 'string' ? statusId : undefined,
          assignedById: typeof assignedById === 'string' ? assignedById : undefined,
        },
      );
      res.json({ success: true, data: result });
    } catch (error) {
      next(error);
    }
  },
);

// Exporta leads em lote para o Bitrix24 sob demanda
router.post(
  '/leads/export-batch',
  importRoles,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { organizationId } = (req as AuthRequest).user;
      const { leadIds, connectionId } = req.body as { leadIds?: unknown; connectionId?: unknown };
      if (Array.isArray(leadIds) && leadIds.length > 0) {
        let exportedCount = 0;
        let skippedCount = 0;
        for (const id of leadIds) {
          if (typeof id === 'string') {
            try {
              await exportLeadToBitrixNow(
                organizationId,
                id,
                typeof connectionId === 'string' ? connectionId : undefined,
              );
              exportedCount++;
            } catch {
              skippedCount++;
            }
          }
        }
        res.json({ success: true, data: { exportedCount, skippedCount, total: leadIds.length } });
        return;
      }
      const result = await exportLeadToBitrixNow(
        organizationId,
        'all',
        typeof connectionId === 'string' ? connectionId : undefined,
      );
      res.json({ success: true, data: result });
    } catch (error) {
      next(error);
    }
  },
);

// ── Sincronização automática (regras) ───────────────────────────────────────────────────────

router.get(
  '/sync-rules',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { organizationId } = (req as AuthRequest).user;
      const connectionId = requireConnectionId(req, res);
      if (!connectionId) return;
      const result = await listSyncRules(organizationId, connectionId);
      res.json({ success: true, data: result });
    } catch (error) {
      next(error);
    }
  },
);

// CLOSER/SDR podem criar a PRÓPRIA regra (ver importRoles) — o ASSIGNED_BY_ID é travado no próprio
// usuário pela mesma resolveScopedAssignedById das rotas de listagem/import acima, então uma regra
// criada por um vendedor nunca traz o dado de outra pessoa. Editar/remover uma regra já existente
// (PUT/DELETE abaixo) continua só ADMIN/GESTOR — mudar automação que já está rodando é ação de
// gestão, criar a sua própria não precisa passar por um gestor.
router.post(
  '/sync-rules',
  importRoles,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { organizationId } = (req as AuthRequest).user;
      const { connectionId, source, categoryId, stageId, assignedById } = req.body as {
        connectionId?: unknown;
        source?: unknown;
        categoryId?: unknown;
        stageId?: unknown;
        assignedById?: unknown;
      };
      if (typeof connectionId !== 'string' || !connectionId) {
        res.status(400).json({ success: false, error: 'connectionId é obrigatório.' });
        return;
      }
      if (source !== 'lead' && source !== 'deal') {
        res.status(400).json({ success: false, error: 'source deve ser "lead" ou "deal".' });
        return;
      }
      if (source === 'deal' && (typeof categoryId !== 'string' || !categoryId)) {
        res
          .status(400)
          .json({ success: false, error: 'categoryId é obrigatório para regras de Negócio.' });
        return;
      }
      const scope = await resolveScopedAssignedById(
        req,
        organizationId,
        connectionId,
        typeof assignedById === 'string' ? assignedById : undefined,
      );
      if (scope.restricted && !scope.matched) {
        res.status(400).json({
          success: false,
          error:
            'Seu e-mail não corresponde a nenhum usuário deste portal Bitrix24 — peça a um Admin/Gestor para conferir.',
        });
        return;
      }
      const result = await createSyncRule(organizationId, {
        connectionId,
        source,
        categoryId: typeof categoryId === 'string' ? categoryId : null,
        stageId: typeof stageId === 'string' ? stageId : null,
        assignedById: scope.assignedById ?? null,
      });
      res.json({ success: true, data: result });
    } catch (error) {
      next(error);
    }
  },
);

router.put(
  '/sync-rules/:id',
  managementRoles,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { organizationId } = (req as AuthRequest).user;
      const { active } = req.body as { active?: unknown };
      if (typeof active !== 'boolean') {
        res.status(400).json({ success: false, error: 'active deve ser booleano.' });
        return;
      }
      const result = await setSyncRuleActive(
        organizationId,
        routeParam(req.params.id, 'id'),
        active,
      );
      res.json({ success: true, data: result });
    } catch (error) {
      next(error);
    }
  },
);

router.delete(
  '/sync-rules/:id',
  managementRoles,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { organizationId } = (req as AuthRequest).user;
      await deleteSyncRule(organizationId, routeParam(req.params.id, 'id'));
      res.json({ success: true });
    } catch (error) {
      next(error);
    }
  },
);

// Histórico real de sincronização Bitrix24 (webhook de entrada + push/pull automático/manual) —
// única fonte real por trás da tela "Webhooks & Monitor" (ver WebhookMonitor.tsx e o achado da
// Onda 1/Roadmap v2 no comentário de topo de service/syncLogs.ts sobre a telemetria fabricada que
// existia aqui antes). Aberta a qualquer papel autenticado, mesmo padrão de leitura de status das
// outras integrações (ver `canManage` em Integrations.tsx: qualquer usuário pode VER status, só
// conectar/desconectar/testar exige Gestor/Admin).
router.get('/sync-logs', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { organizationId } = (req as AuthRequest).user;
    const take = req.query.take ? Number(req.query.take) : undefined;
    const result = await listRecentBitrixSyncLogs(organizationId, take);
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
});

// ── Extrações (Onda 7, Agente 06/06A) ───────────────────────────────────────────────────────
//
// Restrito a ADMIN/GESTOR (diferente de importRoles): uma extração pode trazer TODO o dado
// pessoal de leads/negócios/empresas/contatos de uma organização inteira de uma vez (não um
// registro escolhido a dedo como a importação manual) — minimização de acesso por padrão da
// seção LGPD de /AGENTS.md, não uma trava arbitrária.

router.get(
  '/extractions',
  managementRoles,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { organizationId } = (req as AuthRequest).user;
      const take = req.query.take ? Number(req.query.take) : undefined;
      const result = await listExtractionRuns(organizationId, take);
      res.json({ success: true, data: result });
    } catch (error) {
      next(error);
    }
  },
);

router.post(
  '/extractions',
  managementRoles,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { organizationId, id: userId } = (req as AuthRequest).user;
      const { connectionId, entities, fields, filters } = req.body as {
        connectionId?: unknown;
        entities?: unknown;
        fields?: unknown;
        filters?: unknown;
      };
      if (typeof connectionId !== 'string' || !connectionId) {
        res.status(400).json({ success: false, error: 'connectionId é obrigatório.' });
        return;
      }
      if (!Array.isArray(entities) || entities.some((e) => typeof e !== 'string')) {
        res.status(400).json({ success: false, error: 'entities deve ser uma lista de strings.' });
        return;
      }
      if (
        !filters ||
        typeof filters !== 'object' ||
        typeof (filters as { period?: unknown }).period !== 'string'
      ) {
        res.status(400).json({ success: false, error: 'filters.period é obrigatório.' });
        return;
      }
      const result = await createExtractionRun(organizationId, userId, {
        connectionId,
        entities: entities as string[],
        fields:
          fields && typeof fields === 'object' ? (fields as Record<string, string[]>) : undefined,
        filters: filters as {
          period: string;
          customFrom?: string;
          customTo?: string;
          categoryId?: string;
          stageId?: string;
          assignedById?: string;
          search?: string;
        },
      });
      res.status(201).json({ success: true, data: result });
    } catch (error) {
      next(error);
    }
  },
);

router.get(
  '/extractions/:id',
  managementRoles,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { organizationId } = (req as AuthRequest).user;
      const result = await getExtractionRun(organizationId, routeParam(req.params.id, 'id'));
      res.json({ success: true, data: result });
    } catch (error) {
      next(error);
    }
  },
);

router.post(
  '/extractions/:id/cancel',
  managementRoles,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { organizationId } = (req as AuthRequest).user;
      await cancelExtractionRun(organizationId, routeParam(req.params.id, 'id'));
      res.json({ success: true });
    } catch (error) {
      next(error);
    }
  },
);

router.delete(
  '/extractions/:id',
  managementRoles,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { organizationId } = (req as AuthRequest).user;
      await deleteExtractionRun(organizationId, routeParam(req.params.id, 'id'));
      res.json({ success: true });
    } catch (error) {
      next(error);
    }
  },
);

const EXTRACTION_DOWNLOAD_FORMATS: readonly string[] = ['csv', 'xlsx', 'json'];

router.get(
  '/extractions/:id/download',
  managementRoles,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { organizationId } = (req as AuthRequest).user;
      const format = String(req.query.format || '');
      if (!EXTRACTION_DOWNLOAD_FORMATS.includes(format)) {
        res.status(400).json({ success: false, error: 'format deve ser csv, xlsx ou json.' });
        return;
      }
      const entity = req.query.entity ? String(req.query.entity) : undefined;
      const { buffer, filename, contentType } = await downloadExtractionFile(
        organizationId,
        routeParam(req.params.id, 'id'),
        format as ExtractionFileFormat,
        entity,
      );
      res.setHeader('Content-Type', contentType);
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.send(buffer);
    } catch (error) {
      next(error);
    }
  },
);

export const bitrixRoutes = router;
