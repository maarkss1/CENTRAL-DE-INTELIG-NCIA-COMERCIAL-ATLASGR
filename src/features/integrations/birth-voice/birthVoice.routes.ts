import { Router, type Request, type Response, type NextFunction } from 'express';
import { z } from 'zod';
import type { AuthRequest } from '../../../shared/middlewares/authenticateToken.js';
import { prisma } from '../../../lib/prisma.js';
import { routeParam } from '../../../shared/http/routeParams.js';
import {
  callLead,
  BirthVoiceNotConfiguredError,
  NoPhoneNumberError,
  SuppressedNumberError,
} from './birthVoice.service.js';
import { PiiConsentRequiredError } from '../../intelligence/services/guardrails.service.js';
import {
  listSuppressions,
  recordOptOut,
  normalizeSuppressionKey,
} from './callSuppression.service.js';
import { enabledOrganizations, callWindowFromEnv, dialPolicyFromEnv } from './coldCall.service.js';
import { requireRole } from '../../../shared/middlewares/requireRole.js';

const router = Router();

// Status da campanha de prospecção fria: até aqui, a única forma de saber se ela existe e o que
// fez era ler `.env` e grep no log — nenhuma tela mostrava nada disto.
router.get(
  '/cold-call/status',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { organizationId } = (req as AuthRequest).user;
      const enabled = (await enabledOrganizations()).includes(organizationId);
      const recentRuns = await prisma.coldCallRun.findMany({
        where: { organizationId },
        orderBy: { runAt: 'desc' },
        take: 20,
      });
      res.json({
        success: true,
        data: {
          enabled,
          window: callWindowFromEnv(),
          policy: dialPolicyFromEnv(),
          recentRuns,
        },
      });
    } catch (error) {
      next(error);
    }
  },
);

// Dispara uma ligação do SDR de voz para o lead informado.
router.post(
  '/call/:leadId',
  requireRole(['ADMIN', 'GESTOR', 'CLOSER', 'SDR']),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { organizationId } = (req as AuthRequest).user;
      const agentType = req.body.agentType || 'sdr';
      const result = await callLead(
        organizationId,
        routeParam(req.params.leadId, 'leadId'),
        agentType,
      );
      res.status(202).json({ success: true, data: result });
    } catch (error) {
      // Mesmo status/formato usado em intelligence.routes.ts para o mesmo erro — ver
      // guardrails.service.ts:assertPiiExternalConsent.
      if (error instanceof PiiConsentRequiredError) {
        res.status(403).json({ success: false, error: error.message });
        return;
      }
      if (error instanceof BirthVoiceNotConfiguredError) {
        res.status(503).json({ success: false, error: error.message });
        return;
      }
      if (error instanceof NoPhoneNumberError) {
        res.status(422).json({ success: false, error: error.message });
        return;
      }
      // 409 e não 422: o pedido está bem formado e o lead é discável — o que impede a ligação é o
      // estado atual (opt-out registrado), e a distinção importa para a tela dizer o motivo certo.
      if (error instanceof SuppressedNumberError) {
        res.status(409).json({ success: false, error: error.message });
        return;
      }
      next(error);
    }
  },
);

// Lista interna de bloqueio, para a operação conseguir auditar quem está fora da discagem e por quê.
router.get(
  '/suppressions',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { organizationId } = (req as AuthRequest).user;
      const data = await listSuppressions(organizationId);
      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  },
);

const addSuppressionSchema = z.object({
  phone: z.string().min(1, 'Informe o telefone a bloquear.'),
  reason: z.string().max(500).optional(),
  leadId: z.string().optional(),
});

// Bloqueio manual — pedido que chegou por outro canal (e-mail, WhatsApp, atendimento humano).
// CLOSER/SDR também podem registrar: opt-out é uma obrigação imediata do atendimento e não deve
// depender da disponibilidade de um gestor. VISUALIZADOR continua estritamente somente leitura.
router.post(
  '/suppressions',
  requireRole(['ADMIN', 'GESTOR', 'CLOSER', 'SDR']),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { organizationId } = (req as AuthRequest).user;
      const parsed = addSuppressionSchema.safeParse(req.body);
      if (!parsed.success) {
        res
          .status(400)
          .json({ success: false, error: parsed.error.issues[0]?.message ?? 'Dados inválidos.' });
        return;
      }

      // Recusa antes de gravar em vez de gravar um bloqueio que nunca vai casar com nada: o
      // número é a chave, e uma chave que não normaliza é um bloqueio silenciosamente inútil.
      if (!normalizeSuppressionKey(parsed.data.phone)) {
        res.status(422).json({
          success: false,
          error: 'Telefone fora de um formato brasileiro discável — não é possível bloqueá-lo.',
        });
        return;
      }

      await recordOptOut({
        organizationId,
        phone: parsed.data.phone,
        source: 'manual',
        reason: parsed.data.reason ?? null,
        leadId: parsed.data.leadId ?? null,
      });
      res.status(201).json({ success: true });
    } catch (error) {
      next(error);
    }
  },
);

export const birthVoiceRoutes = router;
