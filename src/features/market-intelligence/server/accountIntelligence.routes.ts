import { Router } from 'express';

/**
 * Tombstone temporário para clientes antigos após a retirada de Market Intelligence do produto.
 * Mantém uma resposta explícita em vez de permitir que chamadas antigas caiam em rotas genéricas.
 */
const router = Router();

router.use((_req, res) => {
  res.status(410).json({
    success: false,
    error: 'Market Intelligence foi removido da plataforma.',
  });
});

export const accountIntelligenceRoutes = router;
