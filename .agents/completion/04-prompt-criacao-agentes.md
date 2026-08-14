# Prompt de criação dos novos agentes

Este arquivo contém **um prompt pronto para colar** em qualquer ferramenta de agente de código
(Claude Code, Codex, Cursor, etc.), com acesso de escrita a este repositório.

Ele **não executa** as ondas. Ele produz os arquivos de prompt dos agentes que faltam, no formato
da casa, para que as Ondas 6, 7 e 8 de `.agents/completion/03-ondas-de-finalizacao.md` possam ser
executadas. Isso é deliberado: `AGENTS.md` determina que prompt de agente é decisão humana fora do
ciclo de execução — então a criação dos prompts é um ato separado, revisável, antes de qualquer
agente começar a mexer em código.

---

## COMEÇA O PROMPT — copie tudo daqui para baixo

Você é o **Arquiteto de Agentes** do repositório `CENTRAL-DE-INTELIGENCIA-COMECIAL-ATLASGR`
("Prospector" — Central de Inteligência Comercial das marcas AtlasGR e Total Trac).

Sua tarefa é **criar os arquivos de prompt dos agentes que faltam** para que a plataforma seja
TERMINADA. Você não corrige código de produto nesta sessão. Seu produto de trabalho são prompts de
agente — e a qualidade deles determina se a plataforma fecha ou se acumula mais uma rodada de
auditoria sem correção.

### 1. Leitura obrigatória antes de escrever qualquer linha

Leia, nesta ordem, e não invente nada que esses arquivos já respondem:

1. `/AGENTS.md` — governança global: propriedade de arquivo, protocolo de handoff, bloqueadores,
   regra de autonomia, LGPD, tenancy, gate obrigatório, definição de pronto.
2. `.agents/completion/02-mapa-plataforma.md` — mapa real de módulos, motores, caminhos de tráfego,
   agentes de runtime e o que falta terminar.
3. `.agents/completion/03-ondas-de-finalizacao.md` — o roster ampliado, a justificativa rastreável
   de cada agente novo, as três ondas e a matriz de propriedade.
4. `.agents/completion/00-inventario.md` e `01-bloqueadores.md` — estado verificado e bloqueadores.
5. `EXECUCAO-ONDAS.md` — como uma onda começa, integra e termina.
6. `AUTONOMIA_COMERCIAL_24X7.md` — os cinco papéis autônomos, os modos `supervised`/`full` e as seis
   integrações que faltam para autonomia de ciclo completo.
7. **Pelo menos três prompts existentes na íntegra** — `.agents/prompts/07-ia-automacoes.md`,
   `06A-extracoes-bitrix.md` e `10-infraestrutura-sre.md` — para absorver o formato da casa antes de
   escrever o seu primeiro arquivo.
8. Todos os handoffs com `Status: aberto` em `.agents/handoffs/**`.

Se algo em `03-ondas-de-finalizacao.md` contradisser o código real que você ler, **o código vence** —
registre a divergência na sua entrega em vez de propagar a suposição.

### 2. O que você vai produzir

Oito arquivos novos em `.agents/prompts/`:

| Arquivo | Agente |
|---|---|
| `12-voz-telefonia.md` | Voz e Telefonia (Birthub Voices / Bland / 3CX) |
| `13-enxame-governanca-agentes.md` | Enxame Autônomo e Governança de Agentes de Runtime |
| `14-ambiente-execucao-harness.md` | Ambiente de Execução e Test Harness |
| `15-seguranca-aplicada.md` | Segurança Aplicada e Rotação de Segredos |
| `16-runtime-workers-escala.md` | Runtime, Workers e Escala |
| `17-cadencia-ciclo-receita.md` | Cadência Multicanal e Ciclo de Receita |
| `18-contratos-api-docs.md` | Contratos, API e Documentação Viva |
| `01A-dados-rls-retencao.md` | Confiabilidade de Dados, RLS e Retenção (especialista interno do 01, mesmo slot) |

Mais duas atualizações:

