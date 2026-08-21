# Guia de Deploy no Oracle Cloud Infrastructure (OCI)

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
./scripts/deploy-oci.sh
```

Na primeira execução, o script cria `.env.production`, restringe suas permissões e gera valores aleatórios para os segredos essenciais de produção. **Nenhum desses valores deve ser commitado no Git ou copiado para documentação, issues, PRs ou logs.**

O arquivo `.env.production` deve permanecer no servidor e com acesso restrito:

```bash
chmod 600 .env.production
```

Faça backup seguro dos segredos por um mecanismo apropriado à operação. Não use o repositório como cofre de credenciais.

---

## 4. Estrutura dos Serviços (`docker-compose.oci.yml`)

A arquitetura no Oracle Cloud sobe os seguintes serviços isolados:

1. **`app`**: monólito AtlasGR, frontend e API.
2. **`worker`**: worker de filas e tarefas em background.
3. **`postgres`**: PostgreSQL com as extensões exigidas pela aplicação.
4. **`redis`**: cache, filas e mensageria.
5. **`caddy`**: reverse proxy e terminação TLS.

Postgres, Redis e a aplicação ficam publicados apenas em loopback quando uma porta de host é necessária. O tráfego público deve entrar por Caddy nas portas 80/443.

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

`APP_DB_PASSWORD`, `BOOTSTRAP_DB_PASSWORD` e `REDIS_PASSWORD` são obrigatórias no Compose. O deploy falha de forma explícita se estiverem ausentes, em vez de usar senhas conhecidas ou previsíveis.

Após o deploy, valide pelo menos:

```bash
docker compose --env-file .env.production -f docker-compose.oci.yml ps
docker exec -i atlasgr_postgres pg_isready -U prospector -d prospectordb
curl -fsS http://127.0.0.1:3000/health/live
```

Não declare o ambiente pronto para produção enquanto os health checks, as migrações e os gates do repositório não estiverem verdes.
