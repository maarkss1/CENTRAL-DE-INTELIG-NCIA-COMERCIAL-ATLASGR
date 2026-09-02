# AGENTS.md — Copiloto Comercial IA (fundação)

## Dono
Quem implementa cada onda seguinte do pacote `atlasgr_copiloto_ai_pack` (ver
`.claude/PILOTS.md` para o registro do piloto que criou esta fundação e
`C:\Users\Marks\Desktop\ATLASGR_COPILOTO_IA_AGENTES_PROMPTS_EXTENSAO_CHROME` para o pacote de
especificação original — agentes, prompts e roadmap por onda).

## O que é
Módulo do Copiloto Comercial IA (pacote `atlasgr_copiloto_ai_pack`), já cobrindo as Ondas 1-4 do
roadmap: fundação de dados/RBAC (Onda 1), captura real de áudio via extensão Chrome (Onda 2),
transcrição via Whisper + resumo executivo (Onda 3), e mapeamento configurável de campo +
writeback real no Bitrix24 para `entityType: LEAD` (Onda 4). Onda 5 em diante (objeções,
concorrentes, buying signals, deal health, coaching, WhatsApp) ainda não existe. NÃO substitui
`ConversationSignal` (`src/features/intelligence`), que lê janelas de `WhatsAppMessage`/e-mail já
persistidas sem transcrição bruta nem consentimento de gravação — são modelos complementares.

**Composição com outras features**: este módulo depende de Bitrix (writeback) e chatbook (resumo
de reunião) só através de PORTAS em `src/shared/contracts/` (`bitrixWriteback.contract.ts`,
`meetingSynthesis.contract.ts`) — nunca importa `src/features/integrations/bitrix/**` nem
`src/features/chatbook/**` diretamente (`no-cross-feature-imports` em `.dependency-cruiser.cjs`
barra isso; já aconteceu uma vez nesta onda e foi corrigido). A composição real (instanciar o
adapter/serviço concreto e injetar) acontece só em `src/shared/di/setup.ts` (rotas HTTP) e
`worker.ts`/`src/bootstrap/workers.ts` (worker de transcrição) — os únicos arquivos com licença de
importar as duas features ao mesmo tempo. Sempre rode `npm run test:architecture` (não só
`npm run lint`) antes de considerar uma mudança pronta — lint sozinho não pega esse tipo de
violação.

## Pode alterar
- domínio/regras/persistência deste módulo (`domain/`, `application/`, `infra/`, `presentation/`,
  `routes/`) e seus testes.

## Não pode
- Não criar/editar migration diretamente sem que `prisma/schema.prisma` já reflita a mudança
  proposta — qualquer novo campo/model deste módulo segue o mesmo processo usado para os 6 models
  atuais (`CopilotoConversation`, `CopilotoTranscriptSegment`, `CopilotoInsight`,
  `CopilotoCrmFieldSuggestion`, `CopilotoDealHealthSnapshot`, `CopilotoConsentRecord`): schema +
  migration versionada em `prisma/migrations/`, nunca `prisma db push`.
- Não remover a policy de RLS das 6 tabelas (`prisma/migrations/20260902130000_copiloto_ia_rls`) —
  é a camada real de isolamento de tenant, não o filtro em `where` (ver `/AGENTS.md`, "Separação
  visual não é prova de isolamento").
- Não assumir/hardcodar um código `UF_CRM_*` — o writeback (Onda 4) só grava um campo se existir
  uma linha em `CopilotoBitrixFieldMapping` para (organizationId, entityType, semanticField); sem
  mapeamento, a tentativa falha explicitamente (`FAILED` + `writebackError` legível), nunca grava
  no campo errado. `BITRIX_FIELD_MAP` (`bitrixFieldMap.ts`, estático/hardcoded) é de outro fluxo
  (sync automático de Lead) e nunca deve ser usado por este módulo.
- Não importar `src/features/integrations/bitrix/**` nem `src/features/chatbook/**` diretamente
  deste módulo — sempre pelas portas em `src/shared/contracts/` (ver seção "O que é" acima).
- Não iniciar captura (`startCapture`/`CAPTURING`) sem `consentStatus` em `GRANTED`/`NOT_REQUIRED`
  — regra estrutural em `CopilotoIaUseCases.startCapture`, não remover essa checagem.
- Não afrouxar `COPILOTO_IA_ROLES` (`src/lib/auth/authorization.ts`) sem decisão humana explícita.

## Coordenação
- Siga `/AGENTS.md` para conflitos e handoffs.
- RBAC: `COPILOTO_IA_ROLES`/`canAccessCopilotoIa` vivem em `src/lib/auth/authorization.ts` (fonte
  única de RBAC do repositório — não duplicar a hierarquia aqui).
- DI: repositório/use cases/controller registrados em `src/shared/di/setup.ts`; rota montada em
  `src/bootstrap/routes.ts` (`/api/copiloto-ia`, com `authenticateToken` + `requireTenant` +
  `requireRole` no mount central, e de novo no próprio router — defesa em profundidade, mesmo
  padrão de `commercial-intelligence`).
- Auditoria: consentimento e aprovação/rejeição de sugestão de campo de CRM chamam
  `AuditService.log` explicitamente (`entity: 'COPILOTO_IA_CONSENT'` /
  `'COPILOTO_IA_CRM_FIELD_SUGGESTION'`) — qualquer nova mutação sensível (PII, decisão humana sobre
  writeback) deve seguir o mesmo padrão.

## Definição de pronto local
- `npx tsc --noEmit`, `npm run lint` sem erro novo neste módulo.
- testes de `application/__tests__/` (regras de negócio puras: máquina de estados, gate de
  consentimento, validação de evidência) e RBAC ponta-a-ponta
  (`tests/integration/rbac-e2e-copiloto-ia.test.ts`, mesmo padrão de
  `rbac-e2e-commercial-intelligence.test.ts`: sessão real via Better Auth, 2 organizações,
  isolamento cross-tenant).

## Gate mínimo
- `npx tsc --noEmit`
- `npm run lint`
- `npm run test:architecture` (dependency-cruiser — pega import cross-feature que o lint não pega)
- `src/features/copiloto-ia/application/__tests__/**`
- `tests/integration/rbac-e2e-copiloto-ia.test.ts`
- `npm run build`

Não registrar sucesso sem executar o teste correspondente.
