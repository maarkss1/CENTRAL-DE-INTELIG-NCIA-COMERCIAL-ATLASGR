# BACKLOG EXECUTÁVEL DE FINALIZAÇÃO — CENTRAL DE INTELIGÊNCIA COMERCIAL ATLAS GR

**Data:** 16 de Agosto de 2026  
**Auditor:** Principal Software Architect, Staff Engineer & Release Lead  

---

## FIN-0001 - Higienização Definitiva de Dados no Histórico Git

- **Categoria:** Segurança & LGPD
- **Prioridade:** P0
- **Severidade:** CRITICAL
- **Status:** Aberto
- **Bloqueia produção:** Sim (Ação de Governança Externa)
- **Dependências:** Alinhamento com a equipe de desenvolvimento sobre reescrita de commits.
- **Arquivos:** Histórico Git de `backups/prospector-*.dump`
- **Problema:** Dumps de banco com dados reais de contatos permanecem extraíveis no histórico antigo de commits.
- **Evidência:** `backups/AGENTS.md:7` e `.agents/completion/01-bloqueadores.md:21`.
- **Causa raiz:** Commits iniciais anteriores à governança de agentes que versionaram arquivos `.dump`.
- **Implementação necessária:** Executar `git filter-repo` ou BFG Repo-Cleaner para purgar `backups/` de todos os branches e tags, seguido de force push coordenado.
- **Critério de aceite:** `git log --all -- backups/*.dump` não retornar nenhum registro.
- **Testes:** Varredura com Gitleaks e verificação de integridade do clone.
- **Risco de regressão:** Baixo no código; requer reclonagem pelos desenvolvedores ativos.
- **Estimativa relativa:** M

---

## FIN-0002 - Rotação de Tokens de Webhooks Externos

- **Categoria:** Segurança
- **Prioridade:** P1
- **Severidade:** HIGH
- **Status:** Aberto
- **Bloqueia produção:** Não (Mitigado no código)
- **Dependências:** Acesso administrativo aos portais da Bland AI e Bitrix24.
- **Arquivos:** `.env.example`, `docs/security/runbooks/`
- **Problema:** Credenciais e URLs de webhook que estiveram no histórico podem continuar ativas nos portais externos.
- **Evidência:** `.agents/completion/01-bloqueadores.md:18-20`.
- **Causa raiz:** Exposição em commits legados anteriores ao commit `40a99c31`.
- **Implementação necessária:** Gerar novos segredos nos portais da Bland AI e Bitrix24, atualizar as variáveis de ambiente em produção e revogar os tokens antigos.
- **Critério de aceite:** Conexões externas operando com os novos tokens e requisições com tokens antigos retornando 401/403.
- **Testes:** `npm run verify:integrations` com as novas credenciais.
- **Risco de regressão:** Nenhum.
- **Estimativa relativa:** S

---

## FIN-0003 - Remoção de Workers BullMQ do Processo HTTP (`server.ts`)

- **Categoria:** Backend & Arquitetura
- **Prioridade:** P1
- **Severidade:** HIGH
- **Status:** Em Andamento
- **Bloqueia produção:** Não
- **Dependências:** Serviço `worker.ts` configurado no `render.yaml`.
- **Arquivos:** `server.ts:467-489`
- **Problema:** Processo HTTP (`server.ts`) instancia os 14 workers das filas BullMQ, duplicando o consumo de jobs quando `worker.ts` está ativo.
- **Evidência:** Handoff `.agents/handoffs/onda-6/16-para-00-remover-workers-de-server-ts.md`.
- **Causa raiz:** Manutenção de workers embutidos para compatibilidade com o comando único de desenvolvimento local.
- **Implementação necessária:** Remover a instanciação de workers de `server.ts` ou condicioná-la à flag `ENABLE_EMBEDDED_WORKERS=true` (desligada por padrão em produção).
- **Critério de aceite:** `server.ts` atuando puramente como produtor de filas e servidor HTTP; `worker.ts` atuando como consumidor exclusivo.
- **Testes:** Smoke test de enfileiramento via API e processamento confirmado nos logs de `worker.ts`.
- **Risco de regressão:** Baixo.
- **Estimativa relativa:** S

---

## FIN-0004 - Implementação do Adaptador de Assinatura Gov.br

