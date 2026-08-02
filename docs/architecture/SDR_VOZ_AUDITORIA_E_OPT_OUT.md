# SDR de voz — auditoria das chamadas de IA e controle de opt-out

Data: 2026-08-02. Escopo verificado em código, não em execução — onde não houve medição, está escrito
"não medido" em vez de um número estimado.

---

## 1. Auditoria: onde o sistema chama IA hoje

Levantado por varredura em `src/` (`openai|anthropic|genai|groq|openrouter|ollama|litellm` e
`fetch(`). Latência e custo por chamada **não foram medidos** nesta passagem — o `AILog` já grava
`latencyMs` e `cost` por requisição (`src/lib/ai/gateway.ts:529`), então a medição real sai de uma
consulta a essa tabela em ambiente com tráfego, não de estimativa.

| Funcionalidade | Arquivo | Rota do modelo | Passa pelo gateway? | Observação |
| --- | --- | --- | --- | --- |
| Chat/geração genérica | `src/lib/ai/gateway.ts` | LiteLLM → Groq → OpenAI | — (é o gateway) | Timeout, retry, circuit breaker e fallback já implementados e cobertos por teste |
| Embeddings (RAG) | `src/lib/ai/gateway.ts`, `local-embeddings.ts` | Local (padrão) → LiteLLM → Google | Sim | `EMBEDDINGS_PROVIDER=local` é o padrão, sem dependência de chave |
| Agente SDR (qualificação) | `src/features/intelligence/agents/sdr.agent.ts` | `ChatOpenAI` direto → LiteLLM, fallback Groq | **Não** | Desvio consciente e documentado no arquivo: `bindTools` exige LangChain e o gateway não transporta `tool_call_id`. Uso é logado manualmente em `AILog` |
| Agente Ops (execução) | `src/features/intelligence/agents/ops.agent.ts` | idem | **Não** | Mesmo desvio, mesma justificativa |
| TTS do VoiceRoleplay | `src/features/intelligence/services/voicebox.service.ts` | Voicebox local | N/A (não é LLM) | — |
| Discagem do SDR de voz | `src/features/integrations/birth-voice/birthVoice.service.ts` | Birth Voices Hub (HTTP) | N/A (não é LLM) | A IA conversacional roda **dentro do Hub**, fora deste repositório |

**Conclusão da auditoria:** a centralização das chamadas de IA está quase completa. As duas exceções
(`sdr.agent.ts`, `ops.agent.ts`) são conscientes e logadas, mas continuam sendo exceções reais ao
critério de aceite "todas as chamadas de IA centralizadas" — fechá-las exige dar suporte a
`tool_calls` no gateway, o que **não** foi feito nesta entrega.

---

## 2. Lacuna crítica encontrada: não havia opt-out

Antes desta entrega, `callLead()` discava para **qualquer** lead com telefone, sem nenhuma consulta a
lista de bloqueio. Uma busca por `optOut|consent|doNotCall|blocklist` em `prisma/schema.prisma` e em
`src/` não retornava nada: o conceito não existia no sistema.

O pedido "não me liguem mais" só sobrevivia como texto dentro de `Activity.observations` — legível
por um humano, invisível para o discador. A automação `Ligar via SDR de Voz` ligaria de novo no dia
seguinte.

Isso violava, simultaneamente:
- o critério de aceite **"opt-out funcionar imediatamente"**;
- o item **"lista interna de bloqueio"** da fase de segurança e conformidade;
- a ressalva de LGPD/telemarketing já registrada no plano do próprio SDR de voz.

---

## 3. O que foi implementado

### Modelo `CallSuppression` (`prisma/schema.prisma`, migração `20260802160000_call_suppression_list`)

Lista de bloqueio por organização, com RLS no mesmo padrão das demais tabelas com tenant.
Chave única `(organizationId, phoneE164)` — é o que torna o registro do opt-out idempotente, já que o
Hub reentrega o webhook até receber 2xx.

O número é guardado **normalizado em E.164**. Sem isso, `(11) 99999-8888` e `011999998888` seriam
dois bloqueios diferentes para a mesma pessoa, e um deles escaparia.

`leadId` é `ON DELETE SET NULL`, não `CASCADE`: apagar o lead não pode reabilitar a discagem para
quem pediu para não ser incomodado.

### Enforcement (`birthVoice.service.ts`)

`callLead()` consulta a lista **antes** de chamar o Hub e lança `SuppressedNumberError`. A checagem
está no serviço, e não na tela, porque este é o último ponto por onde toda ligação passa: rota
manual, automação e o futuro worker de prospecção fria. Um bloqueio validado só na UI seria
contornado pela primeira campanha automática.

### Detecção (`birthVoice.helpers.ts` → `detectOptOut`)

Duas fontes, nesta ordem de precedência:

