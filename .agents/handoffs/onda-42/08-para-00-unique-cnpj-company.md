- De: 08
- Para: 00 (roteamento) / Agente 01 (dono real de `prisma/schema.prisma` e migrações, por
  `AGENTS.md` linhas 251-252)
- Onda: 42
- Status: aberto
- Prioridade: média-alta (bloqueia a garantia real de identidade única de empresa; não bloqueia o
  que esta onda entregou — a resolução determinística já funciona sem o `@@unique`, só não é
  garantida em nível de banco)

## Contexto (dossiê CPI, DEC-16, opção A)

Esta onda implementou resolução determinística de identidade de empresa por CNPJ
(`src/features/prospecting/services/companyIdentity.service.ts` — `resolveCompanyIdentity`, com
`toDeterministicCnpj` em `cnpj.util.ts` fazendo a normalização + validação real de dígito
verificador). Isso substitui, no fluxo de promoção de prospect → CRM, a heurística fraca por nome
como método primário de dedupe.

O que essa mudança de aplicação **não pode** garantir sozinha: que duas `Company` da mesma
`organizationId` nunca tenham o mesmo CNPJ. Isso só é garantido de verdade com um índice único no
banco. Hoje **não existe nenhum** — só um índice não-único:

```prisma
// prisma/schema.prisma, model Company
cnpj              String?
...
@@index([cnpj])   // linha ~280 — não-único, não é escopado por organizationId
```

Não existe `@@unique([organizationId, cnpj])` nem qualquer outro unique envolvendo `cnpj`. Por
`AGENTS.md`, `prisma/schema.prisma` e as migrações são propriedade exclusiva do Agente 01 — não
editei o arquivo. Este handoff documenta exatamente o que precisaria mudar e por quê, incluindo a
análise de risco de dados existentes pedida.

## O que pedir ao schema

```prisma
@@unique([organizationId, cnpj])
```

Semântica desejada: dentro de uma mesma organização, um CNPJ (já normalizado para 14 dígitos) não
pode aparecer em mais de uma `Company`. Empresas sem CNPJ (`cnpj: null`) continuam livres — no
Postgres, `UNIQUE` trata `NULL` como distinto de qualquer outro `NULL` (duas linhas com
`cnpj = NULL` nunca colidem), então este índice não usa nem precisa de `WHERE cnpj IS NOT NULL`
parcial — o comportamento nativo do Postgres já é o que a Regra 3 do escopo desta tarefa pede
("só é resolução determinística quando o CNPJ está presente e válido").

## Por que isto NÃO é um `@@unique` seguro de adicionar direto numa migration simples

Não tenho acesso a um Postgres real com dado de produção/staging neste ambiente (sem
`DATABASE_URL` configurada, sem containers rodáveis) — a análise abaixo é por leitura de código,
não por query real. **A migration real precisa rodar a query de verificação abaixo antes de
aplicar o `@@unique`, em vez de confiar só nesta análise.**

### 1. O valor de `cnpj` não é normalizado hoje — o mesmo CNPJ pode estar gravado em formatos
   diferentes, o que faz um `@@unique` ingênuo (sobre a string crua) NÃO pegar duplicatas reais

Encontrei **três pontos de escrita em `Company.cnpj` com normalização diferente entre si**, dois
deles fora do escopo desta onda (`src/features/prospecting/services/`) então não alterados aqui —
só documentados:

| Caminho de criação | Arquivo | Formato gravado | Dedupe hoje |
|---|---|---|---|
| Promoção prospect → CRM | `prospecting.service.ts::promoteToCrm` (esta onda) | **dígitos só** (`toDeterministicCnpj`, 14 dígitos) | Sim — `resolveCompanyIdentity`, normaliza com `regexp_replace` antes de comparar |
| Aprovação 1-clique do catálogo de Market Intelligence | `marketIntelligence.service.ts::approveToPipeline` (linhas ~309-345) | **com pontuação** (`formatCnpj(normalized)`, ex. `11.222.333/0001-81`) — usa um `formatCnpj` próprio importado de `marketIntelligence.schemas.js`, não o de `cnpj.util.ts` | Parcial — compara `cnpj: formatCnpj(normalized)` por igualdade EXATA contra o valor gravado, sem normalizar o lado do banco. **Não encontra uma Company cujo CNPJ foi gravado só em dígitos** (ex. pela promoção de prospect) — o mesmo CNPJ real cairia como "não encontrado" e criaria uma segunda `Company` |
| Cadastro manual no CRM (`CompanyForm.tsx` → `CompanyController` → `CompanyUseCases` → `PrismaCompanyRepository.create`) | `PrismaCompanyRepository.ts::create` | **o que o usuário digitou, sem normalização nem validação nenhuma** — nem checa dígito verificador, nem remove máscara | Nenhum — `create()` grava direto, sem checar CNPJ existente |

