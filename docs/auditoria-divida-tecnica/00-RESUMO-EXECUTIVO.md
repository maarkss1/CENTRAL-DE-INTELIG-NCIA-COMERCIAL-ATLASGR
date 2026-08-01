# Resumo Executivo — Auditoria de Dívida Técnica
**Sistema:** Prospector Atlas (AtlasGR) — CRM/Plataforma de Prospecção B2B com IA
**Data da auditoria:** 2026-08-01
**Escopo:** Repositório completo (frontend React 19, backend Express, Prisma/PostgreSQL, integrações, IA, infraestrutura)

---

## TECHNICAL HEALTH SCORE: 45/100

O score reflete um sistema com **fundações técnicas de qualidade real** (TypeScript em modo estrito sem erros, engenharia sólida no gateway de IA, observabilidade genuína com OpenTelemetry/Pino/Prometheus, isolamento multi-tenant bem desenhado na maior parte do domínio de CRM) **anulada por falhas de segurança críticas que tornam o controle de acesso da aplicação, hoje, não confiável**. Nenhum sistema com bypass de autenticação incondicional pode ser classificado acima da faixa "crítico" independentemente da qualidade do restante do código.

O score não é uma média aritmética simples: segurança e confiabilidade de autenticação têm peso desqualificante sobre o resultado final, conforme metodologia da Seção 21.

---

## 1. Estado Real do Sistema

O Prospector Atlas é um monólito modular (React 19 + Express + Prisma/PostgreSQL com pgvector, Redis, BullMQ, Meilisearch) com arquitetura em camadas (domain/application/presentation/routes) aplicada de forma consistente em ~5 dos ~28 módulos de `src/features` (o núcleo transacional: activities, companies, contacts, crm, notes) e ausente nos demais 23, que são predominantemente shells de UI. O sistema já foi auditado internamente diversas vezes (`docs/reports/` contém 34 relatórios anteriores, incluindo `RELATORIO_TECHNICAL_DEBT.md`, `PENTEST_REPORT.md`, `FINAL_FORENSIC_AUDIT.md`), mas parte da documentação existente (`docs/compliance/COMPLIANCE_MATRIX.md`) está desatualizada em relação ao estado real do código (ex.: descreve RAG/vetorização como "Ausente" quando o schema já possui `KnowledgeChunk`/`DocumentChunk`/pgvector implementados).

`tsc --noEmit` roda limpo (0 erros) e `vitest run` unitário passa 76/76 testes. `npm run lint` e `npm run build` falharam por esgotamento de memória no ambiente sandboxado desta auditoria (não foi possível confirmar se é um problema do projeto ou do ambiente de execução — ver Seção 2 do `02-RELATORIO-COMPLETO.md`); o build, porém, chegou a transformar 2952 módulos antes de falhar, evidenciando uma árvore de dependências muito pesada (three.js, framer-motion + motion duplicados, xlsx, mammoth não utilizado, langchain, aws-sdk).

## 2. Maiores Riscos

1. **Autenticação de fato não existe no frontend.** `AuthContext.tsx` retorna um usuário admin hardcoded incondicionalmente (`canAccessAdminPanel`/`canAccessBrand` sempre `true`), e existe um componente de login (`Login.tsx`) que autentica automaticamente uma conta backdoor (`admin@prospector.com`) contra o backend real, com esse e-mail presente na allowlist server-side (`AUTHORIZED_LOGIN_EMAILS`). Qualquer visitante que alcance esse fluxo se autentica como administrador total.
2. **Vazamento potencial de dados entre tenants na base de conhecimento/IA.** Os modelos `KnowledgeChunk`, `Document`, `DocumentChunk`, `Prompt`, `AgentMemory`, `AILog` não possuem coluna de tenant real nem RLS; buscas de RAG (`search.service.ts`) não filtram por organização.
3. **SSRF autenticado** via campo `webhookUrl` na exportação de leads para Bitrix24 — qualquer usuário autenticado pode forçar o servidor a fazer requisições a endereços internos arbitrários.
4. **Credenciais reais de funcionários expostas em texto puro** no histórico do Git (`seed_users.ts`), incluindo e-mails corporativos reais e ao menos uma senha com aparência de senha pessoal/corporativa reutilizável (valor mascarado neste relatório; ver `08-PLANO-DE-SEGURANCA.md`).
5. **Pipeline de deploy para produção sem gate de teste.** `production.yaml` tem um job chamado "Build & Test" cujo passo de teste está comentado; a imagem Docker é publicada como `:latest` a cada push em `main` sem qualquer teste, lint ou aprovação manual.

