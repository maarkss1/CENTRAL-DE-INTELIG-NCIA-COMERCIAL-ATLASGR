- De: 10
- Para: 02
- Onda: 4
- Status: resolvido
- Prioridade: alto
## Problema
Ao rodar o gate obrigatório (`npx tsc --noEmit`) no meu worktree (`agente/10-infraestrutura-sre`,
a partir de `integracao/onda-4` == `main` no commit `46e86724`, que já inclui
`3f6e336e feat(02): liga o Cockpit CRM (crm360)...`), o typecheck falha:

```
src/lib/navigationBus.ts(53,7): error TS2741: Property 'crm360' is missing in type
'{ dashboard: true; companies: true; ... }' but required in type 'Record<TabType, true>'.
```

Causa raiz: `TabType` (em `src/components/layout/tabMeta.ts`) ganhou o literal `'crm360'` na
mudança que ligou o Cockpit CRM, mas `TAB_ROUTE_SET` em `src/lib/navigationBus.ts` (linha 53-59)
é um `Record<TabType, true>` mantido **manualmente em sincronia** com esse union type (comentário
na linha 50-52 do próprio arquivo já avisa disso: "TypeScript não expõe os literais de um type
alias em runtime") — e não foi atualizado para incluir `crm360: true,`.

Não toquei em `src/**` (fora do meu escopo — só `k8s/`, `argocd/`, `charts/`, `infrastructure/`,
`docker/`) — reproduzi isso só rodando o gate obrigatório no meu worktree. É um problema
pré-existente em `main`, não uma regressão minha.
## Arquivo(s) envolvido(s)
- `src/lib/navigationBus.ts` (linha 53-59, `TAB_ROUTE_SET`)
## Alteração necessária
Adicionar `crm360: true,` ao objeto `TAB_ROUTE_SET` em `src/lib/navigationBus.ts`, mantendo em
sincronia com `TabType`. Sem essa entrada, além do erro de typecheck, `isKnownTab('crm360')`
retornaria `false` em runtime — ou seja, um comando de voz pedindo navegação para o Cockpit CRM
falharia silenciosamente em `requestNavigation` (`return false`), o mesmo bloqueador #7 de
`/AGENTS.md` ("Comando de voz que afirma navegar sem realizar navegação") que este arquivo existe
para evitar, agora reintroduzido especificamente para o destino `crm360`.
## Teste esperado
`npx tsc --noEmit` volta a passar com 0 erros. Um comando de voz pedindo navegação para
`crm360`/"Cockpit CRM" navega de fato (não só retorna sucesso).
## Contexto adicional
Onda 4 — Agente 10. Bloqueia o gate `npx tsc --noEmit` para qualquer agente que rodar a partir de
`main`/`integracao/onda-4` hoje, não é específico da Onda 4. Prioridade "alto" (bloqueia gate +
tem efeito colateral de UX real em navegação por voz), não "bloqueador" porque não é regressão de
segurança/tenancy.
