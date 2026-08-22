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

**Atualização em 2026-08-21** (branch `claude/trust-blockers-p0-ybn9cd`): a rodada de 20/08 abaixo
já havia marcado os 3 itens como resolvidos, mas por amostragem — o próprio texto original admitia
isso em P0-2/P0-3. Uma nova varredura, mais ampla, achou instâncias **novas e ainda ativas** do
mesmo padrão em telas/serviços que a amostragem anterior não cobriu. Todas corrigidas nesta rodada:

- **`src/features/companies/components/CompanyList.tsx`** (grid e tabela — a tela de listagem de
  empresas, tráfego bem maior que `CompanyDetail.tsx`): fallback `['React', 'AWS', 'Salesforce']`
  / `['React', 'AWS']` renderizado como `TechToolLogo` idêntico a dado real, sem nenhum indicador.
  Corrigido para `company.technologies ?? []` + badge "Sem detecção real" (mesmo padrão já usado em
  `CompanyDetail.tsx`), em ambos os layouts (cards e tabela).
- **`src/features/intelligence/components/ReportsHub.tsx`** + **`GlowChart.tsx`**: falha ao buscar
  a série mensal (`analyticsApi.dashboard`) caía em `setMonthly([])`, indistinguível de uma série
  real vazia (mesma mensagem "Sem dados suficientes ainda."). `GlowChart` ganhou prop `error`; a
  tela agora mostra motivo real da falha em vez de mascarar como "sem dados ainda".
- **`src/lib/queue/newsMonitor.worker.ts`**: job `scan-company-news` sorteava uma manchete de um
  array fixo (`Math.random`) e gravava como `AccountSignal` com `evidenceType: 'FACT'`,
  `confidence: 0.85`, `source: 'GDELT-News'` — fabricando um "fato" com a marca do serviço real de
  notícias (`news.service.ts`). Mitigante: fila nunca registrada em `server.ts` (código órfão,
  documentado como tal em `.agents/runs/onda-27.md:92` e mantido de propósito pelo dono do repo em
  merge anterior) — não gerava dado falso em produção, mas era um risco latente caso reativada.
  Reescrito para chamar `searchCompanyNews` real (mesma função usada no enriquecimento de empresa);
  nunca escreve menção/sinal quando a busca real não encontra nada.
- **`src/features/intelligence/services/abTesting.service.ts`**: `getConversionRates(promptName)`
  retornava `{ variantA: 15.4, variantB: 12.1 }` fixo, ignorando o parâmetro — mesmo número não
  importa o prompt. Não é chamado por nenhuma rota/UI hoje (confirmado por busca no repo), mas era
  um número inventado pronto para aparecer em qualquer dashboard futuro que o consumisse. Reescrito
  para calcular a taxa real a partir das Notas de tracking (`logPromptUsage`) e do status do Lead
  (`Negocios_Ganhos`); retorna `0` (zero real, não invenção) quando a variante não tem nenhuma
  interação rastreada ainda.

