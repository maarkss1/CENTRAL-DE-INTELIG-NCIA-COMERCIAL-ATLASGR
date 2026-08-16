# DÍVIDA TÉCNICA MASTER — CENTRAL DE INTELIGÊNCIA COMERCIAL ATLAS GR

**Data:** 16 de Agosto de 2026  
**Auditor:** Principal Software Architect, Staff Engineer & Security Engineer  

---

## Tabela Consolidada de Débitos Técnicos

| ID | Título | Domínio | Severidade | Prioridade | Bloqueia Produção? | Status |
|---|---|---|---|---|---|---|
| **DT-0001** | Segredo no histórico Git (`backups/*.dump`) | Segurança / LGPD | CRITICAL | P0 | SIM (Ação Humana) | ABERTO NO HISTÓRICO |
| **DT-0002** | Workers BullMQ duplicados no runtime HTTP | Backend / Runtime | HIGH | P1 | NÃO (Mitigado por single-process) | EM ANDAMENTO |
| **DT-0003** | Rotação manual de credenciais de terceiros | Segurança / Ops | HIGH | P1 | NÃO (Funcional) | ABERTO |
| **DT-0004** | Integração Gov.br pendente de implementação de API | Cadência / Fechamento | HIGH | P1 | NÃO (Porta Mock/Manual) | ABERTO |
| **DT-0005** | 73 avisos de ESLint `jsx-a11y` e `any` | Frontend / UX | MEDIUM | P2 | NÃO | ABERTO |
| **DT-0006** | Chunk `exceljs` e `OnboardingTour` no bundle | Frontend / Perf | MEDIUM | P2 | NÃO | PARCIALMENTE RESOLVIDO |
| **DT-0007** | Métrica HTTP Prometheus `http_server_duration` OTel | Observabilidade | MEDIUM | P2 | NÃO | ABERTO |
| **DT-0008** | Sessões Baileys WhatsApp no processo HTTP | Backend / Conexões | MEDIUM | P2 | NÃO | ABERTO |
| **DT-0009** | Deep Link Mobile pendente validação de domínio | Mobile | MEDIUM | P2 | NÃO | ABERTO (Ação Humana) |
| **DT-0010** | Duplicação de modelo `Prospect` vs `Company`/`Lead` | Banco / Prisma | LOW | P3 | NÃO | ABERTO |
| **DT-0011** | Modelos legados `KnowledgeChunk` e RAG paralelo | Banco / IA | LOW | P3 | NÃO | MITIGADO |
| **DT-0012** | Flakiness em testes visuais Linux E2E | QA / CI | LOW | P3 | NÃO | ABERTO |

---

## Detalhamento dos Débitos Técnicos

### DT-0001 - Presença de Dumps de Banco no Histórico Git
- **Domínio:** Segurança & LGPD
- **Arquivo(s):** Histórico Git (commits `2e30b2f`, `543c5b0`, `8b1bc38`, pasta `backups/`)
- **Descrição:** Dumps PostgreSQL (`prospector-*.dump`) contendo dados reais de leads e prospects foram comitados em versões anteriores do repositório. Embora removidos do working tree atual, permanecem extraíveis via histórico de commits.
- **Evidência:** `backups/AGENTS.md:7` e `.agents/completion/01-bloqueadores.md:21`.
- **Causa Raiz:** Commits iniciais sem `.gitignore` restritivo para artefatos de banco.
- **Impacto:** Violação de conformidade LGPD caso o repositório seja compartilhado com partes não autorizadas.
- **Risco:** Alto risco regulatório se o histórico for exposto publicamente.
- **Severidade:** CRITICAL
- **Dependências:** Decisão humana de reescrita de histórico (`git filter-repo` / BFG Repo-Cleaner) pois altera os hashes de commit de todos os branches.
- **Solução:** Executar `git filter-repo --path backups/ --invert-paths` e force push coordenado, seguido de rotação de credenciais de eventuais chaves contidas.
- **Teste Necessário:** `git log --all -- backups/` retornando vazio.
- **Esforço:** M
- **Prioridade:** P0
- **Bloqueia Produção?:** SIM (Ação de Governança Externa)
- **Status:** ABERTO NO HISTÓRICO

---

