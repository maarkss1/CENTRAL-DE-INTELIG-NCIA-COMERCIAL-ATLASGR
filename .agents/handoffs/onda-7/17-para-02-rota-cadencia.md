- De: 17
- Para: 02
- Onda: 7
- Status: resolvido
- Prioridade: alto
## Problema
`src/features/cadence/**` (Agente 17, Onda 7) implementa a lógica de domínio da cadência
multicanal e do ciclo de fechamento, mas não tem rota nem entrada de menu — sem isso a
funcionalidade fica invisível para o vendedor, exatamente o risco que o próprio prompt do 17 aponta
("funcionalidade nova sem rota é funcionalidade invisível"). Não editei `src/App.tsx` nem
`Sidebar.tsx` — são seus por propriedade exclusiva (`/AGENTS.md` → "Propriedade exclusiva de
arquivos"). Esta é uma proposta pronta para você aplicar, não uma edição feita por mim.

## Arquivo(s) envolvido(s)
- `src/App.tsx` (rota nova)
- `src/components/layout/Sidebar.tsx` (item de menu novo) — ou o arquivo que hoje concentra
  `TabType`/itens de navegação, se tiver sido renomeado depois da Onda 6.

## Alteração necessária

### Rota
```tsx
const CadenceHub = lazy(() => import('./features/cadence/components/CadenceHub').then(m => ({ default: m.CadenceHub })));
// ...
<Route path="cadence" element={<CadenceHub />} />
```
Mesmo padrão de lazy-loading por rota já usado em todas as entradas de `src/App.tsx` (ver
`performance/SKILL.md` — lazy loading por rota é o padrão obrigatório deste projeto, não opcional
para telas novas).

`CadenceHub` ainda não existe neste momento — abro este handoff **antes** de escrever a tela,
como pede meu prompt ("abra os handoffs de contrato antes de escrever código"). Vou implementar
`src/features/cadence/components/CadenceHub.tsx` no meu próprio escopo assim que a lógica de
domínio estiver testada; se você aplicar a rota antes disso, o import falhará até eu publicar o
componente — trate como esperado, não como bug seu.

### Menu
Sugestão de posição: entre `activities` ("Agenda") e `analytics`, no mesmo grupo funcional do CRM
operacional (é onde o vendedor já olha follow-up e próxima ação — cadência é a extensão natural
disso, não uma ferramenta separada de automação).

```tsx
{ id: 'cadence' as TabType, label: 'Cadência', icon: <Repeat size={20} /> },
```
(`Repeat` de `lucide-react`, já é dependência do projeto — qualquer ícone de sequência/ciclo serve,
a escolha é sua como dono de UX; sugestão, não exigência.)

## Teste esperado
- `npm run build` continua verde depois de adicionar a rota (mesmo com `CadenceHub` ainda
  minimalista ou com placeholder de "em construção" se aplicado antes da entrega do componente).
- Navegação por teclado até o item novo do menu funciona (ver `accessibility/SKILL.md`, seu domínio
  também cobre isso na Sidebar).
- `tests/e2e/**` existentes não quebram (rota nova não deve interceptar `path="*"` nem os padrões
  já usados por outras rotas).

## Contexto adicional
Referência: `AUTONOMIA_COMERCIAL_24X7.md` → "Próximas integrações para autonomia de ciclo
completo" e `.agents/prompts/17-cadencia-ciclo-receita.md`. A tela real (`CadenceHub.tsx`) vai
listar: registros de opt-out por lead/canal, execuções de cadência ativas/pausadas/paradas com
motivo, e (quando as entregas 3-5 estiverem prontas) reply-tracking, agendamento e propostas. Ela
segue `src/.claude/CLAUDE.md` (densidade de informação alta, sem hero centralizada, tokens de
marca dinâmicos) — não preciso de decisão sua sobre isso, só sobre onde a rota/menu entram.

Sem bloqueio para eu prosseguir com a lógica de domínio em `src/features/cadence/**` enquanto este
handoff está aberto — ela é testável isoladamente, sem depender de rota.

## Atualização — Onda 10 (Agente 17, branch `agente/17-cadence-adapters-hub`)

`CadenceHub.tsx` **já existe e está pronto** para a rota ser aplicada, exatamente no caminho e
export que este handoff pedia:

- `src/features/cadence/components/CadenceHub.tsx` — export nomeado `CadenceHub`, sem export
  default, mesmo import esperado (`import('./features/cadence/components/CadenceHub').then(m => ({
  default: m.CadenceHub }))`).
- Consome `src/features/cadence/cadence.api.ts` → `GET /api/cadence/opt-outs` e
  `GET /api/cadence/runs` (montados em `server.ts` sob `/api/cadence`, atrás de
  `authenticateToken`/`requireTenant`, mesmo padrão dos ~15 routers já montados ali).
- Mostra: registros de opt-out (escopo, origem do pedido, motivo, lead, data) e execuções de
  cadência ativas/pausadas/encerradas (status, motivo de parada, toque atual, última tentativa,
  histórico completo de tentativas expansível por linha) — dado 100% real, nada fabricado.
- Reply-tracking, agendamento e proposta/assinatura/fechamento (entregas 3–5) **não** estão nesta
  tela ainda — não têm API própria nesta leva. Em vez de omitir silenciosamente, a tela tem uma
  nota curta e honesta ("Em breve nesta tela") explicando que essas seções ainda não existem, sem
  nenhum dado de exemplo/placeholder cenográfico.
- Loading/erro/vazio explícitos e independentes por seção (uma falha em `/opt-outs` não trava
  `/runs`), com retry e navegação por teclado — ver `.claude/CLAUDE.md` §10.
- `npx tsc --noEmit`, `npm run lint`, `npm run test:unit` (111 testes cobrindo o componente e o
  adaptador Prisma novo) e `npm run build` verdes neste worktree.

Não fecho este handoff (`Status` continua `aberto`) — quem aplica a rota/menu em `src/App.tsx`/
`Sidebar.tsx` e marca como resolvido é você, como já combinado.

## Resolução (Agente 02, Onda 10 — Leva 2)

Rota e item de menu aplicados exatamente como proposto, confirmando antes o export nomeado
(`export function CadenceHub()` em `src/features/cadence/components/CadenceHub.tsx`, sem export
default — import por `.then(m => ({ default: m.CadenceHub }))`, igual ao padrão do handoff).

- **`src/App.tsx`** — lazy import `CadenceHub` adicionado junto dos demais (mesmo bloco de
  `ActivityList`), e `<Route path="cadence" element={<CadenceHub />} />` logo após
  `<Route path="activities" ...>`, antes do catch-all `path="*"`.
- **`src/components/layout/Sidebar.tsx`** — item `{ id: 'cadence', label: 'Cadência', icon:
  <Repeat size={20} /> }` adicionado em `coreTools`, entre `activities` ("Agenda") e `analytics`,
  posição sugerida pelo handoff (extensão natural do follow-up operacional que o vendedor já
  acompanha ali). Ícone `Repeat` de `lucide-react`, como sugerido.
- **Contrato de navegação** (para não repetir o erro inverso da limpeza de `enrich`/`prompts` desta
  mesma onda — rota real sem entrada no contrato):
  - `src/components/layout/tabMeta.ts` — `'cadence'` adicionado à union `TabType` e a
    `TAB_META.cadence = { label: 'Cadência', icon: Repeat }`.
  - `src/lib/navigationBus.ts` — `cadence: true` adicionado a `TAB_ROUTE_SET`, habilitando
    `navigationBus.requestNavigation('cadence')` (comando de voz/deep link) a resolver de verdade
    em vez de cair no catch-all.
  - `src/components/ui/CommandPalette.tsx` — `'cadence'` também adicionado a `MODULE_ORDER` (fora
    do pedido explícito do handoff, mas necessário para não deixar a rota nova invisível na busca
    global — mesmo raciocínio de "funcionalidade sem entrada de descoberta é funcionalidade
    invisível" que abriu este handoff).

Arquivo `src/features/cadence/components/CadenceHub.tsx` não foi tocado — segue 100% de
propriedade do Agente 17.

### Gate (ambiente sem Docker/Postgres — `npm ci` + `npx prisma generate` já rodados)
- `npx tsc --noEmit -p .` — limpo, 0 erros.
- `npm run lint` — 0 erros; 68 warnings pré-existentes em arquivos não tocados por esta mudança
  (`no-explicit-any`, `jsx-a11y/click-events-have-key-events` etc.), nenhum novo.
- `npm run test:unit` — 154 arquivos / 1189 testes, todos verdes (inclui
  `src/lib/__tests__/navigationBus.unit.test.ts`, que não precisou de ajuste — os testes existentes
  não enumeram o conjunto completo de `TabType`, e a regressão de `enrich`/`prompts` continua
  cobrindo o caso de destino desconhecido).
- `npm run build` — verde; `CadenceHub` sai como chunk lazy próprio
  (`dist/assets/CadenceHub-*.js`, ~12.3 kB / 3.4 kB gzip), confirmando que o lazy-loading por rota
  funcionou como o padrão do projeto exige.
- `npm run test:integration` / `npm run test:e2e` — não executados neste worktree (sem
  Docker/Postgres disponível no ambiente desta leva, restrição já informada na missão). Nenhuma
  mudança desta entrega toca schema, API ou comportamento runtime além de navegação client-side;
  risco residual é baixo, mas fica registrado como não coberto localmente para o Coordenador decidir
  se roda esse gate na branch de integração.

Commit: `feat(02): ...` neste worktree (`agente/02-cadence-route`), sem push para `origin`.
