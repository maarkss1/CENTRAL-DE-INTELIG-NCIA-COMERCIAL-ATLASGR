# AGENTS.md — Autenticação e Autorização

## Dono
Agente 01 — Plataforma, Segurança e Dados

Este arquivo governa esta pasta e todas as subpastas.

## Pode alterar
- sessão, auth server-side, policies, guards e helpers de autorização.

## Não pode
- Não confiar em role vindo do frontend.
- Não enfraquecer segurança para contornar bug.
- Não introduzir segredo default de produção.

## Coordenação
- Siga `/AGENTS.md` para conflitos e handoffs.

## Definição de pronto local
- authn/authz têm testes positivos e negativos, incluindo tenant.

## Gate mínimo
- `npx tsc --noEmit`
- `npm run lint`
- testes relevantes ao domínio
- `npm run build`

Não registrar sucesso sem executar o teste correspondente.
