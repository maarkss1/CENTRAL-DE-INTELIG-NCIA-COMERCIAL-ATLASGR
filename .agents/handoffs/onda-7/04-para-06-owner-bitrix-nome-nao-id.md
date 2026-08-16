- De: Agente 04 (CRM e BI)
- Para: Agente 06 (Integrações e Bitrix)
- Onda: 7
- Status: resolvido
- Prioridade: alto

## Problema

`Lead.owner` mistura duas convenções diferentes na mesma coluna, dependendo de como o lead foi
criado:

- Leads criados dentro do app (`LeadUseCases.createLead`, `assignment.service.ts`) gravam o
  **`User.id`** (cuid) de quem capturou/foi atribuído.
- Leads importados do Bitrix24 (`src/features/integrations/bitrix/service/leads.ts:258` e
  `deals.ts:349`) gravam o **`User.name`** (texto), via `resolveAtlasUserNameByEmail`
  (`userMapping.ts`) — a própria função (e o nome dela) deixa isso explícito: devolve
  `User.name`, não `User.id`.

Isso quebra pelo menos dois pontos que assumem `Lead.owner === User.id`:

1. **`src/shared/middlewares/requireLeadOwnership.ts`** — RBAC que restringe um VENDEDOR a só
   editar/excluir/reenriquecer os leads que ele mesmo capturou, comparando `lead.owner ===
   user.id`. Para um lead importado do Bitrix, `lead.owner` é o NOME do vendedor, não o id — a
   comparação falha sempre, e o vendedor legítimo leva 403 tentando editar o próprio lead. Já
   apliquei um fallback defensivo nesse arquivo (compara também contra `User.name` do usuário
   autenticado) para não deixar o bug ativo enquanto isso não é corrigido na origem — mas é
   band-aid, não a correção real.
2. **Analytics/BI (`src/features/analytics/**`, meu domínio)** — `byOwner`/`performanceReport`
   agrupam por `Lead.owner` bruto. A mesma pessoa pode aparecer em DUAS linhas do ranking (uma
   por id, quando o lead foi criado no app; outra por nome, quando veio do Bitrix), dividindo a
   contagem real dela e distorcendo o relatório de performance por vendedor.

## Arquivo(s) envolvido(s)
- `src/features/integrations/bitrix/service/userMapping.ts` (`resolveAtlasUserNameByEmail`)
- `src/features/integrations/bitrix/service/leads.ts:258`
- `src/features/integrations/bitrix/service/deals.ts:349`

## Alteração necessária
Padronizar `Lead.owner` para sempre gravar `User.id`, também no caminho de import do Bitrix:
- Adicionar `resolveAtlasUserIdByEmail` (ou alterar a função existente para devolver `id` em vez
  de `name`, ajustando os dois call sites) em `userMapping.ts`, mesma regra de "sem correspondência
  devolve `null`, nunca inventa vínculo" já usada hoje.
- Avaliar com o Agente 01 se vale a pena um script de backfill para leads já importados com
  `owner` = nome (dado já em produção/homologação) — troca de convenção sem backfill deixa
  registros antigos ainda quebrados para `requireLeadOwnership`. Isso é decisão de dado real, não
  cabe eu decidir/rodar sozinho.

## Teste esperado
- Teste de integração/unitário em `bitrix/service/leads.ts`/`deals.ts` confirmando que o `Lead`
  importado grava `owner` = `User.id` do responsável casado por e-mail (não o nome).
- Regressão em `requireLeadOwnership` (ou no meu fallback, se ele continuar existindo depois da
  correção): um VENDEDOR consegue editar um lead importado do Bitrix atribuído a ele.

## Contexto adicional
Achado durante a auditoria de forecast/BI da Onda 7 (mission do Agente 04: "Sem owner fictício" e
"Métricas comerciais com dono e origem"). Não é owner fictício (nenhum lado inventa um vínculo sem
correspondência real) — é convenção inconsistente do mesmo campo, o que já é suficiente para
quebrar RBAC de posse e distorcer métricas de BI por vendedor.

## Resolução (Agente 06, Onda 10)

Padronizado `Lead.owner` para gravar sempre `User.id`, também no caminho de import do Bitrix:

- Adicionada `resolveAtlasUserIdByEmail` em
  `src/features/integrations/bitrix/service/userMapping.ts` — nova função, ao lado da
  `resolveAtlasUserNameByEmail` original (que continua existindo, intocada, reexportada em
  `bitrix.service.ts`, mas não é mais usada para preencher `Lead.owner`). Optei por adicionar uma
  função nova em vez de mudar o contrato da existente porque `resolveAtlasUserNameByEmail` já é
  parte da API pública do módulo (reexportada em `bitrix.service.ts`) mesmo sem outro chamador
  interno hoje além dos dois call sites corrigidos — menor raio de impacto, mesmo padrão de
  "sem correspondência devolve `null`, nunca inventa vínculo" preservado nos dois.
- Ajustados os 2 call sites: `src/features/integrations/bitrix/service/leads.ts` (import de Lead) e
  `src/features/integrations/bitrix/service/deals.ts` (import de Negócio) — ambos agora resolvem
  `ownerId` via `resolveAtlasUserIdByEmail` e gravam esse id em `Lead.owner`.
- Ajustado também `src/features/integrations/bitrix/service/ownershipGuard.ts` (mesmo diretório,
  escopo do Agente 06): `findOwnershipConflict` recebe `incomingOwnerId` em vez de
  `incomingOwnerName` (mesma lógica de igualdade, só renomeado para refletir a realidade); e
  `notifyOwnershipConflict` passou a resolver um nome legível a partir do `owner` armazenado
  (`resolveOwnerDisplayName`, tenta casar como `User.id` da organização; sem correspondência, cai
  para o valor bruto) para não vazar um cuid cru na notificação ao operador agora que `owner` é
  id em vez de nome.
- `requireLeadOwnership.ts` (Agente 04) **não foi tocado**, conforme instrução — o fallback
  defensivo por nome que já existe lá continua funcionando como rede de segurança, inclusive para
  os leads antigos que ainda têm `owner` = nome até o backfill rodar.
- **Backfill dos leads já importados com `owner` = nome (dado real de produção/homologação) fica
  pendente**, decisão do Agente 01 — handoff novo aberto em
  `.agents/handoffs/onda-10/06-para-01-backfill-lead-owner.md` (prioridade alto) propondo o script
  de backfill com a mesma lógica de matching por e-mail/nome.

Testes: `src/features/integrations/bitrix/service/__tests__/userMapping.test.ts` (função nova),
`leads.test.ts` e `deals.test.ts` (novo arquivo) cobrindo o import ponta a ponta com owner
resolvido para `User.id` e para `null` sem correspondência; `ownershipGuard.test.ts` cobrindo a
resolução de nome legível na notificação. `npx tsc --noEmit`, `npm run lint` e
`npm run test:unit` verdes — ambiente sem Postgres/Docker, então `test:integration` não pôde ser
executado (ver limitação registrada na resposta da Onda 10).
