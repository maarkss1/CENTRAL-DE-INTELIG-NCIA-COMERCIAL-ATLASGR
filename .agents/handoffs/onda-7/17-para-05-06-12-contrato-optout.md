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

## Resolução (12)

Parte do 12 feita, branch `agente/12-optout-voz` (a partir de `integracao/optout-unificado`,
commit base `459de182`, que já tinha `OptOutRecord` + `PrismaOptOutRepository` aplicados por 00).

- `src/features/integrations/birth-voice/callSuppression.service.ts`: `isSuppressed` agora
  consulta as DUAS fontes antes de deixar discar — `CallSuppression` (histórica) e `OptOutRecord`
  (via `isOptedOut(prismaOptOutRepository, ...)`, canal `'voice'`). Aceita um terceiro parâmetro
  opcional `{ leadId, email }` para fortalecer o casamento entre canais (o telefone sozinho já
  cobre a maioria dos casos, mas um opt-out registrado só por e-mail depende do `leadId` para ser
  encontrado). `recordOptOut` continua gravando em `CallSuppression` (inalterado) e passou a
  também gravar em `OptOutRecord` (`scope: 'voice'`, `originChannel: 'voice'`, melhor esforço —
  uma falha na escrita unificada não derruba o bloqueio de voz, que já valeu via
  `CallSuppression`).
- `src/features/integrations/birth-voice/birthVoice.service.ts` (`callLead`) e
  `src/features/integrations/threecx/threecx.service.ts` (`make3CXCall`, Click-to-Call) — os dois
  pontos reais de discagem — passam a chamar `isSuppressed` com `leadId`/`email` do lead como
  contexto.
- `src/features/integrations/birth-voice/birthVoice.webhook.ts`: passa `evidence` (trecho real da
  transcrição) separado do `reason` composto, para o registro unificado guardar a evidência crua.
- **Decisão registrada** (passo 2 de 3 da proposta original, "Para o 12 especificamente"): mantive
  as duas escritas (`CallSuppression` E `OptOutRecord`) — não migrei a leitura de voz para
  depender só de `OptOutRecord`. Isso é o passo 3, que exige antes confirmar 100% de cobertura;
  fora do escopo desta tarefa pontual.
- Scope sempre `'voice'` nos bloqueios registrados a partir de voz (pedido feito durante a própria
  ligação, ex. "não me ligue mais" — inequivocamente restrito ao canal, não `'global'`). Por
  desenho, isso NÃO bloqueia e-mail/WhatsApp por si só (mesma regra documentada em
  `src/features/cadence/domain/optOut.ts`) — o valor para 05/06 é o registro ficar visível/auditável
  ao lado dos opt-outs deles, não um bloqueio automático de canal.
- Testes: unitários atualizados/adicionados em
  `src/features/integrations/birth-voice/__tests__/callSuppression.service.test.ts`,
  `birthVoice.service.test.ts` e `src/features/integrations/threecx/__tests__/threecx.service.test.ts`
  (mocks) + `tests/unit/features/integrations/threecx/threecx.service.test.ts` (assinatura de
  `isSuppressed` mudou, teste ajustado). Integração nova contra Postgres real, sem mock, em
  `tests/integration/voice-optout-cross-channel.test.ts`: E-mail→Voz e WhatsApp→Voz com
  `scope: 'global'` bloqueando, `scope` restrito ao outro canal não bloqueando, e a convivência
  `CallSuppression`+`OptOutRecord` provada ponta a ponta.
- Gate: `tsc --noEmit`, `lint`, `test:unit` (1080 testes) e `build` verdes. `test:integration`
  verde para todos os arquivos do meu domínio (`threecx-persistence`, `optout-record-persistence`,
  `voice-optout-cross-channel`) rodados isolados; a suíte completa tem flakiness pré-existente por
  contenção no Postgres de teste compartilhado entre agentes rodando em paralelo (confirmado: o
  mesmo `rbac-e2e-commercial-intelligence.test.ts` falha isolado e passa contra o commit-base sem
  minhas mudanças) — não é regressão introduzida por esta tarefa. `verify:integrations` roda mas
  não cobre voz/3CX (só provedores externos tipo Google Places/Apollo/Bitrix); a única falha
  (`googlePlaces`) é pré-existente e fora do meu domínio.

Não marco `Status: resolvido` — isso é do Coordenador, depois de integrar minha parte com as de 05
e 06.
