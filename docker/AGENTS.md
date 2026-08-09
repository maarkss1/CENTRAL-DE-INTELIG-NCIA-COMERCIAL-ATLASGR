# AGENTS.md — Docker (infraestrutura local/auxiliar)

## Dono
Agente 10 — Infraestrutura, Observabilidade e SRE

Este arquivo governa esta pasta e todas as subpastas.

## Pode alterar
- configuração de serviços auxiliares (ex. `docker/postgres/**`) usados por infraestrutura/observabilidade.

## Não pode
- `Dockerfile` e `docker-compose.yml` da raiz continuam com o Agente 08 — não alterá-los sem handoff.
- Não guardar credencial/segredo real em arquivo de configuração versionado.

## Coordenação
- Siga `/AGENTS.md` para conflitos e handoffs. Mudança que afete o build/release da aplicação (não apenas infraestrutura auxiliar) exige handoff para o Agente 08.

## Definição de pronto local
- serviços auxiliares sobem de forma reprodutível sem segredo versionado.

## Gate mínimo
- `npx tsc --noEmit`
- `npm run lint`
- testes relevantes ao domínio
- `npm run build`

Não registrar sucesso sem executar o teste correspondente.
