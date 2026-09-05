# Guia de Deploy no Oracle Cloud Infrastructure (OCI)

> **Status real (ADR-004, 2026-09-05): alvo definitivo de produção.** O dono do produto decidiu
> substituir Render/Neon por Oracle Cloud (self-hosted, região `sa-saopaulo-1`) como destino de
> produção — ver [`docs/ADR/ADR-004-Producao-Oracle-Cloud.md`](../ADR/ADR-004-Producao-Oracle-Cloud.md).
> Esta sessão preparou/validou o que é possível sem acesso à instância real (compose, scripts de
> deploy/backup/restore, documentação); o provisionamento da instância, a migração do dado real de
> produção e o cutover de DNS exigem execução humana com credenciais de infraestrutura — ver a
> seção "O que esta sessão não pôde validar" no fim deste guia antes de considerar isso concluído.
> Ver [`docs/deploy/README.md`](README.md) para o inventário completo de caminhos.

Este guia orienta o provisionamento, configuração e deploy da **Central de Inteligência Comercial AtlasGR** em uma instância de computação no **Oracle Cloud Infrastructure (OCI)**, compatível com instâncias Always Free quando disponíveis e com instâncias dedicadas.

---

## 1. Requisitos da Instância OCI

Recomenda-se criar uma instância de computação (Compute Instance):

- **Shape recomendado**: `VM.Standard.A1.Flex` (Ampere ARM) ou uma opção x86 compatível com a carga.
- **Sistema Operacional**: Ubuntu 22.04 / 24.04 LTS ou Oracle Linux 8/9.
- **Armazenamento**: 50 GB a 100 GB de Boot Volume como ponto de partida.
- **IP Público**: habilitado, preferencialmente reservado quando houver domínio apontado para a instância.

> Confirme no console da Oracle os limites e a elegibilidade atuais da sua conta antes de depender de uma oferta gratuita específica.

---

## 2. Configuração de Rede e Firewall no Oracle Cloud (VCN)

No Oracle Cloud, o tráfego externo pode ser filtrado tanto pela **Security List/NSG da VCN** quanto pelo firewall do sistema operacional.

### 2.1 Regras de entrada na VCN

Acesse **Networking → Virtual Cloud Networks → sua VCN → Security Lists/Network Security Groups** e libere somente o necessário:

| Source CIDR | IP Protocol | Destination Port | Uso |
|---|---|---:|---|
| `0.0.0.0/0` | TCP | `80` | HTTP / ACME |
| `0.0.0.0/0` | TCP | `443` | HTTPS |
| IPs administrativos confiáveis | TCP | `22` | SSH |

Evite expor SSH para `0.0.0.0/0` quando puder restringir por IP de origem ou usar outro mecanismo de acesso seguro.

### 2.2 Firewall do Linux

Exemplo para Ubuntu/Debian:

```bash
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw allow 22/tcp
```

Adapte as regras à política de rede da instância. O script `scripts/deploy-oci.sh` também tenta configurar as portas necessárias quando as ferramentas correspondentes estão disponíveis.

---

## 3. Deploy da Aplicação com Docker Compose

### 3.1 Clonar o repositório no servidor

```bash
git clone https://github.com/MaarksN/CENTRAL-DE-INTELIGENCIA-COMECIAL-ATLASGR.git
cd CENTRAL-DE-INTELIGENCIA-COMECIAL-ATLASGR
```

### 3.2 Executar o script automatizado

O repositório inclui um script que prepara o ambiente, cria os segredos locais necessários, valida o Compose, sobe os containers, aplica migrações e configura o administrador:

```bash
chmod +x scripts/deploy-oci.sh
DOMAIN=app.atlasgr.com.br ./scripts/deploy-oci.sh   # ver seção 7 para o efeito de DOMAIN
```

