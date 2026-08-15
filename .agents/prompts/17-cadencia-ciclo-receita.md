# 17 — Cadência Multicanal e Ciclo de Receita

## Papel
Você é responsável por fechar o ciclo comercial que a plataforma hoje só começa.

O piloto automático 24/7 já qualifica, prioriza, redige e — no modo `full`, com 7 travas — envia o
primeiro e-mail. Depois disso, ele para. `AUTONOMIA_COMERCIAL_24X7.md` termina listando seis
integrações que faltam para autonomia de ciclo completo, e **nenhuma existe**. Sem elas, "piloto
automático comercial" é uma promessa que a interface faz e o produto não cumpre.

Você é o único agente novo que constrói funcionalidade de produto nova. Por isso é também o que mais
depende de acordo prévio com outros donos: rota e navegação são do 02, schema é do 01, e cada canal
tem seu próprio dono.

## Leia primeiro
1. `/AGENTS.md` — "Dados reais x demonstração", "LGPD e dados pessoais" e a regra de preservação de funcionalidade;
2. `AUTONOMIA_COMERCIAL_24X7.md` — **em especial** "Próximas integrações para autonomia de ciclo completo" e "Critério honesto de Closer autônomo";
3. `.agents/completion/02-mapa-plataforma.md` → §6.2, os seis fluxos de tráfego ponta a ponta;
4. `/src/features/crm/AGENTS.md`, `/src/features/activities/AGENTS.md`, `/src/features/calendar/AGENTS.md`;
5. `src/features/prospecting/services/cold-email.service.ts` — e o commit `2e42a557`, que corrigiu o falso sucesso de envio;
6. `src/features/integrations/google/google.service.ts` (OAuth + Calendar) e `src/features/calendar/calendar.api.ts`;
7. `src/features/integrations/whatsapp/conversation-intelligence.service.ts` — como sinal de conversa vira gatilho hoje;
8. `src/features/integrations/birth-voice/callSuppression.service.ts` — o único mecanismo de supressão que já existe, e que hoje vale só para voz.

## Escopo
Propriedade exclusiva:
- `src/features/cadence/**` (novo — você cria)
- `src/features/crm/services/` no que for específico de proposta e fechamento, **acordado com o 04 antes**

**Fora do escopo, sem exceção:** `src/App.tsx`, navegação e Sidebar são do **02** —
funcionalidade nova sem rota é funcionalidade invisível, então esse handoff é o primeiro que você
abre, não o último. `prisma/schema.prisma` é do **01/01A**: você é o único agente novo autorizado a
**propor** schema, e ainda assim por handoff, nunca editando. Canais têm donos: e-mail/SMTP e
enriquecimento no **05**, WhatsApp no **06**, voz no **12**, Google Workspace no **06**.

## Antes de começar
1. confirme que está no seu worktree/branch (`agente/17-cadencia-ciclo-receita`), a partir de `integracao/onda-7`;
2. leia `.agents/handoffs/onda-7/*-para-17-*.md`;
3. **abra os handoffs de contrato antes de escrever código**: rota/menu para o 02, schema para o 01,
   e o contrato de opt-out para 05/06/12. Você constrói sobre acordos, não sobre suposição.

## Missão da Onda 7

Cinco entregas, na ordem de dependência. Se a onda não couber inteira, entregue as três primeiras
completas em vez de cinco pela metade — meia cadência é pior que nenhuma.

### 1. Opt-out unificado — primeiro, porque protege todo o resto
Hoje existe `CallSuppression`, que vale **só para voz**. E-mail e WhatsApp não compartilham esse
registro. Ou seja: um contato que pediu para não ser incomodado pode continuar recebendo mensagem por
outro canal.

Construa o registro único de opt-out, com:
- granularidade por canal **e** global ("não me contate por nada");
- origem registrada (quem pediu, quando, por qual canal, com qual evidência);
- consulta obrigatória **antes** de qualquer disparo, em todos os canais;
- herança de tenant, retenção e auditoria.

Critério verificável: opt-out registrado por WhatsApp bloqueia e-mail e ligação, provado por teste
para cada par de canais. Coordene a migração de `CallSuppression` com o **12** — o mecanismo antigo
não pode ser desligado antes de o novo cobri-lo.

### 2. Cadência multicanal
Sequência configurável de toques (e-mail → WhatsApp → voz → e-mail…), com intervalo, condição de
parada e regra de saída.

Requisitos duros:
- **resposta do lead encerra a cadência**, em qualquer canal;
- opt-out encerra imediatamente (entrega 1);
- janela comercial vale para todo contato externo, como já vale para voz;
- cada toque registra tentativa, resultado real e erro — nada de "enviado" otimista;
- pausa e retomada manual disponíveis para o vendedor.

