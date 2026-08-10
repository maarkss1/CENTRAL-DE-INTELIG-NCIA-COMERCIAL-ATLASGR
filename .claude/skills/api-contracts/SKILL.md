---
name: api-contracts
description: Use ao investigar divergência de contrato de dados entre UI, hook, cliente de API, rota Express, validação Zod, service e Prisma/PostgreSQL — nome de campo diferente, enum divergente, nullable incompatível, cast "as any" mascarando erro. Corrige a origem do contrato, nunca só o sintoma no consumidor.
---

# API Contracts — Central de Inteligência Comercial ATLASGR

## Quando usar

Ative quando o sintoma for "os dados não batem" entre camadas: um campo chega `undefined` onde
deveria ter valor, um enum do frontend não corresponde ao do backend, um `as any`/cast suspeito
aparece perto de uma chamada de API, ou "depois de salvar o lead ele desaparece após reload" (esse
último cenário também aciona `functional-completeness` e `database-integrity` — as três se
sobrepõem porque o sintoma é o mesmo, mas cada uma investiga uma camada diferente da mesma cadeia).

## Missão

Validar e corrigir o contrato de dados ao longo de toda a cadeia real deste projeto:

```
UI (componente)
  ↓
Hook (src/hooks/useDatabase.ts — useFetch genérico, ou hooks de feature como
  useBitrixIntegration.ts)
  ↓
API client (src/lib/api.ts — apiFetch/api.get/post/put/delete/postForm)
  ↓
Express route (src/features/<domínio>/routes/*.routes.ts)
  ↓
Validation (src/shared/middlewares/validateRequest.ts + schema Zod de src/lib/zod.ts)
  ↓
Service/UseCase (application/*UseCases.ts ou *.service.ts)
  ↓
Prisma (infra/Prisma*Repository.ts, ou acesso direto a prisma.* em domínios não-hexagonais)
  ↓
PostgreSQL
```
...e de volta, na resposta.

## Antes de editar

Leia o formato de resposta real antes de investigar um contrato específico:

- **`src/lib/api.ts` (`apiFetch`) já lida com dois formatos de resposta simultaneamente**: o
  padronizado `{success, data, meta?}` (desembrulhado automaticamente) e um "fallback para
  endpoints não padronizados" que devolve o JSON cru. Isso é uma fonte real de divergência
  silenciosa — um endpoint que nunca foi migrado pro formato padrão passa despercebido porque o
  fallback "funciona" sem erro aparente. Antes de investigar um contrato quebrado, confirme qual dos
  dois caminhos o endpoint em questão usa.
- **`src/shared/middlewares/errorHandler.ts`** define o formato de erro canônico:
  `{success: false, error, details?}`, com casos especiais para `ZodError` (400 + `details: issues`)
  e `Prisma.PrismaClientKnownRequestError` (`P2002` → 409 conflito, `P2025` → 404 não encontrado).
  Qualquer rota que não passe pelo `errorHandler` global (ex.: um `try/catch` local que responde
  manualmente) é candidata a formato de erro divergente — procure por isso especificamente.
- **`src/lib/zod.ts`** é a fonte canônica de enums/schemas compartilhados (`LEAD_STATUS`,
  `leadSchema`, etc.). O Piloto 002 encontrou exatamente a classe de bug que esta skill existe para
  prevenir: uma lista de status duplicada localmente no `LeadDetailDrawer` e no filtro de
  automações, divergente do enum real — 7 estágios existiam no schema mas eram inalcançáveis pela
  UI porque as listas locais nunca foram atualizadas.
- **`docs/openapi.yaml`** existe e há um script de teste de contrato real
  (`npm run test:api-schema`, via schemathesis) — hoje com um caminho de execução amarrado a Windows
  (`.venv-opensource\Scripts\schemathesis.exe`). Verifique se esse contrato documentado ainda
  corresponde às rotas reais antes de usá-lo como fonte de verdade cega — um `openapi.yaml`
  desatualizado é pior que nenhum, porque parece autoritativo sem ser.

## Investigação

Para o par de camadas em suspeita, procure:

- **Nome divergente** — `companyName` no frontend vs. `company_name`/`title` no backend/schema
  (Bitrix, por exemplo, usa `TITLE`/`COMPANY_TITLE` — um contexto onde isso é esperado por ser
  campo de sistema externo, não bug; não confunda os dois casos).
- **Enum diferente** — comparar toda constante de status/tipo usada na UI contra `src/lib/zod.ts` e
  o `enum` correspondente em `prisma/schema.prisma`. Três fontes (Zod, Prisma, UI local) precisam
  concordar; se uma delas foi definida localmente em vez de importada, é suspeita.
- **Nullable incompatível** — campo opcional no Zod mas obrigatório na UI (ou vice-versa); campo
  `String?` no Prisma que o frontend trata como sempre presente.
