# Remediação Técnica — PROSPECTOR-ATLASGR

Data: 2026-08-07
Branch: `main` (working tree limpo antes de iniciar — nenhuma alteração pré-existente a preservar)

## Resumo executivo

**Estado inicial.** O briefing de remediação recebido descrevia um conjunto de falhas centradas na
renomeação do enum `LeadStatus` (de `Novo_Lead`/"Novo Lead" para `Lead_Recebido`/"Lead Recebido").
A investigação inicial mostrou que **essa renomeação já havia sido aplicada corretamente** em
`prisma/schema.prisma`, `src/lib/zod.ts` e `src/lib/enumMap.ts` — não havia alias legado nem
inconsistência de contrato nesses arquivos. O problema real era mais restrito: **vários pontos de
teste e um script utilitário ainda usavam o valor antigo `'Novo_Lead'`/`'Novo Lead'` como dado de
entrada**, o que fazia esses testes falharem contra o schema/contrato atual (Zod ou Prisma).

**Causas raiz identificadas.**
1. `tests/helpers/factories.ts` — `LeadFactory.build()` tinha `status: 'Novo_Lead'` como valor
   padrão, um identificador que não existe mais no enum `LeadStatus` do Prisma.
2. Cinco arquivos de teste sobrescreviam explicitamente `status` com o valor antigo (`'Novo Lead'`
   em chamadas que passam pelo Zod, `'Novo_Lead'` em chamadas diretas ao Prisma).
3. `tests/e2e/leads-crud.spec.ts` também usava `'Qualificação'` (sem o sufixo `(SDR)`) — não é
   membro do enum atual.
4. Um bug de produção não relacionado à investigação original foi encontrado por inspeção: em
   `PrismaLeadRepository.ts`, a lógica que seta `closedAt` comparava o status com os rótulos antigos
   `'Fechado Ganho'`/`'Fechado Perdido'`, que não existem mais no enum (os valores atuais são
   `'Negócios Ganhos'`/`'Negócios Perdidos'`) — `closedAt` nunca era gravado ao fechar um lead.
5. Um comentário-exemplo em `vite.config.ts` continha um caractere corrompido (mojibake de em-dash,
   `â€"` em vez de `—`) — único caso real de corrupção de encoding encontrado em todo o repositório
   após varredura completa.

**Correções aplicadas.** Todos os valores de status obsoletos foram substituídos pelos valores
corretos do enum atual (rótulo Zod onde o teste passa pela camada de validação, identificador cru
do Prisma onde o teste escreve direto no banco). O bug de `closedAt` foi corrigido. O mojibake foi
corrigido. Documentação pública (`docs/openapi.yaml`) e um script utilitário
(`scripts/testSdrAgent.ts`) que também usavam os valores obsoletos (incluindo um segundo enum,
`CompanyStatus`, com valor inválido `'NOVO'`) foram corrigidos por consistência e correção de
contrato.

**Resultado final.** Lint, testes unitários (425/425), testes de integração (19/19), testes E2E
(14/14) e build de produção passam com exit code 0. `npm audit` teve uma vulnerabilidade alta
eliminada (`js-yaml`, via update de patch não-breaking); as quatro vulnerabilidades restantes foram
investigadas em profundidade e documentadas como risco residual não corrigível sem downgrade
major ou migração de biblioteca — ver seção Segurança.

## Arquivos alterados

