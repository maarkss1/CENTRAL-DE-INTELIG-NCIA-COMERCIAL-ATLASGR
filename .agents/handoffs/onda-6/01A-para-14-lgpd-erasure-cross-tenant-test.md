- De: Agente 01A (Confiabilidade de Dados, RLS e Retenção)
- Para: Agente 14 (Ambiente de Execução / Harness)
- Onda: 6
- Status: resolvido
- Prioridade: alto

## Problema
`tests/**` é propriedade exclusiva do Agente 14 nesta onda — não posso criar o arquivo de teste de
integração permanente ali, mesmo já tendo **provado o comportamento com banco real** via script
temporário (rodado e apagado, não commitado). O item 4 da minha missão (`.agents/prompts/01A-dados-
rls-retencao.md`) pede exatamente este teste: "cria titular em duas organizações, apaga em uma e
comprova que a outra permanece intacta".

## Arquivo(s) envolvido(s)
Novo arquivo sugerido: `tests/integration/lgpd-erasure-cross-tenant.test.ts` (mesmo padrão de
`tests/integration/tenant-isolation-db001.test.ts` — usa `requestContext.run({ bypassRls: true })`
só para setup/assert/teardown, e testa a função real sob RLS).

## Alteração necessária
Criar teste de integração cobrindo `eraseDataSubject` (`src/shared/services/
dataSubjectErasure.service.ts`, já estendido nesta onda para cobrir `ConversationSignal` e
`TimelineEvent`, além de `Contact`/`WhatsAppMessage`):

```ts
import { describe, it, expect, afterAll } from 'vitest';
import { prisma } from '../../src/lib/prisma';
import { requestContext } from '../../src/lib/async-context';
import { eraseDataSubject, ANONYMIZED_CONTACT_NAME } from '../../src/shared/services/dataSubjectErasure.service';

const withBypass = <T>(fn: () => Promise<T>) => requestContext.run({ bypassRls: true }, fn);

describe('eraseDataSubject — exclusão de titular sem vazamento cross-tenant (integração real)', () => {
  const suffix = Date.now();
  const ORG_A = `test-lgpd-org-a-${suffix}`;
  const ORG_B = `test-lgpd-org-b-${suffix}`;

  afterAll(async () => withBypass(async () => {
    await prisma.whatsAppMessage.deleteMany({ where: { organizationId: { in: [ORG_A, ORG_B] } } });
    await prisma.conversationSignal.deleteMany({ where: { organizationId: { in: [ORG_A, ORG_B] } } });
    await prisma.timelineEvent.deleteMany({ where: { leadId: { in: [`${ORG_A}-lead`, `${ORG_B}-lead`] } } });
    await prisma.lead.deleteMany({ where: { organizationId: { in: [ORG_A, ORG_B] } } });
    await prisma.contact.deleteMany({ where: { organizationId: { in: [ORG_A, ORG_B] } } });
    await prisma.organization.deleteMany({ where: { id: { in: [ORG_A, ORG_B] } } });
  }));

  it('apaga titular de ORG_A sem tocar o titular equivalente em ORG_B', async () => {
    // seed (bypass), erase(ORG_A), assert ORG_A anonimizado e ORG_B intacto — ver script provado
    // em texto no relatório da Onda 6 do 01A (rodado ao vivo contra Postgres real, 9/9 checks OK),
    // não commitado no repo. Estrutura de dados exata (Company/Contact/Lead/TimelineEvent/
    // ConversationSignal/WhatsAppMessage) replicável a partir dos campos obrigatórios do schema.
  });
});
```

## Teste esperado
`npm run test:integration` verde incluindo este arquivo, com asserts equivalentes aos 9 checks já
provados manualmente pelo 01A:
1. Contact de ORG_A anonimizado (nome/telefone/email nulos).
2. Contact de ORG_B permanece intacto.
3. Leitura direta de ORG_B sob contexto de tenant ORG_A retorna vazio (RLS).
4. ConversationSignal de ORG_A redigido (summary/nextStep nulos).
5. ConversationSignal de ORG_B intacto.
6. TimelineEvent de ORG_A com description substituída por `[evento anonimizado — LGPD]`.
7. TimelineEvent de ORG_B intacto.
8. WhatsAppMessage de ORG_A com body nulo.
9. WhatsAppMessage de ORG_B intacto.

