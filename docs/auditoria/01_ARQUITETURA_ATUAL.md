# ARQUITETURA ATUAL — CENTRAL DE INTELIGÊNCIA COMERCIAL ATLAS GR

**Data:** 16 de Agosto de 2026  
**Auditor:** Principal Software Architect & Staff Engineer  

---

## 1. Visão Geral da Arquitetura

A **Central de Inteligência Comercial ATLAS GR** é estruturada como uma aplicação moderna orientada a domínios (Domain-Driven Design / Clean Architecture parcial), composta por um frontend SPA React 19 desacoplado e servido por uma API REST Express em Node.js com suporte a processamento assíncrono via BullMQ/Redis e persistência multi-tenant isolada no PostgreSQL via Prisma e Row-Level Security (RLS).

```mermaid
graph TD
    subgraph Frontend["Frontend SPA (React 19 + Vite + TailwindCSS)"]
        UI[Páginas & Componentes de UI]
        Bus[NavigationBus & SoundEffects]
        Ctx[BrandContext / AuthContext / ActiveRecordContext]
        Query[TanStack React Query & Custom Hooks]
    end

    subgraph Backend["API Layer (server.ts - Express Monolith)"]
        SecMW[Helmet + Strict CSP + CORS + RateLimiters]
        AuthMW[Better-Auth Session + authenticateToken]
        TenantMW[requireTenant + AsyncLocalStorage Context]
        RoleMW[requireRole & requireLeadOwnership]
        Controllers[API Routers & Controllers]
        DI[DI Container - tsyringe / manual]
        SSE[SSE Notification Service]
    end

    subgraph CoreDomain["Application & Domain Core"]
        UseCases[Domain UseCases]
        DomainServices[Domain Services & State Machines]
        CadenceEngine[Cadence Engine & Closure Ledger]
        AIGateway[AI Gateway & Circuit Breaker]
        EnrichEngine[Cascata de Enriquecimento & Scoring]
    end

    subgraph AsyncWorker["Background Processing (worker.ts / server.ts)"]
        BullMQ[14 Filas BullMQ]
        Crons[Jobs Recorrentes & Scanners]
        DeadLetter[Dead Letter Queues & Resiliência]
    end

    subgraph DataStorage["Data & Infrastructure"]
        Postgres[(PostgreSQL + pgvector + RLS)]
        Redis[(Redis Cache, Locks & Queues)]
        Meili[(Meilisearch Full-Text Index)]
        Vault[(Criptografia AES-256-GCM em repouso)]
    end

    subgraph ExternalServices["Provedores & Integrações Externas"]
        Bitrix[Bitrix24 REST CRM]
        Groq[Groq / Llama 3.3 70B]
        Bland[Bland AI / Birth Voices]
        ThreeCX[3CX PABX VoIP]
        Google[Google Workspace / Calendar]
        Apollo[Apollo.io B2B]
        Places[Google Places API]
        Hunter[Hunter.io]
        GovBr[Assinatura Eletrônica gov.br]
    end

    UI --> Query
    Query -->|HTTPS / REST| SecMW
    SecMW --> AuthMW --> TenantMW --> RoleMW --> Controllers
    Controllers --> DI --> UseCases --> DomainServices
    DomainServices --> CadenceEngine
    DomainServices --> AIGateway
    DomainServices --> EnrichEngine
    UseCases -->|Prisma with RLS| Postgres
    DomainServices -->|Enqueue| BullMQ
    BullMQ --> AsyncWorker
    AsyncWorker -->|Prisma / RLS| Postgres
    AsyncWorker --> Redis
    AIGateway --> Groq
    EnrichEngine --> Apollo & Places & Hunter
    DomainServices --> Bitrix & Bland & ThreeCX & Google
    Controllers --> SSE
    SSE -.->|Server-Sent Events| UI
```

---

## 2. Camada de Segurança e Multi-Tenancy (Row-Level Security)

### Isolamento Físico e Lógico por Organização

A plataforma implementa **Row-Level Security (RLS) no PostgreSQL**, garantindo que nenhum vazamento cross-tenant ocorra mesmo se uma cláusula `where: { organizationId }` for omitida no código da aplicação.

