- De: 13
- Para: 01
- Onda: 41
- Status: aberto
- Prioridade: baixa

## Problema

`AIGovernancePolicy` e `AIEvaluation` existem em `prisma/schema.prisma` (linhas ~2081-2093) mas têm
ZERO referência em `src/` — nenhum código real lê ou escreve nesses dois models. Investigação
completa em `src/features/intelligence/**` (rotas, services, agents, tools) não encontrou nenhum
ponto que já precise deles e esteja usando um substituto hardcoded no lugar. São dois casos de
schema morto/aspiracional por motivos diferentes, documentados abaixo para não serem
"redescobertos" do zero numa próxima auditoria.

```prisma
model AIGovernancePolicy {
  id       String @id @default(cuid())
  name     String
  rules    Json
  tenantId String
}

model AIEvaluation {
  id                 String @id @default(cuid())
  logId              String
  precisionScore     Float
  hallucinationScore Float
}
```

### `AIGovernancePolicy` — para que parecia servir

Pelo shape (`name` + `rules: Json` + `tenantId`), era claramente pensado como um motor de política
de governança de IA configurável por tenant — rate limit, orçamento, allowlist de ferramenta ou
guardrail, expresso como regras em JSON em vez de hardcoded. Mas todo ponto real de decisão
equivalente que já existe neste projeto resolve o mesmo problema de um jeito mais simples e **já
deliberadamente sem `AIGovernancePolicy`**:

- **Orçamento mensal de IA** (`src/lib/ai/budget.ts`, `assertAiBudgetNotExceeded`) — circuit breaker
  real, chamado antes de toda chamada de IA (`base.agent.ts` e `gateway.ts`). É **global** (soma de
  todas as organizações via `AI_MONTHLY_BUDGET_USD`, um único valor escalar em env), não por tenant.
  O próprio comentário do arquivo (linhas 13-20) já registra que orçamento por tenant "exigiria uma
  coluna/tabela nova, fora do escopo desta correção" — ou seja, a lacuna que `AIGovernancePolicy`
  parecia preencher já foi identificada e conscientemente adiada, não esquecida.
- **Seleção de modelo/temperatura por ferramenta** (`TOOL_CONFIG` hardcoded em
  `src/features/intelligence/services/ai.service.ts:99`) — já tem um override real em banco, mas por
  `toolKey` (`AiEngineSetting`, ver `ai-settings.service.ts`), não por tenant. Não é o mesmo eixo que
  `AIGovernancePolicy.tenantId` sugere.
- **Consentimento de PII para provedor externo** (`hasPiiExternalConsent` em
  `guardrails.service.ts`) — allowlist por organização, mas via env var
  (`AI_PII_EXTERNAL_CONSENT_ORGANIZATIONS`), fail-closed, não via banco.
- **Flags configuráveis por organização em runtime** — já existe um sistema dedicado e em uso real
  para isso: `FeatureFlag`/`OrganizationFeatureFlag` (schema.prisma ~2189, com
  `src/features/feature-flags/**` completo: service, rotas, painel de UI, hook). Se algum dia um
  "rate limit configurável por tenant" virar prioridade real, este sistema (ou uma extensão dele) é
  o caminho natural — não um model novo e paralelo.