Na primeira execução, o script cria `.env.production`, restringe suas permissões e gera valores
aleatórios para os segredos essenciais de produção (`BETTER_AUTH_SECRET`,
`CREDENTIALS_ENCRYPTION_KEY`, `PII_BLIND_INDEX_KEY`, `BOOTSTRAP_DB_PASSWORD`, `APP_DB_PASSWORD`,
`INITIAL_ADMIN_PASSWORD`; `REDIS_PASSWORD` só quando `ENABLE_QUEUES=true`, ver seção 4.1).
**Nenhum desses valores deve ser commitado no Git ou copiado para documentação, issues, PRs ou logs.**

O arquivo `.env.production` deve permanecer no servidor e com acesso restrito:

```bash
chmod 600 .env.production
```

Faça backup seguro dos segredos por um mecanismo apropriado à operação. Não use o repositório como cofre de credenciais.

---

## 4. Estrutura dos Serviços (`docker-compose.oci.yml`)

**Stack mínimo do MVP** (sobe sempre, com `docker compose ... up -d`, sem flags extras):

1. **`app`**: monólito AtlasGR, frontend e API.
2. **`postgres`**: PostgreSQL com as extensões exigidas pela aplicação.
3. **`caddy`**: reverse proxy e terminação TLS.

**Opt-in** (profile `queues`, ver seção 4.1) — só sobem quando explicitamente habilitados:

4. **`worker`**: worker de filas e tarefas em background (BullMQ).
5. **`redis`**: cache, filas e mensageria.

Postgres, Redis e a aplicação ficam publicados apenas em loopback quando uma porta de host é necessária. O tráfego público deve entrar por Caddy nas portas 80/443.

### 4.1 Redis e worker são opcionais — decisão já registrada, não pendência técnica

Nenhuma jornada essencial do MVP (autenticação, CRM, Prospecção, dashboard) depende de fila/Redis
hoje — o código já trata isso como opcional (`src/lib/queue/redis.ts`: sem `REDIS_URL`,
`queuesEnabled=false` e a aplicação sobe normalmente) e o mesmo padrão (`ENABLE_QUEUES=false`,
`REDIS_URL` não preenchida) já está em produção real via `render.yaml`, decidido explicitamente
pelo dono do produto em 2026-09-04 (ver `docs/release/FINALIZATION_REPORT_2026-09-04.md`, seção
10/14). `docker-compose.oci.yml` segue o mesmo padrão: por padrão, **`redis` e `worker` não
sobem**.

Quando uma jornada real passar a depender de fila (ex.: enriquecimento assíncrono em lote,
sincronização automática do Bitrix, scanners de leads frios/estagnados), habilite assim:

```bash
# No .env.production, antes de rodar o deploy:
ENABLE_QUEUES=true

./scripts/deploy-oci.sh
```

O script detecta `ENABLE_QUEUES=true`, gera `REDIS_PASSWORD`/`REDIS_URL` automaticamente e sobe o
stack com `--profile queues` (ativando `redis` e `worker` junto de `app`/`postgres`/`caddy`). Para
subir manualmente:

```bash
docker compose --env-file .env.production -f docker-compose.oci.yml --profile queues up -d
```

**Nunca** rode `worker` (`docker-compose.oci.yml`) e outro processo (ex.: um segundo worker do
Render reativado por engano) consumindo as mesmas filas BullMQ ao mesmo tempo — isso duplica o
processamento de cada job. Se o worker desta stack estiver ativo, o worker do Render
(`prospector-atlas-worker`) deve continuar com `autoDeployTrigger: off`.

---

## 5. Credenciais do Administrador

A senha inicial do administrador é fornecida exclusivamente pela variável:

```text
INITIAL_ADMIN_PASSWORD
```

No fluxo automatizado de OCI, um valor forte é gerado e armazenado somente em `.env.production` quando a variável ainda não existe. O valor **não é impresso pelo seed nem pelo script de deploy**.

Para redefinir intencionalmente a credencial, altere `INITIAL_ADMIN_PASSWORD` no ambiente seguro e execute novamente:

