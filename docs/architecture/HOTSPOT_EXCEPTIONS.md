# Exceções de hotspot (arquivo excessivamente grande) — ITEM-13

Este arquivo é a contraparte legível-por-humano do gate rodado por
`scripts/architecture/check-hotspots.ts` (`npm run check:hotspots`), seguindo o mesmo padrão já
usado neste repositório para waiver de dívida técnica (`docs/security/AUDIT_WAIVERS.md` +
`scripts/security/check-audit-waivers.ts`): uma exceção só existe se estiver registrada aqui, com
dono e prazo — nunca só como comentário solto no código ou supressão silenciosa no script.

## Regra

`scripts/architecture/check-hotspots.ts` varre `src/**/*.{ts,tsx}`, `server.ts` e `worker.ts`
(excluindo testes, `.d.ts`, `dist/`, `build/`, `android/`, `ios/`) e classifica cada arquivo por
contagem de linhas:

- **≤ 700 linhas:** OK, sem aviso.
- **701–1000 linhas:** aviso não-bloqueante (`WARN`) — sinaliza um arquivo grande, não quebra o
  gate. Hoje (2026-08-25, na branch com ITEM-07/08/09 mergeados) existem alguns arquivos nessa
  faixa — são dívida pré-existente sinalizada, não uma regressão introduzida por este item.
- **> 1000 linhas:** falha o gate (`exit 1`), a menos que o arquivo tenha uma exceção ativa **e**
  não-expirada nesta seção cobrindo um limite igual ou maior ao tamanho atual do arquivo.

`1000` foi escolhido porque é o primeiro múltiplo redondo acima do maior arquivo real do
repositório no momento em que este gate foi criado (`src/features/integrations/components/
BitrixImportPanel.tsx`, 960 linhas) — alto o suficiente para não bloquear nenhum arquivo existente
sem exceção, baixo o suficiente para pegar um hotspot novo crescendo sem controle logo depois de
nascer.

## Formato de uma exceção nova

`scripts/architecture/check-hotspots.ts` só lê blocos `### \`caminho\`` de dentro da seção
"## Exceções ativas" abaixo — copie o bloco a seguir para lá ao adicionar uma exceção nova (não
deixe o bloco de exemplo aqui nesta seção, ele não é uma exceção real e é ignorado pelo parser de
propósito por estar fora de "## Exceções ativas"):

```
### `caminho/relativo/do/arquivo.ts`

- **Limite excepcional:** N linhas (o tamanho até onde o arquivo pode crescer sem quebrar o gate)
- **Dono:** Agente NN — Nome do agente (ou pessoa, se fora do roster de agentes)
- **Motivo:** por que o arquivo precisa ficar acima do limite padrão agora, e por que não é
  possível/desejável modularizar imediatamente
- **Registrado em:** YYYY-MM-DD
- **Reavaliar até:** YYYY-MM-DD (obrigatório — uma exceção sem esta data, ou com uma data já
  vencida, faz o gate falhar mesmo que o arquivo esteja coberto pelo limite excepcional)
```

## Exceções ativas

### `src/features/cadence/components/CadenceHub.tsx`

- **Limite excepcional:** 1700 linhas
- **Dono:** Agente 17 — Cadência Multicanal e Ciclo de Receita
- **Motivo:** já listado abaixo como débito conhecido em 868 linhas (2026-08-25, dentro do limite
  de aviso); cresceu para 1610 linhas em commits de suporte ao Enxame Autônomo e formulários de cadência. Modularizar fica para um item de dívida técnica dedicado.
- **Registrado em:** 2026-08-29
- **Reavaliar até:** 2026-11-30 (mesmo checkpoint do `KNOWN_VIOLATIONS.md`)

### `src/features/commercial-intelligence/components/JoaoReisDiagnosticHub.tsx`

- **Limite excepcional:** 1800 linhas
- **Dono:** Agente 04 — CRM e BI / Agente 02 — Produto e UX
- **Motivo:** painel analítico complexo de diagnóstico comercial executivo, combinando visualizações ECharts, formulários de auditoria e cálculo de scores. Limite elevado de 1300 para 1700 em 2026-09-02 (PR #329) sem nenhuma linha de código nova: o arquivo estava fora do padrão do `biome format` (gate `format:check` do CI) e a formatação obrigatória o levou de 1154 para 1661 linhas — crescimento de formatação, não de lógica. Elevado de novo, de 1700 para 1800, em 2026-09-03: outro PR concorrente ("feat(design-system): promove vocabulario de KPI/achados a primitivos compartilhados + piloto no portal") levou o arquivo a 1743 linhas ao extrair 6 componentes locais (KpiStat, FunnelBars, ChannelDonut, CompareBar, DeltaPill, DealsGrid) para primitivos compartilhados em `src/components/ui/` — conteúdo novo real (não formatação desta vez), na direção certa (menos duplicação, vocabulário reutilizável para outras telas) — ver `.claude/PILOTS.md`, Pilot 028. Não fazia parte do escopo de nenhum dos PRs concorrentes que bateram nesse limite (#335, #336) mexer nesse trabalho de outra sessão em andamento; ambos só recalibraram o limite para não bloquear `test:architecture`/`check:hotspots` por um arquivo que não tocaram. A modularização (dividir o próprio hub em sub-componentes de tela) continua devida; headroom dado para não bloquear o gate enquanto isso não acontece.
- **Registrado em:** 2026-09-01
- **Reavaliar até:** 2026-11-30

### `src/features/integrations/components/BitrixImportPanel.tsx`

- **Limite excepcional:** 1300 linhas
- **Dono:** Agente 06 — Integrações e Bitrix
- **Motivo:** mesma situação do `CadenceHub.tsx` acima — já listado como débito conhecido em 960
  linhas (2026-08-25), cresceu para 1193 linhas sem que o gate rodasse de verdade em CI pelo mesmo
  motivo (mascarado por `no-cross-feature-imports` na etapa anterior). Não é regressão de nenhum
  PR específico. Modularizar fica para um item de dívida técnica dedicado.
- **Registrado em:** 2026-08-29
- **Reavaliar até:** 2026-11-30 (mesmo checkpoint do `KNOWN_VIOLATIONS.md`)

## Débito conhecido, abaixo do limite de falha (sem exceção necessária)

Arquivos na faixa de aviso (701–1000 linhas) no momento em que este gate foi criado — não
requerem exceção porque não quebram o gate, só ficam registrados aqui para não serem
"descobertos" de novo como achado novo em uma auditoria futura. `BitrixImportPanel.tsx` e
`CadenceHub.tsx` saíram desta lista em 2026-08-29 por já terem cruzado 1000 linhas — ver
"Exceções ativas" acima.

- `src/features/market-intelligence/server/accountIntelligence.service.ts` (857 linhas)
- `src/features/intelligence/components/SwarmDashboard.tsx` (770 linhas)
- `src/features/crm/components/LeadDetailDrawer.tsx` (726 linhas)

Se qualquer um desses cruzar 1000 linhas num PR futuro sem uma exceção registrada acima, o gate
bloqueia normalmente — esta lista é só contexto, não é uma isenção.
