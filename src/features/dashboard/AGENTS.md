# AGENTS.md — Dashboard

## Dono
Agente 02 — Produto e UX

Este arquivo governa esta pasta e todas as subpastas.

## Pode alterar
- composição do dashboard, UX de cards, loading/empty/error e conexão visual com dados reais.

## Não pode
- Proibido mostrar números/compromissos fictícios como reais.
- Não redefinir fórmula comercial de KPI sem Agente 04.

## Coordenação
- Fórmulas/semântica de KPI pertencem ao 04.

## Definição de pronto local
- nenhum fallback enganoso; estados e navegação testados.

## Gate mínimo
- `npx tsc --noEmit`
- `npm run lint`
- testes relevantes ao domínio
- `npm run build`

Não registrar sucesso sem executar o teste correspondente.
