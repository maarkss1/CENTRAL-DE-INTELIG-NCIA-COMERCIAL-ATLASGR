# Arquitetura Atual e Alvo

## Arquitetura Atual

```mermaid
flowchart TB
    subgraph Client["Frontend (React 19 + Vite)"]
        UI["src/App.tsx (rotas lazy)"]
        AuthCtx["AuthContext — ⚠️ retorna admin hardcoded, ignora sessão real"]
        Features5["5 features com camadas completas:\ncompanies / contacts / crm / activities / notes"]
        Features23["23 features 'UI-only':\nauth, billing, chatbook, intelligence,\nintegrations, analytics, reports, ..."]
        UI --> AuthCtx
        UI --> Features5
        UI --> Features23
    end

    subgraph Server["Express (server.ts)"]
        MW["helmet → cors → rateLimit → json → auth → routes → errorHandler"]
        RoutesLayered["Rotas com Controller→UseCase→Repository\n(companies, contacts, crm, activities, notes)"]
        RoutesFlat["Rotas 'flat' com Prisma direto\n(analytics, prompt, parte de intelligence)"]
        Orphan["server/marketplace — código órfão, não referenciado"]
        MW --> RoutesLayered
        MW --> RoutesFlat
    end

    subgraph Data["Dados"]
        PG[("PostgreSQL + pgvector\nRLS parcial")]
        Redis[("Redis\n(cache, filas, rate-limit)")]
        Meili[("Meilisearch")]
    end

    subgraph AI["IA"]
        Gateway["lib/ai/gateway.ts\ntimeout + fallback + circuit breaker (sólido)"]
        Swarm["SwarmOrchestrator (LangGraph)\n⚠️ bug leadId/instruction no nó SDR"]
        LiteLLM["LiteLLM proxy\n⚠️ 'gemini-*' silenciosamente roteado p/ Groq"]
        Gateway --> LiteLLM
        Swarm --> Gateway
    end

    subgraph Ext["Integrações Externas"]
        Apollo["Apollo/Hunter/BrasilAPI — maduro"]
        Google["Google OAuth — ⚠️ mockado"]
        WhatsApp["WhatsApp (Baileys) — ⚠️ sessão global\nnão multi-tenant"]
        Bitrix["Bitrix24 — ⚠️ SSRF via webhookUrl"]
    end

    Client -->|fetch + bearer localStorage\n+ cookie better-auth| Server
    RoutesLayered --> PG
    RoutesFlat --> PG
    Server --> Redis
    Server --> Meili
    RoutesLayered --> AI
    RoutesLayered --> Ext

    style AuthCtx fill:#f66,color:#000
    style RoutesFlat fill:#fa6,color:#000
    style Google fill:#fa6,color:#000
    style WhatsApp fill:#fa6,color:#000
    style Bitrix fill:#f66,color:#000
    style Swarm fill:#fa6,color:#000
    style LiteLLM fill:#fa6,color:#000
    style Orphan fill:#999,color:#000
```

**Leitura do diagrama:** em vermelho, os pontos que representam falha de controle de acesso confirmada (autenticação de fato desabilitada, SSRF); em laranja, débitos funcionais relevantes mas não críticos de acesso (integrações mockadas/frágeis, bug de IA, roteamento de modelo enganoso, rotas que pulam a camada de serviço); em cinza, código órfão sem efeito em produção.

---

## Arquitetura Alvo

```mermaid
flowchart TB
    subgraph Client["Frontend (React 19 + Vite)"]
        UI2["src/App.tsx"]
        AuthCtx2["AuthContext — deriva de authClient.useSession()\nProtectedRoute com RBAC real por rota"]
        AllFeatures["Todas as features com contrato explícito:\n'core' (camadas completas) OU 'UI-only' (documentado)"]
        UI2 --> AuthCtx2
        UI2 --> AllFeatures
    end

    subgraph Server2["Express (server.ts)"]
        MW2["helmet → cors → rateLimit (por tenant p/ IA)\n→ json → auth (sem bypass por default) → routes → errorHandler"]
        AllRoutes["Toda rota: Controller → UseCase → Repository\n(sem acesso direto ao Prisma em rotas)"]
        MW2 --> AllRoutes
    end

    subgraph Data2["Dados"]
        PG2[("PostgreSQL + pgvector\nRLS em 100% das tabelas com dado de tenant\n+ índices ANN/GIN")]
        Redis2[("Redis\n(cache, filas, rate-limit,\nestado de circuito de IA,\nsessão WhatsApp por tenant)")]
        Meili2[("Meilisearch — gated por ENABLE_SEARCH")]
    end

    subgraph AI2["IA"]
        Gateway2["lib/ai/gateway.ts (mantido como está — referência)"]
        Swarm2["SwarmOrchestrator — leadId real propagado\nPII minimizada na entrada"]
        LiteLLM2["Modelos nomeados de forma honesta\nembedding unificado em 1 pipeline"]
        Pending["Worker executor de AIPendingAction\n(aprovação = ação real)"]
    end

    subgraph Ext2["Integrações Externas"]
        Apollo2["Apollo/Hunter/BrasilAPI — inalterado"]
        Google2["Google OAuth real OU removido da UI"]
        WhatsApp2["WhatsApp multi-tenant via Redis\nbackoff de reconexão + persistência de inbound"]
        Bitrix2["Bitrix24 com allowlist de domínio"]
    end

    Client -->|sessão única via cookie httpOnly| Server2
    AllRoutes --> PG2
    Server2 --> Redis2
    Server2 --> Meili2
    AllRoutes --> AI2
    AllRoutes --> Ext2
```

**Principais mudanças estruturais:**
1. Um único mecanismo de sessão (cookie httpOnly do better-auth), eliminando o token duplicado em `localStorage`.
2. RBAC real aplicado por rota/feature, não apenas um `ProtectedRoute` genérico.
3. 100% das rotas passam por Controller→UseCase→Repository — nenhuma rota toca Prisma diretamente.
4. Estado que hoje é em memória de processo (circuito de IA, sessão WhatsApp) migra para Redis, viabilizando múltiplas réplicas.
5. RLS cobre todas as tabelas com coluna de tenant, incluindo as de IA/conhecimento.
6. `AIPendingAction` aprovado dispara ação real via worker dedicado.
