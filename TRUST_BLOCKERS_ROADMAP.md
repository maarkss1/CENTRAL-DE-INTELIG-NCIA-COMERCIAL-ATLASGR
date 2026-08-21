# Roadmap de Bloqueadores de Confiança — Central de Inteligência Comercial ATLASGR

**Levantamento em**: 2026-08-20, branch `claude/trust-blockers-roadmap-r7crwh`.
**Objetivo**: registrar, num único lugar vivo, o backlog P0–P3 de confiança/valor/arquitetura/design
do produto, com o **status real** de cada item auditado contra o código atual — não a intenção
declarada em outro documento. Este arquivo é o candidato a "matriz viva de maturidade" pedida no
item P1-7 abaixo; ver seção "Como manter este documento vivo" ao final.

Este documento não substitui as auditorias detalhadas já existentes no repositório — ele aponta
para elas e resume o veredito. Fontes cruzadas nesta auditoria: `PRODUCT_VISUAL_TRUTH_MAP.md`,
`DESIGN_QA_CENTRAL_ATLASGR.md`, `docs/architecture/FEATURE-CLASSIFICATION.md`,
`docs/architecture/MATRIZ_ARQUITETURA.md`, `docs/ADR/ADR-002-Clean-Architecture.md`,
`docs/DATA-CONTRACT-LEAD.md`, `.agents/completion/02-mapa-plataforma.md`, `EXECUCAO-ONDAS.md`.

> **Achado estrutural (item P1-7, ver abaixo)**: o repositório já tem três "mapas de maturidade"
> diferentes (`PRODUCT_VISUAL_TRUTH_MAP.md` de 17/08, `.agents/completion/02-mapa-plataforma.md`
> de 15/08, `docs/architecture/FEATURE-CLASSIFICATION.md` de 02/08) e eles **já divergem entre si**
> depois de poucas semanas — nenhum tem processo de atualização contínua. Isso é, em si, uma
> instância do problema que este backlog tenta resolver: documento de confiança que não é mantido
> vira uma nova fonte de desconfiança.

## Legenda de status

| Status | Significado |
|---|---|
| ✅ RESOLVIDO | Verificado no código atual — não apenas numa mensagem de commit ou noutro doc. |
| 🟡 PARCIAL | Parte do problema foi corrigida; resta uma lacuna concreta (listada na coluna Nota). |
| 🔴 PENDENTE | Não foi endereçado; comportamento problemático ainda presente. |

---

## P0 — Bloqueadores de confiança

| # | Item | Status | Evidência | Nota |
|---|---|---|---|---|
| P0-1 | Remover fallback de tecnologias fixas em empresas ou rotular como demonstração | ✅ RESOLVIDO | `src/features/companies/components/CompanyDetail.tsx:93-94,207-237` — `technologiesList = company.technologies ?? []`, gate `hasDetectedTechnologies`; lista vazia mostra aviso explícito de que nenhum logo demonstrativo foi usado. Commit `33f9316` (fix(02): rotular dados demonstrativos). | — |
| P0-2 | Garantir que dashboards diferenciem erro/offline de zero real | ✅ RESOLVIDO | `LiveStatsWidget.tsx:33-45,99,129-141,159` (badge "Modo Offline" + "—", nunca 0 disfarçado); `CrmOverview.tsx:57,86-91` (tela de erro dedicada); `SinglePageDashboard.tsx:37,44,100-103,146` (`statsError`/`agendaError` como bloco de erro). | Verificado nos 3 widgets executivos principais; não é auditoria de 100% dos KPI tiles do produto. |
| P0-3 | Revisar telas com dado sintético/stub tratado como operacional | ✅ RESOLVIDO (amostragem) | `PRODUCT_VISUAL_TRUTH_MAP.md` seção C confirma ausência de `*mock*/*fixture*` em `src/`. `GamificationWidget.tsx:12-23` documenta XP/nível fictício zerado por padrão; `SpaceGame.tsx`/`GameWidget.tsx` usam `Math.random` só em mecânica decorativa já rotulada. | Verificação por amostragem — não cobre as ~24 features do produto uma a uma. Reabrir se uma tela nova reintroduzir número inventado. |

**Resultado da Onda 1 ("Verdade do produto")**: os 3 itens P0 auditados aqui já foram corrigidos
em rodadas anteriores (commits `33f9316` e a leva de widgets de dashboard). O achado real desta
rodada não é um bug de P0 novo — é que o **rastreamento em si** (P1-7) está fragmentado e
desatualizado.