Ou seja: hoje já é possível (e, por este desenho, bastante provável ao longo do tempo) ter a MESMA
empresa real representada por duas ou três linhas de `Company` na mesma organização, cada uma com
o CNPJ gravado num formato diferente — porque cada caminho de escrita resolve dedupe (quando
resolve) contra o próprio formato, não contra um formato canônico único. Um `@@unique([organizationId, cnpj])`
aplicado direto sobre a coluna como está hoje:
- não teria detectado essas duplicatas na hora de criar (formatos diferentes = strings diferentes
  = sem conflito para o Postgres);
- ao ser adicionado agora, **falharia a migration** se alguma dessas duplicatas já existir com o
  MESMO formato exato (ex. duas linhas ambas com `cnpj = '11.222.333/0001-81'` — cadastro manual
  duplicado, ou reimport do catálogo de Market Intelligence rodado duas vezes);
- e mesmo que a migration passasse (porque as duplicatas reais estão em formatos diferentes,
  então tecnicamente "não colidem"), o índice não cumpriria o objetivo real: duas linhas para a
  mesma empresa continuariam coexistindo, só que agora com uma falsa sensação de unicidade
  garantida.

**Implicação prática:** a migration não pode ser só `ADD CONSTRAINT UNIQUE`. Precisa, nesta ordem:

1. **Backfill de normalização** — `UPDATE "Company" SET cnpj = regexp_replace(cnpj, '\D', '', 'g') WHERE cnpj IS NOT NULL AND cnpj <> ''` (mesma normalização que `sanitizeCnpj`/`toDeterministicCnpj` já fazem em memória) e `UPDATE "Company" SET cnpj = NULL WHERE cnpj = ''` (string vazia não é "sem CNPJ" para fins de unique — ver seção 3).
2. **Query de verificação de duplicata real, rodada em produção/staging antes de aplicar o unique**:
   ```sql
   SELECT "organizationId", cnpj, COUNT(*), array_agg(id) AS company_ids
   FROM "Company"
   WHERE cnpj IS NOT NULL
   GROUP BY "organizationId", cnpj
   HAVING COUNT(*) > 1;
   ```
   (rodar DEPOIS do backfill do passo 1, para já pegar duplicatas que só ficam visíveis após
   normalizar o formato.)
3. **Se a query acima devolver alguma linha**: existe duplicata real de empresa que precisa ser
   resolvida por decisão humana antes do `@@unique` poder ser aplicado — não é um problema que uma
   migration automática deva resolver sozinha. Mesclar duas `Company` não é só apagar uma linha:
   tem `Contact[]`, `Lead[]`, `CrmCommercialDocument[]`, `EnrichmentLog[]`,
   `AccountIntelligenceSnapshot[]`, `AccountSignal[]`, `DecisionMaker[]`,
   `IntelligenceEvidence[]`, `AccountScore[]`, `AccountRecommendation[]`, além das duas relações de
   `EconomicRelationship` (fonte e alvo) — apontando para o `id` de cada duplicata (ver
   `prisma/schema.prisma`, relations do model `Company`, linhas ~258-269). Reatribuir todas essas
   FKs para um único `id` sobrevivente, decidir qual dos registros "vence" nos campos que
   divergem (endereço, segmento, tags, observações), e só então soft-deletar o perdedor é trabalho
   de uma ferramenta de merge dedicada — não existe hoje neste projeto. Recomendo tratar isso como
   entrega separada (ex.: rota administrativa `POST /companies/:id/merge/:duplicateId`) antes ou
   junto da migration, não como parte dela.
4. **Só depois de 1-3 confirmarem zero grupos duplicados**, aplicar `@@unique([organizationId, cnpj])`.

