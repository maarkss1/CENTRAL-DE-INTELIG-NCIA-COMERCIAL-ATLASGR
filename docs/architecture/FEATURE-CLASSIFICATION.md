# Classificação de Features — `src/features/**`

> **Item de dívida técnica:** ARCH-001 (ver `docs/auditoria-divida-tecnica/03-MATRIZ-DIVIDA-TECNICA.md`).
> **Data:** 2026-08-02.
>
> **⚠️ Desatualizado a partir de 2026-08-19.** A classificação por rota (não por pasta), incluindo
> revisão dos achados abaixo, vive agora em `docs/audits/product-truth-wave-1.md` (Onda 1 —
> "Verdade do produto") — trate aquele documento como fonte de verdade atual. Achados específicos
> já corrigidos desde esta data: **Google** (linha "Misto"/BACK-005) deixou de ser mock — OAuth2
> real com refresh token persistido (`google.service.ts`); **`reports`, `roleplay`, `settings`,
> `team`** deixaram de ser placeholders de 25 linhas — cada um ganhou tela e camada de serviço
> reais (`ReportsHub.tsx`, `RoleplayHub.tsx`, `team.service.ts`/`team.routes.ts`), embora os
> arquivos antigos de placeholder (`src/features/reports/components/Reports.tsx` etc.) continuem
> no repositório como código morto, sem rota apontando para eles.

## Critério usado

Cada uma das 24 pastas em `src/features/` foi classificada em uma das categorias abaixo, com base em uma inspeção rápida (não exaustiva) de `routes/`, `services/`/`infra/`, presença de chamadas `prisma.*` reais, presença de testes, e cruzamento com os achados já documentados nas auditorias anteriores (`01-INVENTARIO-TECNICO.md`, `02-RELATORIO-COMPLETO.md`, `03-MATRIZ-DIVIDA-TECNICA.md`):

- **Core transacional** — dado real, persistido via Prisma/Postgres, com rota de API real, usado em um fluxo de negócio principal (prospecção, CRM, IA, faturamento de uso, etc.). Pode conter dívida técnica (bugs, falta de camada, dado fabricado em um sub-fluxo específico) sem deixar de ser core — isso é sinalizado na coluna Observação.
- **UI-only / Mock** — a tela/frontend existe, mas o "backend" por trás é simulado (retorna dado fixo, usa `setTimeout`/`Math.random` no lugar de uma chamada real) ou é literalmente um placeholder ("Em desenvolvimento...", card vazio) sem nenhuma lógica de negócio implementada.
- **Suporte/Infra** — não é uma feature de produto com dados/rotas próprias; é uma camada transversal (autenticação, composição de outras features, onboarding de UX) que não possui `domain`/`application`/`routes` própria e não é dona de nenhum dado.
- **Misto** — a pasta contém sub-módulos com classificações diferentes (ex.: uma integração real e outra mockada dentro da mesma pasta `integrations/`); detalhado na Observação.

Este documento **não substitui** a auditoria completa — é a formalização pontual pedida em ARCH-001 (`Formalizar categorias "core" vs "UI-only"`), servindo de referência rápida para decisões de arquitetura, priorização de testes (`07-PLANO-DE-TESTES.md`) e para não investir esforço de "produção" em telas que hoje são apenas placeholders.

## Tabela

