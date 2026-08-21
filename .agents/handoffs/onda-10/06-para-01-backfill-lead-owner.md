- De: Agente 06 (Integrações e Bitrix)
- Para: Agente 01 (Plataforma, Segurança e Dados)
- Onda: 10
- Status: resolvido
- Prioridade: alto

## Resolução
Script `scripts/backfill-lead-owner.ts` adicionado com a lógica exata requisitada, cobrindo validação de ids, verificação dry-run por default e log auditável (AuditLog). Pode ser rodado com `npx tsx scripts/backfill-lead-owner.ts --apply` em produção/homologação quando necessário.

## Problema

Corrigi em `src/features/integrations/bitrix/service/userMapping.ts` (nova função
`resolveAtlasUserIdByEmail`) + os dois call sites de import (`leads.ts`, `deals.ts`) para que
`Lead.owner` grave sempre `User.id` (cuid), inclusive nos leads importados do Bitrix24 — ver
`.agents/handoffs/onda-7/04-para-06-owner-bitrix-nome-nao-id.md` para o problema original (RBAC de
`requireLeadOwnership` quebrado + duplicação de vendedor no ranking de BI).

Essa correção só vale **daqui para frente**. Leads já importados do Bitrix ANTES desta correção
(em produção/homologação, dado real) continuam com `Lead.owner` = `User.name` (texto), não o id.
Eles seguem funcionando hoje só por causa do fallback defensivo que o Agente 04 já aplicou em
`requireLeadOwnership.ts` (compara também contra `User.name` do usuário autenticado) — mas:

1. esse fallback é banda-aid, não a convenção real, e o Agente 04 não deve precisar mantê-lo para
   sempre;
2. o ranking de BI por owner (`byOwner`/`performanceReport`, domínio do Agente 04) continua
   dividindo a mesma pessoa em duas linhas para todo lead antigo importado do Bitrix, até esses
   registros serem migrados para id;
3. o novo `findOwnershipConflict` (`ownershipGuard.ts`) compara `existing.owner === incomingOwnerId`
   por igualdade simples — um lead legado com `owner` = nome nunca bate com um `incomingOwnerId`
   novo, então o import trata como conflito (bloqueia e notifica) mesmo quando é o mesmo dono na
   prática. É uma falha para o lado seguro (superprotege em vez de deixar passar), mas ainda é um
   comportamento incorreto que o backfill resolve.

Rodar esse backfill é decisão sobre dado real de produção/homologação — não é algo que o Agente 06
deva executar sozinho.

## Arquivo(s) envolvido(s)
- `prisma/schema.prisma` → `model Lead` (campo `owner String?`, sem FK para `User` — é texto livre
  hoje, então o backfill não pode confiar em constraint de banco para achar os candidatos, só em
  correspondência de valor).
- `prisma/schema.prisma` → `model User` (`id`, `name`, `email`, `organizationId`).
- Não altero migração nenhuma — só descrevo abaixo a lógica que um script de backfill (rodado pelo
  Agente 01, ex. em `scripts/`) precisaria seguir.

## Alteração necessária

Proposta de script de backfill (mesma lógica de matching por e-mail que
`resolveAtlasUserIdByEmail` usa hoje no import, aplicada retroativamente aos registros já
existentes):

1. Para cada `Organization`, buscar todos os `Lead` cujo `owner` **não** bate com nenhum `User.id`
   existente NA MESMA organização — isso já separa "owner é id (não mexe)" de "owner é
   possivelmente um nome legado (candidato a backfill)". Não basta checar "parece um cuid" por
   formato — comparar contra os ids reais da organização é mais seguro.
2. Para cada `Lead` candidato, buscar `User.findFirst({ where: { organizationId, name: owner } })`
   dentro da mesma organização.
   - **Um único `User` bate pelo nome** → `UPDATE Lead SET owner = User.id WHERE id = Lead.id`.
   - **Nenhum bate** → não mexe, registra em log/relatório para revisão manual (nome pode ter
     mudado desde o import, usuário pode ter sido removido, ou o valor nunca foi um nome de
     usuário Atlas real).
   - **Mais de um `User` bate pelo mesmo nome na mesma organização** (nomes duplicados são
     possíveis — `User.name` não é `@unique`, só `User.email`) → NÃO decidir sozinho qual é o dono
     correto; registrar como ambíguo para revisão manual. Nunca escolher "o primeiro" ou "o mais
     recente" arbitrariamente — inventar um vínculo errado é pior que deixar o registro como está.
3. Rodar em `dry-run` primeiro (contagem + amostra do que mudaria por organização, sem `UPDATE`
   real) antes de aplicar, dado que isso toca dado de produção/homologação real (ver
   `/AGENTS.md` → "Dados reais x demonstração" e a seção LGPD).
4. Depois do backfill, o fallback por nome em `requireLeadOwnership.ts` pode continuar existindo
   como rede de segurança (não preciso que ele seja removido), mas deixa de ser necessário no dia a
   dia — decisão de quando removê-lo é do Agente 04, dono do arquivo.
5. Auditar o backfill: mesmo padrão de `AuditService.log` já usado no import
   (`action: 'IMPORT'`/`UPDATE`, `entity: 'Lead'`) para manter rastreabilidade de quem/quando
   mudou o campo em massa.

## Teste esperado
- Teste do script de backfill (mock de Prisma, mesmo padrão dos testes de
  `bitrix/service/__tests__/**`) cobrindo: nome com 1 correspondência única (migra), nome sem
  correspondência (não mexe, loga), nome com múltiplas correspondências na mesma organização (não
  mexe, loga como ambíguo), `owner` já é um `User.id` válido (não mexe, idempotente — rodar o
  script duas vezes não deve alterar nada na segunda vez), `owner` null (não mexe).
- Depois do backfill em homologação: confirmar com uma query manual que não sobra nenhum
  `Lead.owner` de uma organização que não bata com `User.id` OU `User.name` dela (ou seja, nenhum
  "órfão" que o backfill devia ter migrado mas não achou correspondência seja um valor totalmente
  desconhecido — esse caso é esperado ficar para revisão manual, mas precisa aparecer no
  relatório, não desaparecer silenciosamente).

## Contexto adicional
- Handoff original que apontou o problema: `.agents/handoffs/onda-7/04-para-06-owner-bitrix-nome-nao-id.md`
  (Status atualizado para `resolvido` nesta onda — a correção na origem foi feita; este handoff
  cobre só o backfill do dado histórico, que ficou pendente por ser decisão sobre dado real).
- `findOwnershipConflict`/`notifyOwnershipConflict` (`src/features/integrations/bitrix/service/ownershipGuard.ts`)
  também foram ajustados nesta onda para continuar mostrando um nome legível na notificação de
  conflito de posse mesmo com `owner` agora sendo um id (`resolveOwnerDisplayName` tenta casar o
  id com `User.id` da organização; se não achar, cai para o valor bruto armazenado — cobre tanto o
  caso novo quanto o legado sem quebrar nada).
- Nenhum código meu (Agente 06) foi revertido ou ficou dependendo deste backfill para funcionar
  corretamente — o import novo já grava id corretamente independente de quando/se o backfill
  rodar. O backfill é só para os registros HISTÓRICOS.
