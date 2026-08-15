- De: Agente 13 (Enxame Autônomo e Governança de Agentes)
- Para: Agente 07 (IA e Automações)
- Onda: 7
- Status: aberto
- Prioridade: normal

## Problema

`AUTONOMIA_COMERCIAL_24X7.md` pede, na seção final, um "painel de SLO por agente: cobertura,
conversão, custo, latência, erro e override humano". Implementei a fonte de dados real e o painel
de UI (dentro do meu escopo), mas a rota HTTP que os liga vive em `agent.routes.ts`, que é seu
(`src/features/intelligence/**` exceto os arquivos listados como meus na matriz da onda). Não
editei esse arquivo para respeitar a propriedade exclusiva da onda.

## Arquivo(s) envolvido(s)

- `src/features/intelligence/routes/agent.routes.ts` (seu — precisa da rota nova)
- `src/features/intelligence/services/swarmScheduler.service.ts` (meu — já exporta
  `getSwarmSloSnapshot`, pronta para uso, com testes em
  `tests/unit/features/intelligence/services/swarmScheduler.sloSnapshot.test.ts` e uma prova
  ponta a ponta em `tests/integration/swarm-autonomous-mission-e2e.test.ts`)
- `src/features/intelligence/components/SwarmDashboard.tsx` (meu — já tem a aba "SLO por agente"
  pronta, consumindo `GET /api/agent/swarm/slo?days=30` via `api.get<SwarmSloSnapshot>(...)`; sem
  a rota, a aba mostra um estado de erro explícito, não quebra nem fabrica dado)

## Alteração necessária

Adicionar ao final de `agent.routes.ts` (mesmo padrão de `authenticateToken`/`requireTenant` já
aplicado no restante do router, ver como `server.ts` monta `/api/agent`):

```ts
import { getSwarmSloSnapshot } from '../services/swarmScheduler.service.js';

const sloQuerySchema = z.object({
    days: z.coerce.number().int().min(1).max(90).optional(),
});

router.get('/swarm/slo', validateRequest(sloQuerySchema, 'query'), async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { organizationId } = (req as AuthRequest).user;
        const { days } = req.query as unknown as z.infer<typeof sloQuerySchema>;
        const snapshot = await getSwarmSloSnapshot(organizationId, days ?? 30);
        res.json(snapshot);
    } catch (err) {
        next(err);
    }
});
```

Ajuste a assinatura de `validateRequest` conforme o padrão real do seu router para querystring (o
resto do arquivo hoje só valida `body`; se `validateRequest` não suportar `query` ainda, um parse
manual com `sloQuerySchema.safeParse(req.query)` resolve sem depender de mudança no middleware).

`organizationId` **precisa** vir de `req.user` (sessão autenticada), nunca de querystring/header —
mesmo padrão já usado no restante do arquivo e em `lgpd.routes.ts`.

## Teste esperado

- `GET /api/agent/swarm/slo` sem organização autenticada → 401 (padrão do middleware).
- `GET /api/agent/swarm/slo?days=30` autenticado → 200 com o shape de `SwarmSloSnapshot` (ver
  interface espelhada em `SwarmDashboard.tsx`, topo do arquivo).
- `days` fora de 1–90 → 400 (validação).

## Contexto adicional

Não é necessário handoff para o Agente 02 (rota de página/menu): a aba "SLO por agente" foi
implementada como uma segunda visão *dentro* do `SwarmDashboard.tsx` já existente (aba "Enxame
Autônomo" do Hub de IA) — não criei rota nem entrada de menu nova, evitando escopo fora do pedido
original da constituição de design (`CLAUDE.md` §13).