### DT-0002 - Duplicação de Instanciação de Workers no `server.ts`
- **Domínio:** Backend & Filas
- **Arquivo(s):** `server.ts:467-489`, `worker.ts`
- **Descrição:** Os workers das 14 filas BullMQ são inicializados dentro do processo Express em `server.ts` e também no entrypoint dedicado `worker.ts`.
- **Evidência:** `server.ts:467` (`const leadsWorker = queuesEnabled ? createLeadsWorker() : null;`). Handoff `.agents/handoffs/onda-6/16-para-00-remover-workers-de-server-ts.md`.
- **Causa Raiz:** Criação de `worker.ts` na Onda 6 sem que o corte em `server.ts` fosse aprovado pelo Coordenador para manter compatibilidade em ambiente local.
- **Impacto:** Em produção, se ambos os containers rodarem com `ENABLE_QUEUES=true`, haverá processamento duplicado de jobs fanned-out.
- **Risco:** Médio (concorrência e overhead de memória).
- **Severidade:** HIGH
- **Dependências:** Atualização dos manifestos de deploy no Render/K8s para rodar o serviço Worker separado do serviço Web.
- **Solução:** Aplicar a remoção dos workers de `server.ts` condicionando a inicialização à ausência de serviço worker dedicado ou flag `DISABLE_EMBEDDED_WORKERS=true`.
- **Teste Necessário:** Smoke test com `worker.ts` processando fila e `server.ts` apenas enfileirando.
- **Esforço:** S
- **Prioridade:** P1
- **Bloqueia Produção?:** NÃO (Controlável via variáveis de ambiente)
- **Status:** EM ANDAMENTO

---

### DT-0003 - Rotação de Credenciais e Webhooks de Terceiros
- **Domínio:** Segurança
- **Arquivo(s):** `.env.example`, `docs/security/runbooks/`
- **Descrição:** Webhooks e chaves de serviços externos (Bland AI, Bitrix24) que estiveram presentes em versões antigas do repositório necessitam de rotação formal nos portais dos provedores.
- **Evidência:** `.agents/completion/01-bloqueadores.md:18-21`.
- **Causa Raiz:** Commits legados contendo tokens hardcoded (sanitizados no working tree no commit `40a99c31`).
- **Impacto:** Possibilidade de consumo não autorizado de créditos de telefonia ou acesso ao portal Bitrix24 se as chaves antigas continuarem válidas nos portais externos.
- **Risco:** Alto financeiro/segurança externa.
- **Severidade:** HIGH
- **Dependências:** Acesso de administrador aos portais Bland AI e Bitrix24.
- **Solução:** Gerar novos tokens nos provedores, atualizar secrets no Render/ambiente de produção e revogar os tokens antigos.
- **Teste Necessário:** `npm run verify:integrations` passando com as novas credenciais.
- **Esforço:** S
- **Prioridade:** P1
- **Bloqueia Produção?:** NÃO (Ação externa de infraestrutura)
- **Status:** ABERTO

---

### DT-0004 - Implementação Real do Provedor de Assinatura Gov.br
- **Domínio:** Cadência Comercial & Fechamento
- **Arquivo(s):** `src/features/cadence/domain/dealClosure.ts`, `prisma/schema.prisma:1834-1862`
- **Descrição:** O modelo de dados `CrmDocumentSignatureRequest`, a máquina de estados e os endpoints de cadência estão prontos e tipados para o provedor `govbr`, mas as chamadas HTTP à API do Gov.br estão com adaptadores mock/em memória.
- **Evidência:** `CadenceHub.tsx:103` e `.agents/runs/onda-10.md:102`.
- **Causa Raiz:** Definição do provedor Gov.br realizada na Onda 7/10 sem tempo hábil para credenciamento oficial no ambiente de homologação do Governo Federal.
- **Impacto:** O fechamento automático de negócios por assinatura digital depende de confirmação manual ou mock até a integração com a API Gov.br estar ativa.
- **Risco:** Baixo (fallback seguro para confirmação manual implementado e testado).
- **Severidade:** HIGH
- **Dependências:** Credenciamento da empresa no Portal de Serviços do Governo Federal.
- **Solução:** Implementar `GovBrSignatureAdapter` consumindo a API oficial e validar o webhook de retorno.
- **Teste Necessário:** Suíte de testes unitários e de integração com MSW mockando as respostas da API Gov.br.
- **Esforço:** L
- **Prioridade:** P1
- **Bloqueia Produção?:** NÃO (Existe caminho determinístico manual auditável)
- **Status:** ABERTO

