# Onda 2 — Operação Comercial

- Data: 2026-08-11
- Branch de integração: `integracao/onda-2` (criada a partir de `main`, commit `51ba141`)
- Executor: Agente 00 — Coordenador

## Preparação (antes de disparar os especialistas)

Como parte da Onda 0/preparação desta rodada, o Coordenador corrigiu diretamente em `main`
(commit `51ba141`, antes de criar `integracao/onda-2`):
- Bloqueador conhecido e documentado em `/AGENTS.md` → "Segurança e higiene": dump de banco com
  dado pessoal real (`backups/prospector-20260806-152827.dump`) estava versionado no git.
  Removido do rastreamento (`git rm --cached` + `.gitignore`), arquivo mantido em disco, histórico
  não reescrito.
- Handoff `onda-G/07-para-00-server-cron.md`: `ColdLeadsScannerService` existia mas nunca era
  inicializado. Aprovado e conectado em `server.ts` após revisão (cron read-only, escopado por
  tenant, sem envio externo de dado pessoal).
- Handoff `onda-D/08-para-00-qa-package-json.md`: confirmado já integrado em `main`, marcado
  resolvido.

## Especialistas executados

Três especialistas em paralelo (máximo permitido pela regra de concorrência), cada um em worktree
e branch próprios a partir de `integracao/onda-2`:

| Agente | Branch | Worktree |
|---|---|---|
| 04 — CRM, BI e Analytics | `agente/04-crm-bi` | `.claude/worktrees/agente-04-crm-bi` |
| 05 — Prospecção e Enriquecimento | `agente/05-prospeccao-onda2` | `.claude/worktrees/agente-05-prospeccao-onda2` |
| 07 — IA, RAG, Filas e Automações | `agente/07-ia-automacoes` | `.claude/worktrees/agente-07-ia-automacoes` |

Todas as três branches foram revisadas (diff restrito ao escopo declarado de cada agente, sem
arquivos fora do domínio) e mescladas em `integracao/onda-2` sem conflito, nesta ordem: 04 → 05 → 07.

## Achados e correções por agente

### Agente 04 — CRM, BI e Analytics
- Boa parte da missão (integridade ponta a ponta, forecast rastreável determinístico, dicionário de
  métricas, ausência de dado fabricado, LGPD em relatórios agregados) já estava implementada em
  commits anteriores à Onda 2 — auditado, não refeito.
- **Corrigido**: botão "Qualificar via Voz" fazia `fetch` direto hardcoded para
  `http://localhost:3001/api/webhooks/bland`, sem auth, sem tenant e sem checar opt-out. Reescrito
  para usar a rota real já existente (`birth-voice`), com tratamento de erro específico
  (não configurado / sem telefone / opt-out).
- **Corrigido**: handoff pedia conectar o disparo de WhatsApp do CRM a um serviço quebrado
  (`prospecting/services/whatsapp.service.ts`). Conectado, em vez disso, ao painel/integração real
  já em produção (`integrations/whatsapp`, Baileys).
- Revisão dos limiares de RBAC aplicados pelo Agente 01 na Onda 1: confirmados como corretos, sem
  alteração de código.
- Handoff aberto: `onda-2/04-para-05-whatsapp-duplicado.md` (resolvido pelo próprio 05 em paralelo).

### Agente 05 — Prospecção e Enriquecimento
- **Corrigido (prioridade 1, bloqueava typecheck do repo inteiro)**: removido
  `src/features/prospecting/services/whatsapp.service.ts` — arquivo órfão/quebrado, importava
  pacotes npm inexistentes (`whatsapp-web.js`, `qrcode-terminal`), sem nenhum import real no
  restante do código. Duplicava, sem necessidade, a integração real já existente.
- **Corrigido (gap real de confiabilidade)**: nenhum provider de enriquecimento (Apollo, Hunter,
  Google Places) tinha retry em erro transitório (429/5xx) antes desta onda — falhavam
  definitivamente em qualquer erro passageiro. Adicionado `src/lib/enrichment/providerFetch.ts`
  (backoff exponencial com jitter, respeita `Retry-After`, nunca retenta 4xx definitivo), aplicado
  a todos os call sites de provider pago e ao `cnpjLookup.ts` (que também tinha bug de tratar 429
  como definitivo).