```mermaid
sequenceDiagram
    autonumber
    actor Cliente as Usuário Autenticado
    participant API as Express API (server.ts)
    participant ALS as TenantAwareAsyncLocalStorage
    participant Prisma as Extended Prisma Client (prisma.ts)
    participant PG as PostgreSQL (RLS Policies)

    Cliente->>API: HTTP Request com Cookie de Sessão / Token
    API->>API: authenticateToken decodifica Session
    API->>ALS: requestContext.run({ tenantId: user.organizationId, role: user.role })
    Note over ALS: Ancoragem do tenantId no contexto assíncrono da requisição
    API->>Prisma: prisma.lead.findMany(...)
    Prisma->>PG: BEGIN Transaction
    Prisma->>PG: SELECT set_config('app.current_tenant_id', 'org_123', true)
    Prisma->>PG: SELECT * FROM "Lead" WHERE ...
    Note over PG: Postgres aplica RLS Policy: organizationId = current_setting('app.current_tenant_id')
    PG-->>Prisma: Apenas registros da org_123
    Prisma->>PG: COMMIT Transaction
    Prisma-->>API: Dados isolados
    API-->>Cliente: HTTP 200 OK com dados do Tenant
```

### Criptografia de Dados Sensíveis em Repouso
- **Campos Criptografados:** Telefones pessoais de contatos (`Contact.phone`), Webhook URLs e credenciais de PABX (`ThreeCXConnection.apiSecret`, `BitrixConnection.webhookUrl`).
- **Algoritmo:** AES-256-GCM com chave simétrica de 32 bytes gerada via `CREDENTIALS_ENCRYPTION_KEY` e vetor de inicialização (IV) aleatório por registro.
- **Fail-Closed:** Se a chave não for válida ou estiver ausente, a aplicação encerra no boot (`process.exit(1)`).

---

## 3. Arquitetura do Gateway de IA e Automações

O módulo de IA utiliza uma arquitetura resiliente com **Circuit Breaker** distribuído no Redis (com degradação limpa em memória caso o Redis esteja indisponível), rate limiting por organização e auditoria de tokens/custos.

```mermaid
flowchart TD
    Req[Requisição de IA / Agente] --> RateLimit{Rate Limit por Org < 15/15min?}
    RateLimit -- Não --> Err429[Retorna HTTP 429 Too Many Requests]
    RateLimit -- Sim --> CB{Circuit Breaker Aberto?}
    CB -- Sim --> Fallback[Aciona Provedor de Fallback / Cache Local]
    CB -- Não --> Invoke[Invoca Provedor Primário: Groq Llama 3.3]
    Invoke -- Sucesso --> RecordLog[Grava AILog: tokens, latência, custo]
    Invoke -- Falha 5xx/Timeout --> Tripper[Registra Falha no Circuit Breaker]
    Tripper --> Retry[Retentativa com Backoff Exponencial / Fallback]
    RecordLog --> Resp[Retorna Output Estruturado Zod]
```

---

## 4. Arquitetura de Cadência e Autonomia Comercial (Onda 10)

Implementado com foco em **Autonomia 24/7 com Fechamento Determinístico**:

1. **Máquina de Estados de Cadência:** Sequências de toques multicanais (E-mail, WhatsApp, Ligação).
2. **Reply Tracking:** Identificação de respostas genuínas via `Message-Id` e `In-Reply-To`.
3. **Agendamento Verificável:** Transição para reunião agendada só ocorre mediante evidência inequívoca (`LeadCalendarReply`, `LeadSchedulingLinkClick`, `ManualVerified`).
4. **Fechamento Determinístico:** Transição para `Negócios Ganhos` é **impossível via IA** — exige assinatura no Gov.br (`SignatureCompleted`), confirmação de pagamento (`PaymentConfirmed`) ou validação manual de gestor (`ManualCrmConfirmation`) registrada no `DealClosureEvent`.

---

## 5. Arquitetura de Filas e Processamento Assíncrono

A plataforma opera com um modelo híbrido:
- **`server.ts`**: Processo HTTP principal. Enfileira jobs em 14 filas BullMQ.
- **`worker.ts`**: Entrypoint dedicado de processamento. Consome as filas isoladamente com health check independente na porta 3006 e métricas Prometheus expostas.
- **Transição de Governança (Handoff 16-00):** Eliminação da instanciação redundante de workers dentro do `server.ts` para evitar concorrência desnecessária quando `worker.ts` estiver ativo em ambiente de produção.
