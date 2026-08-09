# AGENTS.md — Configurações do Produto

## Dono
Agente 02 — Produto e UX

Este arquivo governa esta pasta e todas as subpastas.

## Pode alterar
- telas e UX de configurações, preferências e contexto visual da aplicação.

## Não pode
- Configuração visual não pode conceder permissão real.
- Não armazenar segredo em claro no browser.

## Coordenação
- Segredos/integrações -> 01/06. Navegação global permanece com 02.

## Definição de pronto local
- estados e fluxos de configuração refletem o backend real.

## Gate mínimo
- `npx tsc --noEmit`
- `npm run lint`
- testes relevantes ao domínio
- `npm run build`

Não registrar sucesso sem executar o teste correspondente.