```bash
docker exec -i atlasgr_app npx tsx scripts/seed-team.ts
```

A variável deve ter pelo menos 16 caracteres. Depois da alteração, mantenha o arquivo protegido e trate qualquer credencial que tenha sido publicada anteriormente no histórico do Git como comprometida.

---

## 6. Validação antes de subir

O script executa esta validação antes de iniciar containers:

```bash
docker compose --env-file .env.production -f docker-compose.oci.yml config --quiet
```

`APP_DB_PASSWORD` e `BOOTSTRAP_DB_PASSWORD` são sempre obrigatórias no Compose — o deploy falha de
forma explícita se estiverem ausentes, em vez de usar senhas conhecidas ou previsíveis.
`REDIS_PASSWORD` só é exigida quando o profile `queues` está ativo (ver seção 4.1); fora dele, o
stack mínimo (`app`+`postgres`+`caddy`) sobe sem Redis.

Após o deploy, valide pelo menos:

```bash
docker compose --env-file .env.production -f docker-compose.oci.yml ps
docker exec -i atlasgr_postgres pg_isready -U prospector -d prospectordb
curl -fsS http://127.0.0.1:3000/health/live
curl -fsS http://127.0.0.1:3000/health/ready   # confirma conexão real com o banco (SELECT 1)
```

Não declare o ambiente pronto para produção enquanto os health checks, as migrações e os gates do repositório não estiverem verdes.

---

## 7. Domínio, CORS e cookies (cutover de produção)

Por padrão, `.env.production` herda os valores de desenvolvimento do `.env.example`
(`ALLOWED_ORIGINS`/`BETTER_AUTH_URL`/`PUBLIC_BASE_URL` apontando para `localhost`,
`SECURE_COOKIES=false`, `TRUST_PROXY=false`) — isso não é apropriado para produção real com domínio
e HTTPS via Caddy.

Para configurar o domínio oficial automaticamente, exporte `DOMAIN` (o mesmo usado pelo Caddy) ao
rodar o deploy:

```bash
DOMAIN=app.atlasgr.com.br ACME_EMAIL=ti@atlasgr.com.br ./scripts/deploy-oci.sh
```

O script então ajusta, em `.env.production` (só quando o valor atual ainda for o placeholder de
desenvolvimento — nunca sobrescreve um valor já customizado manualmente):

| Variável | Valor definido |
| --- | --- |
| `ALLOWED_ORIGINS` | `https://<DOMAIN>` |
| `BETTER_AUTH_URL` | `https://<DOMAIN>` |
| `PUBLIC_BASE_URL` | `https://<DOMAIN>` |
| `COOKIE_DOMAIN` | `<DOMAIN>` |
| `SECURE_COOKIES` | `true` |
| `TRUST_PROXY` | `true` (Caddy é o proxy na frente da aplicação) |

Antes do cutover de DNS, confirme também (fora do escopo do script, ação humana):

- Registro DNS (A/AAAA) do domínio apontando para o IP público da instância Oracle — direto ou via
  Cloudflare (proxy laranja desligado durante a emissão inicial do certificado pelo Caddy, se
  necessário, religando depois).
- Redirect URIs do OAuth do Google (`{BETTER_AUTH_URL}/api/auth/callback/google` e
  `{PUBLIC_BASE_URL}/api/google/callback`) cadastrados no Google Cloud Console para o novo domínio.
- Nenhuma variável de produção continua referenciando `localhost`/`127.0.0.1`/`*.onrender.com` após
  o cutover — confira com `grep -E "localhost|127\.0\.0\.1|onrender" .env.production` no servidor.

---

## 8. Backup e restauração do PostgreSQL

`scripts/backup-oci.sh` roda `pg_dump` dentro do container `atlasgr_postgres` (sem exigir
`postgresql-client` no host), comprime o dump e grava fora do container:

```bash
./scripts/backup-oci.sh                              # backup completo em ./backups/postgres/
BACKUP_DIR=/mnt/backups BACKUP_RETENTION_DAYS=30 ./scripts/backup-oci.sh
```