- **Categoria:** Integrações & Cadência
- **Prioridade:** P1
- **Severidade:** HIGH
- **Status:** Aberto
- **Bloqueia produção:** Não (Existe caminho manual auditável)
- **Dependências:** Credenciamento da empresa no Portal de Serviços do Governo Federal.
- **Arquivos:** `src/features/cadence/infra/GovBrSignatureAdapter.ts`, `src/features/cadence/routes/cadence.routes.ts`
- **Problema:** O fluxo de assinatura de propostas está pronto no domínio e banco, mas consome adaptador mock.
- **Evidência:** `.agents/runs/onda-10.md:102` e `src/features/cadence/domain/dealClosure.ts`.
- **Causa raiz:** Definição recente do Gov.br como provedor oficial sem integração HTTP com o ambiente governamental.
- **Implementação necessária:** Criar o adaptador `GovBrSignatureAdapter` com autenticação OAuth2, envio do hash da proposta e tratamento do webhook de assinatura confirmada.
- **Critério de aceite:** Proposta assinada via Gov.br disparando criação automática de `DealClosureEvent` e movendo lead para `Negócios Ganhos`.
- **Testes:** Testes unitários com MSW simulando o webhook do Gov.br.
- **Risco de regressão:** Baixo.
- **Estimativa relativa:** L

---

## FIN-0005 - Resolução Completa de Avisos do Linter (`jsx-a11y` e `any`)

- **Categoria:** Frontend & Qualidade
- **Prioridade:** P2
- **Severidade:** MEDIUM
- **Status:** Aberto
- **Bloqueia produção:** Não
- **Dependências:** Nenhuma.
- **Arquivos:** `src/features/intelligence/components/AISuiteHub.tsx`, `AutomationGuide.tsx`, `RobustScriptGenerator.tsx`, `src/pages/MarketIntelligence.tsx`, `src/pages/Propostas.tsx`
- **Problema:** Existem 73 warnings no ESLint relacionados a interatividade sem suporte a teclado e tipos `any`.
- **Evidência:** Execução de `npm run lint` (0 errors, 73 warnings).
- **Causa raiz:** Componentes ricos que utilizam `onClick` em `div` sem tags semânticas W3C.
- **Implementação necessária:** Inserir `role="button"`, `tabIndex={0}`, `onKeyDown` com suporte a Enter/Espaço e tipar variáveis `any` com tipos estritos.
- **Critério de aceite:** `npm run lint` executando com 0 erros e 0 warnings.
- **Testes:** `npm run lint`.
- **Risco de regressão:** Baixo.
- **Estimativa relativa:** M

---

## FIN-0006 - Implementação da Command Palette Universal (`⌘K`)

- **Categoria:** UX / Produtividade
- **Prioridade:** P2
- **Severidade:** MEDIUM
- **Status:** Aberto
- **Bloqueia produção:** Não
- **Dependências:** Nenhuma.
- **Arquivos:** `src/components/layout/AppTopbar.tsx`, `src/components/ui/CommandPalette.tsx`
- **Problema:** O badge "⌘K" no topo da interface é visualmente estático e não possui funcionalidade interativa.
- **Evidência:** `PRODUCT_EXPERIENCE_CENTRAL_ATLASGR.md:53`.
- **Causa raiz:** Placeholder criado na primeira versão do layout sem implementação da camada de busca e hotkeys.
- **Implementação necessária:** Criar modal global ativado por `Ctrl+K`/`⌘K` integrando busca rápida de leads, empresas, atalhos de navegação e comandos de IA.
- **Critério de aceite:** Pressionar `Ctrl+K` em qualquer tela autenticada abre o buscador, permitindo navegar via setas do teclado e Enter.
- **Testes:** Testes unitários com React Testing Library e teste E2E Playwright.
- **Risco de regressão:** Baixo.
- **Estimativa relativa:** M

---

## FIN-0007 - Publicação de Associação de Domínio para Deep Links Mobile

