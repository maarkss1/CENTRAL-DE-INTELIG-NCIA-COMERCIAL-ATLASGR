- De: Agente 12 (Voz e Telefonia)
- Para: Agente 06 (Integrações, WhatsApp/Baileys)
- Onda: 7
- Status: aberto
- Prioridade: normal (informativo — nenhuma ação obrigatória sua)

## Problema

Nenhum — handoff informativo, não pedido de ação. Registro aqui porque `sendWhatsAppMessage`
(`src/features/integrations/whatsapp/whatsapp.service.ts`, seu domínio) passou a ser chamado de um
segundo lugar nesta onda.

## O que mudei

`src/features/integrations/birth-voice/birthVoice.webhook.ts` (webhook principal do Birth Voices
Hub, meu domínio) agora dispara o mesmo fallback automático de WhatsApp que já existia só no webhook
legado da Bland (`voiceResult.webhook.ts`) — mensagem "tentamos contato mas não conseguimos falar"
quando a ligação não resulta em conversa real (AMD, não-atendida, ocupado, falha, número inválido,
cancelada — nunca quando há conversa de verdade). Chama `sendWhatsAppMessage` exatamente como já era
usado, sem alterar a assinatura nem nada em `whatsapp.service.ts`.

Garanti, com teste (`tests/unit/features/integrations/birth-voice/birthVoice.webhook.test.ts` e
`voiceResult.webhook.test.ts`, novos):
- nunca dispara duas vezes na reentrega do mesmo evento (o guard de idempotência do webhook cobre
  isto — a checagem de duplicidade acontece ANTES de qualquer envio);
- nunca dispara quando a ligação teve conversa real;
- respeita `Lead.customFields.optOutWhatsApp`;
- respeita o opt-out de voz detectado na mesma ligação (não manda "tentamos contato" logo depois de
  o lead pedir para não ser mais incomodado).

## Arquivo(s) envolvido(s)

- `src/features/integrations/birth-voice/birthVoice.webhook.ts` (meu)
- `src/features/integrations/whatsapp/whatsapp.service.ts` (seu — não alterado)

## Alteração necessária

Nenhuma da sua parte. Se `sendWhatsAppMessage` tiver alguma expectativa de uso (rate limit por
número, formatação, o que for) que eu não tenha respeitado por não conhecer o domínio Baileys em
profundidade, me avise por handoff que eu ajusto.

## Teste esperado

Já coberto, ver acima.

## Contexto adicional

Também abri `.agents/handoffs/onda-7/12-para-17-optout-unificado-voz.md` sobre a fragmentação entre
`CallSuppression` (voz) e `Lead.customFields.optOutWhatsApp` (WhatsApp, alimentado pelo seu
`whatsappMessage.service.ts`) — pode ser do seu interesse acompanhar, já que WhatsApp é um dos dois
lados dessa fragmentação.