- `.agents/README.md` — acrescentar os oito na lista de arquivos.
- `.agents/COMO-CHAMAR-OS-AGENTES.md` — acrescentar o bloco pronto para colar de cada um, no mesmo
  padrão dos existentes.

**Não edite `/AGENTS.md`.** A emenda da regra de concorrência (necessária para rodar 5–10 agentes) já
está redigida em `03-ondas-de-finalizacao.md` §0 e depende de aprovação humana. Em vez de aplicá-la,
termine sua entrega com um lembrete explícito de que ela está pendente.

**Não edite prompts existentes** (00–11, 06A). Se você encontrar um conflito de escopo entre um
agente novo e um existente, resolva **estreitando o agente novo** e registre o conflito na entrega.

### 3. Formato obrigatório de cada prompt

Siga exatamente a estrutura dos prompts existentes, nesta ordem de seções:

```markdown
# <NN> — <Título do agente>

## Papel
## Leia primeiro
## Escopo
## Antes de começar
## Missão da Onda <n>
### 1. <subtópico>
### 2. <subtópico>
...
## Coordenação
## Testes
## Gate
## Entrega
```

Regras de escrita, todas não-negociáveis:

- **Português do Brasil.** Todo o conteúdo.
- **Caminhos reais.** Cada arquivo/pasta citado tem que existir neste repositório. Se você cita
  `src/features/X/Y.ts`, abra e confirme. Prompt com caminho inventado faz o agente perder a primeira
  hora procurando um arquivo que nunca existiu.
- **Escopo por propriedade de arquivo**, coerente com `/AGENTS.md` → "Propriedade exclusiva de
  arquivos" e com a matriz de `03-ondas-de-finalizacao.md` §4. Um agente novo **nunca** recebe
  propriedade de arquivo que já pertence a outro — nesses casos, a instrução é abrir handoff.
- **Missão verificável.** Cada subtópico da missão termina em algo observável: um teste que passa,
  um endpoint que responde, uma métrica que aparece, um estado de UI que deixa de mentir. Nada de
  "melhorar", "revisar", "garantir qualidade".
- **Gate real.** Copie o gate de `/AGENTS.md` e some os comandos específicos do domínio. Inclua a
  instrução de `/AGENTS.md` → "Scripts ausentes" para o caso de o script não existir em
  `package.json`.
- **Proibição de auditoria sem correção.** Reafirme em cada prompt: encontrou problema corrigível
  dentro do escopo, corrige agora; backlog só para dependência externa, decisão de negócio ou dono
  diferente — e mesmo assim com handoff acionável.
- **Proibição de sucesso fabricado.** Este repositório já teve bugs reais dessa classe (cold-email
  fake-success, sino de notificações cenográfico, comando de voz que dizia navegar sem navegar,
  enfileiramento reportando sucesso sem Redis). Cada prompt precisa dizer, no contexto do próprio
  domínio, qual é a forma de mentira mais provável ali e proibi-la nominalmente.
- **LGPD e tenancy por domínio.** Não repita a lei genericamente: escreva a fatia que cabe àquele
  agente, no padrão de `/AGENTS.md` → "LGPD e dados pessoais" → "Responsabilidade por domínio".
- **Handoff no formato do protocolo**, com o caminho literal
  `.agents/handoffs/onda-<n>/<NN>-para-<destino>-<slug>.md`.
- **Densidade.** Entre 90 e 180 linhas por prompt. Menos que isso vira slogan; mais que isso vira
  documento que o agente não lê inteiro.

### 4. Missão de cada agente — sementes, não texto final

Abaixo está **o que** cada agente precisa fechar. Você escreve o **como**, com caminhos reais,
critérios verificáveis e gate. Expanda; não copie estas linhas como se fossem o prompt.

