- De: Agente 12 (Voz e Telefonia)
- Para: Agente 00 (Coordenador) / Agente 08 (QA e Release)
- Onda: 7
- Status: aberto
- Prioridade: alto (não bloqueia esta onda isoladamente, mas ameaça a confiabilidade do gate de
  `test:integration` de QUALQUER agente que rode em paralelo com outro)

## Problema

`tests/helpers/integration-setup.ts` (setup global de `vitest.integration.config.ts`) tem, no
`afterAll`:

```ts
afterAll(async () => {
  await cleanDatabase();
  await withRlsBypass(async () => {
    ...
    await prisma.organization.deleteMany();  // SEM where — apaga TODAS as organizações
  });
  await prisma.$disconnect();
});
```

Isso roda uma vez ao final de cada ARQUIVO de teste de integração. Durante a Onda 7, 7 agentes rodam
em worktrees isolados no filesystem, mas todos apontam para o MESMO Postgres de teste
(`prospectordb_test`, mesmo container Docker compartilhado — não há um banco por worktree). Quando
dois agentes rodam `npm run test:integration` ao mesmo tempo (o cenário normal desta onda), o
`afterAll` de um arquivo de QUALQUER agente apaga as organizações que OUTRO agente está usando no
meio da própria suíte — inclusive `test-org-id`, o fixture compartilhado que
`tests/helpers/integration-setup.ts` semeia para todo mundo.

## Como encontrei

Escrevendo `tests/integration/threecx-persistence.test.ts` (meu domínio) nesta onda. Mesmo usando
organizações com id próprio e único por execução (não o `test-org-id` compartilhado, exatamente para
evitar colisão com fixtures de outros arquivos), o teste falhou de forma intermitente com
`Foreign key constraint violated` e resultados vazios inesperados — sempre em pontos diferentes a
cada nova tentativa, nunca no mesmo teste duas vezes seguidas. Validei separadamente, com um script
Node avulso rodando sozinho contra o mesmo Postgres (sem a suíte de integração de mais ninguém por
perto), que a persistência/criptografia/RLS que este teste cobre funcionam corretamente — a
inconsistência é 100% de timing entre processos, não do código sob teste.

Confirmado observando a tabela diretamente: `SELECT count(*) FROM "Organization"` foi para 0 no meio
da minha própria execução, sem nenhuma ação minha que devesse ter causado isso.

## Impacto

Qualquer agente cujo `test:integration` dependa de uma organização (praticamente todos, dado o
schema multi-tenant) pode falhar de forma não-determinística enquanto outro agente da mesma onda
também está rodando `test:integration`. Isso ameaça diretamente o critério de aprovação da Onda 7
("Gate roda 2× seguidas sem depender de retry para fechar verde") — não porque algum agente tenha
um bug, mas porque o ambiente de teste compartilhado não isola execuções concorrentes.

## Alteração necessária (sugestão, não meu domínio)

`tests/helpers/integration-setup.ts` não é meu domínio (é infraestrutura de teste compartilhada,
mais perto de 08/00). Possíveis direções, para avaliação de quem for dono:
1. Cada worktree/agente usar um banco de teste com nome próprio (ex.:
   `prospectordb_test_agente12`), configurado via `.env.test` por worktree — mais trabalho de setup,
   mas isolamento real.
2. Trocar `prisma.organization.deleteMany()` (sem where) por uma limpeza escopada — cada arquivo de
   teste de integração já sabe quais ids de organização criou; o cleanup global só precisaria varrer
   organizações com um prefixo/padrão reconhecível de fixture de teste, nunca um DELETE geral.
3. Serializar `test:integration` entre agentes no nível do Coordenador (rodar o gate de integração
   em lotes, não em paralelo) — mais simples de aplicar agora, mas não resolve o problema de raiz
   para quando isto rodar em CI real com jobs paralelos.

## Teste esperado

Duas execuções concorrentes de `npm run test:integration` (de dois worktrees/agentes diferentes)
contra o mesmo Postgres de teste não devem mais falhar uma à outra por organização inesperadamente
ausente.

## Contexto adicional

Não bloqueei minha própria entrega por causa disto — validei o comportamento real via script
isolado (ver `## Resolução` em
`.agents/handoffs/onda-5/01-para-06-persistencia-3cx-implementada.md`) e mantive
`tests/integration/threecx-persistence.test.ts` no repositório porque ele é correto e vai passar de
forma estável assim que rodar sem concorrência de banco — só registrei aqui o risco para quem for
avaliar o gate agregado da onda.