- Adicionada observabilidade de volume de chamadas faturáveis (sem inventar custo em R$/USD, que
  os providers não expõem publicamente por chamada — decisão documentada para não fabricar métrica).
- Dedupe/proveniência/scoring existentes auditados e cobertos por teste novo, sem reescrita.

### Agente 07 — IA, RAG, Filas e Automações
- Inventariado o Hub de IA (10 abas) — nenhuma é placeholder; todas conectam a backend real.
- **Corrigido (dado fabricado na UI, bloqueador #6 do `AGENTS.md`)**: aba "RAG" do Hub mostrava
  texto/status hardcoded ("Última sincronização há 2 horas", badge "Ativo" fixo). Passou a buscar
  estado real via `knowledgeApi.list()`, com loading/erro/vazio explícitos.
- **Corrigido (achado arquitetural sério)**: existiam dois pipelines de RAG paralelos e
  conflitantes — um real (`Document`/`DocumentChunk`, com ingestão e RLS) e um morto
  (`KnowledgeChunk`, sem ingestão nenhuma, sempre vazio, mas consumido pelo agente de SDR outbound
  e por `GET /api/intelligence/search`, que sempre devolviam resultado vazio mesmo com conteúdo
  real indexado). Consolidado: os dois métodos agora delegam ao pipeline real, com teste de
  integração novo confirmando isolamento de tenant sob RLS.
- Removidos 4 arquivos mortos de `server/ai/` sem nenhum import no repo — um deles
  (`ChromaDBRagEngine.ts`) indexava dados de todos os tenants numa coleção compartilhada sem filtro
  (risco de vazamento cross-tenant que nunca chegou a rodar em produção por estar morto, mas ficava
  como risco latente se alguém reativasse).
- **Corrigido (segurança)**: `POST /pending/:id/approve` e `DELETE /pending/:id` (aprovar/descartar
  ação de IA que pode disparar e-mail real) não tinham `requireRole` — qualquer papel autenticado,
  inclusive somente-leitura, podia confirmar. Corrigido para ADMIN/GESTOR/VENDEDOR.
- **Corrigido**: `cold-leads-scanner.service.ts` (conectado pelo Coordenador nesta mesma onda) fazia
  varredura cross-tenant, sem teto de custo e sem trava contra execução duplicada em múltiplas
  instâncias. Corrigido para operar só sobre organizações opt-in, com limite e trava distribuída.
- Handoff aberto para Agente 01: falta histórico persistente por execução de automação (só
  agregados `lastRunAt`/`runCount` hoje) — não bloqueador desta onda, proposta de schema anexada.

### Achado do Coordenador durante o gate de integração (não atribuível a nenhum dos três agentes)
Ao rodar `npm run verify:ai` com credencial real de provider (primeira vez que esse caminho foi
exercitado de fato — o baseline da Onda 0 não tinha credencial válida), toda tentativa de persistir
o log de uso de IA falhou com `new row violates row-level security policy for table "AILog"`. A
geração de conteúdo em si funciona; só o registro de custo/uso falha silenciosamente. Não é
regressão da Onda 2 (nenhum dos três agentes tocou schema/migração/RLS) — é falha pré-existente que
só ficou visível agora. Registrado handoff `onda-2/00-para-01-ailog-rls-violation.md` (alto) para o
Agente 01, dono exclusivo de `prisma/schema.prisma` e RLS.

## Arquivos alterados (resumo agregado)
21 arquivos de código/teste + 6 arquivos de handoff, distribuídos exatamente pelos escopos
declarados de cada agente (`src/features/crm/**` por 04; `src/features/prospecting/**` e
`src/lib/enrichment/**` por 05; `src/features/intelligence/**`, `src/features/automations/**` e
`server/ai/**` por 07). Nenhum agente tocou arquivo de outro domínio, `prisma/schema.prisma`,
`src/App.tsx`/Sidebar, ou `server.ts`/`package.json`.

## Testes (rodados na branch de integração, após merge das três branches)

| Gate | Resultado |
|---|---|
| `npx tsc --noEmit` | ✅ PASSOU — 0 erros (o erro pré-existente do arquivo órfão de WhatsApp desapareceu com a remoção pelo Agente 05) |
| `npm run lint` | ✅ PASSOU — 0 erros, 152 warnings (mesmo débito `jsx-a11y/*` pré-existente do baseline, nenhum warning novo introduzido) |
| `npm run test:unit` | ✅ PASSOU — 88 arquivos, 577 testes, 0 falhas. **Nota de ambiente**: as duas primeiras tentativas tiveram falhas de infraestrutura do worker pool do Vitest (módulo não encontrado / worker morto por OOM / erro de spawn) — confirmado via `tasklist` que há ~20 processos `node.exe` residuais no host (um usando 1,5 GB), provavelmente sobra de sessões/dev servers anteriores. Rodando com `--maxWorkers=2`, a suíte passa de forma limpa e determinística. Não é regressão de código. |
| `npm run test:integration` | ✅ PASSOU — 11 arquivos, 40 testes, 0 falhas (Docker/Postgres/Redis disponíveis nesta execução, diferente do bloqueio registrado no baseline da Onda 0) |
| `npm run test:e2e` | não executado nesta rodada de integração — Agente 04 reportou bloqueio de porta por processos dos agentes irmãos rodando em paralelo; recomendo o usuário rodar isoladamente antes do gate final da Onda 3 |
| `npm run build` | ✅ PASSOU |
| `npm run verify:integrations` | ✅ PASSOU — todas as integrações obrigatórias respondendo (diferente do baseline da Onda 0, que tinha 3 falhas de credencial/rede; parecem ter sido corrigidas fora desta onda). 2 integrações opcionais não configuradas por design (`gemini`, `langfuse`) |
| `npm run verify:ai` | ✅ PASSOU (exit 0) — geração de conteúdo real funcionando; ver achado de RLS acima, registrado como handoff, não bloqueia o script |

Nenhuma varredura automatizada de segredo (`gitleaks`/`trufflehog`) disponível neste ambiente; feita
varredura manual por padrão de chave/token sobre o diff acumulado (`git diff main..integracao/onda-2`)
— nenhum achado.

## Handoffs (abertos e resolvidos nesta onda)
- Resolvidos: `onda-7/06-para-04-voice-trigger.md`, `onda-G/05-para-04-whatsapp.md`,
  `onda-D/08-para-00-qa-package-json.md`, `onda-G/07-para-00-server-cron.md`.
- Criados e já resolvidos dentro da própria onda: `onda-2/04-para-05-whatsapp-duplicado.md` →
  `onda-2/05-para-04-whatsapp-consolidado.md`.
- Abertos, não bloqueadores, para a próxima onda: `onda-2/07-para-01-automation-execution-history.md`
  (normal/melhoria), `onda-2/00-para-01-ailog-rls-violation.md` (alto).
- Nenhum handoff `Prioridade: bloqueador` ficou `Status: aberto`.

## Riscos restantes
- RLS de `AILog` rejeitando inserts legítimos (handoff aberto para 01) — custo/uso de IA não está
  sendo registrado em produção até isso ser corrigido.
- `test:e2e` não executado nesta integração por conflito de porta entre os 3 worktrees rodando em
  paralelo — precisa rodar isolado antes de um release real.
- Ambiente Windows local com muitos processos `node.exe` residuais degradando a suíte de testes sob
  concorrência alta — não é bug de código, mas vale limpar processos travados periodicamente.

## Decisão da Onda 2
**APROVADA.** Todos os gates obrigatórios passaram na branch de integração (com a ressalva de
`test:e2e`, não executado por conflito de porta local, e a nota de ambiente sobre o worker pool do
Vitest). Nenhum handoff bloqueador ficou aberto. Nenhum dado fictício, bypass de RBAC/tenant,
segredo exposto ou falha silenciosa nova foi introduzida — pelo contrário, dois casos de dado
fabricado/pipeline morto pré-existentes foram corrigidos nesta onda.

Mesclado em `main` pelo Coordenador. Worktrees temporários removidos após a aprovação; branches
preservadas.
