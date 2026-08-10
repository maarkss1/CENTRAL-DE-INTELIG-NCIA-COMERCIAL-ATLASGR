- De: Agente 06A (Extrações Bitrix, especialista interno do Agente 06)
- Para: Agente 01 (Plataforma, Segurança e Dados)
- Onda: 1
- Status: aberto
- Prioridade: normal

## Problema

O módulo "Extrações Bitrix" (`.agents/prompts/06A-extracoes-bitrix.md`) **não existe ainda no
código** — nem UI, nem serviço, nem schema. É uma feature substancial (extração de
Negócios/Leads/Empresas/Contatos/Atividades/Usuários do Bitrix24, com campos dinâmicos
`UF_CRM_*`, filtros, paginação/job assíncrono, cancelamento, exportação CSV/XLSX/JSON, histórico e
análise por IA com consentimento explícito) — não iniciada nesta rodada da Onda 1 por escopo:
implementá-la de verdade (não uma casca de UI) é trabalho de múltiplos dias, incompatível com
"não declarar concluído só porque a interface existe" (critério de conclusão do próprio 06A).

Este handoff adianta a parte de schema (seção 13 do prompt 06A: "Crie um handoff para o Agente 01
contendo entidades/modelos necessários... antes de integrar o módulo") para quem pegar esta
feature não precisar levantar os requisitos do zero.

## Modelo sugerido — `BitrixExtractionRun` (nome sujeito ao seu critério)

Campos:
- `id` (cuid), `organizationId` (+ relação/índice, mesmo padrão de `BitrixConnection`).
- `connectionId` — qual portal Bitrix foi extraído (relação com `BitrixConnection`).
- `requestedBy` — userId de quem disparou a extração.
- `entities` (`Json` ou `String[]`) — quais entidades foram pedidas (deal/lead/company/contact/activity/user/all).
- `fields` (`Json`) — campos selecionados por entidade, incluindo `UF_CRM_*` escolhidos.
- `filters` (`Json`) — período (custom/hoje/7 dias/mês/trimestre/semestre/tudo) + pipeline/etapa/responsável/status/busca/campo de data usado.
- `status` (enum: `queued | running | completed | failed | cancelled`).
- `progress` (`Json`) — por entidade: total estimado, processado, página/lote atual, erros parciais.
- `totalCount`, `countByEntity` (`Json`).
- `errorMessage` (`String? @db.Text`, sanitizado — nunca stack trace/segredo).
- `correlationId`.
- `attempts`/`retryCount` quando útil pro retry de um lote específico.
- `startedAt`, `completedAt`, `cancelledAt`, `createdAt`, `updatedAt`.
- Metadados do(s) arquivo(s) gerado(s) — ex.: `files Json` com `{formato, path/URL de storage, tamanho, geradoEm}` — **nunca** o conteúdo do arquivo na própria linha.

Índices: `organizationId`, `connectionId`, `status`, `createdAt` (para listagem paginada do
histórico).

## Retenção / LGPD (seção 2 do prompt 06A)

O histórico e os arquivos exportados contêm dado pessoal real (nome/e-mail/telefone de
leads/contatos) — precisa de critério de retenção explícito antes de implementar (expurgo após N
dias, ou retenção indefinida com justificativa registrada — não deixar indefinido por omissão), e
excluir uma extração precisa remover o arquivo associado, não só a linha do histórico. Isso é
decisão de produto/negócio (prazo N), não algo que eu deva fixar sozinho — registrar aqui para o
Coordenador/usuário decidir o valor antes da migração ser gerada.

## Teste esperado
Ver seção 18 do `06A-extracoes-bitrix.md` (lista extensa) — a parte relevante pro schema:
isolamento entre organizações no histórico, cross-tenant negado, exclusão de extração remove
arquivo associado.

## Contexto adicional
Este handoff é preparatório — não bloqueia a Onda 1 atual (o módulo em si está fora de escopo
desta rodada). Fica pronto pra quando o Coordenador priorizar esta feature.
