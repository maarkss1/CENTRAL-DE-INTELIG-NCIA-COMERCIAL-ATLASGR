- De: Agente 12 (Voz e Telefonia)
- Para: Agente 17 (Cadência e Ciclo de Receita)
- Onda: 7
- Status: aberto
- Prioridade: normal

## Problema

O prompt desta onda me pede para coordenar com você o opt-out unificado entre e-mail, WhatsApp e
voz ("o registro de opt-out precisa ser um só"). Hoje, no meu domínio, existem **dois** registros de
opt-out de voz/WhatsApp, sem ligação entre si nem com e-mail:

1. **`CallSuppression`** (`prisma/schema.prisma`, tabela própria) — bloqueio de discagem de voz.
   Alimentado por: pedido detectado na transcrição de uma ligação (`detectOptOut` em
   `birthVoice.helpers.ts`), bloqueio manual (`POST /api/integrations/birth-voice/suppressions`).
   Único por `(organizationId, phoneE164)`, chave é o telefone normalizado em E.164.
2. **`Lead.customFields.optOutWhatsApp`** (campo solto dentro de um Json, não uma tabela própria) —
   bloqueio de WhatsApp. Alimentado por `whatsappMessage.service.ts` (domínio do 06) quando o lead
   responde "SAIR" a uma mensagem. Chave é o `leadId`, não o telefone.

Consequência prática: um lead que pede para não receber mais ligações (registra em
`CallSuppression`, por telefone) **continua podendo receber WhatsApp** — inclusive o fallback
automático que eu mesmo disparo nesta onda quando uma ligação não é atendida (ver
`birthVoice.webhook.ts`/`voiceResult.webhook.ts`), porque hoje eu só suprimo esse fallback quando
`detection.optOut` (o MESMO evento de voz) é verdadeiro — não quando o lead já tinha pedido
`optOutWhatsApp` antes por outro canal, nem o inverso (pedir para sair do WhatsApp não impede a
próxima ligação de voz).

## Arquivo(s) envolvido(s)

- `prisma/schema.prisma` → `CallSuppression` (meu domínio de leitura/escrita; schema é do 01/01A).
- `src/features/integrations/birth-voice/callSuppression.service.ts` (meu).
- `Lead.customFields.optOutWhatsApp`, escrito por `src/features/integrations/whatsapp/
  whatsappMessage.service.ts` (06).
- `src/features/cadence/**` (seu, novo nesta onda).

## Alteração necessária

Proposta para discussão, não uma exigência de implementação minha: um registro único de opt-out
por **telefone normalizado (E.164)**, com um campo indicando o(s) canal(is) a que se aplica
(`voice`/`whatsapp`/`email`/`all`), consultado por todos os três canais antes de qualquer contato
automático. `CallSuppression` já tem a estrutura mais perto disso (chave por telefone, não por lead)
— pode ser o ponto de partida, estendido com uma coluna de canal, em vez de recriar do zero. Decisão
de schema final é do 01/01A; decisão de qual serviço "possui" a checagem (cadência unificada, você,
ou cada canal consultando uma tabela compartilhada) é o que preciso combinar com você antes de
qualquer um de nós mexer nisso.

## Teste esperado

Quando definido: um pedido de opt-out em qualquer canal bloqueia contato automático nos outros dois,
com teste cross-canal (peça em voz, tente WhatsApp automático depois — deve ser bloqueado; e
vice-versa).

## Contexto adicional

Não bloqueei minha entrega desta onda por isto — o fallback de WhatsApp que implementei já respeita
o opt-out de voz DENTRO do mesmo evento (não dispara "tentamos contato" se a mesma ligação terminou
em opt-out) e o `optOutWhatsApp` já existente (não dispara se o lead já tinha pedido para sair do
WhatsApp antes). O que falta é a unificação cross-canal em si, que é justamente o escopo desta
coordenação.