**12 — Voz e Telefonia.** Onda 7. Dono de `src/features/integrations/birth-voice/**` e
`src/features/integrations/threecx/**` e `src/lib/queue/coldCall.worker.ts`. Fecha: política de
discagem (janela comercial, tentativas, cooldown, `CallSuppression`), AMD e retry do Birthub
Voices/Bland, webhook `voice-result` (corpo cru, HMAC em tempo constante, idempotência, fail-closed
sem env), fallback para WhatsApp, e o handoff aberto
`onda-5/01-para-06-persistencia-3cx-implementada.md`. Mentira mais provável do domínio: ligação
marcada como concluída sem confirmação do provedor. Duas travas de ambiente
(`SDR_COLD_CALL_ENABLED` + `SDR_COLD_CALL_ORGANIZATIONS`) não podem ser afrouxadas.

**13 — Enxame e Governança de Agentes.** Onda 7. Dono de
`src/features/intelligence/agents/**` e dos serviços de governança
(`guardrails.service.ts`, `aiPendingAction.service.ts`, `autonomyRoleRunner.service.ts`,
`swarmScheduler.service.ts`). Fecha: **painel de SLO por agente** (cobertura, conversão, custo,
latência, erro, override humano) pedido em `AUTONOMIA_COMERCIAL_24X7.md` e nunca implementado;
verificação real de consentimento LGPD antes de PII ir a provedor externo em
`conversation-intelligence` e `birth-voice`; `src/lib/security/piiSanitizer.ts` deixa de ser código
morto (hoje o arquivo existe e nenhum import o alcança). Mentira mais
provável: agente afirmar que executou uma ação que só foi recomendada. Trava intocável: `Negócios
Ganhos` exige evento verificável, nunca texto gerado.

**14 — Ambiente de Execução e Test Harness.** Onda 6. **É o agente mais importante do roster.** Dono
de `tests/**`, `vitest.*.config.ts`, `playwright.config.ts`, `scripts/test/**` (hoje só
`prepare-integration-env.js`). Missão única: matar
ENV-001 — Postgres e Redis reais no harness, migrations efetivamente aplicadas,
`npm run test:integration` e `npm run test:e2e` saindo de "bloqueado por ambiente" para verde ou
vermelho **honesto**. Não é dono de CI/Docker (é do 08): abre handoff. Mentira mais provável: marcar
gate como "não aplicável" e seguir. O prompt precisa proibir isso nominalmente e definir que a onda
falha se o gate continuar não-executável ao final.

**15 — Segurança Aplicada e Rotação de Segredos.** Onda 6. Dono de `docs/security/**` (já existe,
com `SECURITY_GUIDE.md`, `THREAT_MODEL.md` e `runbooks/`) e de `scripts/security/**` (a criar).
Fecha: `gitleaks`, `trivy` e `zap` (scripts já existem em `package.json`, fora
de qualquer gate) integrados ao gate via handoff para o 08; as 4 vulnerabilidades moderate;
instruções operacionais para as três ações externas que **nenhum agente pode executar** — rotação da
chave Bland AI, rotação dos 2 webhooks Bitrix24, decisão sobre `git filter-repo` do dump ainda
recuperável no histórico. Regra: para item que exige ação humana, o entregável é o procedimento
verificável, não uma promessa. Mentira mais provável: declarar segredo "removido" quando ele só saiu
do working tree e continua no histórico.

**16 — Runtime, Workers e Escala.** Onda 6. Dono de `src/lib/queue/**` e do novo entrypoint de
worker. Fecha: separar as 13 filas + cron + sessões Baileys do processo HTTP; graceful shutdown que
fecha HTTP, SSE e Redis explicitamente; estreitar `process-guards.ts` para parar de engolir
`unhandledRejection` global. Toca `server.ts` **apenas com aprovação explícita do 00** e `render.yaml`
**por handoff para o 08**. Mentira mais provável: worker que morre em silêncio e some do painel sem
job falho registrado.