1. **`data.optOut` do Hub** — sinal explícito. Hoje o Birth Voices Hub **não envia este campo**: seu
   vocabulário de `outcome` é puramente telefônico (`Concluído`, `Ocupado`, `Não atendida`, `Falha`,
   `Cancelada`, ver `telephonyService.ts:156` no repo do Hub). O campo já é lido para que, quando o
   Hub passar a enviá-lo, tenha precedência sem mexer neste lado.
2. **Transcrição** — comparação por frase sobre o texto normalizado (sem acento, sem pontuação,
   minúsculo), porque o STT nem sempre devolve acentuação.

Só os turnos do **lead** são examinados. A IA pronuncia as mesmas frases ao confirmar o pedido
("entendi, não ligamos mais"), e considerar o turno dela faria toda ligação em que o assunto aparece
virar um bloqueio.

A lista de frases é deliberadamente ampla: **errar bloqueando** custa uma oportunidade comercial;
**errar deixando passar** custa ligar de novo para quem pediu explicitamente para não ser incomodado.
Na dúvida, bloqueia.

### Gravação (`birthVoice.webhook.ts`)

O opt-out é gravado **antes** da checagem de duplicidade da atividade e antes de qualquer outra
escrita: é o efeito mais importante do webhook e o único que não pode se perder se uma escrita
posterior falhar. O bloqueio usa o número **efetivamente discado** (`data.to`), não o cadastro — o
lead pode ter vários telefones, e quem pediu para não ser incomodado foi quem atendeu naquele.

O pedido também aparece na descrição do `TimelineEvent`, que é o que o SDR humano lê: é o que explica
por que o lead parou de ser discado.

### Automação (`automation.engine.ts`)

`SuppressedNumberError` é capturada e registrada como `logger.info`, não como falha. Um número com
opt-out é a regra funcionando; contá-lo como erro faria a automação parecer quebrada toda vez que
respeitasse a lei. Qualquer outro erro continua subindo.

### API (`birthVoice.routes.ts`)

- `POST /api/integrations/birth-voice/call/:leadId` → **409** quando o número está bloqueado
  (distinto do 422 de "lead sem telefone": o pedido está bem formado, o que impede é o estado).
- `GET /api/integrations/birth-voice/suppressions` → auditoria da lista.
- `POST /api/integrations/birth-voice/suppressions` → bloqueio manual, para pedidos que chegam por
  outro canal (e-mail, WhatsApp, atendimento humano). Recusa com 422 um telefone que não normaliza,
  em vez de gravar um bloqueio que nunca casaria com nada.

---

## 4. Testes

18 testes novos, todos verdes (`npm run test:unit`: 51 arquivos, 285 testes).

- `birthVoice.helpers.test.ts` — `detectOptOut`: ligação comum, pedido do lead com evidência, texto
  sem acento/pontuação, **turno da IA ignorado**, precedência do sinal do Hub, ligação sem transcrição.
- `callSuppression.service.test.ts` — normalização (formatos diferentes → mesma chave), consulta pela
  chave normalizada, idempotência da reentrega, recusa de telefone não discável.
- `birthVoice.service.test.ts` — disca sem bloqueio, **recusa sem chamar o Hub** quando há opt-out,
  recusa antes de consultar a lista quando não há número discável.
- `automation-sdr-voz.test.ts` — bloqueio tratado como execução normal, sem `logger.error`.

Verificações executadas: `npx tsc --noEmit` (limpo), `npm run lint` (limpo), `npm run test:unit`
(285/285), `npm run build` (ok).

---

## 5. Pendências reais (não implementadas)

Nenhum dos itens abaixo foi entregue; estão listados para não serem confundidos com o que foi feito.

- **Migração não aplicada em banco.** `20260802160000_call_suppression_list` foi escrita e o client
  Prisma regenerado, mas `prisma migrate deploy` não foi executado aqui.
- **Remoção de bloqueio não existe.** Não há `DELETE` na API: desfazer um opt-out deveria ser um ato
  deliberado e auditado, e uma rota de exclusão simples seria pior do que não ter nenhuma.
- **Sem tela.** A lista de bloqueio só é acessível por API; não há UI em Automações nem em Integrações.
- **Sem janela de horário permitido, feriado ou fuso.** O scheduler de campanha descrito na Fase 3 não
  existe — a discagem hoje é reativa (automação) ou manual, sem restrição de horário.
- **Sem base legal / consentimento registrado.** `CallSuppression` cobre só o opt-out; não há registro
  de finalidade nem de base legal por lead.
- **Sem extração estruturada pós-ligação.** A transcrição continua indo para `Activity.observations`
  como texto: não há campos com confiança e proveniência, nem lead scoring alimentado pela ligação.
- **Gateway ainda não transporta `tool_calls`**, então `sdr.agent.ts` e `ops.agent.ts` seguem fora dele.
- **Risco de licença 3CX para trunk SIP** continua em aberto e precede qualquer código novo de SIP.