| Feature | Classificação | Justificativa | Observação |
|---|---|---|---|
| `activities` | Core transacional | Camada completa (domain/application/infra/presentation/routes), `PrismaActivityRepository.ts` real, alimenta CRM e Calendário | Sem paginação real (BACK-004) |
| `analytics` | Core transacional | `analytics.service.ts`/`analytics.routes.ts` fazem `prisma.*.count` reais | Em erro de banco, retorna **dado fabricado** silenciosamente sem gate de `NODE_ENV` (**BACK-003**) — risco de métrica inventada parecer real em produção |
| `auth` | Suporte/Infra (transversal, crítico) | Pasta só tem `components/` (telas de login); a lógica real de sessão vive fora de `src/features` (`src/lib/auth.ts`, `AuthContext.tsx`) | **Comprometida**: backdoor hardcoded (SEC-001), `AuthContext` retorna admin incondicional (SEC-002), login por e-mail sem checar senha (SEC-003) — ver `08-PLANO-DE-SEGURANCA.md` |
| `automations` | Core transacional | `automation.service.ts`/`automation.engine.ts` usam `prisma.automation.*` reais; campanha de discagem fria com registro real (commit `4c04dba`) | Tem testes próprios (`__tests__/`) |
| `billing` | Core transacional | `usage.service.ts` consulta `prisma.aILog.*` (tokens/custo/latência reais) | **Não é faturamento real** — o próprio código documenta que não há plano/assinatura/provedor de pagamento; é rastreamento de custo estimado de uso de IA, não cobrança |
| `calendar` | Core transacional | `calendar.api.ts` consome `/api/activities` real (mesmo backend de `activities`) | É uma view sobre dado real de `activities`, não tem persistência própria |
| `chatbook` | Core transacional | `ChatbookHub.tsx`/`FloatingChatbook.tsx` chamam `/api/intelligence/studio` real | Componentes "deus" (912/741 linhas) misturando orquestração de chat com UI (ARCH-002) |
| `companies` | Core transacional | Camada completa, `PrismaCompanyRepository.ts` real | O achado **ARCH-006** (bulk actions simuladas com `setTimeout`/`alert`, fallback de stack tecnológica fabricado em `CompanyList.tsx`) descrito em `02-RELATORIO-COMPLETO.md` **já foi corrigido** — commit `8024f78 fix(arch-006)` (verificado nesta classificação: `handleBulkEnrich` hoje chama `companiesDB.enrich(cnpj)` real). Auditoria anterior está desatualizada nesse ponto |
| `contacts` | Core transacional | Camada completa, `PrismaContactRepository.ts` real | — |
| `crm` | Core transacional | Camada completa, `PrismaLeadRepository.ts` real | — |
| `dashboard` | Suporte/Infra | `SinglePageDashboard.tsx` só compõe hooks (`useAnalytics`, `useActivities`) de outras features reais; `AIConfigCenter.tsx` chama `/api/intelligence/ai-settings` real | Não tem `routes`/`services`/dado próprio — é camada de composição/apresentação |
| `document-editor` | Core transacional | `Editor.tsx` chama `/api/knowledge/:id` real (GET e PUT), é a UI de edição da feature `knowledge` | Acoplado a `knowledge`, sem `routes`/`services` próprios |
| `gamification` | **UI-only / Mock** | `GameWidget.tsx` mostra fatos de vendas aleatórios (`Math.random`); `SpaceGame.tsx` é um mini-jogo 3D decorativo com posições/spawns aleatórios | Puramente decorativo, não conectado a nenhuma lógica de negócio real; sem item de dívida técnica dedicado além de código morto genérico (COD-001) |
| `integrations` | **Misto** | Pasta com 3 sub-integrações de maturidade muito diferente | **Google** (`google/google.service.ts`): **inteiramente mockado** — `getGoogleAuthUrl` retorna URL placeholder, `processGoogleCallback` ignora o `code` e devolve `mock_token`, `getGoogleStatus` sempre retorna desconectado (**BACK-005**). **WhatsApp** (`whatsapp/`): real (Baileys), mas frágil — sessão global não multi-tenant, sem backoff de reconexão, handler de mensagens recebidas vazio (SEC-005/BACK-006). **Birth Voice** (`birth-voice/`): real, `prisma.*` genuíno, com testes (`__tests__/`), SDR de voz recém-entregue (commits `d0b8f47`/`4c04dba`) |
| `intelligence` | Core transacional | Arquitetura Swarm multi-agente real (`agents/`, `graphs/`, `tools/`), `prisma.*` real em várias camadas, alimenta CRM (`crmTools.ts`) | Bugs reais conhecidos: tipo incompatível Swarm→SDR (IA-003), aprovação de ação pendente que não executa nada (IA-005), PII enviada sem minimização (IA-006) |
| `knowledge` | Core transacional | `ingestion.service.ts`/`search.service.ts`/`vector-support.ts` com `prisma.*` real (pgvector), testes próprios | Base de RAG usada por `document-editor` e pelo chat |
| `notes` | Core transacional | Camada completa, `PrismaNoteRepository.ts` real | — |
| `notifications` | Core transacional | `notification.service.ts` com `prisma.notification.*` real (create/findMany/count/updateMany) | — |
| `onboarding` | Suporte/Infra | `OnboardingTour.tsx` é um tour de UX (flag `has_seen_tour`), sem `routes`/`services`/dado de negócio próprio | Montado incondicionalmente em todo `AppLayout`, carregando chunk pesado de three.js antes mesmo de checar a flag (FRONT-004) |
| `prospecting` | Core transacional | `prospecting.service.ts`/`enrichment.service.ts` reais (`prisma.*`), integra Apollo/Hunter/BrasilAPI/CNPJ.ws/IBGE de verdade | Os achados **ARCH-006** (score de "Fit" com `Math.random()`, "Gerar Quebra-Gelo" com `alert()` fake em `ProspectingHub.tsx`) e **BACK-007** (worker de enriquecimento simulado em `company.worker.ts`) descritos em `02-RELATORIO-COMPLETO.md` **já foram corrigidos**: `ProspectingHub.tsx` não tem mais `Math.random`/alert fake (commit `8024f78`), e `company.worker.ts` foi removido do working tree em favor de `enrichCompany()` real em `enrichment.service.ts` (mudança em andamento no repo no momento desta classificação — confirmar se já commitada). Auditoria anterior está desatualizada nesses dois pontos |
| `reports` | **UI-only / Mock** | `Reports.tsx`: componente de 25 linhas, sem `routes`/`services`/fetch — placeholder "Em desenvolvimento... Esta funcionalidade está em construção" | Sem item de dívida técnica dedicado; recomenda-se criar um ao priorizar a feature |
| `roleplay` | **UI-only / Mock** | `Roleplay.tsx`/`RoleplayHub.tsx`: mesmo padrão de placeholder de 25 linhas, sem lógica | Sem item de dívida técnica dedicado |
| `settings` | **UI-only / Mock** | `Settings.tsx`: mesmo padrão de placeholder de 25 linhas, sem lógica | Sem item de dívida técnica dedicado |
| `team` | **UI-only / Mock** | `Team.tsx`: mesmo padrão de placeholder de 25 linhas, sem lógica | Sem item de dívida técnica dedicado |