---

### DT-0005 - 73 Avisos de Linter Restantes (`jsx-a11y` e `any`)
- **Domínio:** Frontend & Qualidade
- **Arquivo(s):** `src/features/intelligence/components/AISuiteHub.tsx`, `AutomationGuide.tsx`, `RobustScriptGenerator.tsx`, `MarketIntelligence.tsx`, `Propostas.tsx`
- **Descrição:** Restam 73 warnings no ESLint (reduzidos de 161 na baseline), principalmente `jsx-a11y/click-events-have-key-events`, `no-static-element-interactions` e tipagens `any` em middlewares e workers.
- **Evidência:** Execução de `npm run lint` (0 errors, 73 warnings).
- **Causa Raiz:** Componentes ricos de IA criados recentemente com manipuladores `onClick` em `div` sem `role="button"` e `onKeyDown` correspondente.
- **Impacto:** Usuários que dependem de navegadores acessíveis ou leitores de tela enfrentam barreiras de navegação por teclado nesses componentes específicos.
- **Risco:** Baixo operacional / Médio acessibilidade.
- **Severidade:** MEDIUM
- **Dependências:** Nenhuma.
- **Solução:** Adicionar `role="button"`, `tabIndex={0}`, `onKeyDown` e tipagens estritas em substituição a `any`.
- **Teste Necessário:** `npm run lint` resultando em 0 warnings.
- **Esforço:** M
- **Prioridade:** P2
- **Bloqueia Produção?:** NÃO
- **Status:** ABERTO

---

### DT-0006 - Otimização de Chunks Grandes no Bundle (`exceljs`, `OnboardingTour`)
- **Domínio:** Frontend & Performance
- **Arquivo(s):** `vite.config.ts`, `dist/assets/exceljs.min-*.js`, `dist/assets/OnboardingTour-*.js`
- **Descrição:** Os chunks de `exceljs` (~1.069 kB) e `OnboardingTour` (~1.018 kB) ultrapassam o threshold de 500 kB do Vite.
- **Evidência:** Output de `npm run build` emitindo aviso de tamanho de chunk.
- **Causa Raiz:** Dependências pesadas (`exceljs` com embutimento completo de estilos XML e `@react-three/fiber` no tour).
- **Impacto:** Aumento do tempo de download inicial se esses chunks fossem carregados na inicialização (mitigado: ambos estão atrás de `React.lazy` e `import()` dinâmico disparados sob demanda).
- **Risco:** Baixo (não afeta First Contentful Paint das rotas principais).
- **Severidade:** MEDIUM
- **Dependências:** Nenhuma.
- **Solução:** Avaliar substituição de `exceljs` por gerador CSV leve nativo onde formatação avançada não for necessária, ou manter o chunk lazy isolado.
- **Teste Necessário:** Medição de FCP e bundle analyzer.
- **Esforço:** S
- **Prioridade:** P2
- **Bloqueia Produção?:** NÃO
- **Status:** PARCIALMENTE RESOLVIDO (Içado para lazy import)

---

### DT-0007 - Métrica HTTP Prometheus de Duração do Servidor
- **Domínio:** Observabilidade & SRE
- **Arquivo(s):** `src/shared/middlewares/observability.ts`, `src/lib/tracing.ts`
- **Descrição:** A métrica `http_server_duration_milliseconds_*` injetada via OpenTelemetry auto-instrumentation apresentou comportamento inconsistente em alguns cenários no Prometheus.
- **Evidência:** Handoff `.agents/handoffs/onda-5/10-para-01-metricas-http-otel.md`.
- **Causa Raiz:** Conflito entre a auto-instrumentação do `@opentelemetry/sdk-node` e as métricas manuais do `prom-client`.
- **Impacto:** O alerta `HighErrorRate5xx` pode receber valor `unknown` se a métrica não for coletada adequadamente.
- **Risco:** Médio (afeta telemetria granular de SRE, sem impacto no usuário final).
- **Severidade:** MEDIUM
- **Dependências:** Nenhuma.
- **Solução:** Unificar o middleware de métricas Express usando `prom-client` com histograma customizado `http_request_duration_seconds`.
- **Teste Necessário:** Requisição contra `/metrics` verificando a presença do histograma.
- **Esforço:** S
- **Prioridade:** P2
- **Bloqueia Produção?:** NÃO
- **Status:** ABERTO

