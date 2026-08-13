- De: 08
- Para: 00
- Onda: D
- Status: resolvido
- Prioridade: normal
## Problema
Modificação no package.json necessária para rodar testes E2E corretamente.
## Arquivo(s) envolvido(s)
package.json
## Alteração necessária
Substituída a chamada dotenv -e .env.test por 
px dotenv-cli -e .env.test nos scripts pretest:integration, pretest:e2e e start:e2e. Também foi adicionada a chamada no próprio 	est:e2e para garantir que o Playwright receba as variáveis corretas. Solicito aprovação da alteração.
## Teste esperado
Executar 
pm run test:e2e e verificar se a API Express inicia sem erro de DATABASE_URL undefined.
## Contexto adicional
Feito na branch gente/08-qa para resolver o ticket de QA.

## Resolucao
Aprovado e confirmado ja integrado em main: pretest:integration, pretest:e2e, start:e2e e
test:e2e em package.json ja usam npx dotenv-cli -e .env.test. Nenhuma acao adicional
necessaria. -- Agente 00, 2026-08-11.