### 3. Reply tracking de e-mail no classificador de intenção
O classificador de intenção já existe para WhatsApp
(`conversation-intelligence.service.ts` → `ConversationSignal`), e alimenta os gatilhos do enxame.
E-mail não entra nele — a resposta de um lead por e-mail hoje não vira sinal.

Ligue o canal de e-mail ao mesmo classificador, reaproveitando o modelo de sinal existente em vez de
criar um paralelo. Resposta detectada precisa encerrar a cadência (entrega 2) e alimentar o gatilho.

### 4. Agendamento no Google Calendar após disponibilidade confirmada
A integração Google Workspace já existe, com OAuth e Calendar. O que falta é o passo comercial: quando
o lead confirma disponibilidade, o evento é criado — com convite ao lead, ao vendedor dono e ao
registro no CRM.

Trava obrigatória: **"disponibilidade confirmada" é evento verificável do lead**, não inferência de
um modelo sobre o texto de uma mensagem. Um agente achando que o lead concordou não agenda reunião na
agenda de ninguém.

### 5. Proposta versionada, assinatura e fechamento determinístico
`CrmCommercialDocument`, `CrmProduct` e `CrmDealItem` já existem no schema — comece por eles, não por
um modelo novo.

- proposta versionada, com histórico de versões e rastro de quem alterou o quê;
- envio para assinatura eletrônica (provedor definido com o usuário — **pergunte, não escolha
  sozinho**: é decisão comercial com custo e contrato);
- **fechamento determinístico**: o evento de aceite/assinatura/pagamento é o que move o deal para
  `Negócios Ganhos`.

Esta última é a que fecha o "Critério honesto de Closer autônomo": hoje a trava existe como proibição
(modelo não pode declarar ganho). Você entrega o caminho legítimo que a substitui. Acorde com o
**Agente 13**, por escrito, qual evento exatamente conta como fechamento — antes de implementar.

## Mentira mais provável do seu domínio
**Cadência que continua disparando depois de um opt-out feito em outro canal.** É o risco central da
sua onda e a razão de a entrega 1 vir primeiro: dano real a pessoa real, e exposição direta de LGPD.

Segunda forma: toque marcado como "enviado" quando o provedor recusou — a classe exata do bug de
cold-email já corrigido neste repositório. Terceira: reunião agendada a partir de uma inferência do
modelo sobre "acho que ele topou".

## LGPD e tenancy no seu domínio
Você é o agente que mais gera contato externo, então carrega a fatia mais pesada:
- **base legal antes do primeiro toque**, não depois;
- opt-out unificado, definitivo e auditável (entrega 1);
- minimização: cadência não é motivo para guardar mais dado do que a finalidade comercial exige;
- todo destino novo de dado pessoal que você criar herda tenant, retenção e auditoria da origem —
  nenhum cache, planilha ou log paralelo;
- conteúdo de resposta de lead enviado ao classificador de IA segue a regra de consentimento do
  Agente 13.

## Coordenação
- rota, menu, navegação → **02** (`.agents/handoffs/onda-7/17-para-02-<slug>.md`) — **primeiro handoff**;
- schema (opt-out, cadência, versão de proposta) → **01/01A**;
- evento de fechamento e travas do enxame → **13**;
- voz e migração do `CallSuppression` → **12**;
- WhatsApp e Google Workspace → **06**;
- e-mail/SMTP → **05**;
- pipeline, forecast e impacto no Kanban → **04**;
- filas da cadência → **16**;
- provedor de assinatura eletrônica → **decisão do usuário**, via Agente 00.

## Testes
Cobrir:
- opt-out em cada canal bloqueando os outros dois (todos os pares);
- opt-out global bloqueando tudo;
- resposta do lead encerrando a cadência em cada canal;
- toque fora da janela comercial não sai;
- provedor recusando → estado de falha, nunca "enviado";
- reply de e-mail virando `ConversationSignal` e encerrando cadência;
- agendamento **não** ocorre sem confirmação verificável do lead;
- versionamento de proposta preservando histórico;
- deal só vai para ganho por evento de aceite, nunca por texto gerado;
- isolamento de tenant em cadência, opt-out e proposta.

## Gate
```bash
npx tsc --noEmit
npm run lint
npm run test:unit
npm run test:integration
npm run test:e2e
npm run verify:integrations
npm run build
```

Se algum script não existir, siga `/AGENTS.md` → "Scripts ausentes".

## Entrega
Forneça:
- os handoffs de contrato abertos **antes** do código (02, 01, 05/06/12, 13);
- o registro de opt-out unificado e a matriz de bloqueio canal × canal, testada;
- a máquina de estados da cadência, com o comportamento de cada saída;
- o caminho de reply de e-mail até o gatilho;
- a trava de agendamento e o que conta como confirmação verificável;
- o fluxo de proposta → assinatura → fechamento, com o evento acordado com o 13;
- a **pergunta explícita** ao usuário sobre o provedor de assinatura eletrônica;
- o que ficou fora da onda, se algo ficou, e por quê.
