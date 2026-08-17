- De: 18
- Para: 13
- Onda: 8
- Status: aberto
- Prioridade: normal

## Problema
`src/features/intelligence/agents/base.agent.ts:133` faz
`const messages = result.messages as any[];` sobre o retorno de `createReactAgent(...).invoke()`
(LangGraph/LangChain), escondendo a forma real do array de mensagens que alimenta
`updateMemory`/a resposta final dos agentes SDR/BDR/Closer do enxame. Já existe um
eslint-disable reconhecendo o `any` como trade-off deliberado, não descoberta nova — reporto aqui
porque a missão desta onda pede varredura completa de `as any` em limite de contrato, e este é o
único ponto do domínio de contrato de agente/ferramenta (Agente 13, por
`.agents/prompts/18-contratos-api-docs.md` → "Coordenação") que se qualifica.

## Arquivo(s) envolvido(s)
- `src/features/intelligence/agents/base.agent.ts:133`

## Alteração necessária
Se o LangGraph/LangChain expõe um tipo para o array de mensagens retornado por
`createReactAgent(...).invoke()` (ex. `BaseMessage[]` do próprio `@langchain/core`), trocar o `any`
por esse tipo e remover o eslint-disable se ele deixar de ser necessário. Se não houver tipo público
adequado, documentar no próprio código por que o `any` é necessário aqui (o eslint-disable já
sinaliza consciência, mas um comentário explicando o motivo ajudaria o próximo agente a não achar
que é uma pendência esquecida).

## Teste esperado
- `npx tsc --noEmit` sem erros novos, se um tipo mais estrito for aplicado.
- Testes de `tests/unit/features/intelligence/agents/**` continuam passando.

## Contexto adicional
Classificado como risco **médio**, não alto: é um limite de orquestração de IA interno (não dado
monetário/PII/tenancy direto), e já é um trade-off reconhecido no próprio código, não uma
descoberta nova de mascaramento acidental. Registrando para fechar a varredura completa da missão,
não porque considero isto urgente.
