- De: 02
- Para: 00
- Onda: 11
- Status: aberto
- Prioridade: alto
## Problema
Erro de TypeScript em `server.ts` indicando que a propriedade 'ENABLE_EMBEDDED_WORKERS' não existe no tipo do ENV validado.
## Arquivo(s) envolvido(s)
`server.ts`
## Alteração necessária
Atualizar o schema de validação do Zod (ou onde o ENV está sendo definido) para incluir a propriedade `ENABLE_EMBEDDED_WORKERS`.
## Teste esperado
O comando `npx tsc --noEmit` deve rodar sem apresentar o erro `TS2339` no `server.ts`.
## Contexto adicional
Detectado durante a validação de build (tsc) na finalização do Agente 02 (UX) da Onda 11. Como `server.ts` é de propriedade do Coordenador, foi aberto este handoff.
