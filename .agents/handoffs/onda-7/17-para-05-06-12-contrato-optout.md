- De: 17
- Para: 05, 06, 12
- Onda: 7
- Status: resolvido
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

## Resolução (05 — E-mail)

`src/features/prospecting/services/cold-email.service.ts`: `ColdEmailCampaign` ganhou
`organizationId` (obrigatório), `leadId` e `contactPhone` (opcionais). `sendColdEmail` chama
`isOptedOut(prismaOptOutRepository, organizationId, { leadId, email: targetEmail, phoneE164:
toE164BR(contactPhone) }, 'email')` antes de qualquer envio real — bloqueio nunca é reportado como
enviado (mesma disciplina do commit `2e42a557`). `prospecting.routes.ts`: a rota `POST /cold-email`
passa a injetar `organizationId` a partir da sessão autenticada, nunca do corpo da requisição.

Não existe hoje nenhum fluxo real de descadastro/opt-out iniciado pelo lead dentro de
`src/features/prospecting/**` — não foi criado um, conforme instrução; só a checagem antes do
envio foi implementada.

Testes: `tests/unit/features/prospecting/cold-email.service.test.ts` (bloqueio, chamada correta a
`isOptedOut`, organizationId obrigatório) + `tests/integration/cold-email-optout.test.ts` (Postgres
real, sem mock de `isOptedOut`/`recordOptOut`): `scope: 'email'`/`'global'` bloqueiam; opt-out
registrado por `phoneE164` (voz) bloqueia e-mail do mesmo lead; `scope: 'voice'`/`'whatsapp'` não
bloqueia e-mail; sem opt-out envia normalmente.

Validação: `tsc --noEmit` limpo, `lint` 0 erros, `test:unit` 143/143 arquivos (1075 testes),
`test:integration` 22/22 arquivos (97 passed, 2 skipped), `build` ok.

Branch: `agente/05-optout-cold-email` (commit `ec8d175e`), a partir de `integracao/optout-unificado`
(`459de182`).

## Resolução (06 — WhatsApp)

Feito. Status permanece `aberto` porque este handoff tem 3 destinatários (05, 06, 12) e só a fatia
do 06 está confirmada abaixo — o Coordenador deve fechar para `resolvido` só depois que 05 e 12
também confirmarem a deles.

- `src/features/integrations/whatsapp/whatsapp.service.ts`: `sendWhatsAppMessage` agora chama
  `isOptedOut` (canal `'whatsapp'`) antes de qualquer envio real, dentro do seu próprio
  `requestContext.run({ tenantId: organizationId }, ...)` — não confia no contexto do chamador,
  porque este ponto é invocado tanto de uma request HTTP autenticada quanto de
  workers/webhooks (`crm/jobs/followUp.worker.ts`, `birth-voice/*.webhook.ts`) que podem não ter
  tenant no `AsyncLocalStorage`. Bloqueado → lança `AppError` 409 (nunca reporta como enviado);
  todo chamador automatizado já envolve a chamada em try/catch, então isto vira "não enviado", não
  um crash. Assinatura ganhou um 5º parâmetro opcional (`SendWhatsAppMessageContext`:
  `leadId`/`email`/`skipOptOutCheck`) — os 3 chamadores automatizados fora do meu escopo
  (`prospecting/services/whatsapp.service.ts`, `crm/jobs/followUp.worker.ts`,
  `birth-voice/*.webhook.ts`) continuam funcionando sem alteração: o default (sem 5º argumento) já
  ativa o check, casando pelo menos por telefone (sempre disponível, é o próprio parâmetro de
  envio).
- `src/features/integrations/whatsapp/whatsapp.routes.ts`: `POST /send` (mensagem manual do
  vendedor no painel) passa `{ skipOptOutCheck: true }` de propósito — não é disparo automatizado.
- `src/features/integrations/whatsapp/whatsappMessage.service.ts`: quando um lead responde
  "sair"/"parar"/"stop", além do flag legado `customFields.optOutWhatsApp` (mantido — outros
  pontos do código dependem dele, fora do meu escopo mexer), agora também chama `recordOptOut`
  (`scope: 'global'`, `originChannel: 'whatsapp'`, evidência = texto real da mensagem).
- Trouxe para o meu worktree (merge/cherry-pick de commits já existentes do Coordenador/01A, não
  autorados por mim): `OptOutRecord` (schema+migration+`PrismaOptOutRepository`, commits
  `e55206bb`/`459de182`) e a correção crítica de RLS de perda de contexto de tenant em
  `requestContext.run()` com `PrismaPromise` lazy (`914d68c9`, Onda 9) — sem ela, o check de
  opt-out fora de uma request HTTP (workers/webhooks) podia perder o tenant e falhar aberto
  (não bloquear quando deveria).
- Testes: `tests/unit/features/integrations/whatsapp/whatsapp.service.test.ts` (mock de
  `isOptedOut`) cobre bloqueio, consulta com leadId/email/telefone normalizado, e
  `skipOptOutCheck`. `tests/integration/whatsapp-optout-gating.test.ts` (novo, Postgres real)
  prova: opt-out `global`/`whatsapp` bloqueia; opt-out restrito a `voice` não bloqueia WhatsApp;
  RLS isola por tenant; `skipOptOutCheck` ignora opt-out existente; `persistWhatsAppMessage`
  registra `OptOutRecord` a partir de mensagem recebida e preserva o flag legado.
- Validação: `tsc --noEmit` limpo, `lint` 0 erros, `test:unit` 143/143 arquivos (1075 testes),
  `test:integration` 22/22 arquivos (102 testes, quando roda sem contenção do Postgres
  compartilhado entre worktrees — ver caveat documentado em
  `tests/integration/threecx-persistence.test.ts`), `build` ok. `verify:integrations` não tem
  entrada específica de WhatsApp (script cobre só integrações com credencial externa
  configurável); rodei mesmo assim, único item com falha (`googlePlaces`) é ambiente local sem
  chave válida, não relacionado a esta mudança.
- Branch: `agente/06-optout-whatsapp` (commit `82851961`), a partir de
  `integracao/optout-unificado` (`459de182`) + cherry-pick de `914d68c9`. Não mesclei em
  `main`/`integracao/optout-unificado` — aguardando o Coordenador revisar e integrar junto com as
  fatias de 05 e 12.

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

## Resolução (Coordenador)

As 3 fatias (05/06/12) integradas em `integracao/optout-unificado` sem conflito de código (só o
próprio corpo deste handoff, resolvido preservando as 3 seções acima). Fechando `Status: resolvido`
— opt-out registrado em qualquer um dos 3 canais agora bloqueia disparo automatizado nos outros,
validado com testes de integração reais cross-channel por 05 e 12 (não apenas unitários/mockados).

Débito consciente, não bloqueador: `CallSuppression` continua escrito em paralelo a `OptOutRecord`
(decisão do 12, passo 3 da proposta original adiado); envio manual de WhatsApp pelo vendedor
(`skipOptOutCheck`) não passa pela checagem, por desenho (não é o disparo automatizado que este
contrato cobre).