---

## P1 — Valor de produto

| # | Item | Status | Evidência | Nota |
|---|---|---|---|---|
| P1-4 | Implementar IA contextual ao registro aberto | ✅ RESOLVIDO | `src/contexts/ActiveRecordContext.tsx` + `src/hooks/assistantContext.ts` injetam tipo/id/label/resumo do registro aberto no prompt do Chatbook. `setActiveRecord` chamado em `CompanyDetail.tsx` (empresa), `LeadDetailDrawer.tsx:68` (lead), `ContactForm.tsx:73` (contato — `ContactDetail.tsx` é stub morto, nunca importado; a tela real de contato é o formulário) e `commercial-intelligence/components/DealDrillDownDrawer.tsx` (negócio, ao abrir o composer de risco de uma linha específica — o drawer normalmente lista vários negócios filtrados, então "um negócio aberto" só existe nesse momento). | Os 4 tipos de registro (`company\|contact\|lead\|deal`) já registram/limpam o registro ativo corretamente. |
| P1-5 | Clarificar navegação por persona e reduzir duplicação de superfícies de IA | 🟡 PARCIAL | `src/components/layout/Sidebar.tsx:46-67` já agrupa por jornada ("IA & Capacitação" com 8 itens), não mais o grupo único de 14 itens descrito antes — a duplicação de navegação já não reflete o código. A duplicação real de IA conversacional estava no backend: `agent.routes.ts` tinha 4 endpoints órfãos (`/chat`, `/groq`, `/roleplay`, `/qualification`) com prompt/sistema próprio, inatingíveis por qualquer UI viva (só o hook morto `useAiPlaybookGenerator.ts` os chamava) — ambos removidos. `ChatbookHub.tsx` (página `/app/chatbook`) e `FloatingChatbook.tsx` (drawer global) continuam sendo duas entradas, mas já compartilhavam a mesma fonte de estado (`useAssistantChat`); agora isso está documentado em comentário nos dois arquivos em vez de parecer implementações concorrentes. | Fonte única do backend conversacional confirmada: só `POST /api/intelligence/studio/stream` (via `useAssistantChat`). Falta ainda validar se P3-15 (mesma raiz, reorganização de sidebar) pode ser fechado — a evidência do Sidebar sugere que sim, mas não foi auditado a fundo nesta rodada. |
| P1-6 | Fechar ou rotular stubs de calendário/Google | 🟡 PARCIAL | `google.service.ts` tem OAuth real (`OAuth2Client`, HMAC state, chamadas reais a `googleapis.com/calendar/v3`), escopo `calendar.readonly` — não é mock, ao contrário do que `docs/architecture/FEATURE-CLASSIFICATION.md:34` (02/08, desatualizado) ainda descreve. Commit `e91ee7a` rotula escrita de agendamento como "stub de transporte" no código/commit. `Calendar.tsx` do app (`/app/calendar`) é 100% local, sem ligação ao Google. | Rotulagem existe em código/commit, **não na UI**: `Integrations.tsx:191` diz "Gmail e Calendar integrados" sem qualificar como somente-leitura; a tela `/app/calendar` não avisa que não sincroniza com o Google. Decisão de produto pendente: implementar escrita real ou renomear para "agenda local" (ver Onda 3). |
| P1-7 | Manter matriz viva de maturidade por rota | 🟡 PARCIAL | Existem 3 mapas: `PRODUCT_VISUAL_TRUTH_MAP.md` (marketing, 17/08), `.agents/completion/02-mapa-plataforma.md` §7 (dev/ops, 15/08), `docs/architecture/FEATURE-CLASSIFICATION.md` (02/08). Nenhum tem histórico de atualização contínua e já divergem entre si (ex.: FEATURE-CLASSIFICATION.md ainda chama Google de "inteiramente mockado", contradito pelo código — ver P1-6). | Não é uma matriz única e viva; são fotografias pontuais desatualizadas em ~2 semanas. **Este arquivo (`TRUST_BLOCKERS_ROADMAP.md`) é o candidato a matriz única** — ver seção final sobre como mantê-lo atualizado, e consolidar/depreciar os outros três quando possível. |

---

## P2 — Arquitetura e manutenção

