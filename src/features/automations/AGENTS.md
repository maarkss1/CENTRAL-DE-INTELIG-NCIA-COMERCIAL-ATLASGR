# AGENTS.md — Automações

## Dono
Agente 07 — IA e Automações

Este arquivo governa esta pasta e todas as subpastas.

## Pode alterar
- automações, execuções, status, retries e histórico.

## Não pode
- Não disparar ação crítica sem autorização.
- Não engolir erro de background.

## Coordenação
- Siga `/AGENTS.md` para conflitos e handoffs.

## Definição de pronto local
- cada execução possui status, passos, erro, retry e correlation id.

## Gate mínimo
- `npx tsc --noEmit`
- `npm run lint`
- testes relevantes ao domínio
- `npm run build`

Não registrar sucesso sem executar o teste correspondente.
