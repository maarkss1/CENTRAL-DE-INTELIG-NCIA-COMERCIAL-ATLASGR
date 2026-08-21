- De: 18
- Para: 08
- Onda: 8
- Status: resolvido
- Prioridade: alto

## Resolução
Script `verify:openapi-drift` adicionado ao `package.json` e ao pipeline de CI (`.github/workflows/ci.yml`) após o Type Check.

## Problema
`docs/openapi.yaml` não tinha nenhuma verificação automatizada que comparasse o documento com as
rotas reais de `server.ts`. Medi a deriva no início desta onda (tabela completa na seção "Contexto
adicional") e corrigi o documento — mas sem uma verificação no CI, a deriva volta a acontecer na
próxima rota nova que alguém esquecer de documentar. Escrevi a verificação; falta ligá-la ao CI,
que é escopo seu (`.github/workflows/**`).

Também não pude adicionar o script `npm run verify:openapi-drift` a `package.json` eu mesmo —
`/AGENTS.md` exige aprovação explícita do Agente 00 para qualquer alteração em `package.json`, e
não a tenho registrada nesta onda. Peço que você (ou o Coordenador, se preferir aplicar direto)
adicione a linha abaixo.

## Arquivo(s) envolvido(s)
- `src/shared/contracts/openapiRouteInventory.ts` (**novo**) — função pura `computeOpenApiDrift`,
  testada em `tests/unit/shared/openapiRouteInventory.test.ts` (7 testes, todos passando,
  incluindo os dois que pram a verificação falhar quando deve — ver "Teste esperado").
- `scripts/verify-openapi-drift.ts` (**novo**) — CLI que lê `server.ts` e `docs/openapi.yaml` do
  disco e sai com código 1 se houver deriva, imprimindo a tabela de divergência.
- `package.json` → `scripts` — precisa da linha (proposta, não aplicada por mim):
  ```json
  "verify:openapi-drift": "tsx scripts/verify-openapi-drift.ts",
  ```
  (mesmo padrão de `verify:integrations`/`verify:ai`, já existentes.)
- `.github/workflows/ci.yml` → job `build-and-test` — sugiro adicionar um step logo após "Run Type
  Check" (a verificação não precisa de Postgres/Redis/servidor rodando, só do checkout):
  ```yaml
  - name: Verificar deriva de OpenAPI (docs/openapi.yaml vs server.ts)
    run: npm run verify:openapi-drift
  ```

## Alteração necessária
1. Adicionar o script a `package.json` (ver acima).
2. Adicionar o step ao workflow de CI (ver acima) — em qualquer ponto depois de `npm ci`, não
   depende de nenhum service container.
3. Confirmar localmente com `npx tsx scripts/verify-openapi-drift.ts` (já testei nesta onda — sai
   0 e imprime "✅ Nenhuma deriva estrutural encontrada" contra o estado atual do repositório).

## Teste esperado
- `npx vitest run -c vitest.unit.config.ts tests/unit/shared/openapiRouteInventory.test.ts` — 7/7
  passando, incluindo:
  - prova de que a verificação passa hoje contra `server.ts`/`docs/openapi.yaml` reais;
  - prova de que ela **falha** (`undocumentedPrefixes` não vazio) quando uma rota nova é montada
    sem documentação — teste com fixture sintética, não editei `server.ts` de verdade para isso;
  - prova de que ela **falha** (`phantomDocumentedPaths` não vazio) quando o documento descreve
    uma rota que não existe;
  - prova de que parâmetros `:param` (Express) e `{param}` (OpenAPI) são tratados como
    equivalentes, sem falso positivo;
  - prova de que mounts fora do universo `/api` (health checks, SPA fallback) não geram ruído.
- Depois de conectado ao CI: abrir um PR de teste com uma rota nova sem documentar deve fazer o
  job falhar no step novo — é o critério verificável explícito desta missão.

## Contexto adicional
**Tabela de deriva medida no início da onda** (antes da correção desta sessão, feita por leitura
direta de `server.ts` + todos os routers montados):
- Documentação fantasma (path documentado sem rota real): **0** — o documento nunca inventou
  endpoint, só tinha cobertura incompleta.
- Rotas existentes não documentadas: **~84 endpoints individuais + 4 webhooks + 2 superfícies
  admin/meta**, concentrados em **6 routers de negócio inteiros sem nenhum tag/path**: CRM 360
  (`/api/crm`, 13 endpoints), Comercial Inteligente (`/api/commercial-intelligence`, 15
  endpoints), LGPD (`/api/lgpd`, 2 endpoints — sensível, direitos do titular), Equipe
  (`/api/team`, 5 endpoints), Bitrix24 (`/api/bitrix`, 25 endpoints), 3CX
  (`/api/integrations/3cx`, 5 endpoints). Mais ~13 endpoints avulsos em routers já parcialmente
  documentados (`leads/import/bitrix24`, `leads/enrich-batch`, `prospecting/ocr`,
  `prospecting/cold-email`, `intelligence/agents/sdr/status/{sessionId}`,
  `intelligence/report/latest`, `intelligence/win-loss-analysis`, `notifications/stream` SSE,
  `automations/stagnation-scan`, `whatsapp/conversations`, `whatsapp/signals`, `google/disconnect`,
  `google/calendar/upcoming`).
- Contratos divergentes (documentado, mas errado): **6** — `GET /google/callback` documentado como
  200 JSON quando na verdade é sempre um redirect 302; e 5 endpoints com papel exigido mais
  restrito do que o documento sugeria (`PUT /intelligence/ai-settings` exige ADMIN, não
  ADMIN/GESTOR; `DELETE /knowledge/{id}`, `POST/PUT /prompts`, `GET /leads/export/csv`, `POST
  /leads/export/bitrix24` exigem ADMIN/GESTOR sem estarem anotados como tal).
- **Depois da correção desta sessão**: todos os itens acima documentados (146 paths totais no
  documento, contra ~60 antes), os 6 contratos divergentes corrigidos, e
  `npx tsx scripts/verify-openapi-drift.ts` confirma 0 deriva estrutural.

**Fora do escopo desta verificação, de propósito**: ela não valida método/parâmetro/corpo/status
code por endpoint — só existência de prefixo de rota. Para essa camada mais profunda, o projeto já
tem `npm run test:api-schema` (schemathesis contra `docs/openapi.yaml`, precisa de servidor real
rodando) — não conectado a nenhum workflow de CI hoje. Se quiser, também vale considerar
conectá-lo, reaproveitando os service containers de Postgres/Redis que o job `build-and-test` já
sobe, subindo o servidor (`npm run start:e2e &`) antes de rodar o schemathesis. Não implementei
isso nesta onda — é uma decisão de infraestrutura de CI (venv Python, tempo de execução adicional)
que cabe a você avaliar.
