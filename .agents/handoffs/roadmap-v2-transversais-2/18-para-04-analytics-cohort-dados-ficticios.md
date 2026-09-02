- De: 18
- Para: 04
- Onda: roadmap-v2-transversais-2
- Status: aberto
- Prioridade: alto

## Problema
Auditando `docs/openapi.yaml` contra o composition root real (ver Passe 2, novo, em
`scripts/verify-openapi-drift.ts`), encontrei que `GET /api/analytics/cohort` e
`GET /api/analytics/export/pdf` existem em produção sem NUNCA terem tido entrada em
`docs/openapi.yaml` — corrigi isso no meu escopo (documentei o contrato real, ver "Alteração já
feita" abaixo). Mas o contrato real que documentei não é o contrato que o produto deveria ter:

- `AnalyticsController.getCohort` (`src/features/analytics/presentation/AnalyticsController.ts`)
  devolve uma lista fixa de 3 meses de exemplo, com o próprio comentário no código dizendo
  `// Fake data just for the prototype`. Não é uma agregação real de `Lead`/pipeline do banco.
- `AnalyticsController.exportPdf` devolve um `Buffer.from('PDF_FAKE_CONTENT_FOR_NOW')` sob
  `Content-Type: application/pdf` — não gera PDF nenhum de verdade.

Isso é o bloqueador prioritário #6 de `/AGENTS.md` ("Dados fictícios misturados a dados reais no
dashboard") — a tela de Analytics já tem `overview`/`dashboard` reais (o comentário de
`getOverview` no mesmo controller até documenta que aquele endpoint já foi corrigido de um bug
idêntico: "Esta rota devolvia números fictícios... Isso saiu"), então `cohort`/`export/pdf` parecem
ter ficado para trás dessa correção.

Não é meu escopo corrigir a lógica de negócio de `AnalyticsController`/`AnalyticsUseCases` — só
documentei a API como ela realmente se comporta hoje (fictícia), deixando isso explícito no YAML
para não mascarar o problema, e abro este handoff para a correção de verdade.

## Arquivo(s) envolvido(s)
- `src/features/analytics/presentation/AnalyticsController.ts` — `getCohort` (linha ~48) e
  `exportPdf` (linha ~62).
- Provavelmente `src/features/analytics/application/AnalyticsUseCases.ts` (mesmo padrão do
  `overview`/`dashboard`, que já leem do Prisma) precisa ganhar um método real de cohort/retenção
  mensal, e uma geração real de PDF (ou, alternativa mais barata: remover o endpoint de export até
  existir geração real, já que hoje ele não entrega nada usável ao usuário).
- `docs/openapi.yaml` — já documentei o contrato ATUAL (fictício) em `/analytics/cohort` e
  `/analytics/export/pdf`. Quando a correção de negócio for feita, atualize a `summary` desses dois
  paths para remover a nota de "dado fictício"/"stub" e ajustar o schema de resposta se o formato
  mudar (ex.: paginação por período em vez de 3 meses fixos).

## Alteração necessária
Implementar cohort de retenção real (agregação por mês de criação do lead × conversão em N meses
seguintes, filtrado por `organizationId`) e, para o export, ou gerar um PDF de verdade a partir
desses dados, ou remover o botão/endpoint de export até haver geração real — não é aceitável a UI
oferecer um download que baixa um arquivo `.pdf` inválido (o conteúdo `PDF_FAKE_CONTENT_FOR_NOW`
nem abre num leitor de PDF).

## Teste esperado
- Teste de integração cobrindo `GET /api/analytics/cohort` com dados reais no banco (organização
  vazia → cohort vazio, não fictício; organização com leads → números batem com o que está no
  banco, não os 3 meses fixos hoje hardcoded).
- Teste cobrindo `GET /api/analytics/export/pdf` (ou a decisão de removê-lo) — se mantido, o
  conteúdo devolvido precisa ser um PDF válido de verdade (`%PDF-` no início dos bytes, no mínimo).

## Contexto adicional
Achado durante a auditoria de contratos/OpenAPI da onda `roadmap-v2-transversais-2` (Agente 18).
Ver `docs/openapi.yaml` → `/analytics/cohort` e `/analytics/export/pdf` para o contrato atual
documentado (com a ressalva de dado fictício escrita no próprio YAML).