| Arquivo | Problema | Causa raiz | Alteração | Teste executado | Resultado |
|---|---|---|---|---|---|
| `tests/helpers/factories.ts` | `LeadFactory` gerava lead com status inválido por padrão | Valor `'Novo_Lead'` não atualizado após rename do enum | `status: 'Novo_Lead'` → `'Lead_Recebido'` | `test:unit`, `test:integration` (todos os consumidores da factory) | ✅ |
| `tests/integration/leads.test.ts` | Teste cria lead via `leadUseCases.createLead()` (valida via Zod) com status fora do enum de rótulos | Override explícito com valor obsoleto | `status: 'Novo Lead'` → `'Lead Recebido'` | `vitest run tests/integration/leads.test.ts` isolado | ✅ 1 passed |
| `tests/integration/activities.test.ts` | Teste cria lead via `prisma.lead.create()` direto com identificador Prisma inválido | Override explícito com valor obsoleto | `status: 'Novo_Lead'` → `'Lead_Recebido'` | `vitest run tests/integration/activities.test.ts` isolado | ✅ 1 passed |
| `tests/integration/notes.test.ts` | Mesmo padrão de `activities.test.ts` (não estava no briefing original, encontrado ao rodar a suíte completa) | Override explícito com valor obsoleto | `status: 'Novo_Lead'` → `'Lead_Recebido'` | `test:integration` completo | ✅ |
| `tests/integration/timeline.test.ts` | Mesmo padrão (também não estava no briefing original) | Override explícito com valor obsoleto | `status: 'Novo_Lead'` → `'Lead_Recebido'` | `test:integration` completo | ✅ |
| `tests/e2e/leads-crud.spec.ts` | Criação/atualização de lead via API real com status fora do enum; 3 ocorrências de criação + 3 asserções de update | Valores obsoletos `'Novo Lead'` e `'Qualificação'` | `'Novo Lead'` → `'Lead Recebido'` (×3); `'Qualificação'` → `'Qualificação (SDR)'` (×3, update + asserções) | `playwright test tests/e2e/leads-crud.spec.ts` isolado + `test:e2e` completo | ✅ 14 passed |
| `src/features/crm/infra/PrismaLeadRepository.ts` | `closedAt` nunca era setado ao mover lead para status final — analytics de "ganho/perdido no mês" ficava incorreto | Comparação com rótulos antigos `'Fechado Ganho'`/`'Fechado Perdido'`, inexistentes no enum atual | `isClosingNow` agora compara com `'Negócios Ganhos'`/`'Negócios Perdidos'` (em `update()` e `updateStatus()`); comentário de exemplo também corrigido | `test:unit`, `test:integration` (cobertura indireta via `LeadUseCases`/`PrismaLeadRepository`) | ✅ |
| `vite.config.ts` | Comentário com em-dash corrompido (mojibake UTF-8→Latin-1) | Corrupção de encoding pré-existente, único caso real no repositório | `â€"` → `—` | Comentário apenas — validado por `build` (exit 0) | ✅ |
| `src/lib/enumMap.ts` | Comentário de exemplo citava valor obsoleto | Documentação não atualizada após rename do enum | Comentário `Novo_Lead`/`Novo Lead` → `Lead_Recebido`/`Lead Recebido` | Comentário apenas — `lint`, `test:unit` | ✅ |
| `scripts/testSdrAgent.ts` | Script manual de fogo (E2E de fila/agente) quebraria com `PrismaClientValidationError` em dois enums se executado | `status: 'NOVO'` inválido para `CompanyStatus` (válidos: `Ativo`/`Inativo`/`Em_analise`); `status: 'Novo_Lead'` inválido para `LeadStatus` | `'NOVO'` → `'Ativo'`; `'Novo_Lead'` → `'Lead_Recebido'` | Não coberto por suíte automatizada (script manual, depende de infra de filas) — corrigido por inspeção estática e comparação direta com os enums do Prisma | ✅ (correção estática validada; execução manual não realizada nesta sessão) |
| `docs/openapi.yaml` | Documentação pública da API listava um `LeadStatus` completamente desatualizado (8 valores antigos, nenhum bate com o enum real de 11 valores) | Doc não sincronizada após rename do enum | Enum `LeadStatus` e `default` do `LeadInput` reescritos para os 11 valores reais (espelhando `src/lib/zod.ts`) | Não há teste automatizado de doc — validado por comparação linha-a-linha com `LEAD_STATUS` em `src/lib/zod.ts` | ✅ |

## Validações

