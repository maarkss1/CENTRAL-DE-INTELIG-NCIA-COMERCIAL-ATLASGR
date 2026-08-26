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

Nenhuma no momento (2026-08-25) — nenhum arquivo do repositório passa de 1000 linhas hoje.

## Débito conhecido, abaixo do limite de falha (sem exceção necessária)

Arquivos na faixa de aviso (701–1000 linhas) no momento em que este gate foi criado — não
requerem exceção porque não quebram o gate, só ficam registrados aqui para não serem
"descobertos" de novo como achado novo em uma auditoria futura:

- `src/features/integrations/components/BitrixImportPanel.tsx` (960 linhas)
- `src/features/cadence/components/CadenceHub.tsx` (868 linhas)
- `src/features/market-intelligence/server/accountIntelligence.service.ts` (857 linhas)
- `src/features/intelligence/components/SwarmDashboard.tsx` (770 linhas)
- `src/features/crm/components/LeadDetailDrawer.tsx` (726 linhas)

Se qualquer um desses cruzar 1000 linhas num PR futuro sem uma exceção registrada acima, o gate
bloqueia normalmente — esta lista é só contexto, não é uma isenção.
