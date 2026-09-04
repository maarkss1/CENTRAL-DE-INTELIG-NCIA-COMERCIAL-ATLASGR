import { Router } from 'express';

/** Compatibilidade explícita para consumidores antigos do catálogo removido. */
const router = Router();

router.use((_req, res) => {
  res.status(410).json({
    success: false,
    error: 'O catálogo de Market Intelligence foi removido da plataforma.',
  });
});

export const marketIntelligenceCompanyRoutes = router;
