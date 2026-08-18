- De: 09
- Para: 00
- Onda: 11
- Status: resolvido
- Prioridade: alto

## Problema
O arquivo server.ts está falhando na checagem de tipos (npx tsc --noEmit) devido a uma propriedade não reconhecida (ENABLE_EMBEDDED_WORKERS).

## Arquivo(s) envolvido(s)
server.ts

## Alteração necessária
Verificar e adicionar a tipagem correta para ENABLE_EMBEDDED_WORKERS na definição do objeto esperado.

## Teste esperado
O comando 
px tsc --noEmit deve passar sem erros neste arquivo.

## Contexto adicional
O erro encontrado foi: server.ts(471,57): error TS2339: Property 'ENABLE_EMBEDDED_WORKERS' does not exist on type...

## Resolução (Sprint 00/Onda 12 — GOV-006, 2026-08-18)
Duplicado de `onda-11/02-para-00-server-ts-env.md` — mesmo achado, já corrigido (`ENABLE_EMBEDDED_WORKERS`
tipado em `src/config/env.ts:66`). Status corrigido de `aberto` para `resolvido`.
