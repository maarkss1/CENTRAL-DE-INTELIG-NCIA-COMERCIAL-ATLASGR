# ADR 004: Destino de produção definitivo — Oracle Cloud Infrastructure (self-hosted)

## Status

Aceito

- Data de registro: 2026-09-05
- Registrado por: sessão Claude Code, a pedido explícito do dono do produto
  (`comercial@atlasgr.com.br`)
- Este ADR formaliza uma decisão de negócio já comunicada como definitiva, não a propõe.

## Contexto

Em 2026-09-04, `docs/development/LOCAL_FIRST.md` e `docs/deploy/producao.md` documentavam a
arquitetura de produção então escolhida: monólito Node/Express no Render (`plan: starter`),
Postgres gerenciado no Neon (migração em andamento a partir do Supabase, ainda não cortada), e
Storage de objetos no Cloudflare R2. `docker-compose.oci.yml`/`docs/deploy/oracle-cloud.md`
existiam apenas como "caminho alternativo documentado, não implantado ativamente" (ver
`docs/deploy/README.md`, tabela dos quatro caminhos de infraestrutura).

Em 2026-09-05, o dono do produto comunicou uma decisão definitiva, substituindo a anterior: a
Central de Inteligência Comercial AtlasGR será colocada em produção em uma instância Oracle Cloud
Ampere A1 (`sa-saopaulo-1`), self-hosted via Docker Compose, com Caddy como reverse proxy/TLS e
PostgreSQL executando na própria instância — não mais em Render/Neon/Supabase como plataforma de
produção.

## Decisão

1. **Compute**: Oracle Cloud Infrastructure, instância Ampere A1, região `sa-saopaulo-1`.
2. **Orquestração**: Docker + Docker Compose (`docker-compose.oci.yml`), não Kubernetes/Helm/ArgoCD
   (esses caminhos continuam existindo como aspiracionais, ver `docs/deploy/README.md`, mas não são
   o alvo do MVP).
3. **Reverse proxy / TLS**: Caddy (`Caddyfile.oci`), emissão e renovação automática de certificado.
4. **Banco de dados**: PostgreSQL rodando na própria instância Oracle (container `postgres` do
   compose), não um serviço gerenciado externo. Dado real de produção hoje vive no Supabase
   (produção ativa do Render) com uma cópia já validada (contagem de linhas conferida) no Neon,
   ainda não cortada — ver `docs/deploy/producao.md` seção 1.2. A migração desses dados para o
   Postgres da Oracle é tratada como operação de alto risco, exigindo backup, verificação de
   integridade e teste de restauração **antes** de qualquer cutover, e autorização humana explícita
   para o corte em si (nenhuma sessão automatizada decide isso sozinha) — ver
   `docs/deploy/oracle-cloud.md` seção "Migração de dados para o Postgres da Oracle".
5. **Redis / filas / worker dedicado**: permanecem **opt-in, desligados por padrão**
   (`ENABLE_QUEUES=false`), mesma decisão já registrada em `render.yaml` e no relatório de
   finalização de 2026-09-04 (`docs/release/FINALIZATION_REPORT_2026-09-04.md`, seção 10/14) — não
   há jornada essencial do MVP (autenticação, CRM, Prospecção, dashboard) que dependa de fila hoje.
   `docker-compose.oci.yml` implementa isso via Compose profile `queues`.
6. **Storage de objetos**: fora do escopo do MVP na Oracle, a menos que uma jornada essencial
   comprove depender disso — mesmo critério já documentado em `docs/deploy/producao.md` seção 1.3.
7. **Render**: deixa de ser o destino de produção. Os arquivos relacionados (`render.yaml`,
   `docs/deploy/producao.md`, `docs/deploy/render.md`) continuam no repositório como histórico e
   fallback/rollback durante a transição — nenhum esforço novo de infraestrutura é dedicado a eles
   nesta missão, e a implantação existente no Render não é desligada antes do Go-Live Oracle estar
   validado.

## Consequências

- `docs/deploy/README.md` (índice canônico de infraestrutura) passa a apontar Oracle Cloud como o
  caminho ativo de produção, com Render como fallback documentado, não mais "nenhum ambiente cloud
  ativo".
- `docs/deploy/oracle-cloud.md` deixa de ser "candidato não implantado" e passa a ser o
  procedimento operacional real de produção.
- Toda configuração de produção (CORS, `BETTER_AUTH_URL`, `PUBLIC_BASE_URL`, cookies) precisa migrar
  de `localhost`/domínio de desenvolvimento para o domínio oficial da Central antes do cutover —
  `scripts/deploy-oci.sh` agora aceita `DOMAIN=<dominio>` para configurar isso automaticamente.
- Um backup real de PostgreSQL (`scripts/backup-oci.sh`) e um procedimento de restauração/drill
  (`scripts/restore-oci.sh`) passam a existir como pré-requisito documentado de Go-Live, cobrindo o
  requisito que antes dependia de um provedor gerenciado (PITR do Neon/Supabase).
- O corte de DNS/domínio para a Oracle, a migração de dado real de produção e o desligamento do
  Render permanecem como ações que exigem execução e autorização humana com acesso à instância real
  — nenhuma sessão automatizada sem credenciais de infraestrutura pode completá-las sozinha (ver
  `docs/deploy/oracle-cloud.md`, seção "O que esta sessão não pôde validar").

## Alternativas descartadas

Render, Vercel, Railway e Supabase/Neon como plataforma de hosting de produção — descartados por
decisão explícita do dono do produto, não por limitação técnica. Nenhuma delas deve voltar a ser
proposta como alvo de produção enquanto esta decisão estiver em vigor.
