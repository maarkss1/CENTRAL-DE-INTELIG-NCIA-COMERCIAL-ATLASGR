# AGENTS.md — Layout e Navegação

## Dono
Agente 02 — Produto e UX

Este arquivo governa esta pasta e todas as subpastas.

## Pode alterar
- layout, Sidebar, navegação, shell, breadcrumbs e estados globais de página.

## Não pode
- Outros agentes não alteram navegação principal.
- Não duplicar autorização do backend.

## Coordenação
- Siga `/AGENTS.md` para conflitos e handoffs.

## Definição de pronto local
- todos os destinos principais são alcançáveis e testados.

## Gate mínimo
- `npx tsc --noEmit`
- `npm run lint`
- testes relevantes ao domínio
- `npm run build`

Não registrar sucesso sem executar o teste correspondente.
