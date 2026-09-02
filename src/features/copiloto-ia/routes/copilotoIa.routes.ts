import { Router } from 'express';
import { container } from '../../../shared/di/container.js';
import { requireRole } from '../../../shared/middlewares/requireRole.js';
import { COPILOTO_IA_ROLES } from '../../../lib/auth/authorization.js';
import type { CopilotoIaController } from '../presentation/CopilotoIaController.js';

const router = Router();

// Camada de autorização própria da rota, além de `authenticateToken`/`requireTenant` já aplicados
// no mount de `src/bootstrap/routes.ts` — defesa em profundidade, mesmo padrão de
// `commercial-intelligence`/`mesa-tratamento`.
router.use(requireRole([...COPILOTO_IA_ROLES]));

function resolve(): CopilotoIaController {
  return container.resolve<CopilotoIaController>('CopilotoIaController');
}

router.post('/conversations', (req, res, next) => resolve().createConversation(req, res, next));
router.get('/conversations', (req, res, next) => resolve().listConversations(req, res, next));
router.get('/conversations/:id', (req, res, next) => resolve().getConversation(req, res, next));
router.post('/conversations/:id/start', (req, res, next) => resolve().startCapture(req, res, next));
router.post('/conversations/:id/stop', (req, res, next) => resolve().stopCapture(req, res, next));
router.post('/conversations/:id/ready', (req, res, next) => resolve().markReady(req, res, next));
router.post('/conversations/:id/fail', (req, res, next) => resolve().markFailed(req, res, next));
router.post('/conversations/:id/cancel', (req, res, next) => resolve().cancel(req, res, next));
router.post('/conversations/:id/consent', (req, res, next) =>
  resolve().recordConsent(req, res, next),
);
router.post('/conversations/:id/audio/upload-url', (req, res, next) =>
  resolve().requestAudioUploadUrl(req, res, next),
);
router.post('/conversations/:id/audio/complete', (req, res, next) =>
  resolve().completeAudioUpload(req, res, next),
);
router.post('/conversations/:id/transcript-segments', (req, res, next) =>
  resolve().addTranscriptSegments(req, res, next),
);
router.post('/conversations/:id/insights', (req, res, next) =>
  resolve().createInsight(req, res, next),
);
router.get('/conversations/:id/insights', (req, res, next) =>
  resolve().listInsights(req, res, next),
);
router.post('/conversations/:id/crm-field-suggestions', (req, res, next) =>
  resolve().createCrmFieldSuggestion(req, res, next),
);
router.patch('/crm-field-suggestions/:id/approve', (req, res, next) =>
  resolve().approveCrmFieldSuggestion(req, res, next),
);
router.patch('/crm-field-suggestions/:id/reject', (req, res, next) =>
  resolve().rejectCrmFieldSuggestion(req, res, next),
);
router.get('/leads/:leadId/deal-health', (req, res, next) =>
  resolve().listDealHealthSnapshots(req, res, next),
);
router.post('/leads/:leadId/deal-health', (req, res, next) =>
  resolve().createDealHealthSnapshot(req, res, next),
);

export const copilotoIaRoutes = router;