| # | Item | Status | Evidência | Nota |
|---|---|---|---|---|
| P2-8 | Avançar Clean Architecture nos módulos core ainda híbridos | 🟡 PARCIAL | `docs/ADR/ADR-002-Clean-Architecture.md` e `docs/architecture/MATRIZ_ARQUITETURA.md:11-12`: "Core CRM: 100% migrado" vs. "Módulos de IA (Prospecting/AI): parcialmente refatorado". `commercial-intelligence/` já tem `domain/application/infra/presentation/routes/` completos. | Migração real, mas desigual — CRM concluído, IA/Prospecção ainda híbridos por admissão do próprio ADR. |
| P2-9 | Atualizar medição real de cobertura, lint e typecheck | 🟡 PARCIAL | `.github/workflows/ci.yml:122-176` roda `lint`, `tsc --noEmit`, `test:unit -- --coverage`, `test:integration -- --coverage` e sobe `coverage/` como artifact a cada push/PR. | Medição é real e automatizada, mas sem threshold de cobertura em `vitest.unit.config.ts` — número é visível, não é gate que bloqueia merge. |
| P2-10 | Reduzir wiring manual propenso a esquecimento | 🔴 PENDENTE | `docs/ADR/ADR-002-Clean-Architecture.md:26` já documenta como consequência aceita: "wiring manual em `src/shared/di/setup.ts`, exigindo disciplina do time". `App.tsx`/`Sidebar.tsx` mantêm arrays de rota paralelos que exigem lembrar de atualizar os dois lados. | Nenhuma automação (geração de código, registro por convenção) foi introduzida desde a ADR. |
| P2-11 | Documentar contratos frontend/backend por feature crítica | 🟡 PARCIAL | `docs/DATA-CONTRACT-LEAD.md` é o único contrato narrativo campo-a-campo (Prisma→Domain→Repository→DTO→UI→Bitrix→Analytics). `docs/openapi.yaml` (3928 linhas) cobre a superfície de API em geral. | OpenAPI cobre a API, mas a documentação narrativa que expõe divergências semânticas (como as que o `DATA-CONTRACT-LEAD.md` encontrou) só existe para Lead — falta para Company/Contact/Deal. |

---

## P3 — Layout/design system

| # | Item | Status | Evidência | Nota |
|---|---|---|---|---|
| P3-12 | Tokenizar tipografia responsiva | 🔴 PENDENTE | `src/styles/globals.css:323-325` — `h1 { font-size: 3.5rem }`, `h2 { font-size: 2.5rem }`, `h3 { font-size: 2rem }`, valores fixos, sem `clamp()`. `@theme` só define `--font-sans`/`--font-display` (família), nenhum token de tamanho fluido. | Igual ao que o design QA já mapeava; nenhuma tokenização de escala foi introduzida. |
| P3-13 | Parametrizar sombras/gradientes por marca | 🟡 PARCIAL | `--shadow-card-value` (`globals.css:184,201`) varia só por tema claro/escuro, não por marca. Gradientes usam `var(--brand)`/`var(--brand-2)` corretamente em parte do código (`globals.css:407`). | 9 arquivos de componente (`Card.tsx`, `Badge.tsx`, `Intelligence.tsx`, `SelectionScreen.tsx`, `Integrations.tsx`, `ActivityList.tsx`, `CallAnalysisReport.tsx` etc.) ainda usam classes Tailwind hardcoded (`from-orange-*`, `to-blue-*`, `to-purple-*`) que não reagem à troca de marca. |
| P3-14 | Fazer QA visual mobile das rotas principais | 🟡 PARCIAL | `playwright.config.ts:29-33` só define projeto `Desktop Chrome`. `tests/e2e/visual.spec.ts` cobre 3 telas só em desktop light/dark. `tests/e2e/crm-kanban-mobile.spec.ts` testa viewport mobile, mas é funcional (hit-targets, drawer), não regressão visual. `DESIGN_QA_CENTRAL_ATLASGR.md:283` já documenta a lacuna. | Mobile UX corrigida funcionalmente (sidebar, Kanban), mas sem suíte de QA visual mobile sistemática nas rotas principais. |
| P3-15 | Reorganizar sidebar por jornada, não por inventário técnico | 🔴 PENDENTE | `src/components/layout/Sidebar.tsx:139-256` — grupos são "Core Modules", "Executivo", "Inteligência", "Ferramentas", "Administração": nomenclatura de categoria técnica, não de jornada do usuário. | Nenhuma reorganização por persona/jornada ocorreu; mesma raiz do item P1-5. |

---

## Plano de ação em 4 ondas — status por onda

