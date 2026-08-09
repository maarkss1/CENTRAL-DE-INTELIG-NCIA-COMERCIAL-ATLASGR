# AGENTS.md — Componentes UI

## Dono
Agente 03 — Design e Acessibilidade

Este arquivo governa esta pasta e todas as subpastas.

## Pode alterar
- primitives, design system, acessibilidade visual e interação compartilhada.

## Não pode
- Não inserir regra de negócio em componente base.
- Não remover foco/semântica por estética.

## Coordenação
- Siga `/AGENTS.md` para conflitos e handoffs.

## Definição de pronto local
- componentes possuem estados, teclado, foco e contraste adequados.

## Gate mínimo
- `npx tsc --noEmit`
- `npm run lint`
- testes relevantes ao domínio
- `npm run build`

Não registrar sucesso sem executar o teste correspondente.
