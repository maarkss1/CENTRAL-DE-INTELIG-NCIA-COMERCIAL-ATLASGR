# AGENTS.md — Backend de IA

## Dono
Agente 07 — IA e Automações

Este arquivo governa esta pasta e todas as subpastas.

## Pode alterar
- módulos de backend específicos de IA dentro desta pasta.

## Não pode
- Alterações no `server.ts` raiz exigem Coordenador.
- Não expor segredo ou ferramenta sem autorização.

## Coordenação
- Siga `/AGENTS.md` para conflitos e handoffs.

## Definição de pronto local
- endpoints/tools de IA validam authz, argumentos, tenant, timeout e erro.

## Gate mínimo
- `npx tsc --noEmit`
- `npm run lint`
- testes relevantes ao domínio
- `npm run build`

Não registrar sucesso sem executar o teste correspondente.