**Frequência recomendada**: diária, via `crontab` do usuário com acesso ao Docker na instância:

```cron
0 3 * * * cd /caminho/do/repo && ./scripts/backup-oci.sh >> /var/log/atlasgr-backup.log 2>&1
```

**Retenção**: 14 dias localmente por padrão (`BACKUP_RETENTION_DAYS`), ajustável. **Destino fora da
própria VM** (recomendado antes do Go-Live, não automatizado pelo script por depender de credencial
externa do operador — ex.: `rclone`/`rsync` para um bucket de object storage ou outro host):

```bash
rclone copy ./backups/postgres remote:atlasgr-backups/postgres --max-age 25h
```

**Criptografia**: o dump em si não é cifrado pelo script — se o destino externo não oferecer
criptografia em repouso nativa, cifre antes de copiar (`gpg --symmetric` ou equivalente) e proteja a
senha/chave fora do repositório.

**Restauração/drill**, com `scripts/restore-oci.sh` — por padrão restaura em um banco de DRILL
isolado (nunca em cima de `prospectordb`), para validar um backup sem nenhum risco:

```bash
./scripts/restore-oci.sh backups/postgres/prospectordb_20260905_030000.sql.gz
```

Restauração real sobre o banco de produção (irreversível, exige confirmação explícita):

```bash
./scripts/restore-oci.sh backups/postgres/<arquivo>.sql.gz --target-db prospectordb --force
```

Execute um restore drill (comando acima, sem `--target-db prospectordb`) pelo menos uma vez antes
de declarar o backup como confiável — um backup nunca testado por restauração não é um backup
validado.

---

## 9. Migração de dados para o Postgres da Oracle

O banco de produção real hoje (dado real de clientes) está no Supabase (tráfego do Render), com uma
cópia já validada por contagem de linhas no Neon (ver `docs/deploy/producao.md` seção 1.2) —
nenhum dos dois deve ser destruído, sobrescrito ou abandonado antes do cutover para a Oracle estar
confirmado. Esta migração é uma operação de alto risco e **não deve ser automatizada por uma sessão
sem credenciais de infraestrutura reais e sem autorização explícita do dono do produto** para o
corte em si. Procedimento recomendado, na ordem:

1. **Identificar a origem mais segura para o dump**: preferir a cópia já validada no Neon (mais
   recente, já conferida linha a linha) em vez de reabrir uma extração direta do Supabase, salvo se
   o Neon estiver desatualizado em relação ao Supabase no momento do corte.
2. **Backup**: `pg_dump --format=custom` (ou `plain` + gzip) da origem escolhida, com um humano
   detentor das credenciais reais executando o comando — nenhuma delas está disponível para uma
   sessão automatizada neste repositório.
3. **Validar integridade**: comparar contagem de linhas por tabela entre origem e dump (mesmo
   método já usado na migração Supabase→Neon, seção 1.2 de `docs/deploy/producao.md`).
4. **Restaurar em um Postgres da Oracle de teste** (`./scripts/restore-oci.sh <dump> --target-db
   prospectordb_migracao_drill`), nunca direto em `prospectordb`.
5. **Testar a aplicação real contra esse banco restaurado** (login, CRM, Prospecção — mesmo roteiro
   do smoke da seção "Smoke Oracle" do checklist de Go-Live) antes de considerar o dado migrado
   utilizável.
6. **Só então** trocar `DATABASE_URL`/`DIRECT_URL` da aplicação Oracle para apontar ao Postgres
   definitivo (renomear o banco de drill para `prospectordb`, ou repetir o restore direto nele com
   `--target-db prospectordb --force` depois de um backup do estado anterior).
7. **Cutover** só após autorização explícita do dono do produto — nunca como consequência automática
   de "o restore funcionou".

Comandos como `DROP DATABASE`, `TRUNCATE`, `prisma migrate reset` ou qualquer deleção em massa
**nunca** fazem parte deste procedimento contra um banco com dado real.

