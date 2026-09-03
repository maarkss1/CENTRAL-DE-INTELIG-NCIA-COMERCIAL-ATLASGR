import { Router, type Request, type Response, type NextFunction } from 'express';
import type { AuthRequest } from '../../shared/middlewares/authenticateToken.js';
import { requireRole } from '../../shared/middlewares/requireRole.js';
import { lgpdService } from './lgpd.service.js';
import { AuditService } from '../../lib/audit/audit.service.js';
import { routeParam } from '../../shared/http/routeParams.js';

export const lgpdRouter = Router();

// Exclusão / Anonimização de Titular (LGPD Art. 18) — irreversível, por isso exige um papel
// mínimo (ADMIN/GESTOR), mesmo padrão de src/features/commercial-intelligence/routes/
// commercialIntelligence.routes.ts. Este router é montado em server.ts com
// `authenticateToken, requireTenant`, então `req.user` sempre existe aqui.
lgpdRouter.delete(
  '/titular/:contactId',
  requireRole(['ADMIN', 'GESTOR']),
  (req: Request, res: Response, next: NextFunction): void => {
    (async () => {
      // organizationId vem exclusivamente do usuário autenticado (req.user, populado por
      // authenticateToken a partir da sessão) — nunca de um header controlado pelo cliente.
      // Um fallback para `x-organization-id` aqui permitiria que qualquer requisição forjasse
      // esse header e apagasse/anonimizasse dados de OUTRO tenant.
      const { organizationId, id: actorId } = (req as AuthRequest).user;
      const contactId = routeParam(req.params.contactId, 'contactId');
      const result = await lgpdService.eraseContact(organizationId, contactId, actorId);

      // Registro explícito, além do UPDATE genérico de Contact que a extensão de auditoria do
      // Prisma já grava (src/lib/prisma.ts) — este identifica claramente, para quem lê a trilha em
      // AuditLogs.tsx, que a ação foi um exercício do direito de exclusão/anonimização (LGPD art.
      // 18), não uma edição de cadastro comum.
      await AuditService.log({
        action: 'DELETE',
        entity: 'LGPD_TITULAR',
        entityId: contactId,
        actorId,
        tenantId: organizationId,
        ipAddress: req.ip,
        afterState: { ...result },
      });

      res.json({
        message: 'Dados do titular anonimizados com sucesso.',
        result,
      });
    })().catch(next);
  },
);

// Exportação / Portabilidade de Titular (LGPD Art. 18 V) — mesmo papel mínimo da exclusão acima:
// os dados exportados aqui (nome, e-mail, telefone, WhatsApp, LinkedIn, observações) são o PII
// completo do titular; sem essa checagem, qualquer usuário autenticado do tenant (ex.: SDR)
// conseguia baixar o dossiê completo de qualquer contato, não só ADMIN/GESTOR.
lgpdRouter.get(
  '/titular/:contactId/export',
  requireRole(['ADMIN', 'GESTOR']),
  (req: Request, res: Response, next: NextFunction): void => {
    (async () => {
      // Mesmo raciocínio da rota de exclusão acima: organizationId só do usuário autenticado.
      const { organizationId, id: actorId } = (req as AuthRequest).user;
      const contactId = routeParam(req.params.contactId, 'contactId');
      const data = await lgpdService.exportContactData(organizationId, contactId);

      // Rota só de leitura — não passa pela extensão de auditoria do Prisma (que só cobre
      // create/update/delete, ver src/lib/prisma.ts), então sem este registro explícito o
      // download completo de PII de um titular não deixava nenhum rastro em AuditLog.
      await AuditService.log({
        action: 'EXPORT',
        entity: 'LGPD_TITULAR',
        entityId: contactId,
        actorId,
        tenantId: organizationId,
        ipAddress: req.ip,
      });

      res.json(data);
    })().catch(next);
  },
);

// Listagem de Logs de Auditoria de Segurança & LGPD
lgpdRouter.get(
  '/audit-logs',
  requireRole(['ADMIN', 'GESTOR']),
  (req: Request, res: Response, next: NextFunction): void => {
    (async () => {
      const { organizationId } = (req as AuthRequest).user;
      const limit = Math.min(Number(req.query.limit) || 50, 100);
      const { prisma } = await import('../../lib/prisma.js');

      const logs = await prisma.auditLog.findMany({
        where: {
          tenantId: organizationId,
        },
        orderBy: {
          timestamp: 'desc',
        },
        take: limit,
      });

      // ACHADO REAL (Piloto 025): a resposta trazia `logs` na raiz em vez de `data` — o cliente
      // HTTP genérico (`src/lib/api.ts`) sempre desembrulha `data.data`, então
      // `api.get('/api/lgpd/audit-logs')` sempre devolvia `undefined` pra qualquer chamador. A
      // aba "Auditoria & LGPD" nunca mostrou nenhum log, pra nenhum usuário, desde sempre.
      res.json({
        success: true,
        data: { logs },
      });
    })().catch(next);
  },
);
