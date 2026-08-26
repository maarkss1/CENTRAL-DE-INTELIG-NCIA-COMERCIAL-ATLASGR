- De: Agente 15 — Segurança Aplicada e Rotação de Segredos
- Para: Agente 00 — Coordenador
- Onda: roadmap-v2-transversais
- Status: resolvido
- Prioridade: normal

## Problema

`auditAccessMiddleware` (`src/lib/security/auditLog.middleware.ts`) — factory de middleware
Express que grava `AuditService.log` com `action: EXPORT|DELETE|UPDATE` por entidade, a partir
exclusivamente de `req.user.organizationId` (tenant nunca vem de header do cliente — isso já foi
corrigido numa rodada anterior contra spoofing de tenant, confirmado ainda correto pelo teste
`tests/unit/lib/security/auditLog.middleware.test.ts`) — **não está montado em nenhuma rota da
aplicação**.

`grep -rn "auditAccessMiddleware" src/ server.ts` só retorna a própria definição do arquivo.
Nenhuma rota de `src/features/**` nem `server.ts` a importa ou usa. O código existe, compila, tem
teste unitário próprio cobrindo o comportamento correto — mas não protege nada em produção hoje,
porque nada o invoca.

Isso não é o mesmo tipo de achado de "gate fail-open disfarçado de fail-closed" (a lógica interna
do middleware está correta), mas é adjacente: é um controle de segurança com aparência de
funcional (implementado, testado) e zero efeito real (nunca executado). `docs/security/
SECURITY_GUIDE.md` → "Auditing" recomenda genericamente usar `AuditService.log` para "mudanças de
estado críticas, acesso a dados" — outros domínios (ex.: `src/features/integrations/bitrix/
service/*.ts`) já chamam `AuditService.log` diretamente, então a superfície não é zero, mas o
middleware genérico por rota (pensado para cobrir qualquer entidade sem repetir a chamada em cada
service) segue sem nenhum consumidor.

**Causa raiz:** aparenta ser um utilitário implementado (com teste) numa onda anterior, antecipando
uso em rotas específicas, mas a etapa de montá-lo nas rotas (`router.use(auditAccessMiddleware(...))`
em algum lugar) nunca aconteceu ou foi revertida sem remover o arquivo.

## Arquivo(s) envolvido(s)

- `src/lib/security/auditLog.middleware.ts` (meu escopo — já revisado, lógica interna correta,
  nada a corrigir na própria função).
- Onde a decisão precisa ser aplicada: rotas específicas dentro de `src/features/*/`.
  routes.ts` de cada módulo (dono varia por módulo — CRM/04, Prospecção/05, Integrações/06 etc.) e,
  se a montagem for centralizada, `server.ts` (exige aprovação do Agente 00).

## Alteração necessária

Uma de duas, decisão de produto/segurança, não técnica:

1. **Montar de fato** `auditAccessMiddleware(entity)` nas rotas de entidades sensíveis que hoje não
   têm `AuditService.log` cobrindo GET/DELETE/PUT/PATCH (ex.: exportação de contatos/empresas,
   remoção de registros) — decisão de quais rotas cabe ao dono de cada feature.
2. **Remover o arquivo** se foi superado pelas chamadas diretas a `AuditService.log` já existentes
   nos services de integração, e não há intenção de reaproveitá-lo — nesse caso também remover o
   teste correspondente.

Não estou fazendo nenhuma das duas eu mesmo: a opção 1 tocaria arquivos de rota fora do meu
escopo (`src/features/*`, possivelmente `server.ts`), e a opção 2 é uma decisão de produto sobre
cobertura de auditoria, não um bug de segurança isolado no arquivo que possuo.

## Teste esperado

Se a opção 1 for escolhida: teste de integração/rota confirmando que uma chamada real a uma rota
protegida grava `AuditLog` com o `tenantId` correto (o unitário existente já cobre a lógica
interna do middleware, falta cobertura de que ele está de fato no pipeline da rota).
Se a opção 2: `npx tsc --noEmit` limpo após remoção, nenhuma outra referência quebrada.

## Contexto adicional

Achado durante auditoria de `src/lib/security/` desta onda (roadmap-v2-transversais). Não é
bloqueador da lista "Bloqueadores prioritários" do `/AGENTS.md` (não é RBAC ausente nem rota sem
autorização — é lacuna de trilha de auditoria, não de controle de acesso), por isso classifiquei
como prioridade normal, não bloqueador.

## Resolução (Coordenador, 00)
Escolhida a Opção 1 (montar de fato), aplicada de forma restrita ao gap mais claro: `GET
/api/leads/export/csv` (`src/features/crm/routes/lead.routes.ts`) — dump completo de nome/telefone/
e-mail de todos os leads do tenant, já marcado no próprio código como "sensível (LGPD)", e sem
NENHUMA chamada a `AuditService.log` em todo `src/features/crm/` (confirmado via grep). Agora usa
`auditAccessMiddleware('Lead')` depois de `managementRoles`. Não estendi a outras rotas/domínios —
isso continua sendo decisão de cada dono de feature, não algo para eu resolver de uma vez de forma
genérica.

Não escolhi a Opção 2 (remover) porque o middleware tem lógica correta, teste próprio, e havia pelo
menos um gap real e concreto para ele cobrir — descartar o utilitário só porque nada o usava ainda
teria sido remover uma correção real, não um código morto de fato.

Teste novo: `tests/integration/lead-export-audit.test.ts` (sessão/RLS reais) — ADMIN gera AuditLog
`action:'EXPORT', entity:'Lead'` com `actorId`/`tenantId` corretos; SDR (fora de `managementRoles`)
recebe 403 e não grava nada.