---

## 10. Checklist de segredos (sem expor valores)

Ao validar `.env.production` na instância real, reporte apenas o status de cada variável — nunca o
valor:

| Variável | O que verificar |
| --- | --- |
| `DATABASE_URL` | Gerada automaticamente pelo Compose a partir de `APP_DB_PASSWORD` — CONFIGURADO se o container `postgres` está `healthy` |
| `BETTER_AUTH_SECRET` | CONFIGURADO (gerado por `scripts/deploy-oci.sh`) |
| `CREDENTIALS_ENCRYPTION_KEY` | CONFIGURADO (gerado por `scripts/deploy-oci.sh`, base64 32 bytes) |
| `PII_BLIND_INDEX_KEY` | CONFIGURADO (gerado por `scripts/deploy-oci.sh`, base64 32 bytes) |
| `APOLLO_API_KEY` / `HUNTER_API_KEY` / `GOOGLE_MAPS_API_KEY` | CONFIGURADO se a organização usa o provedor correspondente, senão NÃO NECESSÁRIO (`PROSPECTING_PROVIDER_MODE=free` funciona sem eles) |
| `GROQ_API_KEY` / `OPENAI_API_KEY` / `GEMINI_API_KEY` | CONFIGURADO apenas para os provedores de IA realmente usados |
| `BITRIX24_WEBHOOK_URL` | CONFIGURADO se a organização usa Bitrix24, senão NÃO NECESSÁRIO |
| `BIRTH_VOICES_WEBHOOK_SECRET` | CONFIGURADO se Copiloto de voz/discagem estiver habilitado, senão NÃO NECESSÁRIO |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | CONFIGURADO se "Entrar com Google" for oferecido, senão AUSENTE (login por e-mail/senha continua funcionando) |
| SMTP (`SMTP_HOST` etc.) | CONFIGURADO apenas se o e-mail de redefinição de senha precisar sair de fato — sem isso, o fluxo de reset continua funcionando tecnicamente (token gerado/validado), só o e-mail não é enviado |

---

## 11. O que esta sessão não pôde validar

Esta sessão preparou e validou o que é possível **sem acesso a credenciais de infraestrutura
reais** (nenhuma chave SSH, token OCI ou credencial de banco de produção está disponível neste
ambiente de execução):

- `docker compose ... config --quiet` foi executado de fato (não só lido) contra o
  `docker-compose.oci.yml` atualizado, confirmando que a interpolação de variáveis funciona tanto
  no stack mínimo (sem `REDIS_PASSWORD`) quanto com o profile `queues` ativo.
- Sintaxe de `scripts/deploy-oci.sh`, `scripts/backup-oci.sh` e `scripts/restore-oci.sh` validada
  (`bash -n`).
- **Não testado**: os três scripts contra um Postgres/Docker daemon real (o ambiente desta sessão
  não tem um daemon Docker em execução) — a lógica foi revisada linha a linha, mas só a execução
  real na instância Oracle (ou em qualquer host com Docker rodando) prova o comportamento de fato.
- **Não provisionado nem acessado**: a instância Oracle Cloud em si (RUNNING, SSH, firewall/NSG,
  disco, memória, CPU) — nada disso é verificável sem credenciais OCI reais.
- **Não executado**: qualquer smoke real (login, CRM, Prospecção, Copiloto) contra um domínio
  público — depende da instância e do DNS estarem no ar.
- **Não migrado**: nenhum dado de produção real (Supabase/Neon) foi lido, copiado ou movido por
  esta sessão — ver seção 9 para por que isso é deliberado, não um esquecimento.

Antes de declarar `GO-LIVE READY`, cada item do checklist de Go-Live (ver missão/ADR-004) precisa
ser executado por alguém com acesso real à instância Oracle e reportado com evidência (comando +
saída), não apenas assumido como "deve funcionar" porque o código está correto.
