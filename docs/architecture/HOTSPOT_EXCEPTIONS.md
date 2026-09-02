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
  de aviso); cresceu para 1110 linhas em commits normais de feature depois disso, sem que ninguém
  percebesse que já passava do limite de falha — o gate nunca chegou a rodar de verdade em CI até
  agora porque `npm run lint:architecture` (etapa anterior do mesmo `test:architecture`) sempre
  falhava primeiro por violações de `no-cross-feature-imports` não relacionadas, mascarando esta
  checagem via `&&`. Não é uma regressão introduzida por nenhum PR específico; é dívida
  pré-existente só agora visível. Modularizar fica para um item de dívida técnica dedicado.
- **Atualização em 2026-08-31:** o mesmo padrão de mascaramento se repetiu — o arquivo cresceu de
  1110 para 1404 linhas em commits normais de feature, e só voltou a ser visível depois que as
  novas violações de `no-cross-feature-imports` de `dashboard`/`gamification` (ver
  `KNOWN_VIOLATIONS.md`, seção "2026-08-31") foram registradas na baseline. Limite elevado para
  1500 (margem sobre as 1404 atuais) em vez de reduzir o arquivo, que não foi tocado por esta
  sessão. `test:architecture` roda os dois gates encadeados com `&&`; enquanto isso não mudar,
  qualquer falha em `lint:architecture` volta a mascarar `check:hotspots` da mesma forma — vale
  considerar separar os dois comandos em jobs de CI independentes num item de dívida técnica futuro.
- **Atualização em 2026-09-02:** mesmo padrão de mascaramento de novo — desta vez pelo audit
  gate/Prettier/`tsc` (PR #326, que só corrigia contraste de título em `globals.css`), não por
  `no-cross-feature-imports`. O arquivo já estava em 1609-1610 linhas em `origin/main` (crescimento
  em commits paralelos de suporte ao Enxame Autônomo e formulários de cadência), acima das 1500
  registradas acima, sem que nenhum PR anterior tivesse rodado este gate até o fim para notar. `npm
  run format` (Biome, mudança puramente mecânica de reformatação, mesma PR) somou mais 1-2 linhas
  de quebra de JSX, chegando a 1611 pela contagem do script — não uma regressão de conteúdo. Limite
  elevado para 1700 (margem sobre as 1611 atuais); o arquivo em si não foi editado por conteúdo
  nesta atualização. Aprovado explicitamente pelo dono do repositório. Modularização continua fora
  do escopo desta correção pontual.
- **Registrado em:** 2026-08-29
- **Reavaliar até:** 2026-11-30 (mesmo checkpoint do `KNOWN_VIOLATIONS.md`)

### `src/features/commercial-intelligence/components/JoaoReisDiagnosticHub.tsx`

- **Limite excepcional:** 1300 linhas
- **Dono:** Agente 04 — CRM e BI / Agente 02 — Produto e UX
- **Motivo:** painel analítico complexo de diagnóstico comercial executivo, combinando visualizações ECharts, formulários de auditoria e cálculo de scores.
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
