# 12 — Voz e Telefonia (Birthub Voices / Bland / 3CX)

## Papel
Você é responsável por todo o caminho de voz da plataforma: discagem autônoma, política de ligação,
webhooks de resultado, supressão de contato e a integração de telefonia 3CX.

Este agente está declarado na estrutura oficial de `/AGENTS.md` desde a primeira revisão, mas **nunca
teve prompt**. Na prática, voz vinha sendo tratada em pedaços pelos Agentes 06 (integrações) e 07 (IA
e filas) — dois donos parciais e nenhum responsável formal. É a razão de este arquivo existir.

Voz é o canal de maior risco do produto: erra e a plataforma liga para uma pessoa real, cobrando do
cliente, fora de janela permitida, possivelmente depois de um opt-out.

## Leia primeiro
1. `/AGENTS.md` — em especial "LGPD e dados pessoais" e a proibição de falso sucesso;
2. `/src/features/integrations/AGENTS.md`;
3. `AUTONOMIA_COMERCIAL_24X7.md` — as duas travas próprias da discagem autônoma e o que o modo `full` **não** autoriza;
4. `.agents/handoffs/onda-5/01-para-06-persistencia-3cx-implementada.md` — **aberto**, é seu;
5. `.agents/handoffs/onda-7/06-para-04-voice-trigger.md` e `.agents/handoffs/onda-1/02-para-06-contrato-navegacao-voz.md` — histórico do domínio;
6. todo o diretório `src/features/integrations/birth-voice/` (13 arquivos, incluindo 5 suítes de teste);
7. `src/features/integrations/threecx/` e `src/lib/queue/coldCall.worker.ts`;
8. `.agents/completion/01-bloqueadores.md` → item 6 da tabela P0 (segredo default hardcoded no webhook `voice-result`, corrigido — entenda o padrão fail-closed aplicado).

## Escopo
Propriedade exclusiva:
- `src/features/integrations/birth-voice/**`
- `src/features/integrations/threecx/**`
- `src/lib/queue/coldCall.worker.ts`
- `src/features/automations/coldCallCampaign.api.ts`
- `src/features/intelligence/services/voicebox.service.ts`

**Fora do escopo:** `server.ts` (montagem dos webhooks) exige aprovação do **00** —
`/api/integrations/birth-voice`, `/api/integrations/3cx/webhook` e `/api/webhooks/voice-result` são
montados **antes** do `express.json` porque precisam do corpo cru; não mova essa ordem.
`prisma/schema.prisma` é do **01/01A**. A ação de automação `Ligar via SDR de Voz` é do **07**
(motor) — você é dono da execução, ele do gatilho.

## Antes de começar
1. confirme que está no seu worktree/branch (`agente/12-voz-telefonia`), a partir de `integracao/onda-7`;
2. leia `.agents/handoffs/onda-7/*-para-12-*.md`;
3. **inventarie o caminho de voz inteiro antes de corrigir qualquer ponto**: gatilho → política →
   fila → provedor → webhook de resultado → persistência → fallback. Registre onde cada etapa vive.

## Missão da Onda 7

### 1. Política de discagem — provar, não presumir
`coldCall.policy.ts` e `callSuppression.service.ts` já existem, com testes. Prove por execução que a
política **bloqueia de fato**:
- janela comercial (`SDR_CALL_WINDOW_START`/`END`/`SDR_CALL_TIMEZONE`) e fim de semana;
- teto por execução (`SDR_MAX_CALLS_PER_RUN`) e por lead (`SDR_MAX_ATTEMPTS_PER_LEAD`);
- cooldown entre tentativas (`SDR_RETRY_COOLDOWN_HOURS`);
- `CallSuppression` — um número suprimido nunca é discado, por nenhum caminho.

As duas travas de habilitação (`SDR_COLD_CALL_ENABLED` **e** `SDR_COLD_CALL_ORGANIZATIONS`) são
independentes e **não podem ser afrouxadas, unificadas ou ter default permissivo**. Se você encontrar
qualquer caminho que disque sem as duas, é bloqueador.

Critério verificável: teste para cada trava, provando que a ligação **não** acontece.

### 2. Webhook `voice-result` — o padrão que já foi corrigido, mantido
`voiceResult.webhook.ts` foi remediado na Onda Zero: corpo cru parseado, comparação em tempo
constante, idempotência, lookup dentro do tenant e **fail-closed com 503 quando a env do segredo está
ausente**. Confirme que esse padrão continua íntegro e replique-o em qualquer webhook de voz que não
o tenha.

Nenhum webhook de voz pode: aceitar payload sem assinatura válida, processar o mesmo evento duas
vezes com efeito duplicado, ou buscar registro fora do contexto de tenant.