## Contexto adicional
Não bloqueia a aprovação desta onda por si só — a prova real já foi feita e está registrada no
relatório desta rodada do 01A — mas o teste permanente deveria existir para pegar regressão futura
(mesma lição do handoff do AILog: "corrigido uma vez, provado por leitura de código" já causou 3
reaberturas nesse mesmo repositório).

## Resolução

Criado `tests/integration/lgpd-erasure-cross-tenant.test.ts`, seguindo exatamente o esqueleto e o
padrão de `tenant-isolation-db001.test.ts`. Roda contra Postgres real
(`prospectordb_test`, RLS `FORCE ROW LEVEL SECURITY` ativa) — não é mock.

O teste cria em duas organizações (`ORG_A`/`ORG_B`, ids gerados por execução) a cadeia completa
Company → Contact → Lead → WhatsAppMessage/ConversationSignal/TimelineEvent, chama
`eraseDataSubject({ organizationId: ORG_A, contactId: contactA.id })` e verifica os 9 checks do
handoff, mais um décimo (idempotência):

1. Contact de ORG_A anonimizado (nome = `ANONYMIZED_CONTACT_NAME`, phone/whatsapp/email/linkedin/
   observations nulos, customFields = `{}`) — OK.
2. Contact de ORG_B intacto — OK.
3. Leitura direta de ORG_A sob contexto real de tenant ORG_B (`requestContext.run({ tenantId:
   ORG_B }, ...)`, sem bypass) retorna vazio para Contact, WhatsAppMessage, ConversationSignal,
   TimelineEvent e para a lista de Lead por `organizationId: ORG_A` — OK (RLS real, não é o filtro
   explícito de `organizationId` fazendo o trabalho; a policy `tenant_isolation_policy` nega as
   linhas antes mesmo do `WHERE` aplicado pelo Prisma).
4. ConversationSignal de ORG_A redigido (summary/nextStep nulos, objections `[]`, rawModelOutput
   `{}`) — OK.
5. ConversationSignal de ORG_B intacto — OK.
6. TimelineEvent de ORG_A com description = `[evento anonimizado — LGPD]` — OK.
7. TimelineEvent de ORG_B intacto — OK.
8. WhatsAppMessage de ORG_A com body nulo — OK.
9. WhatsAppMessage de ORG_B intacto — OK.
10. (extra) rodar `eraseDataSubject` uma segunda vez sobre o mesmo contato retorna
    `alreadyAnonymized: true` sem falhar nem re-mascarar mensagens já mascaradas — OK.

Resultados reais:
- `vitest run -c vitest.integration.config.ts tests/integration/lgpd-erasure-cross-tenant.test.ts`
  — 1/1 passou (rodado 3x seguidas para descartar flakiness, sempre verde).
- `npm run test:integration` (suíte completa) — 14 arquivos, 49 testes, todos verdes, incluindo o
  novo arquivo. Nenhum teste pré-existente quebrou.
- `npx tsc --noEmit` — sem erros.
- `npm run lint` — 0 erros, 101 warnings (todos pré-existentes em outros arquivos, nenhum no
  arquivo novo — débito já mapeado, ex. `jsx-a11y/label-has-associated-control`,
  `@typescript-eslint/no-explicit-any`).

### Achado colateral (documentado no topo do teste)

Ao escrever o teste, bati numa pegadinha real do runtime deste repo, não específica do meu código:
todo callback passado a `requestContext.run()` (`src/lib/async-context.ts`) precisa ser uma função
`async`, mesmo sem nenhum `await` interno. Um callback não-async que só repassa a Promise (`() =>
prisma.x.create(...)`) faz `getStore()` (lido de forma síncrona no topo do `$allOperations` da
extensão do Prisma, `src/lib/prisma.ts`) voltar `undefined` sob o `client-engine-runtime` do Prisma
7 — sem tenantId nem bypassRls, a policy de RLS nega até um `INSERT` legítimo com "new row violates
row-level security policy", mesmo com o contexto correto passado para `run()`. Reproduzido de forma
determinística e isolada (script descartável, não commitado) até isolar a causa; todo o padrão já
usado em `tests/integration/*.test.ts` existente sempre envolve o callback em `async () => {...}`,
então nenhum teste pré-existente é afetado — só documentei a causa raiz no comentário do novo
arquivo para a próxima pessoa não perder tempo redescobrindo isso.
