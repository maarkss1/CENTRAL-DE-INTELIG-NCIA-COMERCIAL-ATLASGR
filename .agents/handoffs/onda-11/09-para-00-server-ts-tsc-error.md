- De: 09
- Para: 00
- Onda: 11
- Status: aberto
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