### 2. Unificar os pontos de escrita para o mesmo formato canônico (fora do escopo desta onda, mas
   pré-requisito real para o `@@unique` não ser recontornado no futuro)

Mesmo depois do backfill + unique, se `approveToPipeline` (Market Intelligence) continuar gravando
`formatCnpj(normalized)` (com pontuação) enquanto `promoteToCrm` (Prospecção) continua gravando só
dígitos, os dois formatos SÃO strings diferentes para o Postgres — o `@@unique` não impede a
próxima duplicata, só trava a partir do estado zerado inicial em formatos que colidam
exatamente. Recomendo (decisão do Agente 01 e do dono de `market-intelligence`/`companies`, não
minha para tomar): padronizar todo `Company.cnpj` gravado como dígitos-só (o que
`toDeterministicCnpj` já produz) e usar `formatCnpj` só na camada de apresentação (UI), nunca ao
persistir. Isso também resolveria o cadastro manual (`PrismaCompanyRepository.create`), que hoje
não normaliza nem valida nada.

### 3. String vazia (`''`) não é `NULL`

`CompanyForm.tsx` e `OcrCapturePanel.tsx` inicializam o campo `cnpj` do formulário como `''`
(string vazia), não `undefined`/`null`. Se esse valor chegar ao banco como `cnpj: ''` em vez de
`cnpj: null` (preciso confirmar isso no controller/use case — não tive tempo de rastrear até o
fim, mas é um risco real a checar antes da migration), duas `Company` da mesma organização com
`cnpj = ''` colidiriam sob o `@@unique` (`''` é um valor concreto, igual a si mesmo, diferente de
`NULL`) — um falso positivo de "duplicata" que bloquearia cadastros legítimos de empresas sem
CNPJ. O passo 1 do backfill acima (`UPDATE ... SET cnpj = NULL WHERE cnpj = ''`) cobre o estado
existente; recomendo também garantir que nenhum caminho de escrita grave `''` daqui pra frente
(normalizar para `null` na validação de entrada), não só no banco.

## Teste esperado depois da migration

- `tests/integration/prospecting-rls.test.ts` (já existente, describe `findExistingCompany dedupe
  por CNPJ`) continua passando sem alteração — o `@@unique` reforça em nível de banco o que o
  código já garante hoje por busca prévia; não deveria mudar nenhum resultado desses testes.
- Um teste de integração novo (sugestão, não escrito por mim — fora do meu arquivo de propriedade):
  tentar `prisma.company.create` duas vezes com o mesmo `(organizationId, cnpj)` fora do caminho de
  `promoteToCrm`/`resolveCompanyIdentity` (ex. direto via `PrismaCompanyRepository.create`, ou
  simulando `approveToPipeline`) e confirmar que a segunda escrita falha com Prisma `P2002`, em vez
  de silenciosamente criar uma duplicata — hoje, sem o `@@unique`, esse teste falharia (a segunda
  chamada teria sucesso).
- Verificar que `PrismaCompanyRepository.create` (`src/features/companies/infra/PrismaCompanyRepository.ts`)
  e `approveToPipeline` (`src/features/market-intelligence/server/marketIntelligence.service.ts`)
  tratam `P2002` explicitamente depois do `@@unique` existir — hoje nenhum dos dois tem
  `try/catch` para isso; sem tratar, o usuário veria um erro 500 cru em vez de uma mensagem
  "empresa com este CNPJ já existe" no primeiro cadastro que colidir. Isso é follow-up de
  aplicação, não do schema, mas registro aqui porque só fica visível depois que o `@@unique`
  existir.

## Contexto adicional

- Não editei `prisma/schema.prisma` nem nenhuma migração — só os arquivos dentro de
  `src/features/prospecting/services/` e seus testes, conforme escopo desta onda.
- `formatCnpj` duplicado (um em `src/features/prospecting/services/cnpj.util.ts`, outro em
  `src/features/market-intelligence/server/marketIntelligence.schemas.js`) é uma duplicação de
  utilitário que valeria consolidar num módulo compartilhado (ex. `src/shared/utils/cnpj.ts`) — não
  fiz essa consolidação aqui porque tocaria arquivo de outro módulo/agente sem necessidade direta
  para esta tarefa; registro para quem for tratar o achado da seção 1.