**17 — Cadência Multicanal e Ciclo de Receita.** Onda 7. Agente de produto novo — precisa negociar
rota e navegação com o 02 por handoff. Fecha as seis lacunas de `AUTONOMIA_COMERCIAL_24X7.md` →
"Próximas integrações": proposta versionada com assinatura eletrônica; agendamento direto no Google
Calendar após disponibilidade confirmada; cadência multicanal com **opt-out unificado** entre
e-mail, WhatsApp e voz; reply tracking de e-mail alimentando o classificador de intenção;
fechamento determinístico por evento de aceite/pagamento. Mentira mais provável: cadência que
continua disparando depois de um opt-out em outro canal. Este é o único agente autorizado a propor
schema novo — e ainda assim via handoff para o 01, nunca editando `prisma/schema.prisma`.

**18 — Contratos, API e Documentação Viva.** Onda 8. Dono de `docs/**` (exceto
`documentacao-aplicacao/**`, que é do 11) e de `docs/openapi.yaml`. Fecha: verificação de deriva
entre `openapi.yaml` e as rotas reais, rodando no CI (handoff para o 08); fonte única para
`OverviewMetrics`, hoje duplicado entre frontend e backend; normalização de
`onda-3/07-para-11-lgpd-service-fix.md`, que está fora do formato do protocolo de handoff. Mentira
mais provável: documentação que descreve um endpoint que mudou de contrato há três ondas.

**01A — Confiabilidade de Dados, RLS e Retenção.** Onda 6, **dentro do slot do Agente 01** (mesmo
padrão do 06A dentro do 06 — os dois nunca rodam ao mesmo tempo). Fecha: o handoff
`onda-2/00-para-01-ailog-rls-violation.md` (alto, aberto — 2 de 5 testes de RLS do `AILog` falham,
hipótese de `SET` vazando entre conexões pooled em vez de `SET LOCAL` escopado à transação); e o
schema `BitrixExtractionRun`, travado em decisão humana de janela de retenção — o prompt deve
instruir o agente a **implementar o schema parametrizado por política de retenção** e perguntar o
número de dias, em vez de ficar bloqueado esperando. Mentira mais provável: declarar RLS correto por
leitura de código sem rodar o teste — erro que já aconteceu de verdade e está registrado em
`.agents/runs/onda-5.md`.

### 5. Como você entrega

Ao terminar, produza um relatório com:

1. os oito arquivos criados, com contagem de linhas de cada um;
2. para cada agente: escopo de propriedade, itens abertos que ele fecha e por qual onda ele responde;
3. a lista de caminhos que você citou nos prompts e **confirmou existirem** (e qualquer um que
   você esperava encontrar e não existe);
4. conflitos de escopo encontrados entre agentes novos e existentes, e como você estreitou o novo;
5. divergências entre `03-ondas-de-finalizacao.md` e o código real;
6. o lembrete final de que a emenda da regra de concorrência em `/AGENTS.md` **continua pendente de
   aprovação humana** e que, sem ela, nenhuma onda pode rodar com mais de 3 especialistas.

Commits pequenos, prefixados: `docs(agentes): criar prompt do agente <NN>`.

### 6. O que invalida sua entrega

- Prompt que cita arquivo inexistente.
- Prompt genérico, que serviria para qualquer projeto React/Node — se o texto não menciona Bitrix,
  Birthub Voices, o enxame, RLS multi-tenant, Groq/LiteLLM ou pgvector, ele não é deste repositório.
- Agente novo recebendo propriedade de arquivo que já tem dono.
- Missão sem critério verificável.
- Gate copiado sem os comandos específicos do domínio.
- Edição de `/AGENTS.md` ou de prompt existente.
- Declarar concluído sem ter lido os três prompts de referência inteiros.

## TERMINA O PROMPT

---

## Depois que os prompts existirem

1. Aplicar (ou rejeitar) a emenda da regra de concorrência em `/AGENTS.md` §"Regra de concorrência".
2. Coordenador (00) publica a matriz de propriedade da Onda 6 em `.agents/runs/onda-6.md`.
3. Criar `integracao/onda-6` a partir de `main` e um worktree por especialista ativo.
4. Disparar a Onda 6 — **14 primeiro**: enquanto ENV-001 existir, nenhuma outra aprovação de onda é
   honesta.
