# AGENTS.md — Infraestrutura

## Dono
Agente 10 — Infraestrutura, Observabilidade e SRE

Este arquivo governa esta pasta e todas as subpastas.

## Pode alterar
- arquivos futuros dentro de `infrastructure/**`.

## Não pode
- Não duplicar manifests existentes sem razão.
- Não guardar credenciais.

## Coordenação
- Siga `/AGENTS.md` para conflitos e handoffs.

## Definição de pronto local
- infraestrutura nova segue o mesmo gate de release.

## Gate mínimo
- `npx tsc --noEmit`
- `npm run lint`
- testes relevantes ao domínio
- `npm run build`

Não registrar sucesso sem executar o teste correspondente.
