# Guia de Deploy no Oracle Cloud Infrastructure (OCI)

Este guia orienta o provisionamento, configuração e deploy da **Central de Inteligência Comercial AtlasGR** em uma instância de computação no **Oracle Cloud Infrastructure (OCI)** (compatível tanto com Always Free quanto instâncias dedicadas).

---

## 1. Requisitos da Instância OCI

Recomenda-se criar uma instância de computação (Compute Instance):
- **Shape Recomendado (Always Free)**: `VM.Standard.A1.Flex` (Ampere ARM - 4 OCPUs, 24 GB RAM) ou `VM.Standard.E2.1.Micro` (AMD x86).
- **Sistema Operacional**: Ubuntu 22.04 / 24.04 LTS ou Oracle Linux 8/9.
- **Armazenamento**: 50 GB a 100 GB Boot Volume.
- **IP Público**: Habilitado (Reserved Public IP / Ephemeral).

---

## 2. Configuração de Rede & Firewall no Oracle Cloud (VCN)

No Oracle Cloud, o tráfego externo é bloqueado por padrão em dois níveis: na **Security List da VCN** e no **Firewall do SO (iptables)**.

### 2.1 Regras de Entrada na VCN (Oracle Console)
Acesse: **Networking → Virtual Cloud Networks → Sua VCN → Security Lists → Default Security List**.
Adicione as seguintes **Ingress Rules**:

| Source CIDR | IP Protocol | Source Port | Destination Port | Descrição |
|---|---|---|---|---|
| `0.0.0.0/0` | TCP | All | `80` | HTTP (Redirecionamento / ACME Let's Encrypt) |
| `0.0.0.0/0` | TCP | All | `443` | HTTPS (Tráfego seguro da aplicação) |
| `0.0.0.0/0` | TCP | All | `22` | SSH (Acesso ao servidor) |

### 2.2 Liberar portas no Firewall do Linux (Oracle OS)
Ao conectar na instância via SSH (`ssh -i chave.key ubuntu@<IP_PUBLICO>`), execute:

```bash
# Para Ubuntu / Debian
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 80 -j ACCEPT
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 443 -j ACCEPT
sudo netfilter-persistent save

# Para Oracle Linux (firewalld)
sudo firewall-cmd --zone=public --permanent --add-port=80/tcp
sudo firewall-cmd --zone=public --permanent --add-port=443/tcp
sudo firewall-cmd --reload
```

---

## 3. Deploy da Aplicação com Docker Compose

### 3.1 Clonar o repositório no servidor
```bash
git clone https://github.com/MaarksN/CENTRAL-DE-INTELIGENCIA-COMECIAL-ATLASGR.git
cd CENTRAL-DE-INTELIGENCIA-COMECIAL-ATLASGR
```

### 3.2 Executar o script automatizado
O repositório inclui um script que prepara o ambiente, sobe os containers, aplica migrações e configura o usuário:

```bash
chmod +x scripts/deploy-oci.sh
./scripts/deploy-oci.sh
```

---

## 4. Estrutura dos Serviços (`docker-compose.oci.yml`)

A arquitetura no Oracle Cloud sobe os seguintes serviços isolados:
1. **`app`**: Monólito AtlasGR (Frontend React + API Express).
2. **`worker`**: Worker de filas em background (BullMQ, cadência, IA).
3. **`postgres`**: Banco PostgreSQL 16 com extensão `vector` (pgvector) e controle de RLS.
4. **`redis`**: Cache e mensageria distribuída.
5. **`caddy`**: Reverse Proxy com **HTTPS automático** via Let's Encrypt / ZeroSSL.

---

## 5. Acesso e Credenciais

Após o deploy:
- **URL**: `https://<SEU_DOMINIO>` ou `http://<IP_PUBLICO>`
- **Usuário Administrador Único**: `marcelo.nascimento@atlasgr.com.br`
- **Senha Padrão**: `01090109`

Para redefinir ou sincronizar novamente o usuário a qualquer momento:
```bash
docker exec -i atlasgr_app npx tsx scripts/seed-team.ts
```
