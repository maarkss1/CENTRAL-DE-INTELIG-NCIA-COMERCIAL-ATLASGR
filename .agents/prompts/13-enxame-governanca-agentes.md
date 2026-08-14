# 13 — Enxame Autônomo e Governança de Agentes de Runtime

## Papel
Você é responsável pelos **agentes de IA que o cliente usa** — não pelos agentes de desenvolvimento
que constroem a plataforma. São coisas diferentes e a confusão entre elas é fácil neste repositório.

Seu domínio: o Enxame (Supervisor + SDR + BDR + Closer + CRM + Ops + Learning), o scheduler de
autonomia 24/7, o ledger de decisões `AIPendingAction`, os guardrails de PII e a prova de que o
"piloto automático" faz o que afirma fazer.

O Agente 07 continua dono de RAG, filas e motor de automação. Você foi separado dele porque governança
de agente autônomo é um domínio de risco próprio: aqui um erro não gera tela feia, gera e-mail enviado
para um cliente real sem ninguém ter aprovado.

## Leia primeiro
1. `/AGENTS.md` — "LGPD e dados pessoais" (responsabilidade do 07 sobre IA vale para você) e a proibição de falso sucesso;
2. `/src/features/intelligence/AGENTS.md` e `/src/lib/ai/AGENTS.md`;
3. `AUTONOMIA_COMERCIAL_24X7.md` — **inteiro**: os 5 papéis, os gatilhos monitorados, os modos `supervised`/`full`, as 7 travas do envio autônomo, o "Critério honesto de Closer autônomo" e as 6 próximas integrações;
4. `.agents/completion/02-mapa-plataforma.md` → §4 e §5.1;
5. `src/features/intelligence/agents/` inteiro — `base.agent.ts`, `supervisor.agent.ts` (roteamento, `MAX_STEPS`, `enforceLeadGuard`, `fallbackDecision`), `sdr.agent.ts`, `sdr-agent.ts`, `bdr.agent.ts`, `closer.agent.ts`, `crm.agent.ts`, `ops.agent.ts`, `learning.agent.ts`, `swarm.constants.ts`;
6. `src/features/intelligence/services/guardrails.service.ts`, `aiPendingAction.service.ts`, `pending-actions.service.ts`, `autonomyRoleRunner.service.ts`, `swarmScheduler.service.ts`;
7. `src/lib/security/piiSanitizer.ts` — **existe e nenhum import o alcança**.

## Escopo
Propriedade exclusiva:
- `src/features/intelligence/agents/**`
- `src/features/intelligence/services/{guardrails,aiPendingAction,pending-actions,autonomyRoleRunner,swarmScheduler}.service.ts`
- `src/features/intelligence/services/winLossAnalysis.worker.ts`
- `src/features/intelligence/components/{SwarmDashboard,AIPendingActions}.tsx`
- `src/lib/queue/swarmScheduler.worker.ts` e `src/lib/queue/agent.worker.ts`
- `src/lib/security/piiSanitizer.ts`

**Fora do escopo:** `src/lib/ai/gateway.ts`, RAG (`src/features/knowledge/**`,
`vectorStore.ts`) e o motor de automação são do **07**. `src/features/intelligence/tools/**` é
compartilhado — mudança de contrato de ferramenta se acorda com o 07 por escrito antes de editar.
Rota e menu são do **02**. Schema é do **01/01A**.

## Antes de começar
1. confirme que está no seu worktree/branch (`agente/13-enxame-governanca`), a partir de `integracao/onda-7`;
2. leia `.agents/handoffs/onda-7/*-para-13-*.md`;
3. **rode uma missão real do enxame de ponta a ponta e registre o traço**: qual rota o supervisor
   escolheu, quais especialistas rodaram, o que foi persistido em `AILog`, `AgentMemory` e
   `AIPendingAction`. Você precisa ver o comportamento antes de julgá-lo.

## Missão da Onda 7

### 1. Painel de SLO por agente — a lacuna nomeada
`AUTONOMIA_COMERCIAL_24X7.md` termina pedindo, literalmente, um "painel de SLO por agente: cobertura,
conversão, custo, latência, erro e override humano". **Nunca foi implementado.** É o entregável
central desta onda.

As fontes já existem — não invente métrica nova antes de esgotá-las: `AILog` (consumo, custo,
latência por modelo), `AgentMemory` (memória por papel), `AIPendingAction` (agente originador, risco,
confiança, aprovação, descarte, tentativas, execução, erro), `ColdCallRun`, e as métricas Prometheus
`ai_usage_cost_usd_total` e `ai_usage_budget_usd_total` (Onda 5).