Testes novos: `tests/unit/features/intelligence/components/ReportsHub.test.tsx` (caso "distingue
falha ao buscar a série mensal de uma série real vazia") e
`tests/unit/features/intelligence/services/abTesting.service.test.ts`. `npx tsc -b --noEmit` e
`npm run lint` limpos (0 erros); suíte unitária completa 1564/1566 passando — as 2 falhas em
`tests/unit/features/automation-sdr-voz.test.ts` são pré-existentes, confirmadas reproduzíveis sem
as mudanças desta rodada (`git stash`), fora do escopo deste item.

| # | Item | Status | Evidência | Nota |
|---|---|---|---|---|
| P0-1 | Remover fallback de tecnologias fixas em empresas ou rotular como demonstração | ✅ RESOLVIDO | `src/features/companies/components/CompanyDetail.tsx:93-94,207-237` (commit `33f9316`) + `CompanyList.tsx` grid/tabela (rodada de 21/08, ver acima) — `?? []` + badge "Sem detecção real" nas 3 superfícies onde tecnologias de empresa aparecem. | — |
| P0-2 | Garantir que dashboards diferenciem erro/offline de zero real | ✅ RESOLVIDO | `LiveStatsWidget.tsx:33-45,99,129-141,159`; `CrmOverview.tsx:57,86-91`; `SinglePageDashboard.tsx:37,44,100-103,146`; `ReportsHub.tsx`/`GlowChart.tsx` (rodada de 21/08 — série mensal, ver acima). | Cobre os 3 widgets executivos principais + o gráfico de tendência mensal do Hub de Relatórios; ainda não é auditoria de 100% dos KPI tiles do produto. |
| P0-3 | Revisar telas com dado sintético/stub tratado como operacional | ✅ RESOLVIDO (amostragem ampliada) | `PRODUCT_VISUAL_TRUTH_MAP.md` seção C; `GamificationWidget.tsx:12-23`; `SpaceGame.tsx`/`GameWidget.tsx` (`Math.random` decorativo, já rotulado). Rodada de 21/08 achou e corrigiu 2 instâncias adicionais fora dessa amostragem original: `newsMonitor.worker.ts` (mock de notícia gravado como FACT) e `abTesting.service.ts` (taxa de conversão fixa) — ver acima. | Ainda é verificação por amostragem, agora mais ampla — não cobre as ~24 features do produto uma a uma. Reabrir se uma tela/serviço novo reintroduzir número inventado. |

**Resultado da Onda 1 ("Verdade do produto")**: os 3 itens P0 seguem resolvidos, mas a rodada de
21/08 mostra que "resolvido por amostragem" não é o mesmo que "resolvido". O padrão (fallback
sintético apresentado como dado real) se repetiu em pelo menos 4 lugares que a auditoria de 20/08
não cobriu. Recomendação para a próxima rodada: tratar este item como recorrente, não como
concluído — repetir a varredura sempre que uma tela/serviço novo tocar `technologies`,
`newsMentions`, métricas agregadas ou qualquer taxa/score calculado, antes de declarar P0
resolvido de novo.

---

## P1 — Valor de produto

| # | Item | Status | Evidência | Nota |
|---|---|---|---|---|
| P1-4 | Implementar IA contextual ao registro aberto | ✅ RESOLVIDO | `src/contexts/ActiveRecordContext.tsx` + `src/hooks/assistantContext.ts` injetam tipo/id/label/resumo do registro aberto no prompt do Chatbook (union `company\|contact\|lead\|deal\|document`). `setActiveRecord` chamado em `CompanyDetail.tsx` e `Account360.tsx` (empresa), `LeadDetailDrawer.tsx:68` (lead), `ContactForm.tsx:73` (contato — `ContactDetail.tsx` é stub morto, nunca importado; a tela real de contato é o formulário), `commercial-intelligence/components/DealDrillDownDrawer.tsx` (negócio, só quando o drill-down resolve para exatamente 1 registro — uma lista filtrada com vários negócios não tem um "registro aberto" único) e `crm360/components/PropostaDetail.tsx` (tipo novo `document`, proposta comercial aberta). | Os 5 tipos de registro já registram/limpam o registro ativo corretamente, incluindo contato (via `ContactForm.tsx`, achado que a rodada anterior deste documento não tinha capturado). |
| P1-5 | Clarificar navegação por persona e reduzir duplicação de superfícies de IA | 🟡 PARCIAL | Duplicação de **IA conversacional** resolvida no backend: `agent.routes.ts` tinha 4 endpoints órfãos (`/chat`, `/groq`, `/roleplay`, `/qualification`) com prompt/sistema próprio, inatingíveis por qualquer UI viva (só o hook morto `useAiPlaybookGenerator.ts` os chamava) — ambos removidos; `ChatbookHub.tsx` (página `/app/chatbook`) e `FloatingChatbook.tsx` (drawer global) continuam sendo duas entradas, mas já compartilhavam a mesma fonte de estado (`useAssistantChat`), agora documentado em comentário nos dois arquivos em vez de parecer implementações concorrentes — só `POST /api/intelligence/studio/stream` é a fonte real. Duplicação de **navegação/hubs** ainda aberta: `src/components/layout/Sidebar.tsx:46-67` agrupa por jornada ("IA & Capacitação" com 8 itens), não mais o grupo único de 14 itens descrito antes, mas ao menos 4 hubs (IntelligenceHub, ChatbookHub, ReportsHub, CommercialIntelligenceHub) têm escopo de geração/relatório de IA sobreposto, espalhados entre os grupos "Analisar" e "IA & Capacitação"; não existe conceito de "persona" em `src/lib/auth/authorization.ts` (só a hierarquia de `Role` ADMIN/GESTOR/CLOSER/SDR/VISUALIZADOR). | Fonte única do backend conversacional confirmada e duplicação de código morto eliminada. Falta decisão de produto sobre quais hubs mesclar/despriorizar e o que "persona" significa neste produto antes de mexer na navegação em produção — não é um refactor mecânico. Ver também P3-15 (mesma raiz). |
| P1-6 | Fechar ou rotular stubs de calendário/Google | ✅ RESOLVIDO (2026-08-21) | Commit `608ab098` trocou o escopo OAuth para `calendar.events` e `PrismaCalendarSchedulerPort.createEvent` passou a chamar `google.service.ts::createCalendarEvent` de verdade (fallback local só se a chamada falhar) — não é mais stub. `Integrations.tsx:239,248-253,268` atualizado para refletir isso: badge "Calendar escrita (via Cadência)" em vez de "Google escrita pendente", texto explica que o agendamento pela Cadência já escreve no Google, mas o CRUD manual da Agenda (`Calendar.tsx`, `/app/calendar`) continua só local. `docs/CADENCE-CYCLE-AUDIT.md` (CYC-004) atualizado no mesmo commit para não descrever mais escrita como stub. | A Agenda manual do Atlas (`/app/calendar`) continua sem sincronizar com o Google — isso é intencional e agora está rotulado na UI, não é mais um gap de confiança. |
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
- Passar contexto de rota/registro para Chatbook/copiloto — ✅ feito para empresa (2 telas), lead, contato, negócio (drill-down) e documento comercial (P1-4).
- Definir fonte única de IA conversacional / remover superfícies duplicadas — 🟡 duplicação de backend (rotas órfãs de `agent.routes.ts` e hook morto) removida e fonte única confirmada; duplicação de navegação/hubs de IA ainda depende de decisão de produto (P1-5).
- **Resultado esperado ("IA responde sobre a empresa, contato, lead, negócio ou documento aberto")**: alcançado — os 5 tipos de registro passam contexto ao copiloto.

### Onda 3 — "Integrações honestas"
- Calendário: decidir entre escrita real no Google ou renomear para agenda local — ✅ decidido e implementado 2026-08-21: escrita real via Cadência (`calendar.events`), Agenda manual rotulada como local na UI (P1-6).
- Revisar Bitrix/Google/WhatsApp/3CX por maturidade real — parcialmente coberto por `BITRIX24-LEAD-FLOW-AUDIT.md` (Bitrix) e por este documento (Google); WhatsApp/3CX fora do escopo desta rodada.
- Criar status visual por integração (conectado/leitura/escrita/stub/erro/pendente de escopo) — 🟡 existe para Google/Bitrix/3CX (`CapabilityBadge`/`IntegrationStatusBadge` em `Integrations.tsx`); não auditado para WhatsApp nesta rodada.
- **Resultado esperado ("usuário sabe exatamente o que está conectado e o que é apenas local")**: alcançado para Google — era o maior gap de confiança aberto no P1, agora fechado.

### Onda 4 — "UX e design system"
- Redesenhar navegação por jornada/persona — 🔴 não iniciado (P3-15, mesma raiz de P1-5).
- Validar mobile em rotas principais — 🟡 parcial, funcional mas não visual (P3-14).
- Tokenizar tipografia e efeitos multibrand — 🔴 não iniciado (P3-12), 🟡 parcial (P3-13).
- **Resultado esperado ("produto mais simples de vender, demonstrar e usar")**: não alcançado; esta onda é a que tem menos progresso real das quatro.

---

## Prioridade sugerida para a próxima rodada

Com P0 e P1-6 já resolvidos, os itens de maior impacto de confiança/valor ainda abertos são:

1. ~~**P1-6 / Onda 3** — rotular no UI que `/app/calendar` é local e a integração Google é
   somente-leitura.~~ ✅ Resolvido — ver P1-6.
2. ~~**P1-4** — completar `setActiveRecord` para os 5 tipos de registro.~~ ✅ Resolvido — ver P1-4.
3. **P1-7** — decidir qual dos três mapas de maturidade é a fonte única (proposta: este arquivo) e
   apontar os outros dois para ele em vez de manter conteúdo divergente.
4. **P1-5 / P3-15** — mesma causa raiz (sidebar por inventário técnico + hubs de IA sobrepostos); a
   duplicação de backend já foi resolvida (ver P1-5), mas a duplicação de navegação/hubs segue
   pendente. Requer decisão de produto (quais hubs mesclam, o que "persona" significa aqui) antes
   de qualquer mudança de navegação em produção — não é um item mecânico como os demais desta
   lista.

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