- **Campo obrigatório diferente** — schema Zod exige um campo que o formulário não coleta, ou
  formulário coleta um campo que o schema ignora silenciosamente (`.strip()` implícito do Zod pode
  mascarar isso).
- **Payload antigo** — hook/service enviando um formato de payload de uma versão anterior da rota.
- **Resposta diferente do esperado** — o hook assume `{data: {...}}` mas a rota devolve o objeto
  cru (ver o fallback de `apiFetch` acima).
- **Endpoint morto** — rota existe no backend sem nenhum caller no frontend (ou vice-versa: hook
  chamando uma rota que não existe mais) — `grep` cruzado entre `src/features/*/routes/*.routes.ts`
  e usos de `api.*`/`apiFetch` no frontend.
- **Query param ignorado** — frontend envia filtro/paginação que a rota recebe mas nunca usa na
  query Prisma.
- **Status HTTP inadequado** — 200 para erro de negócio, 500 para erro de validação do usuário
  (deveria ser 400 via `ZodError`/`AppError`).
- **Erro com shape diferente** — uma rota que responde erro fora do formato `{success, error}` do
  `errorHandler` global, quebrando qualquer consumidor que espera o formato padrão.
- **Frontend fazendo cast pra esconder erro** — `as any`, `as unknown as X`, `!` de non-null
  assertion perto de uma resposta de API, sem validação real. Esses são o sintoma mais direto de um
  contrato quebrado sendo mascarado em vez de corrigido.

## Processo de execução

1. Trace a cadeia completa do dado em questão, camada por camada, anotando o shape/tipo esperado em
   cada uma.
2. Identifique onde o shape diverge — esse é o ponto real do bug, não necessariamente onde o
   sintoma aparece (um `undefined` na UI pode ter origem 4 camadas antes).
3. Verifique se a divergência é um bug ou uma transformação intencional e documentada (ex.: mapear
   campo interno para nome exigido por uma API externa como Bitrix é esperado, não é contrato
   quebrado).
4. Corrija na origem do contrato (geralmente o schema Zod ou a fonte de enum), não no ponto de
   consumo — um cast/fallback no consumidor esconde o problema para o próximo caso, não resolve.

## Evidências necessárias

Para cada divergência reportada, mostre lado a lado: o shape que a camada A envia/espera vs. o
shape que a camada B recebe/produz, com `arquivo:linha` de cada lado. "Parece que não bate" sem os
dois lados citados não é uma prova de contrato quebrado.

## Regras de implementação

- Corrija a origem (schema Zod, enum canônico, contrato de resposta), nunca só o sintoma —
  especificamente: **remova o `as any`/cast em vez de adicionar mais um em outro lugar**.
- Se o formato de resposta de uma rota precisa migrar do fallback não-padronizado para
  `{success, data}`, confirme todos os callers dessa rota antes de migrar (grep completo) — mudar o
  formato sem atualizar todos os consumidores quebra silenciosamente quem dependia do formato
  antigo.
- Reuse `LEAD_STATUS`/schemas de `src/lib/zod.ts` em vez de criar uma nova lista local — se um valor
  novo precisa existir, adicione na fonte canônica, não numa cópia local.

## Validação

- `npx tsc -b --noEmit` — divergência de tipo entre camadas tipadas aparece aqui primeiro, se os
  tipos estiverem corretamente compartilhados (não `any`).
- Teste de integração da rota afetada (`tests/integration/*.test.ts`) — confirma o shape real de
  request/response contra o banco real.
- `npm run test:api-schema` (schemathesis contra `docs/openapi.yaml`), se disponível no ambiente —
  registre se não pôde rodar (dependência Windows-only hoje) em vez de pular silenciosamente.

## O que não fazer

- Não use `as any` ou cast para fazer o TypeScript parar de reclamar de um contrato divergente —
  isso é o antipadrão central que esta skill existe para eliminar.
- Não corrija só o consumidor mais visível e deixe os outros callers do mesmo endpoint divergentes.
- Não confie em `docs/openapi.yaml` como verdade absoluta sem confirmar contra o código real — ele
  pode estar desatualizado.
- Não trate toda transformação de campo como bug — mapeamento para uma API externa (Bitrix,
  Google) é esperado; confirme a intenção antes de "corrigir".

## Quando parar e pedir aprovação de escopo/Git

Pare antes de mudar o formato de resposta de uma rota consumida por múltiplas telas/integrações sem
mapear todos os consumidores, e antes de alterar `docs/openapi.yaml` de forma que amplie a
superfície de API pública sem confirmação do usuário.

## Critérios de conclusão

- [ ] A divergência foi corrigida na origem (schema/enum/contrato canônico), não com cast ou
      fallback no consumidor.
- [ ] Todos os callers do endpoint/campo afetado foram identificados e continuam funcionando.
- [ ] Nenhum `as any`/cast novo foi introduzido para mascarar o contrato.
- [ ] `tsc -b --noEmit` e o teste de integração da rota passam.
