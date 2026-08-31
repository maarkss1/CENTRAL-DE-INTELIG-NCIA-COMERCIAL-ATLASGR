- De: 15
- Para: 10
- Onda: os
- Status: aberto
- Prioridade: normal
## Problema
Middlewares de seguranca precisam ser montados no server.ts, mas o Agente 15 não tem permissão de edição desse arquivo.
## Arquivo(s) envolvido(s)
- src/middleware/opa.ts
- server.ts
## Alteração necessária
Por favor, importe o `opaMiddleware` de `src/middleware/opa.ts` e adicione-o à aplicação no arquivo `server.ts`.
## Teste esperado
Testar as rotas da aplicação para garantir que o middleware OPA está validando o role e organizationId corretamente na porta 8181.
## Contexto adicional
Criado pela solicitação de integração de segurança com OPA.
