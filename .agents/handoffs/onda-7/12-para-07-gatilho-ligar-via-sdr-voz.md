- De: Agente 12 (Voz e Telefonia)
- Para: Agente 07 (IA e Automações)
- Onda: 7
- Status: resolvido
- Prioridade: alto (risco real de discagem fora de hora/repetida, mas exige decisão de produto —
  não é bloqueador binário como as travas de env, que continuam íntegras no caminho da campanha)

## Problema

A ação de automação "Ligar via SDR de Voz" (`src/features/automations/automation.engine.ts`,
método privado que trata `automation.action === 'Ligar via SDR de Voz'`) chama `callLead` direto:

```ts
const { callLead, SuppressedNumberError } = await import('../integrations/birth-voice/birthVoice.service.js');
try {
    await callLead(event.organizationId, event.entityId);
} catch (error) {
    if (!(error instanceof SuppressedNumberError)) throw error;
    ...
}
```

`callLead` (meu domínio) já garante, para QUALQUER chamador, que o número não está na lista de
opt-out (`CallSuppression`) — isso este gatilho respeita. Mas ele **não passa** pelas travas que
`coldCall.service.ts` aplica antes de discar:

- janela comercial (`SDR_CALL_WINDOW_START`/`END`/`SDR_CALL_TIMEZONE`, `isWithinCallWindow`);
- teto de tentativas por lead (`SDR_MAX_ATTEMPTS_PER_LEAD`) e cooldown entre tentativas
  (`SDR_RETRY_COOLDOWN_HOURS`, `evaluateLead`);
- as duas travas de habilitação da campanha (`SDR_COLD_CALL_ENABLED`/`SDR_COLD_CALL_ORGANIZATIONS`).

Ou seja: uma automação configurada com esta ação pode ligar para o mesmo lead repetidamente (toda
vez que o evento que a dispara acontecer de novo) e a qualquer hora do dia/madrugada, sem nenhum dos
limites que protegem a campanha fria automática do mesmo risco.

## Por que não corrigi eu mesmo

`automation.engine.ts` é seu domínio (`src/features/automations/**` exceto
`coldCallCampaign.api.ts`, que é meu). A correção certa depende de uma decisão de produto que não é
só técnica:

- as duas travas de habilitação (`SDR_COLD_CALL_ENABLED`/`ORGANIZATIONS`) foram desenhadas para
  "discagem fria automática em massa" — um gatilho de automação configurado deliberadamente por um
  admin para um evento específico (ex.: "quando lead responde e-mail, ligar") é um produto
  diferente, com seu próprio opt-in (a automação precisa existir e estar ativa). Aplicar as mesmas
  travas pode ser certo ou pode ser errado, dependendo de como vocês querem que isto se comporte —
  não decidi isso unilateralmente.
- janela comercial e cooldown por lead, por outro lado, parecem certos de aplicar sempre,
  independente da origem do disparo — ligar às 3h da manhã porque uma automação disparou é o mesmo
  risco de compliance/incômodo, venha de onde vier.

## Arquivo(s) envolvido(s)

- `src/features/automations/automation.engine.ts` (seu)
- Funções já exportadas e prontas para reuso (meu domínio, não precisa duplicar):
  `isWithinCallWindow`/`callWindowFromEnv` e `evaluateLead`/`dialPolicyFromEnv` em
  `src/features/integrations/birth-voice/coldCall.policy.ts` e `coldCall.service.ts`.

## Alteração necessária

Decidir e implementar uma das opções:
1. Aplicar `isWithinCallWindow`/`callWindowFromEnv` (e, se fizer sentido para automação,
   `evaluateLead`/`dialPolicyFromEnv`) antes de chamar `callLead` no motor de automação — mesma
   trava, sem duplicar a lógica.
2. Manter como está, mas documentar explicitamente (aqui ou em `AUTOMACOES.md`/onde vocês
   documentam ações) que esta ação é deliberadamente exceção às travas de horário/cooldown da
   campanha fria, com a justificativa de produto — a Constituição de Design deste repositório (seção
   5 do `CLAUDE.md`, mesmo espírito aplicado a regra de negócio) exige que toda exceção tenha
   justificativa escrita, não silêncio.

## Teste esperado

Se optarem por aplicar as travas: teste provando que a ação não dispara fora da janela comercial e
respeita cooldown por lead, no mesmo padrão de
`src/features/integrations/birth-voice/__tests__/coldCall.service.test.ts`.

## Contexto adicional — dois itens menores, mesmo handoff

**1. `voicebox.service.ts`** (meu domínio,
`src/features/intelligence/services/voicebox.service.ts`): investiguei se está em uso. É consumido
só por `POST /api/ai/tts` em `src/features/intelligence/routes/agent.routes.ts` (seu domínio) — não
encontrei NENHUM chamador no frontend (`grep` por `/tts`, `synthesizeSpeech` fora do próprio
service). `VOICEBOX_API_URL` aponta para `http://127.0.0.1:17493` por padrão, e o comentário em
`.env.example` diz que é "instância compartilhada rodando em
`C:\Users\Mah\Documents\GitHub\voicebox`" — uma máquina de desenvolvedor específica, não um serviço
de produção. Em qualquer ambiente implantado, esta chamada falha por design (ECONNREFUSED,
tratado honestamente — já tem timeout de 30s e erro claro, nada finge sucesso). Não removi nada
(decisão de remoção segue `/AGENTS.md` seção "Preservação de conteúdo", não é unilateral) — só
registro a decisão: **código morto no sentido de "sem consumidor real hoje", mas não perigoso** (não
mente, não finge sucesso). Se o roleplay de voz (VoiceRoleplay) é uma feature ainda planejada, vale
vocês decidirem se conectam o frontend a `/api/ai/tts` ou se documentam isto como recurso
descontinuado.

**2. `ColdCallStatusCard.tsx`** (`src/features/automations/components/`, seu domínio): adicionei um
novo valor possível a `ColdCallRun.haltedBy` — `'not-authorized'` (ver
`coldCallCampaign.api.ts`, meu) — quando a campanha revalida as duas travas de habilitação na
EXECUÇÃO (não só no agendamento) e a organização não está mais autorizada (ver
`coldCall.service.ts::runColdCallCampaign`). `haltedLabel()` neste componente só trata
`'outside-window'`/`'not-configured'` hoje; um `'not-authorized'` cai no `null` (sem rótulo
especial, mas não quebra nada). Um `else if (haltedBy === 'not-authorized') return 'organização não
autorizada';` fecha a UI — não editei porque o arquivo é seu.

## Resolução
Adicionada trava isWithinCallWindow(new Date(), callWindowFromEnv()) no motor de automação e label 'not-authorized' no ColdCallStatusCard.tsx. oicebox.service.ts foi mantido para fins de compatibilidade/retrocompatibilidade.