Ou seja: não há UM ponto de decisão hardcoded esperando ser trocado por `AIGovernancePolicy` — há
pelo menos três pontos, cada um já resolvido com um mecanismo mais simples e propositalmente
diferente (escalar global, override por toolKey, allowlist por env, flag por org). Conectar
`AIGovernancePolicy` a qualquer um deles significaria inventar um motor de regras em JSON do zero
(decidir sintaxe de `rules`, como ele se combina com os mecanismos já existentes, qual tem
prioridade) — exatamente o tipo de funcionalidade fabricada que `AGENTS.md` (seção "Dados reais x
demonstração") pede para não fazer sem decisão de produto explícita.

### `AIEvaluation` — para que parecia servir

Pelo shape (`logId` + `precisionScore` + `hallucinationScore`), era o armazenamento pensado para
avaliação de qualidade de saída de IA comparada a uma referência. Isso já está mapeado e em
andamento por outro caminho: `src/features/intelligence/services/evaluationMetrics.service.ts`
implementa as 9 dimensões de avaliação do enxame (AI-006, onda 35) usando `AILog`/`AIPendingAction`/
`AIGuardrailEvent` — e reporta explicitamente `factuality`, `playbookAdherence` e `hallucination`
como **indisponíveis** (`AI005_BLOCKED_REASON`), porque dependem de um "Golden Dataset" (AI-005) que
ainda não existe. `AIEvaluation.precisionScore`/`hallucinationScore` parecem ser exatamente o
destino de dado que AI-005 preencheria — mas AI-005 em si é um recurso ainda não construído e sem
decisão de produto tomada (o que conta como "resposta de referência", quem gera o Golden Dataset,
com que cadência), não um bug de integração. Escrever nesse model hoje sem o Golden Dataset
produziria `precisionScore`/`hallucinationScore` fabricados — o mesmo problema que a auditoria já
criticou em outros pontos do projeto.

## Por que não implementei

Segui a orientação da tarefa: só conectar um model morto a um ponto de decisão real quando a
integração for óbvia, pequena e de baixo risco. Não é o caso aqui — os três candidatos a integração
de `AIGovernancePolicy` já são resolvidos por mecanismos deliberadamente mais simples (com decisão
registrada em comentário, no caso do orçamento), e o candidato para `AIEvaluation` depende de um
recurso ainda não construído (Golden Dataset, AI-005) cuja ausência já é reportada honestamente pelo
harness de avaliação em vez de escondida. Implementar qualquer um dos dois agora seria inventar
comportamento novo sem mandato de produto, não destravar um ponto de integração esquecido.

## O que seria necessário para ativar (decisão de produto, não técnica)

- **`AIGovernancePolicy`**: decisão explícita de que orçamento/allowlist/rate-limit de IA passam a
  ser configuráveis por tenant via banco (não só por env var global) — e, dado isso, decisão de
  design de quais desses três mecanismos existentes (orçamento, `AiEngineSetting`, consentimento de
  PII) migram para `AIGovernancePolicy.rules` versus continuam como estão. Sem essa decisão, o model
  não tem contrato de `rules` para implementar.
- **`AIEvaluation`**: construção de AI-005 (Golden Dataset — conjunto de respostas de referência
  para comparar contra saída real da IA) como pré-requisito. Só depois disso faz sentido decidir se
  `AIEvaluation` é o destino de armazenamento certo ou se o dado deveria viver como mais uma
  dimensão de `evaluationMetricsSnapshot` (mais consistente com o padrão já usado pelas outras 6
  dimensões, que não têm tabela própria).

## Alteração necessária (fora do meu escopo — `prisma/schema.prisma` é arquivo de propriedade
exclusiva do Agente 01/01A)

Adicionar um comentário `///`/`//` acima de `AIGovernancePolicy` e `AIEvaluation` documentando que
são schema morto/aspiracional, com um resumo do achado acima e um ponteiro para este handoff — no
mesmo padrão já usado em outros models deste schema (ex.: o comentário acima de `FeatureFlag` que
explica a relação com `SWARM_SCHEDULER_ORGANIZATIONS`, ou o comentário de `AIPendingAction.approvedBy`
que aponta para `pending-actions.service.ts`). Sugestão de texto (ajustar ao estilo real do arquivo):

```prisma
/// Schema morto/aspiracional — zero referência em src/ (auditoria onda 41). O ponto de integração
/// óbvio (política de IA configurável por tenant) já é resolvido por três mecanismos mais simples e
/// deliberados: orçamento global via env (lib/ai/budget.ts), override de modelo por toolKey
/// (AiEngineSetting) e allowlist de consentimento de PII por env (guardrails.service.ts). Ver
/// .agents/handoffs/onda-41/13-para-01-aigovernancepolicy-schema-morto.md antes de conectar ou
/// remover este model — requer decisão de produto, não só código.
model AIGovernancePolicy {
  ...
}

/// Schema morto/aspiracional — zero referência em src/ (auditoria onda 41). Parece ser o destino de
/// armazenamento pensado para AI-005 (Golden Dataset), que ainda não existe — ver
/// evaluationMetrics.service.ts, que já reporta factuality/hallucination como explicitamente
/// indisponíveis por esse motivo, em vez de um número fabricado. Ver
/// .agents/handoffs/onda-41/13-para-01-aigovernancepolicy-schema-morto.md antes de conectar ou
/// remover este model — requer decisão de produto (construir o Golden Dataset), não só código.
model AIEvaluation {
  ...
}
```

## Teste esperado

Nenhum (mudança é só de comentário/documentação). Se o Agente 01/01A decidir que o comentário deve
ficar diferente do sugerido, sem problema — o objetivo é só que o schema pare de parecer
funcionalidade esquecida e passe a registrar por que ainda não foi conectado.

## Contexto adicional

Não é meu arquivo — `prisma/schema.prisma` é propriedade exclusiva do Agente 01/01A por
`/AGENTS.md`. Nenhum outro arquivo de código foi alterado nesta investigação; nada para o Agente 01
mergear além deste comentário, quando puder.
