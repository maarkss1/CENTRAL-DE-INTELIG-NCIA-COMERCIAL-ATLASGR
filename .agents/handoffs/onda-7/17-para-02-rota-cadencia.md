- De: 17
- Para: 02
- Onda: 7
- Status: aberto
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