Regra que vale mais que o painel: **nenhuma métrica pode ser fabricada para preencher a interface**
(bloqueador #6 de `/AGENTS.md`). Métrica que a base ainda não sustenta aparece como estado vazio
explícito, com o motivo — não como zero, e muito menos como número plausível.

Rota e entrada de menu: handoff para o **02**.

### 2. Consentimento LGPD verificado antes de PII sair para provedor externo
`01-bloqueadores.md` registra: `piiSanitizer` é código morto, e o consentimento antes de enviar PII a
provedor de IA **não é verificado** em `conversation-intelligence` e `birth-voice`.

Hoje `guardrails.service.ts` já é consumido por 8 chokepoints (`ai.service.ts`, `crmTools.ts`,
`src/lib/ai/features.ts`, `studio/shared.ts`, `agent.routes.ts`, `sdr.agent.ts`, `sdr-agent.ts`,
`CommercialIntelligenceAiService.ts`) — confirme a lista com `grep -rln "minimizePii" src/` antes de
partir do princípio de que está completa. Mas isso é **minimização**, não consentimento: minimizar
reduz o dado que sai; consentimento decide **se ele pode sair**. São controles diferentes, e só o
primeiro existe.

Feche a lacuna: um ponto único onde se verifica base legal antes de qualquer PII atravessar para
Groq/OpenAI/Gemini/LiteLLM. Sem consentimento registrado, a operação **falha explicitamente** ou roda
sobre dado minimizado — nunca envia mesmo assim.

Decida e registre o destino de `piiSanitizer.ts`: integrar ao caminho real ou remover. As duas são
aceitáveis; deixar como código morto por mais uma onda não é.

### 3. As 7 travas do modo `full`, provadas uma a uma
O envio autônomo do primeiro e-mail exige, simultaneamente: organização autorizada, modo `full`, lead
com e-mail, score ≥ `SWARM_AUTONOMOUS_MIN_SCORE`, horário dentro da janela comercial e não fim de
semana, SMTP configurado, e ação ainda inexistente para o lead.

Escreva um teste por trava, provando que a ausência de **cada uma** impede o envio. E confirme o que
o documento promete: se o SMTP cair ou uma trava falhar, a ação **não é fingida como concluída** —
fica registrada para tratamento supervisionado.

### 4. A trava do Closer, intocada
`Negócios Ganhos` exige evento verificável — aceite, assinatura ou confirmação do CRM. **Nunca** texto
gerado por modelo. Essa trava protege forecast, comissão e a sincronização com o Kanban e o Bitrix.

Prove por teste que nenhum caminho do Closer consegue mover um deal para ganho. Se o Agente 17
introduzir fechamento determinístico por evento de aceite/pagamento, o contrato de qual evento conta
se acorda entre vocês por escrito, antes da implementação.

### 5. Idempotência e cooldown do scheduler sob retry
O scheduler deduplica por lead, prioriza, aplica cooldown e usa chave de idempotência para sobreviver
a retry/restart do BullMQ. Prove: reprocessar o mesmo job duas vezes não gera duas recomendações nem
dois contatos externos.

Com o Agente 16 movendo workers para processo próprio nesta mesma janela, alinhe o contrato de
registro do `swarmScheduler.worker` com ele.

### 6. Ferramentas de alto impacto exigem confirmação humana
`/AGENTS.md` (missão do 07) é explícito: nenhuma ferramenta de alto impacto — enviar mensagem,
disparar automação, exportar dado — pode executar só porque o modelo pediu.

Audite as 9 ferramentas registradas (`search_leads`, `get_lead_context`,
`update_lead_qualification`, `market_research`, `search_playbook`, `summarize_lead_history`,
`create_follow_up_task`, `notify_team`, `generate_cold_email_copy`), classifique cada uma como
leitura / escrita interna / ação externa, e confirme que toda ação externa passa por
`AIPendingAction` com aprovação — inclusive as do `OpsAgent`.

## Mentira mais provável do seu domínio
**Agente afirmar que executou uma ação que apenas recomendou.** `/AGENTS.md` já nomeia essa classe
para roleplay ("se o assistente apenas sugere, não dizer que executou"), e no enxame o risco é maior
porque a saída é texto livre de um modelo, que descreve com naturalidade algo que nunca aconteceu.

Segunda forma: painel de SLO com número plausível calculado sobre base vazia. Terceira: `fallbackDecision`
mascarando falha de roteamento como decisão deliberada — se o supervisor não conseguiu decidir, isso
precisa aparecer como erro, não como escolha.

## LGPD e tenancy no seu domínio
- dado pessoal só entra em prompt/contexto de IA com consentimento explícito registrado;
- o contexto enviado ao modelo **nunca** mistura tenants — nem via `AgentMemory`, nem via RAG, nem
  via histórico de sessão;
- `AILog` e `AgentMemory` são destinos de dado pessoal e herdam tenant, retenção e auditoria;
- toda decisão em `AIPendingAction` mantém rastro: agente originador, risco, confiança, chave de
  idempotência, aprovação/descarte, tentativas, execução e evidência que a acionou.

## Coordenação
- gateway, RAG, filas, motor de automação → **07**;
- rota e menu do painel de SLO → **02**;
- voz e transcrição → **12**;
- cadência multicanal, opt-out unificado, evento de fechamento → **17**;
- schema de métricas/ledger → **01/01A**;
- runtime dos workers → **16**;
- métricas Prometheus e alertas → **10**.

## Testes
Cobrir:
- roteamento do supervisor: decisão válida, decisão inválida, `enforceLeadGuard` sem Lead ID, `MAX_STEPS`;
- cada uma das 7 travas do modo `full`, isoladamente;
- SMTP indisponível → ação não é marcada como concluída;
- nenhum caminho do Closer move deal para ganho;
- reprocessamento de job não duplica recomendação nem contato;
- PII sem consentimento não atravessa para provedor externo;
- isolamento de tenant em `AgentMemory` e no contexto do modelo;
- cada ferramenta de ação externa exige aprovação;
- painel de SLO em base vazia mostra estado vazio, não zero fabricado.

## Gate
```bash
npx tsc --noEmit
npm run lint
npm run test:unit
npm run test:integration
npm run verify:ai
npm run build
```

Se algum script não existir, siga `/AGENTS.md` → "Scripts ausentes".

## Entrega
Forneça:
- traço de uma missão real do enxame, ponta a ponta;
- painel de SLO: fontes de cada métrica e o comportamento em base vazia;
- ponto único de verificação de consentimento e o destino decidido para `piiSanitizer`;
- teste por trava do modo `full`, com resultado;
- prova de que o Closer não fecha negócio;
- classificação das 9 ferramentas por impacto e onde cada ação externa é aprovada;
- handoffs abertos.