## 3. Principais Bloqueios

- Nenhuma feature de maior superfície de risco (billing, WhatsApp, Google, IA/chatbot/roleplay, relatórios/exportação) possui cobertura de teste — proporção geral de ~1 teste para cada 9 arquivos de produção.
- Integração com Google é inteiramente mockada no backend (`google.service.ts` retorna tokens fake), mas a UI apresenta como conectada.
- Recursos de "IA autônoma" (pontuação de fit, quebra-gelo, aprovação de ações pendentes) misturam dados reais com simulações (`Math.random()`, `alert()`, `setTimeout`) sem sinalização ao usuário — risco de confiança/conversão em um produto de vendas.
- Drift de infraestrutura: dois manifests ArgoCD conflitantes para homolog (mesmo nome, repositórios/namespaces diferentes) e nenhum manifest de produção representado no repositório.

## 4. Custo Provável da Inação

- **Segurança/compliance:** exposição a acesso não autorizado total ao sistema, vazamento de dados entre clientes (multi-tenant), e risco LGPD por envio de PII a provedores de IA externos sem minimização — qualquer um destes pode gerar incidente de segurança, perda de confiança de clientes B2B e exposição regulatória.
- **Confiabilidade comercial:** dados fabricados apresentados como reais (scores de IA, status de integrações, métricas de analytics quando o banco falha) corroem a credibilidade do produto perante times comerciais que o usam para decisão.
- **Velocidade de entrega:** ausência de testes nas áreas de maior risco aumenta o custo e o tempo de qualquer mudança futura nessas áreas, e o pipeline de produção sem gate de teste aumenta a chance de regressões chegarem a produção sem detecção.

## 5. Cinco Prioridades Imediatas (Onda 0/1)

1. Remover o login backdoor (`Login.tsx`, conta `admin@prospector.com`) e reescrever `AuthContext` para derivar o usuário da sessão real do better-auth — sem isso, nenhuma outra correção de segurança tem efeito prático.
2. Rotacionar a(s) credencial(is) exposta(s) em `seed_users.ts` e remover o arquivo do histórico do Git.
3. Adicionar isolamento de tenant (coluna + RLS) às tabelas de conhecimento/IA (`KnowledgeChunk`, `Document`, `DocumentChunk`, `Prompt`, `AgentMemory`, `AILog`) e às tabelas que ficaram de fora do rollout original de RLS (`Prospect`, `AIPendingAction`).
4. Corrigir o SSRF do webhook do Bitrix24 (allowlist de domínio + bloqueio de IPs privados/link-local).
5. Adicionar um passo real de teste ao `production.yaml` antes de qualquer publish de imagem `:latest`, e gate de aprovação manual para produção.

## 6. Recomendação Executiva

O sistema tem uma base de engenharia mais madura do que aparenta à primeira vista (tipagem estrita, gateway de IA com timeout/fallback/circuit breaker bem implementado, observabilidade real, isolamento de tenant bem desenhado na maior parte do domínio central). Entretanto, **o sistema não deve ser considerado seguro para uso em produção multi-tenant no estado atual**, dado que o controle de acesso do frontend está efetivamente desabilitado e existem vetores confirmados de vazamento de dados entre clientes. Recomenda-se congelar novas features voltadas a clientes até a conclusão da Onda 0 (contenção de riscos críticos, ver `04-ROADMAP-CORRECAO.md`), que é estimada em dias, não semanas, dado que os problemas são localizados e não exigem reescrita arquitetural.

---

*Ver documentos complementares: `01-INVENTARIO-TECNICO.md`, `02-RELATORIO-COMPLETO.md`, `03-MATRIZ-DIVIDA-TECNICA.md`, `04-ROADMAP-CORRECAO.md`, `05-QUICK-WINS.md`, `06-ARQUITETURA-ATUAL-E-ALVO.md`, `07-PLANO-DE-TESTES.md`, `08-PLANO-DE-SEGURANCA.md`, `09-BACKLOG-EXECUTAVEL.md`.*
