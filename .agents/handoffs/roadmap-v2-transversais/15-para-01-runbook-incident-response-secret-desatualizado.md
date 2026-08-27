- De: Agente 15 — Segurança Aplicada e Rotação de Segredos
- Para: Agente 01 — Plataforma, Segurança e Dados
- Onda: roadmap-v2-transversais
- Status: resolvido
- Prioridade: alto

## Problema

`docs/security/runbooks/INCIDENT_RESPONSE.md`, Fase 2 (Containment), instrui: "Immediately
rotate all `JWT_SECRET` and `JWT_REFRESH_SECRET` environment variables." Essas duas variáveis
**não existem neste código** — `src/config/env.ts` não as declara, e nenhum `.ts`/`.tsx`/`.mjs`
do repositório as lê (`grep -rln "JWT_SECRET" src/` não retorna nada). A autenticação real deste
projeto é Better Auth por cookie `HttpOnly` (`better-auth.session_token`), assinado por
`BETTER_AUTH_SECRET` — confirmado pelo próprio `docs/security/THREAT_MODEL.md` ("não há
Access/Refresh Token JWT neste projeto") e por `docs/security/SECURITY_GUIDE.md` ("Sessão
validada por cookie `HttpOnly`... não por par de Access/Refresh Token JWT").

`JWT_SECRET`/`JWT_REFRESH_SECRET` só aparecem hoje como env vars placeholder soltas em alguns
workflows de CI (`ci.yml`, `cd-homolog.yml`, `market-intelligence-ci.yml`,
`onda-2.5-validation.yml`, `endpoint-latency-budget.yml`) — resíduo de um sistema de auth
anterior (JWT Access/Refresh) que foi substituído pelo Better Auth, sem que o runbook de
incidente tivesse sido atualizado junto.

**Causa raiz:** o runbook de resposta a incidente não foi atualizado quando o projeto migrou de
JWT próprio para Better Auth. Resultado prático: em um incidente real, um respondente seguindo
este documento ao pé da letra rotacionaria variáveis de ambiente que não existem e **não
rotacionaria o segredo que de fato assina toda sessão ativa** (`BETTER_AUTH_SECRET` —
documentado em `docs/security/SECRETS_MANAGER_MIGRATION.md`, que já descreve corretamente o
impacto de rotacionar esse valor: invalida todas as sessões logadas).

Isso é exatamente o tipo de divergência "política de rotação documentada vs. mecanismo real" que
minha missão desta onda pediu para verificar — mas o arquivo a corrigir (`docs/security/**`) está
fora do meu escopo de edição (`scripts/security/**` e `src/lib/security/`), então abro este
handoff em vez de editar.

## Arquivo(s) envolvido(s)

- `docs/security/runbooks/INCIDENT_RESPONSE.md` (Fase 2 — Containment) — precisa de correção.
- Contexto/evidência já correta, não precisa mudar: `docs/security/THREAT_MODEL.md`,
  `docs/security/SECURITY_GUIDE.md`, `docs/security/SECRETS_MANAGER_MIGRATION.md`.

## Alteração necessária

Trocar, na Fase 2 (Containment) de `INCIDENT_RESPONSE.md`:

> "Immediately rotate all `JWT_SECRET` and `JWT_REFRESH_SECRET` environment variables."

por algo alinhado ao mecanismo real, por exemplo:

> "Immediately rotate `BETTER_AUTH_SECRET` (invalidates all active sessions — see
> `docs/security/SECRETS_MANAGER_MIGRATION.md` for sequencing) and, if the incident involves
> integration credentials, rotate the source credential and re-encrypt via
> `CREDENTIALS_ENCRYPTION_KEY` (`src/lib/crypto/secretFields.ts`)."

Aproveitar para revisar se `JWT_SECRET`/`JWT_REFRESH_SECRET` como env var placeholder nos
workflows de CI listados acima ainda tem alguma razão de existir (nenhum código os lê hoje) ou se
também são resíduo a limpar — decisão do dono de `Pipelines de CI` (Agente 08) se envolver edição
de `.github/workflows/**`, fora do escopo deste handoff.

## Teste esperado

Não há teste automatizado para conteúdo de runbook (é documentação operacional). Validação
esperada: revisão humana/Agente 01 confirmando que o texto novo cita `BETTER_AUTH_SECRET` (não
`JWT_SECRET`), e checagem manual de que nenhum outro trecho de `docs/security/**` ainda referencia
`JWT_SECRET`/`JWT_REFRESH_SECRET` como se fossem reais.

## Contexto adicional

Encontrado durante auditoria de `scripts/security/**` + `src/lib/security/` desta onda
(roadmap-v2-transversais). Não é o achado conhecido de `backups/prospector-*.dump` (esse
permanece como decisão humana separada, sem novidade nesta auditoria — confirmei via `git
ls-files` que nenhum `.dump` está rastreado no worktree atual).

## Resolução (Coordenador, 00)
Fase 2 (Containment) de `docs/security/runbooks/INCIDENT_RESPONSE.md` reescrita conforme sugerido:
agora instrui rotacionar `BETTER_AUTH_SECRET` (com referência a `SECRETS_MANAGER_MIGRATION.md`) e,
separadamente, credenciais de integração via `CREDENTIALS_ENCRYPTION_KEY`. Não toquei nos workflows
de CI (`JWT_SECRET`/`JWT_REFRESH_SECRET` como env var placeholder) — decisão do dono de Pipelines de
CI (Agente 08), fora do escopo deste handoff, como o próprio Agente 15 já apontou.