### Onda 1 — "Verdade do produto"
- Auditar todas as rotas e marcar real/parcial/stub/demo/bloqueado — 🟡 feito 3 vezes de forma pontual (ver P1-7), ainda não como processo vivo único.
- Corrigir/rotular tecnologias demonstrativas em `CompanyDetail` — ✅ feito (P0-1).
- Ajustar estados de erro/offline nos widgets executivos — ✅ feito (P0-2).
- **Resultado esperado ("nenhuma tela parece mostrar dado real quando não mostra")**: alcançado nos pontos auditados nesta rodada (P0-1/2/3); manter via revisão de toda tela nova antes de merge.

### Onda 2 — "IA útil no fluxo"
- Passar contexto de rota/registro para Chatbook/copiloto — ✅ feito para empresa, lead, contato e drill-down de negócio (P1-4).
- Definir fonte única de IA conversacional / remover superfícies duplicadas — 🟡 backend consolidado (rotas órfãs de `agent.routes.ts` e hook morto removidos); Chatbook (página) e FloatingChatbook (drawer) documentados como o mesmo copiloto, não duplicados; navegação por persona (P3-15) ainda não auditada a fundo (P1-5).
- **Resultado esperado ("IA responde sobre a empresa, contato, lead ou negócio aberto")**: alcançado — os 4 tipos de registro passam contexto ao copiloto.

### Onda 3 — "Integrações honestas"
- Calendário: decidir entre escrita real no Google ou renomear para agenda local — 🔴 decisão de produto ainda pendente; hoje é leitura real + escrita local não rotulada na UI (P1-6).
- Revisar Bitrix/Google/WhatsApp/3CX por maturidade real — parcialmente coberto por `BITRIX24-LEAD-FLOW-AUDIT.md` (Bitrix) e por este documento (Google); WhatsApp/3CX fora do escopo desta rodada.
- Criar status visual por integração (conectado/leitura/escrita/stub/erro/pendente de escopo) — 🔴 não existe; `Integrations.tsx` hoje não distingue esses estados.
- **Resultado esperado ("usuário sabe exatamente o que está conectado e o que é apenas local")**: não alcançado — é o maior gap de confiança ainda aberto no P1.

### Onda 4 — "UX e design system"
- Redesenhar navegação por jornada/persona — 🔴 não iniciado (P3-15, mesma raiz de P1-5).
- Validar mobile em rotas principais — 🟡 parcial, funcional mas não visual (P3-14).
- Tokenizar tipografia e efeitos multibrand — 🔴 não iniciado (P3-12), 🟡 parcial (P3-13).
- **Resultado esperado ("produto mais simples de vender, demonstrar e usar")**: não alcançado; esta onda é a que tem menos progresso real das quatro.

---

## Prioridade sugerida para a próxima rodada

Com P0 já resolvido, os itens de maior impacto de confiança/valor ainda abertos são:

1. **P1-6 / Onda 3** — rotular no UI (não só no código) que `/app/calendar` é local e que a
   integração Google é somente-leitura. É o gap mais simples de fechar com maior redução de risco
   de confiança — hoje o usuário pode achar que agendar ali sincroniza com o Google e não
   sincroniza.
2. ~~**P1-4** — completar `setActiveRecord` em `ContactDetail.tsx` e `DealDrillDownDrawer.tsx` para
   fechar a paridade de contexto de IA entre os 4 tipos de registro.~~ ✅ Resolvido — ver P1-4.
3. **P1-7** — decidir qual dos três mapas de maturidade é a fonte única (proposta: este arquivo) e
   apontar os outros dois para ele em vez de manter conteúdo divergente.
4. **P1-5 / P3-15** — auditar se a reorganização de sidebar já existente fecha P3-15; resolver junto reduz
   retrabalho.

---

## Como manter este documento vivo

Este arquivo só cumpre a função de "matriz viva" (P1-7) se for atualizado como parte do processo,
não revisitado meses depois. Regra prática:

- Qualquer PR que resolva ou altere o status de um item numerado acima **deve** atualizar a linha
  correspondente nesta tabela (Status + Evidência) no mesmo PR.
- Qualquer tela nova classificada como stub/demo/parcial no processo da Onda 1 entra aqui antes de
  ir para produção — não cria um documento de auditoria paralelo novo.
- Ao final de cada Onda (`EXECUCAO-ONDAS.md`), o Coordenador confere este arquivo contra o estado
  real do código antes de declarar a onda concluída — para não repetir o padrão descrito em
  `docs/ROADMAP-100-STEPS-COMPLETE.md` (conclusão declarada antes da correção real terminar).
