# Central AtlasGR — modo local-first

> **Fase ENCERRADA em 2026-09-02.** O critério de saída definido na seção "Critério para voltar à
> produção" (fim deste arquivo) foi cumprido e confirmado pelo dono do repositório: frontend,
> backend, autenticação, permissões, banco, integrações, Market Intelligence, CRM, testes e build
> final validados. A arquitetura de produção definitiva foi escolhida — monólito único no Render
> (`plan: starter`) + Postgres no Neon + Storage no Cloudflare R2, conforme
> `docs/deploy/producao.md`. **Nota**: a escolha inicial do dia foi Supabase (Pro); horas depois,
> ainda na mesma sessão, foi trocada para Neon (motivo documentado em `docs/deploy/producao.md`) —
> o corte de produção do Render ainda aponta para o Supabase até esse `DATABASE_URL` ser trocado,
> ver status real em `docs/deploy/producao.md`. O deploy automático voltou a estar ativo
> (`render.yaml`, `autoDeployTrigger: commit`). Este documento continua existindo como registro
> histórico da fase
> local-first (procedimento de subida local, migração e regra de corte usados na transição) — para
> o estado atual de produção, use `docs/deploy/producao.md`.

## Estado desta fase

Durante o desenvolvimento e o redesenho da Central, o repositório GitHub é a fonte de verdade. A aplicação não deve depender de Render, Vercel, Supabase, Neon ou Railway para funcionar no dia a dia de desenvolvimento.

A infraestrutura cloud existente fica preservada temporariamente somente para rollback e migração segura de dados. Ela não deve receber novas decisões arquiteturais nem novos acoplamentos.

## Arquitetura de desenvolvimento

```text
Navegador
   |
   v
Node/Express + Vite (localhost:3005)
   |
   +--> PostgreSQL local (localhost:5434)
   +--> Redis local (localhost:6379)
   +--> Meilisearch local (localhost:7700)
   +--> MinIO local / S3 (localhost:9000)
   +--> Ollama local (localhost:11434)
   +--> LiteLLM local (localhost:4000)
```

O `docker-compose.yml` é a base da infraestrutura local. O storage MinIO cria automaticamente o bucket `prospector-assets`.

## Subida local

1. Copie `.env.example` para `.env`.
2. Garanta que `DATABASE_URL` use o PostgreSQL local na porta 5434.
3. Para storage local, configure:

```env
STORAGE_ENDPOINT=http://localhost:9000
STORAGE_REGION=us-east-1
STORAGE_BUCKET=prospector-assets
STORAGE_ACCESS_KEY_ID=atlasgr
STORAGE_SECRET_ACCESS_KEY=atlasgr_minio_dev_only
```

4. Para Redis local, quando as filas forem necessárias:

```env
REDIS_URL=redis://:prospector_redis_pass@localhost:6379
ENABLE_QUEUES=true
```

5. Para Meilisearch local, quando a busca for necessária:

```env
MEILI_HOST=http://localhost:7700
MEILI_MASTER_KEY=atlasgr_meili_master_key
ENABLE_SEARCH=true
```

6. Suba a infraestrutura:

```bash
docker compose up -d
```

7. Instale as dependências e aplique as migrations:

```bash
npm ci
npx prisma migrate deploy
```

8. Rode o verificador local-first:

```bash
node scripts/local-first/doctor.mjs
```

9. Inicie a aplicação:

```bash
npm run dev
```

O doctor falha se os principais endpoints de runtime ainda apontarem para Supabase, Neon, Render, Railway ou Vercel.

## Migração do Supabase

O projeto Supabase usado pela Central contém dados de autenticação e organização. Portanto, ele não pode ser pausado ou excluído antes de existir uma cópia local validada.

No Windows PowerShell, gere o backup do schema `public` com:

```powershell
.\scripts\local-first\backup-supabase.ps1 -SourceDatabaseUrl "<CONNECTION_STRING_DO_SUPABASE>"
```

O dump é salvo em `backups/`, diretório protegido pelo `.gitignore`. O script também calcula SHA-256 para permitir verificar a integridade do arquivo.

### Regra de corte

O Supabase só pode ser pausado depois de todos estes itens estarem comprovados no PostgreSQL local:

- usuários e contas de credencial importados;
- organizações importadas;
- login local funcionando;
- troca de senha funcionando;
- migrations atualizadas;
- contagens essenciais reconciliadas;
- nenhuma rota da aplicação usando URL do Supabase;
- backup íntegro mantido fora do Git.

## Situação dos provedores legados

### Vercel

`vercel.json` contém `git.deploymentEnabled=false`. Isso desliga novos deployments automáticos por Git quando a configuração estiver incorporada à branch usada pelo projeto.

### Render

**Reativado em 2026-09-02** (ver banner no topo deste arquivo). `render.yaml` voltou a ter
`autoDeployTrigger: commit` no serviço web (`prospector-atlas`, `plan: starter`) — deixou de ser
apenas rollback temporário e passou a ser o ambiente de produção real. O bloco `worker`
(`prospector-atlas-worker`) continua congelado (`autoDeployTrigger: off`, `plan: free`) — fora do
escopo desta reativação, ver `docs/deploy/producao.md`.

### Supabase

**Reativado brevemente em 2026-09-02, depois substituído por Neon na mesma sessão.** Projeto de
produção real (Supabase `CENTRAL DE INTELIGENCIA COMERCIAL`, ref `wezvrhkvetkzawmxsfjx` — não o
ref `hzttamzvokacmcnrfkrm` originalmente documentado em `docs/deploy/producao.md`, que não existe
mais na conta) chegou a ser cotado para o plano Pro, mas a decisão final do dono do repositório foi
migrar para Neon (ver `docs/deploy/producao.md`) — o Supabase segue como o banco real em produção
até o `DATABASE_URL` do Render ser trocado para Neon; os dados já foram copiados e validados lá.
Não pausar nem excluir este projeto Supabase até o corte estar confirmado.

### Neon

Novo destino escolhido em 2026-09-02, no lugar do Supabase — ver `docs/deploy/producao.md` seção 1
para a justificativa (PITR incluso no plano pago, pay-as-you-go) e o estado da migração de dados.

### Neon

Não faz parte do runtime local-first. O projeto legado deve ser eliminado somente no encerramento da migração, depois da conferência de que não guarda dados necessários.

### Railway

Não há dependência funcional encontrada no código da Central. Referências restantes são comentários históricos e não compõem o runtime.

## O que NÃO fazer durante esta fase

- não adicionar novo banco cloud;
- não apontar `.env` local para banco remoto;
- não adicionar deploy automático;
- não usar Vercel/Render como ambiente de validação visual;
- não excluir Supabase antes do restore local validado;
- não colocar dumps, senhas ou connection strings no GitHub;
- não escolher a infraestrutura de produção definitiva antes da plataforma estar funcionalmente pronta.

## Critério para voltar à produção

A escolha de hospedagem será reaberta apenas quando a Central estiver com frontend, backend, autenticação, permissões, banco, integrações, Market Intelligence, CRM, testes e build final validados. Nesse momento será escolhida uma arquitetura de produção mínima, preferencialmente com um único provedor de compute e um único PostgreSQL, e os recursos legados serão removidos definitivamente.
