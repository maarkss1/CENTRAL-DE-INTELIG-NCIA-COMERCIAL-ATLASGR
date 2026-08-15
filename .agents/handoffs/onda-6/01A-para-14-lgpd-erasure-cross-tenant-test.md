- De: Agente 01A (Confiabilidade de Dados, RLS e Retenção)
- Para: Agente 14 (Ambiente de Execução / Harness)
- Onda: 6
- Status: aberto
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
