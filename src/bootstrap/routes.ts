import type { Express } from 'express';
import { authenticateToken, type AuthRequest } from '../shared/middlewares/authenticateToken.js';
import { requireTenant } from '../shared/middlewares/authorization.js';
import { requireRole } from '../shared/middlewares/requireRole.js';
import { COMMERCIAL_INTELLIGENCE_ROLES, COPILOTO_IA_ROLES } from '../lib/auth/authorization.js';
import { sseService } from '../features/notifications/sse.service.js';

import { intelligenceRoutes } from '../features/intelligence/routes/intelligence.routes.js';
import { promptRoutes } from '../features/intelligence/routes/prompt.routes.js';
import { companyRoutes } from '../features/companies/routes/company.routes.js';
import { contactRoutes } from '../features/contacts/routes/contact.routes.js';
import { leadRoutes } from '../features/crm/routes/lead.routes.js';
import { crm360Routes } from '../features/crm360/routes/crm360.routes.js';
import { qualificationMatrixRoutes } from '../features/playbook/qualification-matrix/routes/qualification-matrix.routes.js';
import { objectionMatrixRoutes } from '../features/playbook/objection-matrix/routes/objection-matrix.routes.js';
import { activityRoutes } from '../features/activities/routes/activity.routes.js';
import { mesaTratamentoRoutes } from '../features/mesa-tratamento/routes/mesaTratamento.routes.js';
import { prospectingRoutes } from '../features/prospecting/routes/prospecting.routes.js';
import { prospectingToolsRoutes } from '../features/prospecting/routes/prospecting-tools.routes.js';
import { noteRoutes } from '../features/notes/routes/note.routes.js';
import { analyticsRoutes } from '../features/analytics/routes/analytics.routes.js';
import { eventsRoutes } from '../features/analytics/routes/events.routes.js';
import { commercialIntelligenceRoutes } from '../features/commercial-intelligence/routes/commercialIntelligence.routes.js';
import { copilotoIaRoutes } from '../features/copiloto-ia/routes/copilotoIa.routes.js';
import { whatsappRoutes } from '../features/integrations/whatsapp/whatsapp.routes.js';
import { birthVoiceRoutes } from '../features/integrations/birth-voice/birthVoice.routes.js';
import { googleRoutes } from '../features/integrations/google/google.routes.js';
import { bitrixRoutes } from '../features/integrations/bitrix/bitrix.routes.js';
import { teamRoutes } from '../features/team/routes/team.routes.js';
import { authExtraRoutes } from '../features/auth/routes/auth-extra.routes.js';
import { agentRoutes } from '../features/intelligence/routes/agent.routes.js';
import { knowledgeRoutes } from '../features/knowledge/knowledge.routes.js';
import { notificationRoutes } from '../features/notifications/notification.routes.js';
import { automationRoutes } from '../features/automations/routes/automation.routes.js';
import { usageRoutes } from '../features/billing/routes/usage.routes.js';
import { cadenceRoutes } from '../features/cadence/cadence.routes.js';
import {
  publicBookingRouter,
  privateBookingRouter,
} from '../features/calendar/routes/booking.routes.js';
import { lgpdRouter } from '../features/lgpd/lgpd.routes.js';
import { featureFlagsRouter } from '../features/feature-flags/routes/featureFlags.routes.js';
import { bugReportRouter } from '../features/bug-reports/routes/bugReport.routes.js';
import { threecxRoutes } from '../features/integrations/threecx/threecx.routes.js';
import { gamificationRoutes } from '../features/gamification/routes/gamification.routes.js';

/**
 * Monta todas as rotas de API protegidas (autenticação + tenant + papel, conforme o módulo) e o
 * fallback 404 de `/api/*`. Deve ser montado depois do parser JSON, do handler de auth e do
 * BullBoard, e antes do fallback de frontend — mesma posição do server.ts original.
 */
