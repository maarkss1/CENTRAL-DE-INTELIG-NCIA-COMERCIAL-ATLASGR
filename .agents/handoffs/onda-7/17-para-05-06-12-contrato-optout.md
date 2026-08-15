- De: 17
- Para: 05, 06, 12
- Onda: 7
- Status: aberto
- Prioridade: bloqueador
## Problema
Hoje `CallSuppression` só protege o canal de voz (12). E-mail (05) e WhatsApp (06) não consultam
nenhum registro de opt-out antes de disparar — um lead que pede para não ser incomodado num canal
continua recebendo mensagem pelos outros dois. É a mentira mais provável do meu domínio (ver
`.agents/prompts/17-cadencia-ciclo-receita.md` → "Mentira mais provável") e o risco central de
LGPD da onda: dano real a pessoa real.

Construí o registro unificado em `src/features/cadence/domain/optOut.ts` e
`src/features/cadence/application/optOutService.ts` como lógica de domínio pura, com uma porta
(`OptOutRepository`) e uma implementação em memória para meus testes. O adaptador Prisma real
depende da tabela `OptOutRecord`, que propus em `17-para-01-schema-cadencia-optout-proposta.md`
(ainda não aplicada). Este handoff é o contrato de **como cada canal deve chamar essa camada**
assim que o adaptador Prisma existir — a interface já está estável e testada, só falta a ligação.

## Arquivo(s) envolvido(s)
- Meu: `src/features/cadence/domain/optOut.ts`, `src/features/cadence/application/optOutService.ts`
  (porta + serviço, prontos e testados).
- Seus, quando for aplicar: cada ponto de disparo real —
  `src/features/prospecting/services/cold-email.service.ts` e qualquer outro caminho de envio de
  e-mail (05); serviço de envio de WhatsApp em `src/features/integrations/whatsapp/**` (06);
  `src/features/integrations/birth-voice/coldCall.policy.ts` /
  `src/features/integrations/birth-voice/callSuppression.service.ts` (12).

## Alteração necessária

### Contrato de consulta (antes de qualquer disparo, nos 3 canais)
```ts
import { isOptedOut } from '../../cadence/application/optOutService.js'; // caminho ilustrativo — ajusto se preferirem outro ponto de entrada público

const blocked = await isOptedOut(repo, organizationId, {
    leadId: lead.id,           // sempre que disponível — é o casamento mais forte
    email: lead.contact?.email ?? null,
    phoneE164: toE164BR(lead.contact?.phone ?? lead.contact?.whatsapp),
}, 'email' /* | 'whatsapp' | 'voice' */);

if (blocked) {
    // registrar tentativa como 'skipped' (motivo 'opt-out'), NUNCA como enviado — mesma classe de
    // honestidade já corrigida em cold-email.service.ts (commit 2e42a557)
    return;
}
```

**Ponto crítico**: passem `email` **e** `phoneE164` do lead sempre que o canal já os tiver
carregado, mesmo que o canal atual só use um dos dois para o envio em si. É assim que um opt-out
registrado por telefone (voz/WhatsApp) bloqueia e-mail do mesmo lead, e vice-versa, sem exigir uma
tabela de resolução de identidade separada — o casamento acontece nos três campos
(`leadId`/`email`/`phoneE164`) dentro de `isOptedOut`, não em cada canal individualmente.

### Contrato de registro (quando o canal recebe um pedido de opt-out)
```ts
import { recordOptOut } from '../../cadence/application/optOutService.js';

await recordOptOut(repo, {
    organizationId,
    scope: 'global', // ou 'email'/'whatsapp'/'voice' se o pedido for explicitamente restrito a um canal
    leadId: lead?.id ?? null,
    email: lead?.contact?.email ?? null,
    phoneE164: toE164BR(phone),
    originChannel: 'whatsapp', // 'email' | 'whatsapp' | 'voice' | 'manual' | 'import'
    reason: 'Lead pediu para não receber mais mensagens',
    evidence: mensagemOriginal, // texto/trecho real, nunca inferência
    requestedBy: null, // ou userId, se registrado manualmente por um vendedor
});
```
`scope: 'global'` é a interpretação correta por padrão sempre que o lead pedir para "parar de
contato" de forma genérica — só use `scope` restrito a um canal quando o pedido for
inequivocamente restrito ("não me liga mais, pode mandar e-mail").

### Para o 12 especificamente — migração do `CallSuppression`
Não desligo nem removo `CallSuppression` — ele é seu e está em produção. Proposta:
1. `OptOutRecord` recebe (via migration, ver handoff ao 01) uma cópia inicial de todo
   `CallSuppression` existente (`scope='Voice'`, `originChannel='voice'`).
2. A partir da aplicação do schema, `coldCall.policy`/`callSuppression.service.ts` passam a
   **escrever nos dois** (ou só em `OptOutRecord`, se você decidir migrar de vez — sua chamada,
   é seu arquivo) até você confirmar que `OptOutRecord` cobre 100% dos casos hoje cobertos por
   `CallSuppression`.
3. Quando confirmado, `isSuppressed`/`isOptedOut` passam a consultar só `OptOutRecord` para voz
   também, fechando a lacuna: opt-out feito por WhatsApp bloqueando voz, hoje impossível.

## Teste esperado
Cobrir, para cada par de canais (E-mail↔WhatsApp, E-mail↔Voz, WhatsApp↔Voz):
- opt-out registrado num canal impede disparo real no outro (teste de integração no canal
  consumidor, chamando `isOptedOut` de verdade em vez de mockar).
- opt-out `scope: 'global'` bloqueia os três.
- opt-out `scope` restrito a um canal não bloqueia os outros dois (regressão para não
  super-bloquear).

Meus próprios testes (`src/features/cadence/__tests__/optOut.test.ts`) já cobrem a lógica de
casamento/matching em memória — o que falta é a integração de cada canal real chamando isso, que é
o objeto deste handoff.

## Contexto adicional
Prioridade `bloqueador` porque, sem essa ligação, a Onda 7 entrega um registro de opt-out que
existe mas não protege ninguém de verdade — exatamente o cenário que o meu prompt chama de "a
mentira mais provável do seu domínio". Não é bloqueador para eu continuar implementando dentro do
meu próprio escopo (a lógica de domínio não depende de vocês para existir e ser testada), mas é
bloqueador para a Onda 7 ser aprovada como "opt-out unificado" de verdade, e deveria ser tratado
como tal na integração final (`/AGENTS.md` → "Bloqueadores prioritários", item 13, LGPD).