| Comando | Exit code | Aprovados | Falhas | Resultado |
|---|---|---|---|---|
| `npx prisma generate` | 0 | — | — | ✅ |
| `npx vitest run tests/integration/leads.test.ts` (isolado) | 0 | 1 | 0 | ✅ |
| `npx vitest run tests/integration/activities.test.ts` (isolado) | 0 | 1 | 0 | ✅ |
| `npx playwright test tests/e2e/leads-crud.spec.ts` (isolado) | 0* | 3 | 0 | ✅ (*primeira tentativa teve 1 timeout de cold-start do webServer, não relacionado à correção — reexecução isolada confirmou 1 passed limpo) |
| `npm run lint` | 0 | — | 0 | ✅ |
| `npm run test:unit` | 0 | 425 arquivos: 70, testes: 425 | 0 | ✅ (bate a meta exata do briefing) |
| `npm run test:integration` | 0 | arquivos: 9, testes: 19 | 0 | ✅ (bate a meta exata) |
| `npm run test:e2e` | 0 | 14 | 0 | ✅ (bate a meta exata) |
| `npm run build` | 0 | `dist/server.cjs` gerado (543 kB) + assets Vite | — | ✅ |
| `npm audit --json` (antes) | — | — | 5 vulnerabilidades (2 moderate, 3 high, 0 critical) | investigado |
| `npm update js-yaml` (dentro do range já aceito por `@eslint/eslintrc`) | 0 | — | — | ✅ js-yaml 4.3.0 → 4.3.1, elimina 1 vulnerabilidade alta |
| `npm audit --json` (depois) | — | — | 4 vulnerabilidades (2 moderate, 2 high, 0 critical) | ver Segurança |

Logs internos esperados (gerados propositalmente pelos próprios testes — `boom`, `Banco
indisponível`, `Lead not found`, `Redis`/`searchQueue offline` em cenários de teste de resiliência)
apareceram no stdout mas **não** representam falha; os resumos do Vitest/Playwright confirmam 100%
de aprovação em todos os comandos acima.

## Segurança

**Segredos:** `docs/SECURITY_REVIEW_REQUIRED.md` citado no briefing **não existe** no repositório.
Os quatro arquivos apontados como possíveis fontes de segredo foram inspecionados individualmente:

| Arquivo | Classificação |
|---|---|
| `litellm-config.yaml` | FALSO POSITIVO — chaves referenciadas via `os.environ/...`, nenhum valor hardcoded |
| `src/features/integrations/google/__tests__/google.service.test.ts` | FIXTURE DE TESTE — strings como `'client-secret'`, `'at-1'`, `'segredo-de-teste'` são mocks óbvios |
| `src/features/integrations/birth-voice/__tests__/birthVoice.helpers.test.ts` | FIXTURE DE TESTE — `SECRET = 'segredo-compartilhado'` usado só para testar HMAC localmente |
| `prisma/migrations/20260802220000_google_workspace_connection/migration.sql` | FALSO POSITIVO — DDL puro, colunas `accessToken`/`refreshToken` sem valores |

Nenhuma credencial real foi encontrada; nenhuma rotação é necessária; nada foi commitado com
segredo.

**Vulnerabilidades npm — 4 restantes, todas investigadas quanto a alcançabilidade real:**

| Pacote | Severidade | Cadeia | Alcançável neste código? | Por quê | Mitigação |
|---|---|---|---|---|---|
| `js-yaml` | alta | `eslint → @eslint/eslintrc → js-yaml` | **Corrigida** nesta sessão | — | `npm update js-yaml` (4.3.0→4.3.1, dentro do range `^4.3.0` já aceito pelo pai, zero breaking change) |
| `@xenova/transformers` / `sharp` (aninhado) | alta | `@xenova/transformers@2.17.2` (última versão publicada) bundla `sharp@0.32.6` (vulnerável a CVEs libvips, corrigido só em `sharp≥0.35.0`) | Tecnicamente sim (roda server-side, `src/lib/ai/local-embeddings.ts`), mas **não explorável na prática** | O pipeline usado é exclusivamente `feature-extraction` de texto (`embedLocal`) — `sharp` só é acionado pelo `@xenova/transformers` em pré-processamento de imagem, caminho nunca exercitado por este código. Não há upgrade disponível: 2.17.2 é a última versão publicada do pacote (`npm view` confirma), e o sucessor oficial `@huggingface/transformers@4.2.0` ainda bundla `sharp@^0.34.5`, abaixo do piso seguro `0.35.0` | Nenhum fix seguro disponível hoje. Documentado como risco residual aceito; revisitar quando `sharp≥0.35.0` for adotado a montante por qualquer sucessor do pacote |
| `exceljs` / `uuid` (aninhado) | moderada | `exceljs@3.10.0` (já atualizado — acima do downgrade `3.4.0` que o `npm audit` sugere) bundla `uuid@7.0.3` | Não — `exceljs` só chama `uuidv4()` sem parâmetro `buf`; a CVE (GHSA-w5hq-g745-h8pq) afeta somente `v3/v5/v6` **com** `buf` fornecido | Verificado via `grep` no código-fonte de `exceljs` (`cf-rule-ext-xform.js`) — único uso de `uuid` no pacote inteiro | Nenhuma ação necessária; downgrade sugerido pelo `npm audit` (`exceljs@3.4.0`) seria regressivo, pois já estamos numa versão mais nova. Documentado como falso-positivo estrutural |