export function mountFeatureRoutes(app: Express): void {
  app.use('/api/companies', authenticateToken, requireTenant, companyRoutes);
  app.use('/api/contacts', authenticateToken, requireTenant, contactRoutes);
  app.use('/api/leads', authenticateToken, requireTenant, leadRoutes);
  app.use('/api/crm', authenticateToken, requireTenant, crm360Routes);
  app.use(
    '/api/playbook/qualification-matrix',
    authenticateToken,
    requireTenant,
    qualificationMatrixRoutes,
  );
  app.use(
    '/api/playbook/objection-matrix',
    authenticateToken,
    requireTenant,
    objectionMatrixRoutes,
  );
  app.use('/api/leads/:leadId/notes', authenticateToken, requireTenant, noteRoutes);
  app.use('/api/activities', authenticateToken, requireTenant, activityRoutes);
  app.use('/api/mesa-tratamento', authenticateToken, requireTenant, mesaTratamentoRoutes);
  app.use('/api/prospecting', authenticateToken, requireTenant, prospectingRoutes);
  app.use('/api/prospecting/tools', authenticateToken, requireTenant, prospectingToolsRoutes);
  // authenticateToken já rodou pra estas 3 (junto com o aiLimiter, ver SEC-008b em rateLimiters.ts) —
  // só falta requireTenant aqui, chamar de novo seria uma segunda consulta de sessão redundante.
  app.use('/api/intelligence', requireTenant, intelligenceRoutes);
  app.use('/api/prompts', authenticateToken, requireTenant, promptRoutes);
  app.use('/api/analytics', authenticateToken, requireTenant, analyticsRoutes);
  app.use('/api/events', authenticateToken, requireTenant, eventsRoutes);
  // Comercial Inteligente — módulo executivo restrito (ver AGENTS.md/CLAUDE.md e
  // src/lib/auth/authorization.ts). `requireRole` aqui é defesa em profundidade: o router em
  // commercialIntelligence.routes.ts já se protege sozinho (router.use(requireRole(...))), mas
  // o mount explícito garante que NENHUM caminho de acesso a este módulo (direto por URL,
  // include futuro em outro arquivo, etc.) escapa da checagem de papel no servidor.
  app.use(
    '/api/commercial-intelligence',
    authenticateToken,
    requireTenant,
    requireRole([...COMMERCIAL_INTELLIGENCE_ROLES]),
    commercialIntelligenceRoutes,
  );
  // Copiloto Comercial IA (fundação — Onda 1). `requireRole` aqui é defesa em profundidade: o
  // router em copilotoIa.routes.ts já se protege sozinho (router.use(requireRole(...))), mesmo
  // desenho do mount de Comercial Inteligente logo acima.
  app.use(
    '/api/copiloto-ia',
    authenticateToken,
    requireTenant,
    requireRole([...COPILOTO_IA_ROLES]),
    copilotoIaRoutes,
  );
  app.use('/api/knowledge', requireTenant, knowledgeRoutes);
  app.use('/api/lgpd', authenticateToken, requireTenant, lgpdRouter);
  app.use('/api/feature-flags', authenticateToken, requireTenant, featureFlagsRouter);
  // authenticateToken + bugReportLimiter já rodaram pra esta rota (ver rateLimiters.ts) — só
  // falta requireTenant aqui, mesmo padrão de /api/intelligence.
  app.use('/api/bug-reports', requireTenant, bugReportRouter);
  app.use('/api/notifications', authenticateToken, requireTenant, notificationRoutes);

  app.get('/api/notifications/stream', authenticateToken, requireTenant, (req, res) => {
    const { organizationId } = (req as AuthRequest).user;
    sseService.addClient(req, res, organizationId);
  });

  app.use('/api/automations', authenticateToken, requireTenant, automationRoutes);
  // ADMIN-only: consumo/custo de IA da organização. A Sidebar (src/components/layout/Sidebar.tsx)
  // já trata este item como admin-only na navegação — este era o lado que faltava (rota
  // administrativa sem autorização real por cargo, achado da Onda 1/Roadmap v2, Agente 02).
  app.use(
    '/api/usage',
    authenticateToken,
    requireTenant,
    requireRole(['ADMIN', 'GESTOR']),
    usageRoutes,
  );
  // Coaching semanal por IA (Piloto 007) — cada vendedor só gera o próprio, sem restrição de papel.
  app.use('/api/gamification', authenticateToken, requireTenant, gamificationRoutes);
  app.use('/api/whatsapp', authenticateToken, requireTenant, whatsappRoutes);
  app.use('/api/integrations/birth-voice', authenticateToken, requireTenant, birthVoiceRoutes);
  app.use('/api/integrations/3cx', authenticateToken, requireTenant, threecxRoutes);
  app.use('/api/google', authenticateToken, requireTenant, googleRoutes);
  app.use('/api/bitrix', authenticateToken, requireTenant, bitrixRoutes);
  app.use('/api/team', authenticateToken, requireTenant, teamRoutes);
  app.use('/api/auth-extra', authenticateToken, requireTenant, authExtraRoutes);
  app.use('/api/agent', requireTenant, agentRoutes);
  app.use('/api/cadence', authenticateToken, requireTenant, cadenceRoutes);
  app.use('/api/calendar/booking-links', privateBookingRouter);
  app.use('/api/calendar/book', publicBookingRouter);

  // Qualquer /api/* que não bateu em nenhuma rota acima deve 404 aqui, e nunca
  // cair no fallback do Vite/SPA (mountFrontend, em frontend.ts): em dev, `vite.middlewares`
  // reprocessa requisições sem arquivo correspondente e isso re-executa toda a cadeia de
  // middlewares (incluindo o apiLimiter) repetidamente para a mesma requisição,
  // estourando o rate limit em segundos com uma única chamada a um endpoint
  // inexistente (ex.: /api/analytics/overview, que nunca teve rota registrada).
  app.use('/api', (_req, res) => {
    res.status(404).json({ success: false, error: 'Not found' });
  });
}
