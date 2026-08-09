# AGENTS.md — Integrações e Bitrix

## Dono
Agente 06 — Integrações e Bitrix

Este arquivo governa esta pasta e todas as subpastas.

## Pode alterar
- Bitrix, Extrações, Google, WhatsApp, 3CX, voz, status/retry de integrações.

## Não pode
- Não criar/editar migration.
- Não armazenar segredo em localStorage.
- Não afirmar sucesso sem confirmação.

## Coordenação
- Schema -> 01. Navegação -> 02. IA -> 07. Deploy -> 08.

## Definição de pronto local
- health/status, retry, erros, Bitrix e voz têm testes e observabilidade.

## Gate mínimo
- `npx tsc --noEmit`
- `npm run lint`
- testes relevantes ao domínio
- `npm run build`

Não registrar sucesso sem executar o teste correspondente.
