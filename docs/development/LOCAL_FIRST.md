# Central AtlasGR — modo local-first

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

`render.yaml` está marcado como legado/congelado e usa `autoDeployTrigger: off`. O serviço existente deve permanecer apenas como rollback temporário até o corte final.

### Supabase

Mantido temporariamente como origem de migração. Não adicionar novas dependências.

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
