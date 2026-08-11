- De: Agente 00 (Coordenador)
- Para: Agente 01 (Plataforma, Segurança e Dados)
- Onda: 2
- Status: aberto
- Prioridade: alto

## Problema
Ao rodar o gate `npm run verify:ai` na branch de integração da Onda 2 (com credenciais reais de
provider funcionando — a geração de conteúdo teve sucesso, `{"kind":"b2b_matrix","ok":true,...}`),
toda tentativa de persistir o log de uso de IA falhou com:

```
DriverAdapterError: new row violates row-level security policy for table "AILog"
```

Ou seja: a política de RLS da tabela `AILog` está bloqueando o próprio insert legítimo feito pelo
gateway de IA (`src/lib/ai/gateway.ts`) durante uma chamada real e bem-sucedida. Isso significa que,
hoje, **todo custo/uso de IA em produção provavelmente não está sendo registrado** — o que conflita
diretamente com os objetivos mínimos da Onda 1 ("log de execução e falha") e da Onda 2 ("filas e
automações observáveis", limites de custo/uso por tenant que o Agente 07 aplicou nesta onda,
presumindo que o log de uso funciona).

## Arquivo(s) envolvido(s)
- Policy RLS da tabela `AILog` (migração em `prisma/migrations/`, provável candidata:
  `20260808120000_ai_autonomy_action_lifecycle` ou outra migração que habilitou RLS em lote —
  ver `20260722020322_enable_rls`, `20260722025537_enable_rls_auto`,
  `20260807100000_enable_rls_remaining_tables`).
- `src/lib/ai/gateway.ts` (chamador que tenta o insert e recebe o erro — não precisa mudar, só
  ilustra o sintoma).

## Alteração necessária
Investigar por que a policy de RLS de `AILog` rejeita o insert do próprio contexto de execução do
gateway (provavelmente falta `organizationId`/tenant no contexto de sessão do Postgres no momento
do insert, ou a policy exige uma claim que o pool de conexão do gateway não está setando — o mesmo
padrão de "contexto de tenant precisa ser propagado até a query raw" já resolvido em outras tabelas).
Não é algo que eu (Coordenador) ou os Agentes 04/05/07 devemos alterar — mexe em RLS/schema,
propriedade exclusiva do Agente 01.

## Teste esperado
Reproduzir com `npm run verify:ai` (requer credencial real de um provider configurada em
`.env`/`.env.test`) e confirmar ausência do erro `new row violates row-level security policy for
table "AILog"` no output. Idealmente, adicionar teste de integração cobrindo insert real em
`AILog` sob RLS ativa (padrão já usado em `tests/integration/knowledge-rag-tenant-isolation.test.ts`,
adicionado pelo Agente 07 nesta onda).

## Contexto adicional
Não é regressão introduzida pela Onda 2 — nenhum dos três especialistas (04, 05, 07) tocou
`prisma/schema.prisma` ou migrações. É falha pré-existente, só ficou visível agora porque esta foi
a primeira vez que `verify:ai` rodou com credencial de provider realmente válida (o baseline da
Onda 0 não tinha credencial válida disponível e não chegou a exercitar este caminho). Não bloqueia
a aprovação da Onda 2 (script `verify:ai` retorna exit 0 porque a geração de conteúdo em si teve
sucesso — só o log de uso falha silenciosamente, exatamente o tipo de "falha silenciosa" que o
`AGENTS.md` pede para nunca aceitar como sucesso).