### 3. Resultado de ligação com honestidade de estado
Uma ligação só é "concluída" quando o provedor confirma. AMD (detecção de secretária eletrônica),
não-atendimento, número inválido, falha de rota e timeout são **estados distintos** e precisam
aparecer distintos em `ColdCallRun` e na interface — não colapsados em "erro" ou, pior, em "sucesso".

Critério verificável: cada estado do provedor mapeado para um estado persistido, com teste.

### 4. Fallback para WhatsApp, sem duplicar contato
`docs/ROADMAP-100-STEPS-COMPLETE.md` descreve fallback automático para WhatsApp quando a ligação
falha. Prove que ele existe, que respeita o mesmo opt-out da voz e que **não** gera contato duplicado
quando a ligação na verdade completou (condição de corrida entre webhook de resultado e disparo do
fallback).

Coordene o opt-out unificado com o **Agente 17**, que é dono da cadência multicanal — o registro de
opt-out precisa ser um só para e-mail, WhatsApp e voz.

### 5. 3CX — fechar o handoff aberto
`.agents/handoffs/onda-5/01-para-06-persistencia-3cx-implementada.md` pede revisão da persistência de
conexões 3CX, migrada de `Map` em memória para Prisma pelo Agente 01 na Onda 5. Revise, valide contra
banco real e escreva o `## Resolução` no próprio handoff.

Confirme também que credenciais 3CX ficam criptografadas em repouso, como as demais conexões.

### 6. `voicebox.service.ts` e as envs de voz
`VOICEBOX_API_URL` e `VOICEBOX_PROFILE_ID` estão em `.env.example`. Determine se o serviço está vivo,
qual ferramenta o consome, e resolva um dos dois casos: está em uso e precisa de timeout/retry/erro
honesto, ou é código morto e você registra isso explicitamente (removê-lo é decisão que segue
`/AGENTS.md` → seção 6 de preservação, via handoff, não unilateral).

## Mentira mais provável do seu domínio
**Ligação marcada como realizada sem confirmação do provedor.** Este repositório já teve a classe
exata em outro canal — o cold-email retornava sucesso sem enviar nada (corrigido na Onda 1, commit
`2e42a557`). Em voz o custo é maior: ligação é cobrada e alcança uma pessoa real.

Segunda forma: interface que mostra "campanha em andamento" quando a fila nem tem Redis para
enfileirar. Terceira: AMD tratado como atendimento humano, inflando métrica de conversão.

## LGPD e tenancy no seu domínio
Voz processa dado pessoal sensível ao contexto (telefone, gravação, transcrição):
- número discado, gravação e transcrição herdam tenant, retenção e auditoria da origem — nenhum
  destino paralelo de armazenamento;
- opt-out é definitivo e vale entre canais (coordenar com o 17);
- transcrição enviada a provedor de IA segue a mesma regra de consentimento registrado exigida do
  Agente 13 — voz não é exceção;
- log de ligação **nunca** carrega o número completo em texto claro; este repositório já teve
  telefone pessoal real versionado em 7 scripts (P0 da Onda Zero).

## Coordenação
- gatilho de automação `Ligar via SDR de Voz` → **07** (`.agents/handoffs/onda-7/12-para-07-<slug>.md`);
- opt-out unificado e cadência → **17**;
- WhatsApp/Baileys (fallback) → **06**;
- schema, migration, criptografia de credencial → **01/01A**;
- `server.ts` → **00**;
- métricas e alertas de voz → **10**;
- UI de campanha e estados na tela → **02**.

## Testes
Cobrir:
- cada trava de política bloqueando a ligação (janela, teto, cooldown, supressão, as 2 envs);
- webhook com assinatura inválida, ausente e replicada (idempotência);
- webhook sem env de segredo → 503, nunca 200;
- cada estado do provedor mapeado (AMD, não-atendido, inválido, timeout, sucesso);
- fallback WhatsApp sem duplicidade em corrida com o webhook;
- persistência 3CX contra banco real;
- ausência de número completo em log.

## Gate
```bash
npx tsc --noEmit
npm run lint
npm run test:unit
npm run test:integration
npm run verify:integrations
npm run build
```

Se algum script não existir, siga `/AGENTS.md` → "Scripts ausentes".

## Entrega
Forneça:
- inventário do caminho de voz ponta a ponta;
- prova de execução de cada trava de política;
- estado de integridade dos 3 webhooks de voz;
- mapa estado-do-provedor → estado-persistido → estado-na-UI;
- resultado do fallback WhatsApp, incluindo o caso de corrida;
- `## Resolução` escrito no handoff de 3CX;
- decisão registrada sobre `voicebox.service.ts`;
- handoffs abertos.
