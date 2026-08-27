- De: Agente 06 — Integrações e Bitrix
- Para: Agente 01 — Plataforma, Segurança e Dados
- Onda: roadmap-v2-onda-1
- Status: resolvido
- Prioridade: normal

## Problema

`BitrixExtractionStatus` (`prisma/schema.prisma`) só tem `queued | running | completed | failed |
cancelled` — não existe um valor para "terminou, gerou arquivo, mas NÃO esgotou o portal para
alguma entidade" (teto de segurança de páginas atingido, `PAGE_SAFETY_CAP = 500` em
`src/features/integrations/bitrix/service/extraction.ts`). Isso é exatamente o bloqueador #12 de
`/AGENTS.md` ("Extrações Bitrix incompletas tratadas como recurso final"): antes da correção desta
onda, uma extração parcial ficava com `status: 'completed'`, idêntica na tela e na API a uma
extração que de fato esgotou o portal — só existia um `logger.warn`, sem nenhum sinal visível ou
agregável.

## Correção já aplicada nesta onda (dentro do escopo do Agente 06, sem tocar o schema)

Como `prisma/schema.prisma` é propriedade exclusiva do Agente 01, a correção desta onda **não**
adiciona um valor de enum novo. Em vez disso:

- `executeExtractionRun` (`service/extraction.ts`) agora grava `errorMessage` (campo `String?` já
  existente na linha) com um aviso explícito quando qualquer entidade bate no teto de páginas,
  mesmo com `status: 'completed'`.
- Nova métrica `bitrix_extraction_partial_total{tenant,entity}` (`service/metrics.ts`), separada de
  `bitrix_extraction_failures_total` (não é uma falha — a extração terminou com sucesso e gerou
  arquivo utilizável, só que parcial).
- `BitrixExtractionPanel.tsx` (frontend) agora trata `status === 'completed' && errorMessage != null`
  como "Concluída (parcial)" — badge âmbar + texto explicando o teto atingido — em vez do
  "Concluída" verde padrão.
- Testes cobrindo os dois casos em `service/__tests__/extraction.test.ts` (extração que esgota
  normalmente → `errorMessage: null`; extração que bate no teto → `errorMessage` com "PARCIAL" +
  incremento da métrica).

Isso resolve o bloqueador de "tratado como recurso final silencioso" dentro do que o Agente 06 pode
alterar, mas é um workaround em cima de `errorMessage` (campo de texto livre, não estruturado) — não
o modelo de dados ideal.

## Arquivo(s) envolvido(s)

- `prisma/schema.prisma` — `enum BitrixExtractionStatus` (linha ~1834).

## Alteração necessária

Quando o Agente 01 tiver uma janela para editar o schema (migration nova): adicionar um valor
`completed_partial` (ou equivalente) a `BitrixExtractionStatus`, e o Agente 06/06A troca
`errorMessage`-como-sinal pelo status estruturado de verdade — `status === 'completed_partial'` em
vez de `status === 'completed' && errorMessage != null`. Não é bloqueador (a correção atual já torna
o estado parcial visível/observável), é uma promoção de modelo de dados quando a agenda do Agente 01
permitir.

## Teste esperado

Depois da migration: `service/__tests__/extraction.test.ts` — testes citados acima passam a
verificar `status: 'completed_partial'` em vez de `errorMessage`; `BitrixExtractionPanel.tsx` lê o
novo status diretamente.

## Contexto adicional

Achado real desta auditoria (Onda 1 — Fundação, Roadmap v2), não teórico:
`service/__tests__/extraction.test.ts` já tinha um teste ("respeita o teto de segurança de páginas
[...]") que comprovava o teto de páginas funcionando, mas nunca verificava o que a linha final
comunicava sobre a incompletude — só que ela virava `status: 'completed'` como qualquer outra. A
correção desta onda fechou a lacuna sem mexer no schema; este handoff é só para a evolução de modelo
de dados, não para o comportamento em si (que já está corrigido).

## Resolução (Coordenador, 00)
Adicionado `completed_partial` a `BitrixExtractionStatus` (migration
`20260826180000_bitrix_extraction_status_completed_partial`, `ALTER TYPE ... ADD VALUE IF NOT
EXISTS`, aditiva/não-destrutiva). `service/extraction.ts` agora grava
`status: partialWarning ? 'completed_partial' : 'completed'` em vez de sobrecarregar `errorMessage`
como único sinal. `BitrixExtractionPanel.tsx` lê o status diretamente (badge própria no
`STATUS_BADGE`, sem mais o computed `isPartial`). Achado extra corrigido no mesmo lugar:
`downloadExtractionFile` só aceitava `status === 'completed'` — sem o ajuste, o botão de download
que passou a aparecer para `completed_partial` no front quebraria com 400 no backend. Testes
atualizados em `service/__tests__/extraction.test.ts` (status esperado + novo caso de download de
extração parcial).