## Resumo por categoria

| Categoria | Quantidade | Features |
|---|---:|---|
| Core transacional | 15 | activities, analytics, automations, billing, calendar, chatbook, companies, contacts, crm, document-editor, intelligence, knowledge, notes, notifications, prospecting |
| UI-only / Mock | 5 | gamification, reports, roleplay, settings, team |
| Suporte/Infra | 3 | auth, dashboard, onboarding |
| Misto (contém sub-módulo mockado) | 1 | integrations (Google mockado — BACK-005; WhatsApp e Birth Voice reais) |

**Total: 24 pastas em `src/features/`.**

### Destaques — Mock / UI-only (achado principal deste documento)

1. **`reports`, `roleplay`, `settings`, `team`** — quatro telas inteiras são placeholders idênticos ("Em desenvolvimento... Esta funcionalidade está em construção"), sem nenhuma camada de backend. Isso é maior do que o número "23 de 28 sem Clean Architecture completa" citado em ARCH-001 sugere à primeira vista: para essas quatro, não é que a arquitetura seja informal — **não existe funcionalidade real implementada**.
2. **`gamification`** — decorativo por design (jogo 3D + fatos aleatórios), não é uma feature de negócio incompleta, mas deve continuar fora de qualquer métrica de "cobertura de produto".
3. **`integrations/google`** — a integração Google (`google.service.ts`) é inteiramente mockada (**BACK-005**), porém a tela de Integrações a apresenta como uma conexão real (`connected: false` fixo é tratado pela UI como resultado de uma checagem genuína) — ver também **FRONT-005**.
4. **Nota de correção em relação à auditoria anterior:** `02-RELATORIO-COMPLETO.md` descreve `companies`/`prospecting` como contendo sub-fluxos fabricados (ARCH-006: score de fit aleatório, quebra-gelo falso, bulk actions com `setTimeout`; BACK-007: worker de enriquecimento simulado). Ao verificar o código-fonte atual para esta classificação, **esses dois achados já foram corrigidos** (commit `8024f78 fix(arch-006)`; remoção de `company.worker.ts` em favor de `enrichCompany()` real). Mantido aqui como registro de que o padrão de risco mais perigoso — dado fabricado **dentro** de um fluxo que o usuário já confia como real, e não isolado em uma tela "em construção" — já ocorreu neste projeto e pode se repetir; o item ainda vivo desse mesmo padrão é a integração Google (`BACK-005`, destaque 3 acima).