`npm audit fix --force` **não foi executado** em nenhum momento, conforme proibição explícita —
os dois downgrades que ele sugeriria (`@xenova/transformers@1.4.2`, `exceljs@3.4.0`) seriam
regressões de API sem eliminar de fato o risco (no caso do transformers) ou desnecessárias (no
caso do exceljs, que já está numa versão mais recente que o alvo do downgrade).

## Dívidas residuais

- **Chunks grandes no build**: `OnboardingTour` (1,018 kB), `exceljs.min` (1,069 kB),
  `vendor-react` (466 kB), `CartesianChart` (356 kB), `IntelligenceHub` (275 kB). Nenhuma alteração
  de code-splitting foi aplicada nesta sessão — o `manualChunks` já existente em `vite.config.ts`
  cobre `vendor-react`/`vendor-motion`/`vendor-icons`/`vendor-dnd`; `exceljs` já é importado via
  `import()` dinâmico (só entra no bundle ao clicar em exportar). Oportunidade futura: lazy-load do
  `OnboardingTour` via `React.lazy`, hoje aparentemente no bundle principal.
- **`eval` em `exceljs.min.js`**: warning do Vite na build, vindo do bundle minificado da própria
  lib de terceiro — não é código do projeto, não bloqueia a build (exit 0).
- **`@xenova/transformers`/`sharp`**: ver tabela de Segurança — sem fix seguro disponível a
  montante; risco aceito e documentado.
- **`scripts/testSdrAgent.ts`**: corrigido estaticamente (dois enums inválidos), mas não executado
  de ponta a ponta nesta sessão — depende de filas (`enrichmentQueue`, `leadsQueue`) e de um agente
  de IA rodando, fora do escopo de uma correção de enum. Recomenda-se rodar manualmente antes do
  próximo uso real do script.
- **Encoding**: nenhuma outra corrupção real encontrada além do único caso em `vite.config.ts`; os
  32 arquivos inicialmente sinalizados pela busca por `Ã|Â|â€` eram, em sua totalidade (exceto esse
  caso), falsos positivos — texto em português corretamente codificado em UTF-8.

## Git

Estado final (antes do commit):

```
 M docs/openapi.yaml
 M package-lock.json
 M scripts/testSdrAgent.ts
 M src/features/crm/infra/PrismaLeadRepository.ts
 M src/lib/enumMap.ts
 M tests/e2e/leads-crud.spec.ts
 M tests/helpers/factories.ts
 M tests/integration/activities.test.ts
 M tests/integration/leads.test.ts
 M tests/integration/notes.test.ts
 M tests/integration/timeline.test.ts
 M vite.config.ts
?? .remediation-backup/         (cópias pré-edição de cada arquivo alterado; não entra no commit)
?? REMEDIACAO_DIFF_INICIAL.patch        (vazio — árvore já estava limpa no início)
?? REMEDIACAO_DIFF_CACHED_INICIAL.patch (vazio)
?? REMEDIACAO_FINAL_PROSPECTOR_ATLASGR.md (este relatório)
```

12 arquivos de código/config alterados, 35 inserções / 30 deleções — todas as alterações são
substituições pontuais de valores de enum obsoletos, uma correção de bug de `closedAt`, um
mojibake e um patch de dependência transitiva. Nenhuma alteração legítima pré-existente foi
descartada (a árvore já estava limpa no início da sessão). Nenhum teste foi removido, marcado como
`skip`/`only`, ou teve asserções enfraquecidas.

Push **não** foi realizado. Commit local único a ser criado a seguir, conforme solicitado.