---

### DT-0008 - Ciclo de Vida de Sessões Baileys (WhatsApp) no Processo Principal
- **Domínio:** Integrações & Estabilidade
- **Arquivo(s):** `src/features/integrations/whatsapp/whatsapp.service.ts`
- **Descrição:** Os sockets de conexão do WhatsApp via Baileys mantêm instâncias ativas na memória do processo HTTP (`server.ts`).
- **Evidência:** Handoff `.agents/handoffs/onda-6/16-para-06-plano-migracao-baileys.md`.
- **Causa Raiz:** Necessidade de autenticação QR Code interativa no frontend.
- **Impacto:** Reinicializações da API desconectam brevemente as sessões do WhatsApp em andamento.
- **Risco:** Baixo a Médio em alta escala.
- **Severidade:** MEDIUM
- **Dependências:** Mapeamento de persistência de sessão multi-instância no Redis.
- **Solução:** Mover a gerência de sockets para um serviço dedicado (Microserviço ou Worker com Redis Auth State).
- **Teste Necessário:** Reconexão automática após restart do container sem perder pareamento.
- **Esforço:** L
- **Prioridade:** P2
- **Bloqueia Produção?:** NÃO
- **Status:** ABERTO

---

### DT-0009 - Configuração de Domínio e Keystore para Deep Links Mobile
- **Domínio:** Mobile (Capacitor)
- **Arquivo(s):** `capacitor.config.ts`, `android/app/src/main/AndroidManifest.xml`
- **Descrição:** O suporte a Deep Linking (`atlasgr://` e `https://app.atlasgr.com.br`) foi implementado no código nativo e no frontend, mas a validação de `assetlinks.json` (Android) e `apple-app-site-association` (iOS) requer o domínio final ativo.
- **Evidência:** `.agents/runs/onda-8.md:83`.
- **Causa Raiz:** Dependência de DNS corporativo e publicação HTTPS em ambiente de produção.
- **Impacto:** O clique em links de CRM no celular abre o navegador em vez do aplicativo nativo até o arquivo de associação de domínio ser publicado.
- **Risco:** Baixo (fallback para Webview funcional).
- **Severidade:** MEDIUM
- **Dependências:** Domínio de produção ativo com SSL.
- **Solução:** Publicar `.well-known/assetlinks.json` na raiz do domínio público.
- **Teste Necessário:** Validação via Google Digital Asset Links Tool.
- **Esforço:** S
- **Prioridade:** P2
- **Bloqueia Produção?:** NÃO
- **Status:** ABERTO (Ação de Infraestrutura/DNS)

---

### DT-0010 - Duplicação Estrutural entre `Prospect` e `Company`/`Lead`
- **Domínio:** Banco de Dados & Modelagem
- **Arquivo(s):** `prisma/schema.prisma:1472-1507`
- **Descrição:** A tabela `Prospect` armazena dados de descoberta que espelham campos de `Company` e `Lead` (CNPJ, razão social, score, status).
- **Evidência:** `PRODUCT_EXPERIENCE_CENTRAL_ATLASGR.md:66`.
- **Causa Raiz:** Módulo de Discovery criado originalmente como PoC isolado antes da unificação do domínio de Prospecção.
- **Impacto:** Redundância de dados e necessidade de sincronização no momento da conversão.
- **Risco:** Baixo (isolamento garantido por RLS).
- **Severidade:** LOW
- **Dependências:** Migração de dados de prospects ativos.
- **Solução:** Deprecar a tabela `Prospect` e usar `Lead` com status `Descoberta` ou tabela unificada de staging.
- **Teste Necessário:** Validação de migração Prisma sem perda de registros.
- **Esforço:** M
- **Prioridade:** P3
- **Bloqueia Produção?:** NÃO
- **Status:** ABERTO