- **Categoria:** Mobile
- **Prioridade:** P2
- **Severidade:** MEDIUM
- **Status:** Aberto
- **Bloqueia produção:** Não
- **Dependências:** Domínio de produção ativo com certificado SSL.
- **Arquivos:** `public/.well-known/assetlinks.json`, `capacitor.config.ts`
- **Problema:** Links diretos de CRM abertos no celular não acionam o aplicativo nativo automaticamente.
- **Evidência:** `.agents/runs/onda-8.md:83`.
- **Causa raiz:** Falta da publicação do manifesto de associação de domínio público do Android/iOS.
- **Implementação necessária:** Gerar o hash SHA-256 da keystore de produção e publicar em `https://app.atlasgr.com.br/.well-known/assetlinks.json`.
- **Critério de aceite:** Validação aprovada na ferramenta oficial do Google Digital Asset Links.
- **Testes:** Teste em dispositivo Android físico com abertura de link de lead.
- **Risco de regressão:** Nenhum.
- **Estimativa relativa:** S

---

## FIN-0008 - Unificação de Métricas de Latência HTTP no Express

- **Categoria:** Observabilidade & SRE
- **Prioridade:** P2
- **Severidade:** MEDIUM
- **Status:** Aberto
- **Bloqueia produção:** Não
- **Dependências:** Nenhuma.
- **Arquivos:** `src/shared/middlewares/observability.ts`, `src/lib/tracing.ts`
- **Problema:** Histograma de duração de requisições HTTP do OpenTelemetry apresenta falhas de coleta no Prometheus.
- **Evidência:** Handoff `.agents/handoffs/onda-5/10-para-01-metricas-http-otel.md`.
- **Causa raiz:** Conflito entre exportadores OTLP e métricas manuais `prom-client`.
- **Implementação necessária:** Registrar histograma `http_request_duration_seconds` com buckets semânticos no `prom-client` dentro de `observabilityMiddleware`.
- **Critério de aceite:** Endpoint `/metrics` expondo os percentis P50, P90, P99 por método e rota.
- **Testes:** Teste unitário do middleware e verificação do output `/metrics`.
- **Risco de regressão:** Nenhum.
- **Estimativa relativa:** S

---

## FIN-0009 - Reativação dos 5 Testes E2E Skipados (Baselines Visuais Linux)

- **Categoria:** QA / CI
- **Prioridade:** P2
- **Severidade:** LOW
- **Status:** Aberto
- **Bloqueia produção:** Não
- **Dependências:** Ambiente de CI Linux do GitHub Actions.
- **Arquivos:** `tests/e2e/visual-regression.spec.ts`
- **Problema:** Cinco testes visuais de Playwright estão com `test.skip` devido a diferenças de renderização de fontes entre Windows e Linux.
- **Evidência:** `.agents/runs/onda-8.md:96`.
- **Causa raiz:** Geração de snapshots no ambiente de desenvolvimento Windows sem correspondência com o runner Linux do CI.
- **Implementação necessária:** Executar `npx playwright test --update-snapshots` dentro do container Docker Linux oficial e comitar as imagens de referência.
- **Critério de aceite:** Suíte E2E rodando com 100% de testes ativos (45/45 passando, 0 skipped).
- **Testes:** `npm run test:e2e` no GitHub Actions.
- **Risco de regressão:** Baixo.
- **Estimativa relativa:** S

---

## FIN-0010 - Persistência no Redis para Sessões do WhatsApp (Baileys)

- **Categoria:** Integrações & Estabilidade
- **Prioridade:** P2
- **Severidade:** MEDIUM
- **Status:** Aberto
- **Bloqueia produção:** Não
- **Dependências:** Redis configurado em produção.
- **Arquivos:** `src/features/integrations/whatsapp/whatsapp.service.ts`
- **Problema:** Sessões do WhatsApp residem no filesystem local/memória do processo HTTP.
- **Evidência:** Handoff `.agents/handoffs/onda-6/16-para-06-plano-migracao-baileys.md`.
- **Causa raiz:** Implementação padrão do Baileys com `useMultiFileAuthState`.
- **Implementação necessária:** Implementar `useRedisAuthState` para desacoplar a sessão do filesystem local.
- **Critério de aceite:** Reinicialização do container sem necessidade de novo escaneamento de QR Code.
- **Testes:** Teste de persistência e recuperação de sessão no Redis.
- **Risco de regressão:** Médio (exige validação cuidadosa de locks de socket).
- **Estimativa relativa:** L
