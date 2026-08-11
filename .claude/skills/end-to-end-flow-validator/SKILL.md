---
name: end-to-end-flow-validator
description: Use para validar uma jornada completa do produto (lead→enriquecimento→conversão→Bitrix; empresa→enriquecimento→CRM; IA→dados→resposta→persistência), não um componente isolado. Um módulo não é funcional só porque suas partes passam em isolamento — valida happy path, erro, reload, duplicidade, autorização, integridade e observabilidade ao longo de toda a cadeia.
---

# End-to-End Flow Validator — Central de Inteligência Comercial ATLASGR

## Quando usar

Ative quando a pergunta envolver uma **jornada**, não uma tela: "o fluxo de lead até virar negócio
funciona?", "o enriquecimento de empresa realmente alimenta o CRM?", "a IA responde com dado real
ou alucinado?". Diferente de `functional-completeness` (que prova um elo local — um botão, um
formulário), esta skill encadeia múltiplos elos por múltiplos módulos e confirma que o dado
sobrevive à travessia inteira. Use as duas juntas quando o pedido for algo como "o botão de
enriquecer funciona de ponta a ponta?" — `functional-completeness` prova o botão, esta skill prova
que o resultado do enriquecimento realmente chega e persiste no destino final da jornada.

## Missão

Validar jornadas reais do produto, não módulos isolados. Um módulo com 100% dos testes unitários
passando pode falhar na jornada real se o dado que ele produz nunca chega ao próximo passo — foi
exatamente o padrão encontrado pela auditoria Bitrix: cada peça isolada (importação, enriquecimento,
exportação) "funciona", mas a jornada inteira ("lead enriquecido no Atlas aparece com os mesmos
dados estruturados no Bitrix") está estruturalmente quebrada porque os pontos de conexão entre as
peças (`bitrixFieldMap.ts`) nunca foram ligados ao código real — ver
`BITRIX24-LEAD-FLOW-AUDIT.md` seção 2 (diagrama de arquitetura real) como referência do que uma
auditoria de jornada correta encontra e como documentá-la.

## Antes de editar

Leia a jornada específica em `BITRIX24-LEAD-FLOW-AUDIT.md` (se a jornada tocar Bitrix) e
`.claude/PILOTS.md` Piloto 002 (jornada Kanban/Lead→Negócio, incluindo o bug real de
`auditableModels` só descoberto ao escrever um teste de jornada completa, não por unidade). Mapeie
os arquivos reais de cada etapa antes de testar — não adivinhe o caminho de dados.

## Investigação — jornadas deste produto

### Jornada CRM (Lead → Negócio)

```
Lead entra (import Bitrix / prospecção / manual)
  ↓ src/features/crm/application/LeadUseCases.ts, prospecting.service.ts
Enriquecimento (CNPJ BrasilAPI, Google Places, Apollo, Hunter, Score)
  ↓ src/features/prospecting/services/enrichment.service.ts
Qualificação (score, temperatura, IA)
  ↓ Lead.score/temperature
Mudança de etapa (Kanban, drag) — PUT /api/crm/records/:id/stage
  ↓ src/components/CrmBoard.tsx → crm360.service.ts
Conversão (Lead → Negócio) — POST /api/crm/leads/:id/convert
  ↓ CrmPipeline/CrmPipelineStage/CrmDealItem
Persistência (Postgres, RLS por organizationId)
  ↓
Bitrix24 (push automático fire-and-forget, ou export manual)
  ↓ src/features/integrations/bitrix/service/outboundSync.ts
```

**O que já se sabe estar quebrado nesta jornada** (não redescubra, confirme o estado atual):
qualificação/score chega ao Bitrix só como texto solto em `COMMENTS`, nunca como campo estruturado
(P1-1); push automático ao criar o lead é fire-and-forget e falha silenciosamente sem sinal ao
operador (P1-3 — mas o schema já ganhou `bitrixSyncStatus`/`bitrixSyncError`/`bitrixSyncedAt` desde
o audit; confirme se `LeadDetailDrawer.tsx` já expõe isso antes de repetir o achado como não
corrigido).

### Jornada Empresa

```
Empresa criada
  ↓ CompanyController/CompanyUseCases → PrismaCompanyRepository
Enriquecimento (mesmo pipeline ativo de prospecting.service.ts, disparado na criação via fila)
  ↓
Contato / Decisor (Apollo/Hunter localizam decisores; Contact.role)
  ↓
Tecnologias / dados de firmografia
  ↓
Prospecção → promoção a CRM (prospecting.service.ts:promoteToCrm)
  ↓
CRM (Lead criado, entra na jornada CRM acima)
```

### Jornada de IA

```
Dados reais (contexto do lead/empresa/registro aberto, se o caller passar)
  ↓
Contexto (prompt montado — verificar se inclui o registro/rota ativa, ou só metadados de marca)
  ↓
Modelo (AI gateway: Groq → OpenAI → Gemini → LiteLLM/Ollama local, com circuit breaker
  Redis-backed em src/lib/ai/gateway.ts)
  ↓
Resposta (com timeout — AI_FALLBACK_TIMEOUT_MS — e retry com backoff sugerido pelo provedor)
  ↓
Persistência (AILog, AgentMemory, AIPendingAction conforme o fluxo)
  ↓
Interface (ChatbookHub / FloatingChatbook / RoleplayHub / AIDockWidget)
```

**Achado documentado a confirmar**: `PRODUCT_EXPERIENCE_CENTRAL_ATLASGR.md` aponta 4 superfícies de
chat de IA sobrepostas sem um entry point único, e que `useAssistantChat` recebe só
`activeBrand`/`brandInfo`, não o registro/rota aberta — ou seja, a etapa "Contexto" da jornada pode
estar estruturalmente rasa (IA não sabe em que lead/empresa o usuário está) mesmo que "Modelo" e
"Resposta" funcionem perfeitamente. Confirme contra o código atual antes de citar.

## Para cada jornada

Valide, nesta ordem, com execução real sempre que possível:

1. **Happy path** — o caminho feliz completo, do primeiro ao último passo, com dado real
   verificável em cada etapa (não só "não deu erro").
2. **Erro** — força uma falha no meio da jornada (ex.: enriquecimento falha, integração externa
   fora do ar) e confirma que a jornada degrada de forma previsível (ver `error-resilience`) em vez
   de deixar o registro num estado intermediário inconsistente.
3. **Reload** — em cada etapa persistida, reload/nova consulta confirma que o estado sobrevive.
4. **Duplicidade** — repetir a mesma entrada (mesmo lead importado duas vezes, mesmo webhook
   reenviado) não deveria criar registros duplicados sem constraint — ver `database-integrity` para
   os `@@unique` reais já existentes/faltantes.
5. **Autorização** — um papel sem permissão em qualquer etapa da jornada é bloqueado no backend, não
   só escondido na UI.
6. **Integridade dos dados** — o dado que chega ao fim da jornada é o mesmo (ou uma transformação
   esperada) do dado que entrou — não um subconjunto perdido silenciosamente (ver P2-1 do audit
   Bitrix: `UTM_*`/`ASSIGNED_BY_ID`/`COMMENTS` nunca são requisitados na importação — perda
   silenciosa de contexto).
7. **Integração externa** — se a jornada cruza uma fronteira externa, delegue a checagem detalhada
   dessa fronteira a `integration-audit`, mas confirme aqui que o resultado dela realmente é
   consumido pelo próximo passo da jornada (não só "a chamada foi feita com sucesso").
8. **Observabilidade** — é possível, a partir de um log/`correlationId`, reconstruir por onde um
   registro específico passou na jornada? Se não, isso é uma lacuna a registrar (ver P3-4 do audit
   Bitrix: nenhuma gravação em `AuditLog` para operações de sync, apesar do modelo existir).

## Processo de execução

1. Desenhe a jornada real (arquivo por etapa) antes de testar — use os mapas acima como ponto de
   partida, mas confirme contra o código atual, que muda mais rápido que este documento.
2. Execute o happy path de ponta a ponta primeiro (via Playwright contra o servidor real quando
   possível — `tests/e2e/` já sobe o Express real via `start:e2e`, não mock).
3. Depois, aplique os 7 pontos de "Para cada jornada" em ordem de risco (erro e duplicidade
   primeiro, geralmente onde os bugs reais deste produto apareceram).
4. Documente onde a cadeia quebra com a etapa exata, o arquivo, e se foi confirmado por execução ou
   só por leitura de código.

## Evidências necessárias

Mesmo padrão de `functional-completeness`: comando/execução real com resultado real citado. Para
"integridade dos dados", mostre o payload de entrada e o dado final lado a lado (não descreva de
memória) — foi assim que a auditoria Bitrix provou perda de campos, comparando byte a byte o que
entra vs. o que sai.

## Regras de implementação

Corrija o ponto de quebra específico encontrado, sem expandir para "melhorar a jornada inteira" —
isso é escopo de produto, peça alinhamento. Reuse a infraestrutura de teste real
(`tests/e2e/helpers.ts`, `signUp()`, seeds via API autenticada, como os specs existentes já fazem)
em vez de escrever um harness descartável que nunca vira teste oficial — ver
`visual-qa/SKILL.md` seção "Harness/script de investigação temporário nunca vira teste oficial por
cópia direta", o mesmo princípio se aplica aqui a scripts de validação de jornada.

## Validação

- Specs E2E da jornada relevante (`crm.spec.ts`, `crm-kanban.spec.ts`, `leads-crud.spec.ts`) contra
  o servidor real.
- Specs de integração de RLS/tenant/RBAC (`tests/integration/rbac-e2e-crm-operations.test.ts`,
  `tenant-isolation-db001.test.ts`) quando a jornada cruza fronteira de organização/papel.
- Se a jornada envolve integração externa real (Bitrix, Google, WhatsApp), valide contra um
  ambiente de teste/sandbox da integração, nunca contra produção real, e documente exatamente o que
  foi (não foi) exercitado de verdade vs. mockado.

## O que não fazer

- Não declare uma jornada "funcional" porque cada módulo isolado passa em teste unitário — essa é
  exatamente a lacuna que esta skill existe para fechar.
- Não teste só o happy path e generalize para "a jornada funciona" — erro, duplicidade e
  autorização são parte da definição de completude aqui, não extras.
- Não invente uma jornada nova fora das três mapeadas acima sem antes desenhar o caminho de dados
  real (arquivo por etapa) — uma jornada mal mapeada gera um relatório que parece rigoroso mas testa
  o caminho errado.

## Quando parar e pedir aprovação de escopo/Git

Pare se a correção do ponto de quebra exigir mudança de contrato entre módulos que outras telas já
consomem (`api-contracts`), mudança de schema (`database-integrity`), ou reconfiguração de uma
integração externa em produção (`integration-audit`) — alinhe escopo antes de codificar.

## Critérios de conclusão

- [ ] O caminho de dados real da jornada (arquivo por etapa) foi confirmado contra o código atual,
      não copiado cegamente de um mapa antigo.
- [ ] Happy path, erro, reload, duplicidade, autorização, integridade e observabilidade foram
      avaliados — com o que foi/não pôde ser executado de fato registrado.
- [ ] Nenhuma conclusão de "jornada funcional" se apoia só em testes unitários isolados dos módulos
      que a compõem.
- [ ] Achados já documentados (auditoria Bitrix, Piloto 002) foram confirmados como ainda válidos
      antes de reportados como novos.
